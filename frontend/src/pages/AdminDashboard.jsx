import React, { useEffect, useState, useCallback } from "react";
import { api, API_BASE, formatApiErrorDetail } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import { Globe, GlobeLock, Download, Archive } from "lucide-react";

export default function AdminDashboard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/theses/approved");
      setItems(data);
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const togglePublish = async (t) => {
    setActing(t.id);
    setError("");
    try {
      if (t.status === "published") {
        await api.post(`/theses/${t.id}/unpublish`);
      } else {
        await api.post(`/theses/${t.id}/publish`);
      }
      await fetch();
    } catch (e) {
      setError(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setActing(null);
    }
  };

  const token = localStorage.getItem("tv_token");

  const approvedCount = items.filter((t) => t.status === "approved").length;
  const publishedCount = items.filter((t) => t.status === "published").length;

  return (
    <div className="paper-noise min-h-[calc(100vh-4rem)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <header className="border-b pb-6 mb-10" style={{ borderColor: "var(--border-soft)" }}>
          <p className="font-mono-plex text-[11px] uppercase tracking-[0.2em] text-neutral-500">
            Admin Console
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl mt-1 tracking-tight">Publications</h1>
          <p className="text-neutral-700 mt-2 max-w-xl">
            Control which approved theses are visible in the public repository.
          </p>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
          <StatCard label="Awaiting publish" value={approvedCount} testId="stat-awaiting" />
          <StatCard label="Published" value={publishedCount} testId="stat-published" />
          <StatCard label="Total approved" value={items.length} testId="stat-total" />
        </div>

        {error && (
          <div className="mb-6 p-3 border border-red-300 bg-red-50 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <p className="font-mono-plex text-xs uppercase tracking-widest text-neutral-500">Loading…</p>
        ) : items.length === 0 ? (
          <div className="card text-center py-16" data-testid="admin-empty">
            <Archive size={24} strokeWidth={1.5} className="mx-auto mb-3 text-neutral-400" />
            <p className="text-sm text-neutral-600">
              No approved theses yet. Once supervisors approve submissions, they will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border" style={{ borderColor: "var(--border-soft)" }} data-testid="admin-table">
            <table className="table-editorial">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Student</th>
                  <th>Program / Year</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id} data-testid={`admin-row-${t.id}`}>
                    <td className="font-serif text-lg">{t.title}</td>
                    <td className="text-sm">{t.student_name}</td>
                    <td className="text-sm font-mono-plex">{t.program} · {t.year}</td>
                    <td><StatusBadge status={t.status} /></td>
                    <td className="text-right whitespace-nowrap">
                      <div className="flex items-center gap-2 justify-end">
                        {t.has_file && (
                          <a
                            href={`${API_BASE}/files/${t.id}?token=${encodeURIComponent(token || "")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-ghost text-xs"
                            data-testid={`admin-download-${t.id}`}
                          >
                            <Download size={12} strokeWidth={1.5} /> PDF
                          </a>
                        )}
                        {t.status === "published" ? (
                          <button
                            className="btn btn-warn text-xs"
                            disabled={acting === t.id}
                            onClick={() => togglePublish(t)}
                            data-testid={`admin-unpublish-${t.id}`}
                          >
                            <GlobeLock size={12} strokeWidth={1.5} />
                            {acting === t.id ? "…" : "Unpublish"}
                          </button>
                        ) : (
                          <button
                            className="btn btn-primary text-xs"
                            disabled={acting === t.id}
                            onClick={() => togglePublish(t)}
                            data-testid={`admin-publish-${t.id}`}
                          >
                            <Globe size={12} strokeWidth={1.5} />
                            {acting === t.id ? "…" : "Publish"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, testId }) {
  return (
    <div className="card" data-testid={testId}>
      <p className="font-mono-plex text-[11px] uppercase tracking-[0.2em] text-neutral-500">{label}</p>
      <p className="font-serif text-4xl mt-2">{value}</p>
    </div>
  );
}
