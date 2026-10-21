import "server-only";
import { request } from "node:https";
import { lookup as dnsLookup } from "node:dns";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { unstable_cache } from "next/cache";
import ical from "node-ical";
import type { Member } from "./types";

export type BusyBlock = {
  member: Member;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  /** The zone the block's dates belong to. All-day blocks are calendar dates, carried as UTC midnights. */
  timezone: string;
};

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 8000;
/** Whole-fetch budget across redirects; per-socket timeouts alone reset whenever a byte arrives. */
const DEADLINE_MS = 10000;

/** node-ical builds a DATE value as midnight in the server's own zone; this keeps the date, at UTC midnight. */
const asUtcDate = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

const text = (v: unknown): string =>
  typeof v === "string" ? v : v && typeof v === "object" && "val" in v ? String(v.val) : "";

/** Accepts webcal:// links (what Google/Yahoo/iCloud hand out) and only fetches https. */
export function normaliseIcsUrl(raw: string): string | null {
  const url = raw.trim().replace(/^webcal:\/\//i, "https://");
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password) return null;
    if (isIP(u.hostname.replace(/^\[|\]$/g, "")) && isPrivateAddress(u.hostname.replace(/^\[|\]$/g, ""))) return null;
    if (u.hostname === "localhost" || u.hostname.endsWith(".localhost") || u.hostname.endsWith(".internal")) {
      return null;
    }
    return u.toString();
  } catch {
    return null;
  }
}

// Loopback, private, link-local (cloud metadata), CGNAT, multicast and other non-public ranges.
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

export function isPrivateAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return blocked.check(mapped[1], "ipv4");
  const family = isIP(address);
  if (family === 4) return blocked.check(address, "ipv4");
  if (family === 6) return blocked.check(address, "ipv6");
  return true;
}

/**
 * DNS lookup that refuses non-public addresses. Used as the socket's own resolver, so the address that's
 * checked is the address that's connected to (no gap for DNS rebinding).
 */
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = addresses as unknown as { address: string; family: number }[];
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (!list.length || bad) {
      return callback(
        Object.assign(new Error(`Refusing non-public address for ${hostname}`), { code: "EBLOCKED" }),
        "",
        0,
      );
    }
    if ((options as { all?: boolean }).all) return (callback as (e: null, a: typeof list) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

function getOnce(url: URL, signal: AbortSignal): Promise<{ status: number; location?: string; body?: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        lookup: publicOnlyLookup,
        timeout: TIMEOUT_MS,
        signal,
        headers: { Accept: "text/calendar, */*" },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location });
        }
        if (Number(res.headers["content-length"] ?? 0) > MAX_BYTES) {
          res.destroy();
          return reject(new Error("Calendar too large"));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            res.destroy();
            reject(new Error("Calendar too large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status, body: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Calendar fetch timed out")));
    req.on("error", reject);
    req.end();
  });
}

/** Fetches an https URL, re-checking every redirect hop, refusing private addresses and capping the size. */
export async function fetchPublicText(raw: string): Promise<string | null> {
  let url = raw;
  const signal = AbortSignal.timeout(DEADLINE_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const safe = normaliseIcsUrl(url);
    if (!safe) return null;
    const res = await getOnce(new URL(safe), signal);
    if (res.location !== undefined) {
      url = new URL(res.location, safe).toString();
      continue;
    }
    return res.status >= 200 && res.status < 300 ? (res.body ?? "") : null;
  }
  return null;
}

// Members' calendars change slowly; cache them so page loads don't wait on other sites every time.
const cachedIcs = unstable_cache(fetchPublicText, ["external-ics"], { revalidate: 900 });

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
          const body = await cachedIcs(m.external_ics_url!);
          if (!body) return [];
          const parsed = ical.parseICS(body);
          const blocks: BusyBlock[] = [];
          for (const item of Object.values(parsed)) {
            if (!item || item.type !== "VEVENT") continue;
            for (const inst of ical.expandRecurringEvent(item, { from, to, expandOngoing: true })) {
              blocks.push({
                member: { id: m.id, display_name: m.display_name, handle: m.handle, timezone: m.timezone },
                title: text(inst.summary) || "Busy",
                starts_at: (inst.isFullDay ? asUtcDate(inst.start) : new Date(inst.start)).toISOString(),
                ends_at: (inst.isFullDay
                  ? asUtcDate(inst.end ?? inst.start)
                  : new Date(inst.end ?? inst.start)
                ).toISOString(),
                all_day: inst.isFullDay,
                // All-day dates are carried as UTC midnights, so reading them in UTC keeps the right day.
                timezone: "UTC",
              });
            }
          }
          return blocks;
        } catch (err) {
          console.error("external calendar failed", m.handle, err instanceof Error ? err.message : "unknown");
          return [];
        }
      }),
  );
  return results.flat().sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}
