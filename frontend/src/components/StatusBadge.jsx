import React from "react";
import { statusLabel } from "@/lib/api";

const CLASS_MAP = {
  draft: "badge badge-draft",
  submitted: "badge badge-submitted",
  approved: "badge badge-approved",
  rejected: "badge badge-rejected",
  changes: "badge badge-changes",
  published: "badge badge-published",
};

export default function StatusBadge({ status }) {
  const cls = CLASS_MAP[status] || "badge badge-draft";
  return (
    <span className={cls} data-testid={`thesis-status-${status}`}>
      {statusLabel(status)}
    </span>
  );
}
