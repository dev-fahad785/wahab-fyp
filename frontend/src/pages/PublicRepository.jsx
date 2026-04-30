import React, { useEffect, useState, useCallback } from "react";
import { api, API_BASE } from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import { Search, Download, BookOpen, Calendar, User, ArrowRight } from "lucide-react";

const HERO_IMG =
  "https://images.pexels.com/photos/16091031/pexels-photo-16091031.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";

export default function PublicRepository() {
  const [q, setQ] = useState("");
  const [year, setYear] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (q.trim()) params.q = q.trim();
      if (year) params.year = Number(year);
      const { data } = await api.get("/public/theses", { params });
      setItems(data);
    } catch (_e) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [q, year]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const onSubmit = (e) => {
    e.preventDefault();
    fetchItems();
  };

  return (
    <div className="paper-noise min-h-screen">
      {/* Hero */}
      <section
        className="relative border-b"
        style={{ borderColor: "var(--border-soft)" }}
        data-testid="public-hero"
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(rgba(253,252,248,0.72), rgba(253,252,248,0.85)), url(${HERO_IMG})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "grayscale(0.2)",
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="max-w-3xl fade-up">
            <p className="font-mono-plex uppercase tracking-[0.3em] text-xs text-neutral-700 mb-6">
              Public Repository &middot; Est. 2026
            </p>
            <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl leading-[0.95] tracking-tight">
              A quiet archive of&nbsp;
              <em className="italic text-neutral-700">rigorous</em> thought.
            </h1>
            <p className="mt-6 text-base sm:text-lg text-neutral-700 max-w-xl leading-relaxed">
              ThesisVault is the scholarly repository where students submit, supervisors
              review, and admins publish. Browse openly — every thesis below has been
              peer-reviewed and approved.
            </p>

            <form
              onSubmit={onSubmit}
              className="mt-10 flex flex-col sm:flex-row gap-3 max-w-2xl"
              data-testid="public-search-form"
            >
              <div className="relative flex-1">
                <Search
                  size={16}
                  strokeWidth={1.5}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500"
                />
                <input
                  type="text"
                  placeholder="Search by title, keyword, author…"
                  className="w-full pl-11 pr-4 h-12 bg-white border border-black/10 rounded-sm focus:outline-none focus:border-black focus:shadow-[inset_0_0_0_1px_#111]"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  data-testid="public-search-input"
                />
              </div>
              <input
                type="number"
                placeholder="Year"
                className="w-full sm:w-28 h-12 px-4 bg-white border border-black/10 rounded-sm focus:outline-none focus:border-black focus:shadow-[inset_0_0_0_1px_#111] font-mono-plex"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                data-testid="public-search-year"
              />
              <button className="btn btn-primary h-12" data-testid="public-search-submit">
                Search
                <ArrowRight size={14} strokeWidth={1.5} />
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Listings */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
        <div className="flex items-end justify-between border-b pb-4 mb-10" style={{ borderColor: "var(--border-soft)" }}>
          <div>
            <p className="font-mono-plex text-[11px] uppercase tracking-[0.2em] text-neutral-500">
              Published theses
            </p>
            <h2 className="font-serif text-3xl sm:text-4xl mt-1">The Catalog</h2>
          </div>
          <span className="font-mono-plex text-xs text-neutral-500" data-testid="public-result-count">
            {loading ? "—" : `${items.length} ${items.length === 1 ? "record" : "records"}`}
          </span>
        </div>

        {loading ? (
          <p className="font-mono-plex text-xs uppercase tracking-widest text-neutral-500">Loading…</p>
        ) : items.length === 0 ? (
          <div
            className="card text-center py-16"
            data-testid="public-empty-state"
          >
            <BookOpen size={28} strokeWidth={1.5} className="mx-auto mb-4 text-neutral-400" />
            <h3 className="font-serif text-2xl mb-2">No theses found</h3>
            <p className="text-neutral-600 text-sm">
              Try different keywords, or check back once admins publish newly approved work.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="public-grid">
            {items.map((t, idx) => (
              <article
                key={t.id}
                className={`card card-hover flex flex-col fade-up-delay-${Math.min(idx, 3)}`}
                data-testid={`public-thesis-card-${t.id}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <StatusBadge status="published" />
                  <span className="font-mono-plex text-[11px] text-neutral-500 tracking-widest">
                    {t.year}
                  </span>
                </div>
                <h3 className="font-serif text-2xl leading-tight tracking-tight mb-3 line-clamp-3">
                  {t.title}
                </h3>
                <p className="text-sm text-neutral-700 leading-relaxed mb-5 line-clamp-4">
                  {t.abstract}
                </p>
                <div className="mt-auto space-y-2 pt-4 border-t" style={{ borderColor: "var(--border-soft)" }}>
                  <div className="flex items-center gap-2 text-xs font-mono-plex text-neutral-600">
                    <User size={12} strokeWidth={1.5} /> {t.student_name}
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono-plex text-neutral-600">
                    <Calendar size={12} strokeWidth={1.5} /> {t.program}
                  </div>
                  {t.keywords?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {t.keywords.slice(0, 4).map((k) => (
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
                <a
                  href={`${API_BASE}/files/${t.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-outline mt-5 w-full"
                  data-testid={`public-download-${t.id}`}
                >
                  <Download size={14} strokeWidth={1.5} /> Download PDF
                </a>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
