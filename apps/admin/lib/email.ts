// Outgoing email from the admin (invites). Same Resend SMTP setup as the app:
//   SMTP_URL=smtps://resend:<RESEND_API_KEY>@smtp.resend.com:465, EMAIL_FROM=Listgate <hello@listgate.com.au>
// Without SMTP_URL nothing is sent and the admin shows the link to copy.
import nodemailer from "nodemailer";

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export async function sendInvite(o: { to: string; firstName: string; agency: string; link: string; role: string }): Promise<boolean> {
  if (!process.env.SMTP_URL) return false;
  const subject = `You're invited to ${o.agency} on Listgate`;
  const text = `Hi ${o.firstName},\n\n${o.agency} is set up on Listgate. Set your password here (the link works for 14 days):\n\n${o.link}\n\nYou'll see your listing feed and choose which partners get your listings.\n\nListgate`;
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#eaf9fd;">
<div style="display:none;max-height:0;overflow:hidden;">${esc(o.agency)} is set up on Listgate. Set your password to get in.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eaf9fd;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;">
<tr><td style="background:#0d2d4f;padding:16px 24px;"><span style="font:800 20px/1 ${FONT};color:#ffffff;">list<span style="color:#2ac4ea;">gate</span></span></td></tr>
<tr><td style="padding:28px 28px 8px;font:400 15px/1.55 ${FONT};color:#262e3b;">
  <h1 style="margin:0 0 16px;font:700 22px/1.3 ${FONT};color:#0d2d4f;">${esc(o.agency)} on Listgate</h1>
  <p style="margin:0 0 14px;">Hi ${esc(o.firstName)},</p>
  <p style="margin:0 0 14px;">Your agency is set up on Listgate. Set your password to see your listing feed and choose which partners get your listings.</p>
</td></tr>
<tr><td align="center" style="padding:4px 28px 28px;"><a href="${esc(o.link)}" style="display:inline-block;background:#2ac4ea;color:#0d2d4f;font:700 16px/1 ${FONT};text-decoration:none;padding:16px 32px;border-radius:999px;">Take the keys</a>
<p style="margin:14px 0 0;font:400 12px/1.5 ${FONT};color:#6b7280;">This link is just for you and works for 14 days.</p></td></tr>
<tr><td style="border-top:1px solid #eef2f6;padding:16px 28px;font:400 12px/1.5 ${FONT};color:#6b7280;">Sent by Listgate. Not expecting this? You can ignore it.</td></tr>
</table></td></tr></table></body></html>`;
  try {
    await nodemailer.createTransport(process.env.SMTP_URL).sendMail({ from: process.env.EMAIL_FROM ?? "Listgate <hello@listgate.com.au>", to: o.to, subject, text, html });
    return true;
  } catch (err) {
    console.error("sendInvite failed", err);
    return false;
  }
}

/** Emails the person who raised a ticket when Listgate replies or resolves it. */
export async function sendTicketUpdate(o: { to: string; firstName: string; number: number; subject: string; reply?: string; resolved: boolean; link: string; staffName: string; logged?: boolean; subjectLine?: string; message?: string }): Promise<boolean> {
  if (!process.env.SMTP_URL) return false;
  const heading = o.resolved ? `Ticket #${o.number} is resolved` : o.logged ? `We've logged ticket #${o.number}` : `We've replied to ticket #${o.number}`;
  const subject = o.subjectLine?.trim() || `${o.resolved ? "Resolved" : "Reply"}: #${o.number} ${o.subject}`;
  const replyHtml = o.reply ? `<div style="margin:0 0 14px;padding:14px 16px;background:#eaf9fd;border-radius:10px;white-space:pre-wrap;">${esc(o.reply)}</div><p style="margin:0 0 14px;color:#6b7280;font-size:13px;">${esc(o.staffName)}, Listgate</p>` : "";
  // A message written (or edited) by staff replaces the standard greeting and intro.
  const custom = o.message?.trim();
  const text = custom ? `${custom}\n\nSee it or reply in Listgate (Help): ${o.link}\n${o.resolved ? "Still not right? Reply there and it reopens.\n" : ""}\nListgate` : `Hi ${o.firstName},\n\n${o.resolved ? `We've marked your ticket "${o.subject}" as resolved.` : `We've replied to your ticket "${o.subject}".`}\n\n${o.reply ? `${o.reply}\n\n${o.staffName}, Listgate\n\n` : ""}See it or reply in Listgate (Help): ${o.link}\n${o.resolved ? "Still not right? Reply there and it reopens.\n" : ""}\nListgate`;
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#eaf9fd;">
<div style="display:none;max-height:0;overflow:hidden;">${esc((custom || o.reply || heading).slice(0, 100))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eaf9fd;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;">
<tr><td style="background:#0d2d4f;padding:16px 24px;"><span style="font:800 20px/1 ${FONT};color:#ffffff;">list<span style="color:#2ac4ea;">gate</span></span></td></tr>
<tr><td style="padding:28px 28px 8px;font:400 15px/1.55 ${FONT};color:#262e3b;">
  <h1 style="margin:0 0 16px;font:700 22px/1.3 ${FONT};color:#0d2d4f;">${esc(heading)}</h1>
  ${custom ? `<div style="margin:0 0 14px;white-space:pre-wrap;">${esc(custom)}</div>` : `<p style="margin:0 0 14px;">Hi ${esc(o.firstName)},</p>
  <p style="margin:0 0 14px;">${o.resolved ? `We've marked <strong>${esc(o.subject)}</strong> as resolved.` : `Here's our reply on <strong>${esc(o.subject)}</strong>.`}</p>
  ${replyHtml}`}
</td></tr>
<tr><td align="center" style="padding:4px 28px 28px;"><a href="${esc(o.link)}" style="display:inline-block;background:#2ac4ea;color:#0d2d4f;font:700 16px/1 ${FONT};text-decoration:none;padding:16px 32px;border-radius:999px;">${o.resolved ? "See the ticket" : "Reply"}</a>
${o.resolved ? `<p style="margin:14px 0 0;font:400 12px/1.5 ${FONT};color:#6b7280;">Still not right? Reply in the Help tab and it reopens.</p>` : ""}</td></tr>
<tr><td style="border-top:1px solid #eef2f6;padding:16px 28px;font:400 12px/1.5 ${FONT};color:#6b7280;">Listgate support · ticket #${o.number}</td></tr>
</table></td></tr></table></body></html>`;
  try {
    await nodemailer.createTransport(process.env.SMTP_URL).sendMail({ from: process.env.EMAIL_FROM ?? "Listgate <hello@listgate.com.au>", to: o.to, subject, text, html });
    return true;
  } catch (err) {
    console.error("sendTicketUpdate failed", err);
    return false;
  }
}
