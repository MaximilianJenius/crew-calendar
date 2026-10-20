import "server-only";
import ical from "node-ical";
import type { Member } from "./types";

export type BusyBlock = {
  member: Member;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
};

const text = (v: unknown): string =>
  typeof v === "string" ? v : v && typeof v === "object" && "val" in v ? String((v as { val: unknown }).val) : "";

/** Accepts webcal:// links (what Google/Yahoo/iCloud hand out) and only fetches https. */
export function normaliseIcsUrl(raw: string): string | null {
  const url = raw.trim().replace(/^webcal:\/\//i, "https://");
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Reads each member's own calendar from the private link they pasted in Settings,
 * so the group can see when people are busy. A bad link just yields nothing.
 */
export async function fetchBusy(
  members: (Member & { external_ics_url: string | null })[],
  from: Date,
  to: Date,
): Promise<BusyBlock[]> {
  const results = await Promise.all(
    members
      .filter((m) => m.external_ics_url)
      .map(async (m) => {
        try {
          const res = await fetch(m.external_ics_url!, {
            signal: AbortSignal.timeout(8000),
            next: { revalidate: 900 },
          });
          if (!res.ok) return [];
          const parsed = ical.parseICS(await res.text());
          const blocks: BusyBlock[] = [];
          for (const item of Object.values(parsed)) {
            if (!item || item.type !== "VEVENT") continue;
            for (const inst of ical.expandRecurringEvent(item, { from, to, expandOngoing: true })) {
              blocks.push({
                member: { id: m.id, display_name: m.display_name, handle: m.handle, timezone: m.timezone },
                title: text(inst.summary) || "Busy",
                starts_at: new Date(inst.start).toISOString(),
                ends_at: new Date(inst.end ?? inst.start).toISOString(),
                all_day: inst.isFullDay,
              });
            }
          }
          return blocks;
        } catch (err) {
          console.error("external calendar failed", m.handle, err);
          return [];
        }
      }),
  );
  return results.flat().sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}
