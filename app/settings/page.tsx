import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { googleEnabled, isGoogleConnected } from "@/lib/google";
import { emailEnabled } from "@/lib/notify";
import { SubmitButton } from "../components/SubmitButton";
import { TimeZoneSelect } from "../components/TimeZoneSelect";
import { CopyLink } from "./CopyLink";
import { deleteMyAccount, disconnectGoogle, resetFeedLinks, saveExternalCalendar, saveProfile } from "./actions";

const MESSAGES: Record<string, string> = {
  profile: "Saved.",
  link: "Calendar linked. Your busy times now show for the group.",
  unlinked: "Calendar unlinked.",
  reset: "New links made. Re-subscribe with the links below; the old ones no longer work.",
};

const ERRORS: Record<string, string> = {
  save: "That didn't save. Nothing was changed; try again.",
  timezone: "Pick a timezone from the list. Nothing was changed.",
  badlink: "That link didn't look right. It should start with https:// or webcal://.",
  confirm: "To delete your account, type your handle exactly as shown.",
  delete: "Your account couldn't be deleted. Try again.",
  delete_google:
    "Google Calendar couldn't be reached to remove your events, so your account wasn't deleted. Try again shortly.",
};

const GOOGLE_MESSAGES: Record<string, string> = {
  connected: "Google Calendar connected. New events you're tagged in go straight into it.",
  disconnected: "Google Calendar disconnected.",
  error: "Google connection didn't finish. Try again.",
  off: "Google sign-in isn't set up on this site yet. Use the subscribe link below.",
};

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const me = await requireMember();
  const params = await searchParams;
  const google = await isGoogleConnected(me.id);

  const base = process.env.APP_URL ?? "";
  const mine = `${base}/api/feed/${me.feed_token}.ics`;
  const group = `${base}/api/feed/${me.group_feed_token}.ics`;
  const webcal = (u: string) => u.replace(/^https?:\/\//, "webcal://");
  const saved = typeof params.saved === "string" ? MESSAGES[params.saved] : null;
  const googleMsg = typeof params.google === "string" ? GOOGLE_MESSAGES[params.google] : null;
  const errorMsg = typeof params.error === "string" ? ERRORS[params.error] : null;

  return (
    <main className="wrap">
      <header className="top">
        <h1>Settings</h1>
        <nav>
          <Link href="/">← Back to calendar</Link>
        </nav>
      </header>

      {params.welcome && (
        <section className="card" style={{ borderColor: "var(--accent)" }}>
          <h2>Welcome, {me.display_name}!</h2>
          <p style={{ margin: 0 }}>
            One last step: choose how events get into <strong>your</strong> calendar app below. People can now tag you
            as <strong>@{me.handle}</strong>.
          </p>
        </section>
      )}
      <div role="status">{(saved || googleMsg) && <p className="ok">{saved ?? googleMsg}</p>}</div>
      <div role="alert">{errorMsg && <p className="error">{errorMsg}</p>}</div>

      <section className="card">
        <h2>1. Get tagged events in your calendar</h2>

        <h3 style={{ fontSize: 15, margin: "8px 0 4px" }}>Use Google Calendar? Connect it (instant)</h3>
        {google ? (
          <div className="row">
            <span className="grow">✓ Connected{google.email ? ` as ${google.email}` : ""}</span>
            <form action={disconnectGoogle}>
              <SubmitButton
                className="danger"
                pending="Disconnecting…"
                confirm="Disconnect Google Calendar? New events won't be added to it, and this site loses access to it. Events already added stay."
              >
                Disconnect
              </SubmitButton>
            </form>
          </div>
        ) : googleEnabled() ? (
          <a className="btn" href="/api/google/connect">
            Connect Google Calendar
          </a>
        ) : (
          <p className="muted">Not set up on this site. Use the subscribe link below instead.</p>
        )}
        <p className="muted">
          Events you&apos;re tagged in appear in your Google Calendar right away. With Google connected, you don&apos;t
          need the link below; your personal link skips those events, so nothing shows up twice.
        </p>

        <h3 style={{ fontSize: 15, margin: "16px 0 4px" }}>Any other calendar: subscribe to your link</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Works with Yahoo, iPhone, Android, Outlook and Google. Your calendar app checks it for new events on its own,
          from every few minutes to every few hours depending on the app.
        </p>
        <CopyLink label="Your events" url={mine} webcal={webcal(mine)} />

        <details>
          <summary>How to subscribe</summary>
          <p>
            <strong>iPhone / iPad</strong>
          </p>
          <ol className="steps">
            <li>
              Tap <em>Open in Calendar app</em> above, then <em>Subscribe</em>.
            </li>
            <li>For faster updates: Settings → Apps → Calendar → Accounts → Fetch New Data → Every 15 minutes.</li>
          </ol>
          <p>
            <strong>Yahoo Calendar</strong> (on a computer)
          </p>
          <ol className="steps">
            <li>
              Copy the link. In Yahoo Calendar, click <em>Actions</em> (or the ⋮ next to <em>Other calendars</em>) →{" "}
              <em>Follow other calendars</em>.
            </li>
            <li>
              Give it a name, paste the link into <em>iCal address</em>, then click <em>Save</em>.
            </li>
          </ol>
          <p>
            <strong>Google Calendar</strong> (if you&apos;d rather not connect it)
          </p>
          <ol className="steps">
            <li>
              On a computer, open calendar.google.com → <em>Other calendars</em> + → <em>From URL</em>.
            </li>
            <li>Paste the link. Google can take several hours to pick up new events this way. Connecting is faster.</li>
          </ol>
          <p>
            <strong>Android phone calendar (Samsung etc.)</strong>
          </p>
          <ol className="steps">
            <li>If your phone calendar syncs with a Google account, use the Google steps above.</li>
            <li>
              If it only keeps events on the phone, install the free app <em>ICSx⁵</em> from the Play Store, tap +, and
              paste the link.
            </li>
          </ol>
          <p>
            <strong>Outlook</strong>: Add calendar → Subscribe from web → paste the link.
          </p>
        </details>

        <details>
          <summary>Want the whole group&apos;s events, not just yours?</summary>
          <CopyLink label="Everyone's events" url={group} webcal={webcal(group)} />
        </details>

        <form action={resetFeedLinks} style={{ marginTop: 8 }}>
          <SubmitButton
            className="link"
            pending="Making new links…"
            confirm="Make new links? Both links above stop working right away, on every phone and calendar app you've subscribed with. You'll need to subscribe again with the new links."
          >
            Shared a link by mistake? Make new links
          </SubmitButton>
        </form>
      </section>

      <section className="card">
        <h2>2. Let the group see when you&apos;re busy (optional)</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Paste your own calendar&apos;s private link. The group sees your busy times on the home page and in the daily
          email. Only the times are shown to others, not what you&apos;re doing.
        </p>
        <form action={saveExternalCalendar}>
          <label htmlFor="url">Your calendar&apos;s private iCal link</label>
          <input
            id="url"
            name="url"
            type="url"
            defaultValue={me.external_ics_url ?? ""}
            placeholder="https://… or webcal://…"
          />
          <div className="row" style={{ marginTop: 8 }}>
            <SubmitButton>Save</SubmitButton>
          </div>
        </form>
        <details>
          <summary>Where do I find my link?</summary>
          <p>
            <strong>Google</strong>: on a computer, calendar.google.com → ⚙ Settings → click your calendar on the left →{" "}
            <em>Integrate calendar</em> → copy <em>Secret address in iCal format</em>.
          </p>
          <p>
            <strong>Yahoo</strong>: Yahoo Calendar → hover your calendar → ⋮ → <em>Share</em> → <em>View only</em> →
            copy the <em>ICS</em> link.
          </p>
          <p>
            <strong>iPhone (iCloud)</strong>: Calendar app → <em>Calendars</em> → ⓘ next to yours → turn on{" "}
            <em>Public Calendar</em> → <em>Share Link</em>. Anyone with this link can see your events, so share it only
            here.
          </p>
          <p>
            <strong>Phone-only calendar</strong>: these have no link, so a website can&apos;t read them. Move them to
            Google or iCloud, or add your plans in this app instead.
          </p>
        </details>
      </section>

      <section className="card">
        <h2>3. You</h2>
        <form action={saveProfile}>
          <label htmlFor="name">Name</label>
          <input id="name" name="name" type="text" defaultValue={me.display_name} />
          <label htmlFor="timezone">Timezone</label>
          <TimeZoneSelect id="timezone" name="timezone" defaultValue={me.timezone} />
          <p className="muted">
            Handle: @{me.handle} · Email: {me.email}
          </p>
          <label className="row" style={{ color: "var(--text)" }}>
            <input type="checkbox" name="notify_email" defaultChecked={me.notify_email} />
            Email me when I&apos;m tagged, plus a daily summary
          </label>
          {!emailEnabled() && (
            <p className="muted">Email alerts aren&apos;t set up on this site yet; in-app alerts still work.</p>
          )}
          <SubmitButton style={{ marginTop: 8 }}>Save</SubmitButton>
        </form>
      </section>

      <section className="card">
        <h2>4. Delete my account</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Removes your profile, email, calendar links, Google connection and alerts from this site, and revokes its
          Google access. Events you added are cancelled for everyone. Events others added stay, without you.
        </p>
        <form action={deleteMyAccount}>
          <label htmlFor="confirm_handle">Type your handle ({me.handle}) to confirm</label>
          <input
            id="confirm_handle"
            name="confirm_handle"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            required
          />
          <SubmitButton
            className="danger"
            style={{ marginTop: 8 }}
            pending="Deleting…"
            confirm="Delete your account and cancel every event you added? This can't be undone."
          >
            Delete my account
          </SubmitButton>
        </form>
      </section>
    </main>
  );
}
