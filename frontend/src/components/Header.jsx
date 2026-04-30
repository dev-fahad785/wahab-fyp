import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { BookOpen, LogOut, Menu } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = React.useState(false);

  const handleLogout = () => {
    logout();
    setMenuOpen(false);
    navigate("/");
  };

  const navLinks = [
    { to: "/", label: "Repository" },
    user && user.role === "student" && { to: "/student", label: "My Theses" },
    user && (user.role === "supervisor" || user.role === "admin") && { to: "/supervisor", label: "Review Queue" },
    user && user.role === "admin" && { to: "/admin", label: "Admin" },
  ].filter(Boolean);

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-md border-b"
      style={{ background: "rgba(253,252,248,0.85)", borderColor: "var(--border-soft)" }}
      data-testid="site-header"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5" data-testid="brand-logo-link">
          <BookOpen size={22} strokeWidth={1.5} />
          <span className="font-serif text-2xl tracking-tight">ThesisVault</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`link-underline text-sm ${location.pathname === l.to ? "opacity-100" : "opacity-70"}`}
              data-testid={`nav-${l.label.toLowerCase().replace(/\s+/g, "-")}-link`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <>
              <div className="flex flex-col items-end leading-tight">
                <span className="text-sm font-medium">{user.name}</span>
                <span className="font-mono-plex text-[10px] uppercase tracking-widest text-neutral-500">
                  {user.role}
                </span>
              </div>
              <button className="btn btn-ghost" onClick={handleLogout} data-testid="logout-button">
                <LogOut size={14} strokeWidth={1.5} />
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost" data-testid="login-link">
                Sign in
              </Link>
              <Link to="/register" className="btn btn-primary" data-testid="register-link">
                Create account
              </Link>
            </>
          )}
        </div>

        <button
          className="md:hidden btn btn-ghost"
          onClick={() => setMenuOpen((v) => !v)}
          data-testid="mobile-menu-toggle"
          aria-label="Menu"
        >
          <Menu size={18} strokeWidth={1.5} />
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t" style={{ borderColor: "var(--border-soft)" }}>
          <div className="px-4 py-3 flex flex-col gap-3">
            {navLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => setMenuOpen(false)}
                className="text-sm"
                data-testid={`mobile-nav-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {l.label}
              </Link>
            ))}
            <div className="divider-thin" />
            {user ? (
              <button className="btn btn-outline" onClick={handleLogout} data-testid="mobile-logout-button">
                Sign out ({user.role})
              </button>
            ) : (
              <div className="flex gap-2">
                <Link to="/login" className="btn btn-ghost flex-1" onClick={() => setMenuOpen(false)}>Sign in</Link>
                <Link to="/register" className="btn btn-primary flex-1" onClick={() => setMenuOpen(false)}>Create</Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
