"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/http";

export function DeleteEvent({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!confirm(`Delete "${title}" from everyone's calendar? This can't be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      await postJson(`/api/events/${id}`, undefined, "DELETE");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      <button
        className="link"
        onClick={() => void remove()}
        disabled={busy}
        style={{ color: "var(--danger)", fontSize: 14 }}
      >
        {busy ? "Deleting…" : "Delete"}
      </button>
      {error && (
        <span role="alert" className="error" style={{ display: "block" }}>
          {error}
        </span>
      )}
    </span>
  );
}
