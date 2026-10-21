# Crew Calendar

A shared calendar for a small group (up to 10 people). Paste a chat message or upload a screenshot, tag people with
`@handle`, and the event goes into each tagged person's own calendar app: Google, Yahoo, iPhone, Android or Outlook.

## What it does

- **Sign in with an email code.** No passwords. New people also need the group's invite code.
- **Paste, upload or type.** Paste text, upload a chat screenshot or a WhatsApp "Export chat" `.txt`, or fill in the form.
  Claude reads it and works out the title, date, time, place and who's tagged. You check the details and press _Add_.
- **Events reach everyone's calendar:**
  - **Google users** connect once. Events they're tagged in go straight into their Google Calendar, and deleting an
    event removes it there too.
  - **Everyone else** (Yahoo, iPhone, Android, Outlook) subscribes once to a personal link. Their calendar app picks up
    new events by itself. Each event has a 30-minute reminder, so phones alert as usual.
- **Alerts.**
  - In the app: "Mei added you to Dinner".
  - Optional email when you're tagged.
  - A daily email summary of the next 24 hours.
- **See each other's busy times.** Anyone can paste the private iCal link of their own Google, Yahoo or iCloud
  calendar. The group then sees when they're busy, on the home page and in the daily email. Only the times are shown,
  not what the event is.

### What it can't do

- **Phone-only calendars are one-way.** If someone's events live only on their phone, with no Google or iCloud account
  behind them, no website can read them. Events can still be _sent_ to them (through the subscribe link, or the free
  ICSx⁵ app on Android), but the group can't see when they're busy.
- **Subscribed calendars can be slow.** Apps check subscribe links on their own schedule: iPhone can be set to every
  15 minutes, and Yahoo and Outlook take a few hours. Google takes many hours, which is why Google users should
  connect directly instead.
- **No SMS login.** Email codes only. Supabase supports SMS through Twilio if you want to add it later.

## Setup (about 30 minutes, all on free plans)

You need accounts on [GitHub](https://github.com), [Supabase](https://supabase.com),
[Vercel](https://vercel.com) and [Anthropic](https://console.anthropic.com). [Resend](https://resend.com) and
Google Cloud are optional.

### 1. Supabase: database and login

1. Create a new project, then open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql)
   and click **Run**. The file is safe to re-run: after updating the app, run it again to upgrade the database.
2. **Authentication → Emails → Templates → Magic Link**: replace the body with something like
   `Your sign-in code is {{ .Token }}`. Without this step, people get a link instead of a code.
3. **Authentication → Emails → SMTP Settings**: turn on custom SMTP. Supabase's built-in email sends only a couple of
   emails an hour, which is too few for 10 people. Resend's free plan works: use host `smtp.resend.com`, port `465`,
   user `resend`, and your Resend API key as the password.
4. **Authentication → URL Configuration**: set _Site URL_ to your Vercel address once you have it (step 3).
5. **Project Settings → API Keys**: copy the project URL, the _publishable_ key and the _secret_ key.

### 2. Anthropic: reads the messages

Create an API key at console.anthropic.com and add a few dollars of credit. Reading one message costs a fraction of a
cent.

### 3. Vercel: hosting

1. Push this folder to a GitHub repository. (In Vercel, set _Root Directory_ to `crew-calendar` if it stays inside a
   bigger repo.)
2. In Vercel, click **Add New → Project**, import the repo, and add the environment variables from
   [`.env.example`](.env.example). Set `APP_URL` to the address Vercel gives you, e.g.
   `https://crew-calendar.vercel.app`.
3. Deploy. The daily summary email runs at 00:00 UTC (8am Singapore time). To change it, edit
   [`vercel.json`](vercel.json).

### 4. Google direct add (optional, recommended if anyone uses Google Calendar)

1. At [console.cloud.google.com](https://console.cloud.google.com), create a project and enable the
   **Google Calendar API**.
2. **Google Auth Platform → Branding/Audience**: user type _External_. Then click **Publish app** so it's
   "In production". If you leave it in "Testing", Google disconnects everyone after 7 days. Google may show an
   "unverified app" warning; people can click _Advanced → Continue_. That's fine for a private group.
3. **Data access**: add the scope `.../auth/calendar.events`.
4. **Clients → Create client → Web application**. Add the redirect URI
   `https://YOUR-APP.vercel.app/api/google/callback`.
5. Put the client ID and secret into Vercel as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Also set
   `GOOGLE_TOKEN_KEY` to the output of `openssl rand -base64 32`; it encrypts the stored Google tokens. Then redeploy.

### 5. Email alerts (optional)

Using the same Resend account: verify a domain you own, then set `RESEND_API_KEY` and
`ALERT_FROM_EMAIL="Crew Calendar <alerts@yourdomain.com>"` in Vercel. Without these, alerts still appear in the app.

### 6. Invite your group

Send them the site address and the `GROUP_INVITE_CODE` (at least 12 characters; joining is switched off with a
shorter one). Wrong guesses are rate-limited per account, per network and overall. After joining, each person lands on **Settings**, which walks
them through connecting Google or subscribing from Yahoo, iPhone or Android.

## Running it locally

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in `.env.local`, then:

```bash
npm run dev
```

Before pushing, run the same checks as CI:

```bash
npm run typecheck && npm run lint && npm run format:check
```

## How it's built

| Part                                                        | Where                                             |
| ----------------------------------------------------------- | ------------------------------------------------- |
| Next.js 16 app (pages and API routes)                       | `app/`                                            |
| Sign-in check on every request                              | `proxy.ts`                                        |
| Claude message reading (Claude Opus 5.5, structured output) | `lib/parse.ts`                                    |
| Saving events, Google push, alerts                          | `lib/events.ts`, `lib/google.ts`, `lib/notify.ts` |
| Subscribe feed (`.ics`)                                     | `lib/ics.ts`, `app/api/feed/[token]/route.ts`     |
| Reading members' own calendars                              | `lib/external.ts`                                 |
| Daily summary                                               | `app/api/cron/digest/route.ts`                    |

### Privacy

- Pasted messages and screenshots are sent to Anthropic to find the events, then thrown away. They aren't stored.
- Google refresh tokens are encrypted at rest. Disconnecting (or deleting your account) revokes access at Google.
- Anyone can delete their account in Settings. Events they added are cancelled for everyone.
- The personal and whole-group subscribe links use separate secrets, and _Make new links_ replaces both.

### Security

All database tables have row-level security turned on with no policies, so the browser can't read them. Only the
server, using the secret key, can, and it checks that the signed-in person is a member first. Only the person who
added an event can delete it.

Message reading uses Claude's server-side fallback (`fallbacks: "default"`). If Claude Opus 5.5 declines a message,
the API retries it on a fallback model automatically.
