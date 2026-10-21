import type { EventWithAttendees } from "@/lib/events";
import { formatWhen } from "@/lib/time";
import type { Member } from "@/lib/types";
import { DeleteEvent } from "./DeleteEvent";

export function EventCard({ event, me, byId }: { event: EventWithAttendees; me: Member; byId: Map<string, Member> }) {
  const mine = event.event_attendees.some((a) => a.user_id === me.id);
  return (
    <article className={`event ${mine ? "mine" : ""}`}>
      <div className="row">
        <span className="title grow">{event.title}</span>
        {event.created_by === me.id && <DeleteEvent id={event.id} title={event.title} />}
      </div>
      <div className="meta">
        {formatWhen(event, me.timezone)}
        {event.location && ` · ${event.location}`}
      </div>
      <div className="chips" style={{ marginTop: 6 }}>
        {event.event_attendees.map((a) => {
          const m = byId.get(a.user_id);
          return m ? (
            <span key={a.user_id} className={`chip ${a.user_id === me.id ? "me" : ""}`}>
              {a.user_id === me.id ? "You" : m.display_name}
            </span>
          ) : null;
        })}
      </div>
      {event.notes && (
        <div className="meta" style={{ marginTop: 6 }}>
          {event.notes}
        </div>
      )}
      <div className="meta" style={{ marginTop: 4, fontSize: 13 }}>
        Added by {byId.get(event.created_by)?.display_name ?? "someone"}
      </div>
    </article>
  );
}
