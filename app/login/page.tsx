"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

/** Email + 6-digit code. No passwords. */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) {
      setError("That code didn't work. Check it, or send a new one.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="center">
      <div className="card">
        <h2>Sign in</h2>
        {step === "email" ? (
          <form onSubmit={sendCode}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="muted">We&apos;ll email you a 6-digit code.</p>
            <button disabled={busy} style={{ width: "100%" }}>
              {busy ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <p className="muted">
              Code sent to <strong>{email}</strong>. Check spam if you don&apos;t see it.
            </p>
            <label htmlFor="code">6-digit code</label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <div className="row" style={{ marginTop: 12 }}>
              <button disabled={busy} className="grow">
                {busy ? "Checking…" : "Sign in"}
              </button>
              <button type="button" className="ghost" onClick={() => setStep("email")}>
                Back
              </button>
            </div>
          </form>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </main>
  );
}
