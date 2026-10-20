"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DraftEvent, Member } from "@/lib/types";

type Image = { media_type: "image/jpeg"; data: string; preview: string };

const MAX_TEXT = 20000;

/** Shrinks a screenshot in the browser so uploads stay small and fast. */
async function shrinkImage(file: File): Promise<Image> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't open that image"));
      el.src = url;
    });
    const scale = Math.min(1, 1800 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { media_type: "image/jpeg", data: dataUrl.split(",")[1], preview: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function blankDraft(me: Member): DraftEvent {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { title: "", start_local: `${day}T19:00`, end_local: null, all_day: false, location: null, notes: null, attendee_handles: [me.handle] };
}

export function Composer({ me, members }: { me: Member; members: Member[] }) {
  const router = useRouter();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [image, setImage] = useState<Image | null>(null);
  const [query, setQuery] = useState<{ q: string; start: number } | null>(null);
  const [active, setActive] = useState(0);
  const [drafts, setDrafts] = useState<DraftEvent[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "reading" | "saving">(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const suggestions = query
    ? [
        { handle: "all", display_name: "Everyone" } as Pick<Member, "handle" | "display_name">,
        ...members,
      ]
        .filter((m) => m.handle.startsWith(query.q.toLowerCase()) || m.display_name.toLowerCase().startsWith(query.q.toLowerCase()))
        .slice(0, 6)
    : [];

  function updateQuery(value: string, caret: number) {
    const m = /(^|\s)@(\w*)$/.exec(value.slice(0, caret));
    setQuery(m ? { q: m[2], start: caret - m[2].length - 1 } : null);
    setActive(0);
  }

  function insertMention(handle: string) {
    const el = textRef.current;
    if (!el || !query) return;
    const caret = el.selectionStart;
    const next = `${text.slice(0, query.start)}@${handle} ${text.slice(caret)}`;
    setText(next);
    setQuery(null);
    const pos = query.start + handle.length + 2;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function addMentionChip(handle: string) {
    setText((t) => `${t}${t && !/\s$/.test(t) ? " " : ""}@${handle} `);
    textRef.current?.focus();
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      if (file.type.startsWith("image/")) {
        setImage(await shrinkImage(file));
      } else {
        // Chat exports (WhatsApp "Export chat" .txt) can be long; the newest messages are at the end.
        const content = await file.text();
        setText((t) => (t ? `${t}\n${content}` : content).slice(-MAX_TEXT));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file");
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function read() {
    setBusy("reading");
    setError(null);
    setDone(null);
    setNote(null);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, image: image && { media_type: image.media_type, data: image.data } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      const found = (json.events as DraftEvent[]).map((d) => ({
        ...d,
        attendee_handles: d.attendee_handles.includes(me.handle) ? d.attendee_handles : [me.handle, ...d.attendee_handles],
      }));
      setDrafts(found);
      setNote(found.length ? json.note : "No event found in that message. You can add one by hand.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!drafts?.length) return;
    if (drafts.some((d) => !d.title.trim() || !d.start_local)) {
      setError("Every event needs a title and a start.");
      return;
    }
    setBusy("saving");
    setError(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: drafts, source_message: text || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't save");
      setDone(`Added ${json.saved} event${json.saved === 1 ? "" : "s"}. Everyone tagged has been alerted.`);
      setDrafts(null);
      setText("");
      setImage(null);
      setNote(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setBusy(null);
    }
  }

  const patch = (i: number, p: Partial<DraftEvent>) =>
    setDrafts((ds) => ds && ds.map((d, j) => (j === i ? { ...d, ...p } : d)));

  return (
    <section className="card">
      <h2>Add from a message</h2>
      <div style={{ position: "relative" }}>
        <textarea
          ref={textRef}
          value={text}
          maxLength={MAX_TEXT}
          placeholder={`Paste a chat message, e.g.\n"Dinner Fri 7.30pm at Jumbo East Coast @${members[1]?.handle ?? "mei"} @${members[2]?.handle ?? "ali"}"`}
          onChange={(e) => {
            setText(e.target.value);
            updateQuery(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={(e) => {
            if (!suggestions.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % suggestions.length); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + suggestions.length) % suggestions.length); }
            else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(suggestions[active].handle); }
            else if (e.key === "Escape") setQuery(null);
          }}
          onBlur={() => setTimeout(() => setQuery(null), 150)}
        />
        {suggestions.length > 0 && (
          <div className="suggest" role="listbox">
            {suggestions.map((m, i) => (
              <button
                key={m.handle}
                type="button"
                role="option"
                aria-selected={i === active}
                className={i === active ? "active" : ""}
                onMouseDown={(e) => { e.preventDefault(); insertMention(m.handle); }}
              >
                @{m.handle} <span className="muted">{m.display_name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="chips" style={{ margin: "8px 0" }}>
        <span className="muted" style={{ alignSelf: "center" }}>Tag:</span>
        {members.filter((m) => m.id !== me.id).map((m) => (
          <button key={m.id} type="button" className="chip" onClick={() => addMentionChip(m.handle)}>
            @{m.handle}
          </button>
        ))}
        <button type="button" className="chip" onClick={() => addMentionChip("all")}>@all</button>
      </div>

      {image && (
        <div className="row" style={{ margin: "8px 0" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.preview} alt="Screenshot to read" style={{ maxHeight: 120, borderRadius: 8, border: "1px solid var(--border)" }} />
          <button type="button" className="ghost" onClick={() => setImage(null)}>Remove</button>
        </div>
      )}

      <div className="row">
        <button onClick={read} disabled={busy !== null || (!text.trim() && !image)}>
          {busy === "reading" ? "Reading…" : "Read message"}
        </button>
        <button type="button" className="ghost" onClick={() => fileRef.current?.click()}>
          Upload screenshot or chat .txt
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.txt,text/plain"
          hidden
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <button type="button" className="link" onClick={() => setDrafts((d) => [...(d ?? []), blankDraft(me)])}>
          Add by hand
        </button>
      </div>

      {note && <p className="muted" style={{ marginTop: 12 }}>{note}</p>}

      {drafts?.map((d, i) => (
        <div key={i} className="draft">
          <div className="row">
            <strong className="grow">Event {drafts.length > 1 ? i + 1 : ""}</strong>
            <button type="button" className="link" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
          <label>Title</label>
          <input type="text" value={d.title} onChange={(e) => patch(i, { title: e.target.value })} />

          <label className="row" style={{ color: "var(--text)" }}>
            <input
              type="checkbox"
              checked={d.all_day}
              onChange={(e) =>
                patch(i, {
                  all_day: e.target.checked,
                  start_local: e.target.checked ? d.start_local.slice(0, 10) : `${d.start_local.slice(0, 10)}T09:00`,
                  end_local: d.end_local && (e.target.checked ? d.end_local.slice(0, 10) : `${d.end_local.slice(0, 10)}T10:00`),
                })
              }
            />
            All day
          </label>

          <div className="grid2">
            <div>
              <label>Starts</label>
              <input
                type={d.all_day ? "date" : "datetime-local"}
                value={d.start_local}
                onChange={(e) => patch(i, { start_local: e.target.value })}
              />
            </div>
            <div>
              <label>Ends (optional)</label>
              <input
                type={d.all_day ? "date" : "datetime-local"}
                value={d.end_local ?? ""}
                onChange={(e) => patch(i, { end_local: e.target.value || null })}
              />
            </div>
          </div>

          <label>Where</label>
          <input type="text" value={d.location ?? ""} onChange={(e) => patch(i, { location: e.target.value || null })} />

          <label>Notes</label>
          <input type="text" value={d.notes ?? ""} onChange={(e) => patch(i, { notes: e.target.value || null })} />

          <label>Add to these calendars</label>
          <div className="chips">
            {members.map((m) => {
              const on = d.attendee_handles.includes(m.handle);
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`chip ${on ? "on" : ""}`}
                  aria-pressed={on}
                  onClick={() =>
                    patch(i, {
                      attendee_handles: on ? d.attendee_handles.filter((h) => h !== m.handle) : [...d.attendee_handles, m.handle],
                    })
                  }
                >
                  {on ? "✓ " : ""}{m.id === me.id ? "Me" : m.display_name}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {drafts && drafts.length > 0 && (
        <div className="row" style={{ marginTop: 16 }}>
          <button onClick={save} disabled={busy !== null}>
            {busy === "saving" ? "Adding…" : `Add ${drafts.length} event${drafts.length === 1 ? "" : "s"} to calendars`}
          </button>
          <button type="button" className="ghost" onClick={() => { setDrafts(null); setNote(null); }}>
            Cancel
          </button>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {done && <p className="ok">{done}</p>}
    </section>
  );
}
