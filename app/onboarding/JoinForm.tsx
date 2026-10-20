"use client";

import { useActionState, useSyncExternalStore } from "react";
import { DEFAULT_TZ } from "@/lib/time";
import { joinGroup } from "./actions";

const noSubscribe = () => () => {};

export function JoinForm({ zones }: { zones: string[] }) {
  const [state, action, pending] = useActionState(joinGroup, { error: null });
  // The server can't know the visitor's timezone; the browser fills it in after hydration.
  const detected = useSyncExternalStore(
    noSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => DEFAULT_TZ,
  );
  const initial = zones.includes(detected) ? detected : DEFAULT_TZ;

  return (
    <form action={action}>
      <label htmlFor="name">Your name</label>
      <input id="name" name="name" type="text" required maxLength={40} autoComplete="given-name" />

      <label htmlFor="handle">Handle (what people type after @)</label>
      <input
        id="handle"
        name="handle"
        type="text"
        required
        maxLength={20}
        placeholder="e.g. mei"
        autoCapitalize="none"
      />

      <label htmlFor="timezone">Timezone</label>
      <select key={initial} id="timezone" name="timezone" defaultValue={initial}>
        {zones.map((z) => (
          <option key={z} value={z}>
            {z.replaceAll("_", " ")}
          </option>
        ))}
      </select>

      <label htmlFor="invite">Invite code</label>
      <input id="invite" name="invite" type="text" required autoCapitalize="none" autoComplete="off" />

      <button disabled={pending} style={{ width: "100%", marginTop: 16 }}>
        {pending ? "Joining…" : "Join"}
      </button>
      <div role="alert">{state.error && <p className="error">{state.error}</p>}</div>
    </form>
  );
}
