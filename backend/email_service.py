
import os
from datetime import datetime
from html import escape

import resend
from dotenv import load_dotenv

load_dotenv()

resend.api_key = os.getenv("RESEND_API_KEY")


def send_assignment_email(action):
    if not resend.api_key:
        raise RuntimeError("RESEND_API_KEY is missing")

    recipient = action["assigned_to_email"]
    sender = os.getenv("RESEND_FROM_EMAIL", "onboarding@resend.dev")

    due_date = action.get("due_date") or "Not specified"

    details = {
        "Issue": action["topic"],
        "Province": action["province"],
        "Channel": action["channel"],
        "Assigned team": action["assigned_team"],
        "Priority": action["priority"],
        "Status": action["status"],
        "Due date": str(due_date),
        "Notes": action.get("notes") or "None",
    }

    rows = "".join(
        f"<tr><td><strong>{escape(label)}</strong></td>"
        f"<td>{escape(str(value))}</td></tr>"
        for label, value in details.items()
    )

    response = resend.Emails.send({
        "from": sender,
        "to": [recipient],
        "subject": f"SIGNAL | New action assigned: {action['topic']}",
        "html": (
            "<h2>New SIGNAL Action Assigned</h2>"
            f"<p>Action #{action['id']} has been assigned to you.</p>"
            f"<table cellpadding='8'>{rows}</table>"
            "<p>Sign in to SIGNAL to manage this action.</p>"
        ),
    })

    return response
