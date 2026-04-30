import React, { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api, formatApiErrorDetail } from "@/lib/api";
import { ArrowLeft, Upload, Save } from "lucide-react";

export default function ThesisForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "",
    abstract: "",
    year: new Date().getFullYear(),
    program: "",
    keywords: "",
  });
  const [file, setFile] = useState(null);
  const [existingFileName, setExistingFileName] = useState("");
  const [status, setStatus] = useState("draft");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(!isEdit);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const { data } = await api.get(`/theses/${id}`);
        setForm({
          title: data.title,
          abstract: data.abstract,
          year: data.year,
          program: data.program,
          keywords: (data.keywords || []).join(", "),
        });
        setExistingFileName(data.file_name || "");
        setStatus(data.status);
      } catch (e) {
        setError(formatApiErrorDetail(e.response?.data?.detail) || e.message);
      } finally {
        setLoaded(true);
      }
    })();
  }, [id, isEdit]);

  const canEdit = !isEdit || ["draft", "changes", "rejected"].includes(status);

  const change = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("title", form.title);
      fd.append("abstract", form.abstract);
      fd.append("year", String(form.year));
      fd.append("program", form.program);
      fd.append("keywords", form.keywords);
      if (file) fd.append("file", file);

      const cfg = { headers: { "Content-Type": "multipart/form-data" } };
      if (isEdit) {
        await api.put(`/theses/${id}`, fd, cfg);
      } else {
        await api.post("/theses", fd, cfg);
      }
      navigate("/student");
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!loaded) {
    return (
      <div className="paper-noise min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <span className="font-mono-plex text-xs uppercase tracking-widest text-neutral-500">Loading…</span>
      </div>
    );
  }

  return (
    <div className="paper-noise min-h-[calc(100vh-4rem)]">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Link to="/student" className="inline-flex items-center gap-2 font-mono-plex text-xs uppercase tracking-widest text-neutral-500 link-underline">
          <ArrowLeft size={12} strokeWidth={1.5} /> Back to dashboard
        </Link>
        <h1 className="font-serif text-4xl sm:text-5xl mt-6 tracking-tight">
          {isEdit ? "Edit thesis" : "New thesis"}
        </h1>
        <p className="text-neutral-700 mt-2">
          Fill metadata and attach your PDF. You can save as draft and submit later.
        </p>

        {!canEdit && (
          <div className="mt-6 p-3 border border-amber-300 bg-amber-50 text-sm text-amber-800">
            This thesis is currently {status}. It can only be edited after the supervisor requests changes.
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-10 space-y-5" data-testid="thesis-form">
          <div className="field">
            <label>Title</label>
            <input
              type="text"
              required
              value={form.title}
              onChange={change("title")}
              disabled={!canEdit}
              data-testid="thesis-title-input"
            />
          </div>

          <div className="field">
            <label>Abstract</label>
            <textarea
              rows={6}
              required
              value={form.abstract}
              onChange={change("abstract")}
              disabled={!canEdit}
              data-testid="thesis-abstract-input"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="field">
              <label>Program</label>
              <input
                type="text"
                placeholder="e.g. MSc Computer Science"
                required
                value={form.program}
                onChange={change("program")}
                disabled={!canEdit}
                data-testid="thesis-program-input"
              />
            </div>
            <div className="field">
              <label>Year</label>
              <input
                type="number"
                required
                min="1900"
                max="2100"
                value={form.year}
                onChange={change("year")}
                disabled={!canEdit}
                data-testid="thesis-year-input"
              />
            </div>
          </div>

          <div className="field">
            <label>Keywords (comma separated)</label>
            <input
              type="text"
              placeholder="machine learning, healthcare, NLP"
              value={form.keywords}
              onChange={change("keywords")}
              disabled={!canEdit}
              data-testid="thesis-keywords-input"
            />
          </div>

          <div className="field">
            <label>PDF file</label>
            <div
              className="border border-dashed p-6 bg-white flex flex-col items-center justify-center text-center"
              style={{ borderColor: "var(--border-soft)" }}
            >
              <Upload size={22} strokeWidth={1.5} className="mb-2 text-neutral-500" />
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                disabled={!canEdit}
                data-testid="thesis-file-input"
              />
              {file && (
                <p className="mt-2 text-sm font-mono-plex text-neutral-600">
                  {file.name} ({Math.round(file.size / 1024)} KB)
                </p>
              )}
              {!file && existingFileName && (
                <p className="mt-2 text-xs font-mono-plex text-neutral-500">
                  Currently uploaded: {existingFileName}
                </p>
              )}
              <p className="mt-2 text-xs text-neutral-500">PDF only. Replace anytime while in draft.</p>
            </div>
          </div>

          {error && (
            <div className="p-3 border border-red-300 bg-red-50 text-sm text-red-700" data-testid="thesis-form-error">
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="submit"
              className="btn btn-primary flex-1 h-12"
              disabled={submitting || !canEdit}
              data-testid="thesis-save-button"
            >
              <Save size={14} strokeWidth={1.5} />
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Save as draft"}
            </button>
            <Link to="/student" className="btn btn-ghost h-12">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
