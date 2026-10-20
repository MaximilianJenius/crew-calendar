"use client";

import { useActionState, useEffect, useState } from "react";
import { joinGroup } from "./actions";

export function JoinForm() {
  const [state, action, pending] = useActionState(joinGroup, { error: null });
  const [tz, setTz] = useState("Asia/Singapore");
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone), []);

  return (
    <form action={action}>
      <label htmlFor="name">Your name</label>
      <input id="name" name="name" type="text" required maxLength={40} autoComplete="given-name" />

      <label htmlFor="handle">Handle (what people type after @)</label>
      <input id="handle" name="handle" type="text" required maxLength={20} placeholder="e.g. mei" autoCapitalize="none" />

      <label htmlFor="timezone">Timezone</label>
      <input id="timezone" name="timezone" type="text" value={tz} onChange={(e) => setTz(e.target.value)} />

      <label htmlFor="invite">Invite code</label>
      <input id="invite" name="invite" type="text" required autoCapitalize="none" />

      <button disabled={pending} style={{ width: "100%", marginTop: 16 }}>
        {pending ? "Joining…" : "Join"}
      </button>
      {state.error && <p className="error">{state.error}</p>}
    </form>
  );
}
