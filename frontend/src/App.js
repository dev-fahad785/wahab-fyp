import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import Header from "@/components/Header";
import ProtectedRoute from "@/components/ProtectedRoute";
import PublicRepository from "@/pages/PublicRepository";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import StudentDashboard from "@/pages/StudentDashboard";
import ThesisForm from "@/pages/ThesisForm";
import SupervisorDashboard from "@/pages/SupervisorDashboard";
import AdminDashboard from "@/pages/AdminDashboard";

function Shell() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<PublicRepository />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/student"
          element={
            <ProtectedRoute roles={["student"]}>
              <StudentDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/new"
          element={
            <ProtectedRoute roles={["student"]}>
              <ThesisForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/edit/:id"
          element={
            <ProtectedRoute roles={["student"]}>
              <ThesisForm />
            </ProtectedRoute>
          }
        />
        <Route
          path="/supervisor"
          element={
            <ProtectedRoute roles={["supervisor", "admin"]}>
              <SupervisorDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<PublicRepository />} />
      </Routes>
      <footer className="border-t mt-16 py-10 text-center" style={{ borderColor: "var(--border-soft)" }}>
        <p className="font-mono-plex text-[11px] uppercase tracking-[0.3em] text-neutral-500">
          ThesisVault · The Modern Archive · {new Date().getFullYear()}
        </p>
      </footer>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
