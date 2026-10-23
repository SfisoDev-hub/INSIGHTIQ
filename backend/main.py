

import os
import re
import time
from collections import defaultdict, deque
from threading import Lock

from collections import Counter

from datetime import date, datetime

from typing import Literal, Optional


from fastapi import Depends, FastAPI, HTTPException, Query, Request

from fastapi.middleware.cors import CORSMiddleware

from pydantic import BaseModel, Field

from postgrest.exceptions import APIError


from backend.database import supabase, admin_supabase

from backend.generate import generate_answer


app = FastAPI(title="Telecom Customer Intelligence API")


app.add_middleware(

    CORSMiddleware,

    allow_origins=[

        "http://localhost:5173",

        "http://127.0.0.1:5173",
        *[origin.strip().rstrip("/")
          for origin in os.getenv("FRONTEND_URL", "").split(",") if origin.strip()],

    ],

    allow_credentials=False,

    allow_methods=["GET", "POST", "PATCH"],

    allow_headers=["Content-Type"],

)
# --------------------------------------------------# Models# --------------------------------------------------
Priority = Literal["Low", "Medium", "High", "Critical"]

Status = Literal[

    "Pending",

    "Reviewing",

    "In Progress",

    "Resolved",

    "Escalated",

]


class QuestionRequest(BaseModel):

    question: str = Field(min_length=1, max_length=1000)


class CreateActionRequest(BaseModel):

    topic: str = Field(min_length=1, max_length=120)

    province: str = Field(min_length=1, max_length=120)

    channel: str = Field(min_length=1, max_length=120)

    assigned_team: str = Field(min_length=1, max_length=120)

    priority: Priority = "Low"

    due_date: Optional[date] = None

    notes: Optional[str] = Field(default=None, max_length=2000)


class UpdateActionRequest(BaseModel):

    assigned_team: Optional[str] = Field(
        default=None, min_length=1, max_length=120)

    priority: Optional[Priority] = None

    status: Optional[Status] = None

    due_date: Optional[date] = None

    notes: Optional[str] = Field(default=None, max_length=2000)
# --------------------------------------------------# Authentication# --------------------------------------------------


# Public portfolio demo. Apply IP-based limits to costly/write endpoints.
# For production with multiple workers, use a shared Redis/API-gateway limiter.
_rate_events = defaultdict(deque)
_rate_lock = Lock()


def limit_demo_requests(request: Request, kind: str):
    limits = {"write": 10, "ai": 20}
    window_seconds = 3600
    # Do not trust user-supplied X-Forwarded-For without a trusted proxy.
    client_ip = request.client.host if request.client else "unknown"
    key = (kind, client_ip)
    now = time.monotonic()
    with _rate_lock:
        events = _rate_events[key]
        while events and events[0] <= now - window_seconds:
            events.popleft()
        if len(events) >= limits[kind]:
            raise HTTPException(
                status_code=429, detail="Demo request limit reached. Please try again later.")
        events.append(now)


def get_admin():

    if admin_supabase is None:

        raise HTTPException(

            status_code=503,

            detail="Backend database credentials are not configured",

        )

    return admin_supabase
# --------------------------------------------------# Shared feedback loader# --------------------------------------------------


def fetch_feedback():
    """Fetch all feedback records using Supabase pagination."""

    records = []

    page_size = 500

    offset = 0

    while True:

        response = (

            supabase.table("customer_feedback")

            .select("*")

            .order("id")

            .range(offset, offset + page_size - 1)

            .execute()

        )

        batch = response.data or []

        records.extend(batch)

        if len(batch) < page_size:

            break

        offset += page_size

    return records
# --------------------------------------------------# Existing endpoints# --------------------------------------------------
# --------------------------------------------------
# Explainable, provisional issue severity
# --------------------------------------------------


# These are transparent operational heuristics, NOT a trained risk model.
# Tune thresholds with operational teams once validated against real outcomes.
TOPIC_IMPACT = {
    "connectivity": 2,
    "network performance": 1,
    "coverage": 1,
    "technical support": 1,
    "fibre installation": 1,
    "billing": 1,
    "mobile data": 1,
    "service activation": 1,
    "service cancellation": 0,
    "customer service": 0,
}

HIGH_IMPACT_PHRASES = (
    "no internet", "internet down", "network down", "service down",
    "complete outage", "total outage", "without internet",
    "no connectivity", "cannot connect", "can't connect",
    "charged twice", "double charged", "unauthorised charge",
    "unauthorized charge", "fraud", "data breach",
)

MEDIUM_IMPACT_PHRASES = (
    "intermittent", "keeps disconnecting", "unreliable",
    "slow internet", "slow speed", "not resolved", "still waiting",
    "no response", "failed installation", "incorrect bill",
)


def suggest_issue_severity(topic: str, feedback: list[dict]) -> tuple[str, str]:
    """Return a provisional severity and an auditable explanation.

    Uses available complaint text as a *signal* of possible impact; it does
    not claim to know actual outages, revenue losses, or customer reach.
    """
    count = len(feedback)
    topic_key = (topic or "").strip().lower()
    topic_points = TOPIC_IMPACT.get(topic_key, 0)

    # Volume thresholds operate on the exact topic/province/channel group.
    volume_points = 3 if count >= 50 else 2 if count >= 25 else 1 if count >= 10 else 0

    high_matches = 0
    medium_matches = 0
    for record in feedback:
        comment = str(record.get("post_text")
                      or record.get("comment") or "").lower()
        if any(phrase in comment for phrase in HIGH_IMPACT_PHRASES):
            high_matches += 1
        elif any(phrase in comment for phrase in MEDIUM_IMPACT_PHRASES):
            medium_matches += 1

    # Multiple independent reports are more reliable than a single phrase.
    impact_points = 2 if high_matches >= 2 else 1 if high_matches or medium_matches >= 2 else 0
    score = topic_points + volume_points + impact_points

    if score >= 6:
        severity = "Critical"
    elif score >= 4:
        severity = "High"
    elif score >= 2:
        severity = "Medium"
    else:
        severity = "Low"

    explanation = (
        f"Provisional {severity} (score {score}): {count} negative complaints "
        f"in this topic/province/channel group; issue-type weight {topic_points}; "
        f"{high_matches} reports with potential high-impact wording and "
        f"{medium_matches} with disruption/delay wording. "
        "Verify operational impact before setting action priority."
    )
    return severity, explanation


@app.get("/")
def home():

    return {"message": "Telecom Customer Intelligence API is running"}


@app.get("/feedback")
def get_feedback(

    region: Optional[str] = None,

    channel: Optional[str] = None,

    sentiment: Optional[str] = None,

    topic: Optional[str] = None,

    limit: int = Query(default=100, ge=1, le=500),

):

    records = fetch_feedback()

    if region:

        records = [r for r in records if r["region"] == region]

    if channel:

        records = [r for r in records if r["channel"] == channel]

    if sentiment:

        records = [r for r in records if r["sentiment"] == sentiment]

    if topic:

        records = [r for r in records if r["topic"] == topic]

    return {

        "total": len(records),

        "records": records[:limit],

    }


@app.get("/analytics")
def get_analytics(

    region: Optional[str] = None,

    channel: Optional[str] = None,

    sentiment: Optional[str] = None,

):

    records = fetch_feedback()

    if region:

        records = [r for r in records if r["region"] == region]

    if channel:

        records = [r for r in records if r["channel"] == channel]

    if sentiment:

        records = [r for r in records if r["sentiment"] == sentiment]

    total = len(records)

    sentiment_counts = Counter(

        r.get("sentiment") or "Unknown" for r in records

    )

    topic_counts = Counter(

        r.get("topic") or "Unknown" for r in records

    )

    region_counts = Counter(

        r.get("region") or "Unknown" for r in records

    )

    channel_counts = Counter(

        r.get("channel") or "Unknown" for r in records

    )

    monthly_counts = Counter()

    for record in records:

        created_at = record.get("created_at")

        if created_at:

            month = datetime.fromisoformat(

                created_at.replace("Z", "+00:00")

            ).strftime("%Y-%m")

            monthly_counts[month] += 1

    negative_count = sentiment_counts.get("Negative", 0)

    negative_records = [

        r for r in records if r.get("sentiment") == "Negative"

    ]

    issue_groups = {}

    for record in negative_records:

        key = (

            record.get("topic") or "Unknown",

            record.get("region") or "Unknown",

            record.get("channel") or "Unknown",

        )

        issue_groups[key] = issue_groups.get(key, 0) + 1

    ranked_issues = []

    for (topic, province, source_channel), count in issue_groups.items():
        group_feedback = [
            record for record in negative_records
            if (record.get("topic") or "Unknown") == topic
            and (record.get("region") or "Unknown") == province
            and (record.get("channel") or "Unknown") == source_channel
        ]
        severity, severity_reason = suggest_issue_severity(
            topic, group_feedback)

        ranked_issues.append({
            "topic": topic,
            "province": province,
            "channel": source_channel,
            "volume": count,
            "severity": severity,
            "severity_reason": severity_reason,
        })

    ranked_issues.sort(

        key=lambda issue: issue["volume"],

        reverse=True,

    )

    return {

        "kpis": {

            "total_feedback": total,

            "negative_feedback": negative_count,

            "negative_percentage": round(

                negative_count / total * 100, 1

            ) if total else 0,

            "unique_topics": len(topic_counts),

            "critical_issue_groups": sum(

                1 for issue in ranked_issues

                if issue["severity"] == "Critical"

            ),

        },

        "sentiment": dict(sentiment_counts),

        "topics": dict(topic_counts),

        "regions": dict(region_counts),

        "channels": dict(channel_counts),

        "monthly_trend": [

            {"month": month, "count": count}

            for month, count in sorted(monthly_counts.items())

        ],

        "ranked_issues": ranked_issues,

    }


@app.get("/analytics/explore")
def explore_analytics(
    region: Optional[str] = None,
    channel: Optional[str] = None,
    sentiment: Optional[str] = None,
):
    """Full filtered feedback dataset for cross-dimensional exploration."""
    records = fetch_feedback()
    if region:
        records = [r for r in records if r.get("region") == region]
    if channel:
        records = [r for r in records if r.get("channel") == channel]
    if sentiment:
        records = [r for r in records if r.get("sentiment") == sentiment]
    columns = ("id", "created_at", "post_text",
               "region", "topic", "sentiment", "channel")
    return {
        "total": len(records),
        "records": [{key: row.get(key) for key in columns} for row in records],
    }


@app.post("/ask")
def ask_question(request: QuestionRequest, http_request: Request):

    limit_demo_requests(http_request, "ai")
    if len(request.question.strip()) > 1000:
        raise HTTPException(status_code=422, detail="Question is too long")
    return generate_answer(request.question)
# --------------------------------------------------# Issue Management# --------------------------------------------------


# Public response only: retain existing database records unchanged.
DEMO_EMAIL = "admin@insightiq.co.za"
_EMAIL_PATTERN = re.compile(
    r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)


def public_text(value):
    return _EMAIL_PATTERN.sub("[email hidden]", value) if isinstance(value, str) else value


def public_action(action):
    safe = dict(action)
    safe["assigned_to_email"] = DEMO_EMAIL
    if "notes" in safe:
        safe["notes"] = public_text(safe["notes"])
    return safe


def public_history(entry):
    safe = dict(entry)
    safe["changed_by"] = "Demo Visitor"
    if "note" in safe:
        safe["note"] = public_text(safe["note"])
    return safe


@app.get("/actions")
def list_actions():

    db = get_admin()

    response = (

        db.table("issue_actions")

        .select("*")

        .order("created_at", desc=True)

        .execute()

    )

    return {"actions": [public_action(action) for action in (response.data or [])]}


@app.get("/actions/{action_id}")
def get_action(action_id: int):

    db = get_admin()

    response = (

        db.table("issue_actions")

        .select("*")

        .eq("id", action_id)

        .limit(1)

        .execute()

    )

    if not response.data:

        raise HTTPException(status_code=404, detail="Action not found")

    history = (

        db.table("issue_action_history")

        .select("*")

        .eq("action_id", action_id)

        .order("created_at", desc=True)

        .execute()

    )

    linked_feedback = (

        db.table("issue_action_feedback")

        .select("feedback_id")

        .eq("action_id", action_id)

        .execute()

    )

    return {

        "action": public_action(response.data[0]),

        "history": [public_history(entry) for entry in (history.data or [])],

        "feedback_ids": [

            item["feedback_id"]

            for item in (linked_feedback.data or [])

        ],

    }


@app.post("/actions", status_code=201)
def create_action(

    request: CreateActionRequest,

    http_request: Request,

):

    limit_demo_requests(http_request, "write")
    db = get_admin()

    topic = request.topic.strip()

    province = request.province.strip()

    channel = request.channel.strip()
# Actions can only be created from real complaint groups.
    matching_feedback = [

        record for record in fetch_feedback()

        if (

            record.get("topic") == topic

            and record.get("region") == province

            and record.get("channel") == channel

            and record.get("sentiment") == "Negative"

        )

    ]

    if not matching_feedback:

        raise HTTPException(

            status_code=400,

            detail="No matching negative customer feedback found",

        )

    existing = (

        db.table("issue_actions")

        .select("id")

        .eq("topic", topic)

        .eq("province", province)

        .eq("channel", channel)

        .limit(1)

        .execute()

    )

    if existing.data:

        raise HTTPException(

            status_code=409,

            detail="An action already exists for this complaint group",

        )

    action_data = {

        "topic": topic,

        "province": province,

        "channel": channel,

        "assigned_team": request.assigned_team.strip(),

        "assigned_to_email": "admin@insightiq.co.za",

        "priority": request.priority,

        "status": "Pending",

        "due_date": (

            request.due_date.isoformat()

            if request.due_date else None

        ),

        "notes": request.notes,

    }

    try:

        response = (

            db.table("issue_actions")

            .insert(action_data)

            .execute()

        )

    except APIError as exc:

        if exc.code == "23505":

            raise HTTPException(

                status_code=409,

                detail="An action already exists for this complaint group",

            )

        raise

    action = response.data[0]

    action_id = action["id"]
# Record the creation event.
    db.table("issue_action_history").insert({

        "action_id": action_id,

        "old_status": None,

        "new_status": "Pending",

        "changed_by": "Demo Visitor",

        "note": "Action created and assigned",

    }).execute()
# Link all matching negative feedback records.
    feedback_links = [

        {

            "action_id": action_id,

            "feedback_id": record["id"],

        }

        for record in matching_feedback

    ]

    for start in range(0, len(feedback_links), 100):

        db.table("issue_action_feedback").insert(

            feedback_links[start:start + 100]

        ).execute()
# Send assignment notification after saving the action
    # Public demo: do not email real staff for visitor-created actions.
    email_sent = False
    email_error = None

    return {

        "message": "Action created successfully",

        "action": public_action(action),

        "linked_feedback_count": len(feedback_links),

        "email_sent": email_sent,

        "email_error": email_error,

    }


@app.patch("/actions/{action_id}")
def update_action(

    action_id: int,

    request: UpdateActionRequest,

    http_request: Request,

):

    limit_demo_requests(http_request, "write")
    db = get_admin()

    existing_response = (

        db.table("issue_actions")

        .select("*")

        .eq("id", action_id)

        .limit(1)

        .execute()

    )

    if not existing_response.data:

        raise HTTPException(status_code=404, detail="Action not found")

    existing = existing_response.data[0]

    changes = request.model_dump(exclude_unset=True)

    if not changes:

        raise HTTPException(

            status_code=400,

            detail="No changes provided",

        )

    if "assigned_team" in changes:

        if changes["assigned_team"] is None:

            raise HTTPException(

                status_code=422,

                detail="Assigned team cannot be empty",

            )

        changes["assigned_team"] = changes["assigned_team"].strip()

    if "priority" in changes and changes["priority"] is None:

        raise HTTPException(

            status_code=422,

            detail="Priority cannot be empty",

        )

    if "status" in changes and changes["status"] is None:

        raise HTTPException(

            status_code=422,

            detail="Status cannot be empty",

        )

    if "due_date" in changes and changes["due_date"]:

        changes["due_date"] = changes["due_date"].isoformat()
# The responsible user is fixed to the authenticated owner.# The UI can update the assigned team, not impersonate a user.
    response = (

        db.table("issue_actions")

        .update(changes)

        .eq("id", action_id)

        .execute()

    )

    updated = response.data[0]

    old_status = existing["status"]

    new_status = updated["status"]

    change_descriptions = []

    for field, new_value in changes.items():

        old_value = existing.get(field)

        if old_value != new_value:

            change_descriptions.append(

                f"{field}: {old_value} -> {new_value}"

            )

    if change_descriptions:

        db.table("issue_action_history").insert({

            "action_id": action_id,

            "old_status": old_status,

            "new_status": new_status,

            "changed_by": "Demo Visitor",

            "note": "; ".join(change_descriptions),

        }).execute()

    return {

        "message": "Action updated successfully",

        "action": public_action(updated),

    }
