import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "student",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onChange = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const res = await register(form);
    setSubmitting(false);
    if (res.ok) {
      navigate(res.user.role === "student" ? "/student" : "/supervisor", { replace: true });
    } else {
      setError(res.error);
    }
  };

  return (
    <div className="paper-noise min-h-[calc(100vh-4rem)] flex items-center justify-center p-8">
      <div className="w-full max-w-md fade-up">
        <Link to="/" className="font-mono-plex text-xs uppercase tracking-widest text-neutral-500 link-underline">
          ← Back to repository
        </Link>
        <h1 className="font-serif text-4xl sm:text-5xl mt-6 tracking-tight">Create an account.</h1>
        <p className="text-neutral-700 mt-2">
          Join as a <em>student</em> to submit theses, or as a <em>supervisor</em> to review.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5" data-testid="register-form">
          <div className="field">
            <label>Full name</label>
            <input type="text" required value={form.name} onChange={onChange("name")} data-testid="register-name-input" />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" required value={form.email} onChange={onChange("email")} data-testid="register-email-input" />
          </div>
          <div className="field">
            <label>Password (min 6 chars)</label>
            <input type="password" required minLength={6} value={form.password} onChange={onChange("password")} data-testid="register-password-input" />
          </div>
          <div className="field">
            <label>Role</label>
            <select value={form.role} onChange={onChange("role")} data-testid="register-role-select">
              <option value="student">Student</option>
              <option value="supervisor">Supervisor</option>
            </select>
            <p className="text-xs text-neutral-500 mt-1">
              Admin accounts are created by the institution and cannot self-register.
            </p>
          </div>

          {error && (
            <div className="p-3 border border-red-300 bg-red-50 text-sm text-red-700" data-testid="register-error">
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary w-full h-12" disabled={submitting} data-testid="register-submit-button">
            {submitting ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-sm text-neutral-600">
          Already have an account?{" "}
          <Link to="/login" className="link-underline" data-testid="register-to-login-link">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
