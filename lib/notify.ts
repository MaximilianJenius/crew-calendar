import "server-only";
import { appName } from "./config";

export const emailEnabled = () => Boolean(process.env.RESEND_API_KEY && process.env.ALERT_FROM_EMAIL);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Sends one email through Resend. Failures are logged, never thrown: alerts must not block saving. */
export async function sendEmail(to: string, subject: string, lines: string[]) {
  if (!emailEnabled()) return;
  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5">` +
    lines.map((l) => `<p style="margin:0 0 8px">${esc(l)}</p>`).join("") +
    `<p style="margin-top:16px"><a href="${process.env.APP_URL}">Open ${esc(appName())}</a></p></div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.ALERT_FROM_EMAIL, to, subject, html }),
    });
    // Status only: Resend error bodies can echo recipient addresses.
    if (!res.ok) console.error("email failed", res.status);
  } catch (err) {
    console.error("email failed", err instanceof Error ? err.message : "unknown");
  }
}
