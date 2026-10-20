"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteEvent({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm(`Delete "${title}" from everyone's calendar?`)) return;
    setBusy(true);
    const res = await fetch(`/api/events/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) alert((await res.json()).error ?? "Couldn't delete");
    router.refresh();
  }

  return (
    <button className="link" onClick={remove} disabled={busy} style={{ color: "var(--danger)", fontSize: 14 }}>
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
