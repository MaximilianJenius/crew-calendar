"use client";

import { useState } from "react";

export function CopyLink({ label, url, webcal }: { label: string; url: string; webcal: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Copy this link:", url);
    }
  }

  return (
    <div style={{ margin: "8px 0" }}>
      <label style={{ marginTop: 0 }}>{label}</label>
      <code className="link">{url}</code>
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" onClick={copy}>{copied ? "Copied ✓" : "Copy link"}</button>
        <a className="btn ghost" href={webcal}>Open in Calendar app</a>
      </div>
    </div>
  );
}
