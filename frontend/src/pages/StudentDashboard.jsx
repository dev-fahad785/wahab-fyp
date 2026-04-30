import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, API_BASE, formatApiErrorDetail } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import { Plus, Send, FileText, Download, Eye, Edit3 } from "lucide-react";

export default function StudentDashboard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actioning, setActioning] = useState(null);
  const [reviews, setReviews] = useState({});

  const fetchMine = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/theses/mine");
      setItems(data);
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMine();
  }, [fetchMine]);

  const submitForReview = async (id) => {
    setActioning(id);
    setError("");
    try {
      await api.post(`/theses/${id}/submit`);
      await fetchMine();
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setActioning(null);
    }
  };

  const loadReviews = async (id) => {
    if (reviews[id]) {
      setReviews({ ...reviews, [id]: undefined });
      return;
    }
    try {
      const { data } = await api.get(`/theses/${id}/reviews`);
      setReviews({ ...reviews, [id]: data });
    } catch (_e) {
      /* noop */
    }
  };

  const token = localStorage.getItem("tv_token");

  return (
    <div className="paper-noise min-h-[calc(100vh-4rem)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b pb-6 mb-10" style={{ borderColor: "var(--border-soft)" }}>
          <div>
            <p className="font-mono-plex text-[11px] uppercase tracking-[0.2em] text-neutral-500">
              Student Workspace
            </p>
            <h1 className="font-serif text-4xl sm:text-5xl mt-1 tracking-tight">My Theses</h1>
            <p className="text-neutral-700 mt-2 max-w-xl">
              Draft, revise, and submit your work for supervisor review.
            </p>
          </div>
          <Link to="/student/new" className="btn btn-primary" data-testid="create-thesis-button">
            <Plus size={16} strokeWidth={1.5} /> New thesis
          </Link>
        </header>

        {error && (
          <div className="mb-6 p-3 border border-red-300 bg-red-50 text-sm text-red-700" data-testid="student-error">
            {error}
          </div>
        )}

        {loading ? (
          <p className="font-mono-plex text-xs uppercase tracking-widest text-neutral-500">Loading…</p>
        ) : items.length === 0 ? (
          <div className="card text-center py-16" data-testid="student-empty-state">
            <FileText size={28} strokeWidth={1.5} className="mx-auto mb-4 text-neutral-400" />
            <h3 className="font-serif text-2xl mb-2">No drafts yet</h3>
            <p className="text-neutral-600 text-sm mb-6">
              Create your first thesis to get started. Save as a draft, upload your PDF, then submit for review.
            </p>
            <Link to="/student/new" className="btn btn-primary" data-testid="empty-create-thesis-button">
              <Plus size={16} strokeWidth={1.5} /> Create thesis
            </Link>
          </div>
        ) : (
          <div className="space-y-4" data-testid="student-thesis-list">
            {items.map((t) => (
              <article key={t.id} className="card" data-testid={`student-thesis-${t.id}`}>
                <div className="flex flex-col lg:flex-row lg:items-start gap-6">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <StatusBadge status={t.status} />
                      <span className="font-mono-plex text-[11px] text-neutral-500 tracking-widest">
                        {t.program} · {t.year}
                      </span>
                      {t.has_file && (
                        <span className="font-mono-plex text-[11px] text-neutral-500 tracking-widest">
                          · {t.file_name}
                        </span>
                      )}
                    </div>
                    <h3 className="font-serif text-2xl tracking-tight mb-2">{t.title}</h3>
                    <p className="text-sm text-neutral-700 line-clamp-2 mb-3">{t.abstract}</p>
                    {t.keywords?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {t.keywords.map((k) => (
                          <span
                            key={k}
                            className="text-[10px] font-mono-plex uppercase tracking-widest px-2 py-0.5 bg-[#f3f1e7] border border-black/10"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 lg:w-56 shrink-0">
                    {t.has_file && (
                      <a
                        href={`${API_BASE}/files/${t.id}?token=${encodeURIComponent(token || "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-outline"
                        data-testid={`student-download-${t.id}`}
                      >
                        <Download size={14} strokeWidth={1.5} /> View PDF
                      </a>
                    )}
                    {["draft", "changes", "rejected"].includes(t.status) && (
                      <>
                        <Link
                          to={`/student/edit/${t.id}`}
                          className="btn btn-ghost"
                          data-testid={`student-edit-${t.id}`}
                        >
                          <Edit3 size={14} strokeWidth={1.5} /> Edit
                        </Link>
                        <button
                          className="btn btn-primary"
                          disabled={!t.has_file || actioning === t.id}
                          onClick={() => submitForReview(t.id)}
                          data-testid={`student-submit-${t.id}`}
                        >
                          <Send size={14} strokeWidth={1.5} />
                          {actioning === t.id ? "Submitting…" : "Submit for review"}
                        </button>
                      </>
                    )}
                    <button
                      className="btn btn-ghost text-xs"
                      onClick={() => loadReviews(t.id)}
                      data-testid={`student-reviews-toggle-${t.id}`}
                    >
                      <Eye size={12} strokeWidth={1.5} />
                      {reviews[t.id] ? "Hide feedback" : "View feedback"}
                    </button>
                  </div>
                </div>

                {reviews[t.id] && (
                  <div className="mt-6 pt-6 border-t" style={{ borderColor: "var(--border-soft)" }}>
                    <p className="font-mono-plex text-[11px] uppercase tracking-widest text-neutral-500 mb-3">
                      Supervisor feedback
                    </p>
                    {reviews[t.id].length === 0 ? (
                      <p className="text-sm text-neutral-600">No feedback yet.</p>
                    ) : (
                      <ul className="space-y-3">
                        {reviews[t.id].map((r) => (
                          <li key={r.id} className="text-sm" data-testid={`review-item-${r.id}`}>
                            <span className="font-mono-plex text-[11px] uppercase tracking-widest text-neutral-500">
                              {new Date(r.created_at).toLocaleString()} · {r.supervisor_name} · {r.decision}
                            </span>
                            <p className="mt-1 text-neutral-800 leading-relaxed">
                              {r.comment || <em className="text-neutral-500">(no comment)</em>}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
