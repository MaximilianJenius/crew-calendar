"use client";

import { useId, useState, type RefObject } from "react";
import type { Member } from "@/lib/types";

type Suggestion = Pick<Member, "handle" | "display_name">;

/** Textarea with an accessible @-mention combobox. */
export function MentionTextarea({
  textRef,
  value,
  onChange,
  members,
  maxLength,
  label,
  placeholder,
}: {
  textRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  members: Member[];
  maxLength: number;
  label: string;
  placeholder: string;
}) {
  const id = useId();
  const listId = `${id}-mentions`;
  const [query, setQuery] = useState<{ q: string; start: number } | null>(null);
  const [active, setActive] = useState(0);

  const suggestions: Suggestion[] = query
    ? [{ handle: "all", display_name: "Everyone" }, ...members]
        .filter(
          (m) =>
            m.handle.startsWith(query.q.toLowerCase()) ||
            m.display_name.toLowerCase().startsWith(query.q.toLowerCase()),
        )
        .slice(0, 6)
    : [];
  const open = suggestions.length > 0;
  const optionId = (i: number) => `${id}-opt-${i}`;

  function updateQuery(text: string, caret: number) {
    const m = /(^|\s)@(\w*)$/.exec(text.slice(0, caret));
    setQuery(m ? { q: m[2], start: caret - m[2].length - 1 } : null);
    setActive(0);
  }

  function insertMention(handle: string) {
    const el = textRef.current;
    if (!el || !query) return;
    const caret = el.selectionStart;
    onChange(`${value.slice(0, query.start)}@${handle} ${value.slice(caret)}`);
    setQuery(null);
    const pos = query.start + handle.length + 2;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <div style={{ position: "relative" }}>
      <label htmlFor={id} style={{ marginTop: 0 }}>
        {label}
      </label>
      <textarea
        id={id}
        ref={textRef}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        onChange={(e) => {
          onChange(e.target.value);
          updateQuery(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            insertMention(suggestions[active].handle);
          } else if (e.key === "Escape") {
            setQuery(null);
          }
        }}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
      />
      <div id={listId} className="suggest" role="listbox" aria-label="Members to tag" hidden={!open}>
        {suggestions.map((m, i) => (
          <div
            key={m.handle}
            id={optionId(i)}
            role="option"
            aria-selected={i === active}
            className={`option ${i === active ? "active" : ""}`}
            onMouseDown={(e) => {
              e.preventDefault();
              insertMention(m.handle);
            }}
          >
            @{m.handle} <span className="muted">{m.display_name}</span>
          </div>
        ))}
      </div>
      <span className="sr-only" aria-live="polite">
        {open ? `${suggestions.length} members match. Use up and down arrows, Enter to tag.` : ""}
      </span>
    </div>
  );
}
