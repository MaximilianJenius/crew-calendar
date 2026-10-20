"use client";

import { useId } from "react";
import type { DraftEvent, Member } from "@/lib/types";

/** Review form for one draft event. */
export function DraftEditor({
  draft: d,
  index,
  total,
  me,
  members,
  onChange,
  onRemove,
}: {
  draft: DraftEvent;
  index: number;
  total: number;
  me: Member;
  members: Member[];
  onChange: (patch: Partial<DraftEvent>) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const f = (name: string) => `${id}-${name}`;
  const heading = `Event${total > 1 ? ` ${index + 1}` : ""}`;

  return (
    <fieldset className="draft" aria-labelledby={f("heading")}>
      <div className="row">
        <strong id={f("heading")} className="grow">
          {heading}
        </strong>
        <button type="button" className="link" onClick={onRemove} aria-label={`Remove ${heading}`}>
          Remove
        </button>
      </div>
      <label htmlFor={f("title")}>Title</label>
      <input id={f("title")} type="text" value={d.title} onChange={(e) => onChange({ title: e.target.value })} />

      <label className="row" style={{ color: "var(--text)" }}>
        <input
          type="checkbox"
          checked={d.all_day}
          onChange={(e) =>
            onChange({
              all_day: e.target.checked,
              start_local: e.target.checked ? d.start_local.slice(0, 10) : `${d.start_local.slice(0, 10)}T09:00`,
              end_local:
                d.end_local && (e.target.checked ? d.end_local.slice(0, 10) : `${d.end_local.slice(0, 10)}T10:00`),
            })
          }
        />
        All day
      </label>

      <div className="grid2">
        <div>
          <label htmlFor={f("start")}>Starts</label>
          <input
            id={f("start")}
            type={d.all_day ? "date" : "datetime-local"}
            value={d.start_local}
            aria-describedby={f("tz")}
            onChange={(e) => onChange({ start_local: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor={f("end")}>Ends (optional)</label>
          <input
            id={f("end")}
            type={d.all_day ? "date" : "datetime-local"}
            value={d.end_local ?? ""}
            min={d.start_local}
            aria-describedby={f("tz")}
            onChange={(e) => onChange({ end_local: e.target.value || null })}
          />
        </div>
      </div>
      {!d.all_day && (
        <p id={f("tz")} className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
          Times in {me.timezone}. An end earlier than the start means the next day.
        </p>
      )}

      <label htmlFor={f("where")}>Where</label>
      <input
        id={f("where")}
        type="text"
        value={d.location ?? ""}
        onChange={(e) => onChange({ location: e.target.value || null })}
      />

      <label htmlFor={f("notes")}>Notes</label>
      <input
        id={f("notes")}
        type="text"
        value={d.notes ?? ""}
        onChange={(e) => onChange({ notes: e.target.value || null })}
      />

      <div id={f("who")} className="label">
        Add to these calendars
      </div>
      <div className="chips" role="group" aria-labelledby={f("who")}>
        {members.map((m) => {
          const on = d.attendee_handles.includes(m.handle);
          return (
            <button
              key={m.id}
              type="button"
              className={`chip ${on ? "on" : ""}`}
              aria-pressed={on}
              onClick={() =>
                onChange({
                  attendee_handles: on
                    ? d.attendee_handles.filter((h) => h !== m.handle)
                    : [...d.attendee_handles, m.handle],
                })
              }
            >
              {on ? "✓ " : ""}
              {m.id === me.id ? "Me" : m.display_name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
