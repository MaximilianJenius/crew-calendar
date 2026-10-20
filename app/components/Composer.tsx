"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/http";
import { MAX_MESSAGE_CHARS } from "@/lib/schema";
import type { DraftEvent, Member } from "@/lib/types";
import { DraftEditor } from "./DraftEditor";
import { MentionTextarea } from "./MentionTextarea";

type Image = { media_type: "image/jpeg"; data: string; preview: string };

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
  return {
    title: "",
    start_local: `${day}T19:00`,
    end_local: null,
    all_day: false,
    location: null,
    notes: null,
    attendee_handles: [me.handle],
  };
}

export function Composer({ me, members }: { me: Member; members: Member[] }) {
  const router = useRouter();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [image, setImage] = useState<Image | null>(null);
  const [drafts, setDrafts] = useState<DraftEvent[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "reading" | "saving">(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

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
        setText((t) => (t ? `${t}\n${content}` : content).slice(-MAX_MESSAGE_CHARS));
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
      const json = await postJson<{ events: DraftEvent[]; note: string | null }>("/api/parse", {
        message: text,
        image: image && { media_type: image.media_type, data: image.data },
      });
      const found = json.events.map((d) => ({
        ...d,
        attendee_handles: d.attendee_handles.includes(me.handle)
          ? d.attendee_handles
          : [me.handle, ...d.attendee_handles],
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
      // The server saves all drafts or none, so on failure the drafts stay here and retrying can't duplicate.
      const json = await postJson<{ saved: number }>("/api/events", { events: drafts });
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
    <section className="card" aria-labelledby="composer-heading">
      <h2 id="composer-heading">Add from a message</h2>
      <MentionTextarea
        textRef={textRef}
        value={text}
        onChange={setText}
        members={members}
        maxLength={MAX_MESSAGE_CHARS}
        label="Chat message"
        placeholder={`Paste a chat message, e.g.\n"Dinner Fri 7.30pm at Jumbo East Coast @${members[1]?.handle ?? "mei"} @${members[2]?.handle ?? "ali"}"`}
      />

      <div className="chips" style={{ margin: "8px 0" }} role="group" aria-label="Tag a member">
        <span className="muted" style={{ alignSelf: "center" }}>
          Tag:
        </span>
        {members
          .filter((m) => m.id !== me.id)
          .map((m) => (
            <button key={m.id} type="button" className="chip" onClick={() => addMentionChip(m.handle)}>
              @{m.handle}
            </button>
          ))}
        <button type="button" className="chip" onClick={() => addMentionChip("all")}>
          @all
        </button>
      </div>

      {image && (
        <div className="row" style={{ margin: "8px 0" }}>
          {/* A data: URL preview; next/image can't optimise it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.preview}
            alt="Screenshot to read"
            style={{ maxHeight: 120, borderRadius: 8, border: "1px solid var(--border)" }}
          />
          <button type="button" className="ghost" onClick={() => setImage(null)}>
            Remove screenshot
          </button>
        </div>
      )}

      <div className="row">
        <button onClick={() => void read()} disabled={busy !== null || (!text.trim() && !image)}>
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
          aria-label="Screenshot or chat export"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <button type="button" className="link" onClick={() => setDrafts((d) => [...(d ?? []), blankDraft(me)])}>
          Add by hand
        </button>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>
        &ldquo;Read message&rdquo; sends the text or screenshot, plus members&apos; names and handles, to
        Anthropic&apos;s Claude to find the events. It isn&apos;t stored here.
      </p>

      <div role="status" aria-live="polite">
        {busy === "reading" && <span className="sr-only">Reading the message…</span>}
        {note && (
          <p className="muted" style={{ marginTop: 12 }}>
            {note}
          </p>
        )}
      </div>

      {drafts?.map((d, i) => (
        <DraftEditor
          key={i}
          draft={d}
          index={i}
          total={drafts.length}
          me={me}
          members={members}
          onChange={(p) => patch(i, p)}
          onRemove={() => setDrafts(drafts.filter((_, j) => j !== i))}
        />
      ))}

      {drafts && drafts.length > 0 && (
        <div className="row" style={{ marginTop: 16 }}>
          <button onClick={() => void save()} disabled={busy !== null}>
            {busy === "saving" ? "Adding…" : `Add ${drafts.length} event${drafts.length === 1 ? "" : "s"} to calendars`}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setDrafts(null);
              setNote(null);
            }}
          >
            Cancel
          </button>
        </div>
      )}

      <div role="alert">{error && <p className="error">{error}</p>}</div>
      <div role="status" aria-live="polite">
        {done && <p className="ok">{done}</p>}
      </div>
    </section>
  );
}
