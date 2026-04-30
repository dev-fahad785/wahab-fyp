import React, { useEffect, useState, useCallback } from "react";
import { api, API_BASE, formatApiErrorDetail } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import { CheckCircle2, XCircle, RefreshCcw, Download, Eye, ClipboardCheck } from "lucide-react";

export default function SupervisorDashboard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [active, setActive] = useState(null); // thesis being reviewed
  const [comment, setComment] = useState("");
  const [decision, setDecision] = useState("approve");
  const [submitting, setSubmitting] = useState(false);
  const [reviewHistory, setReviewHistory] = useState([]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/theses/submitted");
      setItems(data);
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const openReview = async (t) => {
    setActive(t);
    setDecision("approve");
    setComment("");
    try {
      const { data } = await api.get(`/theses/${t.id}/reviews`);
      setReviewHistory(data);
    } catch (_e) {
      setReviewHistory([]);
    }
  };

  const close = () => {
    setActive(null);
    setReviewHistory([]);
  };

  const submitReview = async () => {
    if (!active) return;
    setSubmitting(true);
    setError("");
    try {
      await api.post(`/theses/${active.id}/review`, { decision, comment });
      close();
      await fetchItems();
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const token = localStorage.getItem("tv_token");

  const pending = items.filter((t) => t.status === "submitted");
  const recent = items.filter((t) => t.status !== "submitted");

  return (
    <div className="paper-noise min-h-[calc(100vh-4rem)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <header className="border-b pb-6 mb-10" style={{ borderColor: "var(--border-soft)" }}>
          <p className="font-mono-plex text-[11px] uppercase tracking-[0.2em] text-neutral-500">
            Supervisor Workspace
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl mt-1 tracking-tight">Review Queue</h1>
          <p className="text-neutral-700 mt-2 max-w-xl">
            Approve, request changes, or reject submitted theses.
          </p>
        </header>

        {error && (
          <div className="mb-6 p-3 border border-red-300 bg-red-50 text-sm text-red-700">{error}</div>
        )}

        <section>
          <h2 className="font-serif text-2xl mb-4">Awaiting review</h2>
          {loading ? (
            <p className="font-mono-plex text-xs uppercase tracking-widest text-neutral-500">Loading…</p>
          ) : pending.length === 0 ? (
            <div className="card text-center py-10" data-testid="supervisor-empty-pending">
              <ClipboardCheck size={24} strokeWidth={1.5} className="mx-auto mb-3 text-neutral-400" />
              <p className="text-sm text-neutral-600">All caught up. No theses are currently awaiting review.</p>
            </div>
          ) : (
            <div className="overflow-x-auto border" style={{ borderColor: "var(--border-soft)" }} data-testid="supervisor-pending-table">
              <table className="table-editorial">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Student</th>
                    <th>Program</th>
                    <th>Year</th>
                    <th>Submitted</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((t) => (
                    <tr key={t.id} data-testid={`supervisor-row-${t.id}`}>
                      <td className="font-serif text-lg">{t.title}</td>
                      <td className="text-sm">{t.student_name}</td>
                      <td className="text-sm">{t.program}</td>
                      <td className="font-mono-plex text-xs">{t.year}</td>
                      <td className="font-mono-plex text-xs text-neutral-500">
                        {t.submitted_at ? new Date(t.submitted_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="text-right">
                        <button
                          className="btn btn-primary text-xs"
                          onClick={() => openReview(t)}
                          data-testid={`supervisor-review-${t.id}`}
                        >
                          <Eye size={12} strokeWidth={1.5} /> Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {recent.length > 0 && (
          <section className="mt-14">
            <h2 className="font-serif text-2xl mb-4">Recently reviewed</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recent.map((t) => (
                <article key={t.id} className="card" data-testid={`supervisor-recent-${t.id}`}>
                  <StatusBadge status={t.status} />
                  <h3 className="font-serif text-xl mt-3">{t.title}</h3>
                  <p className="text-sm text-neutral-600 mt-1">
                    {t.student_name} · {t.program} · {t.year}
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Review modal */}
      {active && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
          onClick={close}
          data-testid="review-modal"
        >
          <div
            className="bg-white w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto border shadow-[8px_8px_0_0_rgba(17,17,17,1)]"
            style={{ borderColor: "var(--border-strong)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <StatusBadge status={active.status} />
                  <h2 className="font-serif text-3xl tracking-tight mt-3">{active.title}</h2>
                  <p className="text-sm font-mono-plex text-neutral-500 mt-1">
                    {active.student_name} · {active.program} · {active.year}
                  </p>
                </div>
                <button onClick={close} className="btn btn-ghost" data-testid="review-close-button">Close</button>
              </div>

              <div className="mb-6">
                <p className="font-mono-plex text-[11px] uppercase tracking-widest text-neutral-500 mb-2">Abstract</p>
                <p className="text-sm text-neutral-800 leading-relaxed whitespace-pre-line">{active.abstract}</p>
              </div>

              {active.keywords?.length > 0 && (
                <div className="mb-6 flex flex-wrap gap-1.5">
                  {active.keywords.map((k) => (
                    <span
                      key={k}
                      className="text-[10px] font-mono-plex uppercase tracking-widest px-2 py-0.5 bg-[#f3f1e7] border border-black/10"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              )}

              {active.has_file && (
                <a
                  href={`${API_BASE}/files/${active.id}?token=${encodeURIComponent(token || "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-outline mb-6"
                  data-testid="review-pdf-link"
                >
                  <Download size={14} strokeWidth={1.5} /> Open PDF
                </a>
              )}

              {reviewHistory.length > 0 && (
                <div className="mb-6 border-t pt-4" style={{ borderColor: "var(--border-soft)" }}>
                  <p className="font-mono-plex text-[11px] uppercase tracking-widest text-neutral-500 mb-2">Previous reviews</p>
                  <ul className="space-y-2">
                    {reviewHistory.map((r) => (
                      <li key={r.id} className="text-sm">
                        <span className="font-mono-plex text-[11px] uppercase tracking-widest text-neutral-500">
                          {new Date(r.created_at).toLocaleString()} · {r.decision}
                        </span>
                        <p className="text-neutral-800">{r.comment || <em className="text-neutral-500">(no comment)</em>}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {active.status === "submitted" ? (
                <>
                  <div className="field mb-4">
                    <label>Decision</label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { v: "approve", label: "Approve", icon: CheckCircle2, cls: "btn-success" },
                        { v: "changes", label: "Request changes", icon: RefreshCcw, cls: "btn-warn" },
                        { v: "reject", label: "Reject", icon: XCircle, cls: "btn-danger" },
                      ].map(({ v, label, icon: Icon, cls }) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setDecision(v)}
                          className={`btn ${decision === v ? cls : "btn-outline"}`}
                          data-testid={`review-decision-${v}`}
                        >
                          <Icon size={14} strokeWidth={1.5} /> {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="field mb-4">
                    <label>Comments to student</label>
                    <textarea
                      rows={5}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Provide feedback, required revisions, etc."
                      data-testid="review-comment-input"
                    />
                  </div>

                  <button
                    className="btn btn-primary w-full h-12"
                    onClick={submitReview}
                    disabled={submitting}
                    data-testid="review-submit-button"
                  >
                    {submitting ? "Submitting…" : "Submit decision"}
                  </button>
                </>
              ) : (
                <p className="text-sm text-neutral-600">
                  This thesis has already been reviewed. Status: <StatusBadge status={active.status} />
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
