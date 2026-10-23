import { useCallback, useEffect, useMemo, useState } from "react";
import "./IssueManagement.css";

type Issue = { topic: string; province: string; channel: string; volume: number; severity: string; severity_reason?: string };
type Priority = "Low" | "Medium" | "High" | "Critical";
type Status = "Pending" | "Reviewing" | "In Progress" | "Resolved" | "Escalated";
type Action = {
  id: number; topic: string; province: string; channel: string;
  assigned_team: string; assigned_to_email: string;
  priority: Priority; status: Status; due_date: string | null;
  notes: string | null; created_at: string;
};
type History = {
  id: number; old_status: string | null; new_status: string;
  changed_by: string; note: string | null; created_at: string;
};
type ActionDetail = { action: Action; history: History[]; feedback_ids: number[] };

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const teams = ["Network Operations", "Billing", "Customer Support", "Technical Support", "Other"];
const priorities: Priority[] = ["Low", "Medium", "High", "Critical"];
const statuses: Status[] = ["Pending", "Reviewing", "In Progress", "Resolved", "Escalated"];

async function actionRequest<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try { const result = await response.json(); message = result.detail || message; } catch { /* no JSON */ }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export default function IssueManagement({ issues }: { issues: Issue[] }) {
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [selectedActionId, setSelectedActionId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ActionDetail | null>(null);
  const [team, setTeam] = useState(teams[0]);
  const [priority, setPriority] = useState<Priority>("Medium");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [editTeam, setEditTeam] = useState(teams[0]);
  const [editPriority, setEditPriority] = useState<Priority>("Medium");
  const [editStatus, setEditStatus] = useState<Status>("Pending");
  const [editDueDate, setEditDueDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [queueFilter, setQueueFilter] = useState<"All" | "Needs action" | "Action created">("Needs action");
  const [queueSearch, setQueueSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<"All" | Priority>("All");
  const [visibleCount, setVisibleCount] = useState(6);

  const loadActions = useCallback(async () => {
    setLoading(true);
    try {
      const result = await actionRequest<{ actions: Action[] }>("/actions");
      setActions(result.actions);
      setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load actions"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadActions(); }, [loadActions]);

  const actionKeys = useMemo(
    () => new Set(actions.map((a) => JSON.stringify([a.topic, a.province, a.channel]))),
    [actions]
  );
  const isCreated = (issue: Issue) => actionKeys.has(JSON.stringify([issue.topic, issue.province, issue.channel]));

  const openActions = actions.filter((action) => action.status !== "Resolved");
  const overdueActions = openActions.filter((action) => action.due_date && action.due_date < new Date().toLocaleDateString("en-CA"));
  const pendingActions = actions.filter((action) => action.status === "Pending");
  const unassignedIssues = issues.filter((issue) => !isCreated(issue)).length;
  const queueIssues = issues.filter((issue) => {
    const created = isCreated(issue);
    const matchesStatus = queueFilter === "All" || (queueFilter === "Action created" ? created : !created);
    const matchesText = `${issue.topic} ${issue.province} ${issue.channel}`.toLowerCase().includes(queueSearch.toLowerCase().trim());
    const matchesSeverity = severityFilter === "All" || issue.severity.toLowerCase() === severityFilter.toLowerCase();
    return matchesStatus && matchesText && matchesSeverity;
  });
  const displayedIssues = queueIssues.slice(0, visibleCount);

  function startCreate(issue: Issue) {
    setSelectedIssue(issue);
    setSelectedActionId(null);
    setDetail(null);
    setPriority(priorities.includes(issue.severity as Priority) ? issue.severity as Priority : "Medium");
    setTeam(teams[0]); setDueDate(""); setNotes(""); setError(""); setNotice("");
  }

  async function createAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedIssue || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await actionRequest<{ action: Action; linked_feedback_count: number }>("/actions", "POST", {
        topic: selectedIssue.topic,
        province: selectedIssue.province,
        channel: selectedIssue.channel,
        assigned_team: team,
        priority,
        due_date: dueDate || null,
        notes: notes || null,
      });
      setSelectedIssue(null);
      setNotice(`Action #${result.action.id} created and linked to ${result.linked_feedback_count} complaints.`);
      await loadActions();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to create action"); }
    finally { setBusy(false); }
  }

  async function openAction(action: Action) {
    setSelectedIssue(null); setSelectedActionId(action.id); setDetail(null);
    setError(""); setNotice("");
    try {
      const result = await actionRequest<ActionDetail>(`/actions/${action.id}`);
      setDetail(result);
      setEditTeam(result.action.assigned_team);
      setEditPriority(result.action.priority);
      setEditStatus(result.action.status);
      setEditDueDate(result.action.due_date || "");
      setEditNotes(result.action.notes || "");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load action"); }
  }

  async function saveAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await actionRequest(`/actions/${detail.action.id}`, "PATCH", {
        assigned_team: editTeam, priority: editPriority, status: editStatus,
        due_date: editDueDate || null, notes: editNotes || null,
      });
      setNotice(`Action #${detail.action.id} updated.`);
      await loadActions();
      const refreshed = await actionRequest<ActionDetail>(`/actions/${detail.action.id}`);
      setDetail(refreshed);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to update action"); }
    finally { setBusy(false); }
  }

  return (
    <div className="issues-workspace">
      {error && <div className="issue-alert issue-alert-error" role="alert">{error}</div>}
      {notice && <div className="issue-alert" role="status">{notice}</div>}

      <section className="issue-command-summary" aria-label="Action management summary">
        <div className="issue-command-summary__intro">
          <span className="issue-command-summary__eyebrow">ACTION COMMAND CENTRE</span>
          <h2>Turn customer signals into action.</h2>
          <p>Prioritise unresolved complaint clusters, assign ownership and track progress in one workspace.</p>
        </div>
        <div className="issue-command-summary__stats">
          <div className="issue-stat"><span>Active actions</span><strong>{openActions.length}</strong><small>Not yet resolved</small></div>
          <div className="issue-stat"><span>Pending review</span><strong>{pendingActions.length}</strong><small>Awaiting progress</small></div>
          <div className="issue-stat issue-stat--alert"><span>Overdue actions</span><strong>{overdueActions.length}</strong><small>Past due date</small></div>
          <div className="issue-stat"><span>Unaddressed clusters</span><strong>{unassignedIssues}</strong><small>Without a tracked action</small></div>
        </div>
      </section>

      <section className="panel issue-panel issue-detection">
        <div className="panel-heading issue-heading">
          <div>
            <span className="issue-section-kicker">DETECT / REVIEW / ACT</span>
            <h2>Complaint Detection Centre</h2>
            <p>Focus on complaint clusters that need attention. Suggested severity considers complaint volume, issue type and potential customer impact. Review the explanation before assigning priority.</p>
          </div>
          <button type="button" className="issue-secondary" onClick={() => void loadActions()}>Refresh actions</button>
        </div>
        <div className="issue-queue-controls">
          <div className="issue-queue-tabs" role="group" aria-label="Filter complaint clusters">
            {(["Needs action", "All", "Action created"] as const).map((option) => (
              <button type="button" key={option} className={queueFilter === option ? "active" : ""} onClick={() => { setQueueFilter(option); setVisibleCount(6); }}>
                {option}{option === "Needs action" ? ` (${unassignedIssues})` : option === "All" ? ` (${issues.length})` : ` (${issues.length - unassignedIssues})`}
              </button>
            ))}
          </div>
          <input className="issue-queue-search" type="search" value={queueSearch} onChange={(event) => { setQueueSearch(event.target.value); setVisibleCount(6); }} placeholder="Search issue, province or channel" aria-label="Search complaint clusters" />
        </div>
        <div className="issue-severity-filter" role="group" aria-label="Filter by suggested severity" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, margin: "14px 0 10px" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#536a78", marginRight: 4 }}>Suggested severity</span>
          {(["All", ...priorities] as const).map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={severityFilter === level}
              onClick={() => { setSeverityFilter(level); setVisibleCount(6); }}
              style={{
                padding: "7px 13px", borderRadius: 9, cursor: "pointer", fontSize: 12, fontWeight: 700,
                border: severityFilter === level ? "1px solid #177d70" : "1px solid #dbe7eb",
                background: severityFilter === level ? "#177d70" : "#f7fafb",
                color: severityFilter === level ? "#fff" : "#466273",
              }}
            >
              {level}
              <span style={{ marginLeft: 5, opacity: 0.8 }}>
                ({issues.filter((issue) => (queueFilter === "All" || (queueFilter === "Action created" ? isCreated(issue) : !isCreated(issue))) && (level === "All" || issue.severity.toLowerCase() === level.toLowerCase()) && `${issue.topic} ${issue.province} ${issue.channel}`.toLowerCase().includes(queueSearch.toLowerCase().trim())).length})
              </span>
            </button>
          ))}
        </div>
        <div className="issue-queue-meta"><span>{queueIssues.length} matching clusters</span><span>Ranked by complaint volume</span></div>
        <div className="issue-cluster-grid">
          {displayedIssues.map((issue, index) => {
            const created = isCreated(issue);
            return (
              <article className="issue-cluster" key={JSON.stringify([issue.topic, issue.province, issue.channel])}>
                <div className="issue-cluster__top">
                  <span className="issue-cluster__index">CLUSTER {String(index + 1).padStart(2, "0")}</span>
                  <span className={`issue-cluster__status ${created ? "is-created" : ""}`}>{created ? "Action created" : "Needs action"}</span>
                </div>
                <h3>{issue.topic}</h3>
                <div className="issue-cluster__location"><span>{issue.province}</span><span className="issue-cluster__divider"/><span>{issue.channel}</span></div>
                <div className="issue-cluster__bottom">
                  <div className="issue-cluster__volume"><strong>{issue.volume.toLocaleString("en-ZA")}</strong><span>complaints</span></div>
                  <div className="issue-cluster__right"><span className={`severity ${issue.severity.toLowerCase()}`} title={issue.severity_reason || "Provisional priority recommendation"}>{issue.severity} suggested</span>
                    <button type="button" className={created ? "issue-secondary" : "issue-action-button"} onClick={() => {
                      if (created) {
                        const linked = actions.find((action) => action.topic === issue.topic && action.province === issue.province && action.channel === issue.channel);
                        if (linked) void openAction(linked);
                      } else startCreate(issue);
                    }}>{created ? "View action →" : "Create action →"}</button>
                  </div>
                </div>
                {issue.severity_reason && (
                  <details className="issue-severity-explanation" style={{ marginTop: 12, borderTop: "1px solid #e6edf0", paddingTop: 10 }}>
                    <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#386476" }}>
                      Why {issue.severity.toLowerCase()} priority?
                    </summary>
                    <p style={{ margin: "8px 0 0", fontSize: 12, lineHeight: 1.6, color: "#536a78" }}>
                      {issue.severity_reason}
                    </p>
                  </details>
                )}
              </article>
            );
          })}
          {queueIssues.length === 0 && <div className="issue-queue-empty">No complaint clusters match this view.</div>}
        </div>
        {queueIssues.length > visibleCount && <div className="issue-queue-more"><button type="button" className="issue-secondary" onClick={() => setVisibleCount((count) => count + 6)}>Show 6 more clusters ↓</button></div>}
      </section>

      {selectedIssue && (
        <section className="panel issue-panel">
          <div className="panel-heading"><h2>Create Action</h2><p>{selectedIssue.topic} · {selectedIssue.province} · {selectedIssue.channel} · {selectedIssue.volume} complaints</p></div>
          <form className="issue-form" onSubmit={createAction}>
            <label>Assigned team<select value={team} onChange={(e) => setTeam(e.target.value)}>{teams.map((t) => <option key={t}>{t}</option>)}</select></label>
            <label>Priority (editable recommendation)<select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>{priorities.map((p) => <option key={p}>{p}</option>)}</select></label>
            <label>Due date<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
            <label className="issue-wide">Notes<textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Describe the required follow-up" /></label>
            <div className="issue-form-buttons"><button type="submit" disabled={busy}>{busy ? "Creating..." : "Confirm Create Action"}</button><button type="button" className="issue-secondary" onClick={() => setSelectedIssue(null)}>Cancel</button></div>
          </form>
          <p className="issue-footnote">Public demo: actions are attributed to a demo visitor. No assignment emails are sent.</p>
        </section>
      )}

      <section className="panel issue-panel">
        <div className="panel-heading"><h2>Tracked Actions</h2><p>{actions.length} actions saved in Supabase. Select an action to update it and view history.</p></div>
        {loading ? <p className="issue-empty">Loading actions...</p> : (
          <div className="table-scroll"><table><thead><tr><th>ID</th><th>ISSUE</th><th>TEAM</th><th>ASSIGNED TO</th><th>PRIORITY</th><th>STATUS</th><th>DUE</th><th></th></tr></thead>
            <tbody>
              {actions.map((action) => <tr key={action.id}>
                <td>#{action.id}</td><td className="strong-cell">{action.topic}<small className="issue-subtext">{action.province} · {action.channel}</small></td>
                <td>{action.assigned_team}</td><td>{action.assigned_to_email}</td>
                <td><span className={`severity ${action.priority.toLowerCase()}`}>{action.priority}</span></td>
                <td>{action.status}</td><td>{action.due_date || "—"}</td>
                <td><button className="issue-action-button" onClick={() => void openAction(action)}>Manage</button></td>
              </tr>)}
              {!actions.length && <tr><td colSpan={8}>No actions created yet.</td></tr>}
            </tbody>
          </table></div>
        )}
      </section>

      {selectedActionId !== null && (
        <section className="panel issue-panel">
          <div className="panel-heading issue-heading"><div><h2>Manage Action #{selectedActionId}</h2><p>{detail ? `${detail.action.topic} · ${detail.action.province} · ${detail.action.channel}` : "Loading details..."}</p></div><button className="issue-secondary" onClick={() => { setSelectedActionId(null); setDetail(null); }}>Close</button></div>
          {detail && <>
            <p className="issue-footnote">Assigned to: {detail.action.assigned_to_email} · Linked feedback: {detail.feedback_ids.length}</p>
            <form className="issue-form" onSubmit={saveAction}>
              <label>Assigned team<select value={editTeam} onChange={(e) => setEditTeam(e.target.value)}>{[...new Set([...teams, detail.action.assigned_team])].map((t) => <option key={t}>{t}</option>)}</select></label>
              <label>Priority<select value={editPriority} onChange={(e) => setEditPriority(e.target.value as Priority)}>{priorities.map((p) => <option key={p}>{p}</option>)}</select></label>
              <label>Status<select value={editStatus} onChange={(e) => setEditStatus(e.target.value as Status)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
              <label>Due date<input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} /></label>
              <label className="issue-wide">Notes<textarea rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} /></label>
              <div className="issue-form-buttons"><button type="submit" disabled={busy}>{busy ? "Saving..." : "Save Changes"}</button></div>
            </form>
            <div className="issue-history"><h3>Activity History</h3>
              {detail.history.length ? detail.history.map((entry) => <div className="issue-history-item" key={entry.id}>
                <strong>{entry.old_status ? `${entry.old_status} → ${entry.new_status}` : `Created · ${entry.new_status}`}</strong>
                <span>{new Date(entry.created_at).toLocaleString("en-ZA")} · {entry.changed_by}</span>
                {entry.note && <p>{entry.note}</p>}
              </div>) : <p>No activity recorded.</p>}
            </div>
          </>}
        </section>
      )}
    </div>
  );
}
