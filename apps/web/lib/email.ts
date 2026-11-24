// Outgoing email, same setup as Propchat and Dwellicious: Resend over SMTP.
//   SMTP_URL=smtps://resend:<RESEND sending key>@smtp.resend.com:465
//   EMAIL_FROM=Listgate <hello@listgate.com.au>
// Without SMTP_URL nothing is sent and callers fall back to showing links to copy.
import nodemailer from "nodemailer";

export const emailEnabled = () => !!process.env.SMTP_URL;
const defaultFrom = () => process.env.EMAIL_FROM ?? "Listgate <hello@listgate.com.au>";

export async function sendEmail(o: { to: string | string[]; subject: string; text: string; html?: string; from?: string; replyTo?: string }): Promise<boolean> {
  if (!process.env.SMTP_URL) {
    console.log("[email:off] would send", { to: o.to, subject: o.subject });
    return false;
  }
  try {
    const transport = nodemailer.createTransport(process.env.SMTP_URL);
    await transport.sendMail({ from: o.from ?? defaultFrom(), to: o.to, subject: o.subject, text: o.text, replyTo: o.replyTo, ...(o.html ? { html: o.html } : {}) });
    return true;
  } catch (err) {
    console.error("sendEmail failed", err);
    return false;
  }
}

export const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const WORDMARK = `<span style="font:800 20px/1 ${FONT};color:#ffffff;letter-spacing:-0.02em;">list<span style="color:#2ac4ea;">gate</span></span>`;

/** Branded email shell: navy header, white card, one optional button. */
export function brandedHtml(o: { preheader: string; heading: string; paragraphs: string[]; button?: { label: string; url: string }; footer: string }) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="format-detection" content="telephone=no,address=no,email=no,date=no"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#eaf9fd;">
<div style="display:none;max-height:0;overflow:hidden;">${esc(o.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eaf9fd;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;">
<tr><td style="background:#0d2d4f;padding:16px 24px;">${WORDMARK}</td></tr>
<tr><td style="padding:28px 28px 8px;font:400 15px/1.55 ${FONT};color:#262e3b;">
  <h1 style="margin:0 0 16px;font:700 22px/1.3 ${FONT};color:#0d2d4f;">${esc(o.heading)}</h1>
  ${o.paragraphs.map((p) => `<p style="margin:0 0 14px;">${p}</p>`).join("")}
</td></tr>
${o.button ? `<tr><td align="center" style="padding:4px 28px 28px;"><a href="${esc(o.button.url)}" style="display:inline-block;background:#2ac4ea;color:#0d2d4f;font:700 16px/1 ${FONT};text-decoration:none;padding:16px 32px;border-radius:999px;">${esc(o.button.label)}</a></td></tr>` : ""}
<tr><td style="border-top:1px solid #eef2f6;padding:16px 28px;font:400 12px/1.5 ${FONT};color:#6b7280;">${esc(o.footer)}</td></tr>
</table></td></tr></table></body></html>`;
}
