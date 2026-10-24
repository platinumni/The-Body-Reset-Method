import type { Email } from "../services/email";
import { formatPrice } from "../services/products";

// Email templates. Plain, readable HTML with inline styles (email apps ignore stylesheets),
// plus a text version for every email.

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function wrap(siteName: string, bodyHtml: string, footerHtml = ""): string {
  return `<!doctype html><html><body style="margin:0;background:#f4efe6;font-family:Arial,Helvetica,sans-serif;color:#1d2621">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:560px;background:#fbf8f2;border:1px solid #ddd3c3;border-radius:14px" cellpadding="0" cellspacing="0">
<tr><td style="padding:28px 28px 8px;font-family:Georgia,serif;font-size:20px">${esc(siteName)}</td></tr>
<tr><td style="padding:8px 28px 28px;font-size:16px;line-height:1.6">${bodyHtml}</td></tr>
</table>
<p style="font-size:12px;color:#6d756f;margin-top:16px">Education and movement coaching, not medical advice.${footerHtml}</p>
</td></tr></table></body></html>`;
}

export const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${esc(href)}" style="background:#1d2621;color:#f4efe6;padding:14px 22px;border-radius:999px;text-decoration:none;font-weight:bold;display:inline-block">${esc(label)}</a></p>`;

export type OrderEmailInput = {
  siteName: string;
  to: string;
  name: string | null;
  orderRef: string;
  lines: { title: string; pence: number }[];
  totalPence: number;
  /** Amount taken off by a discount code, if any. */
  discountPence?: number;
  currency: string;
  /** Link to create an account, or null if they already have one. */
  setupUrl: string | null;
  loginUrl: string;
};

export function orderConfirmationEmail(i: OrderEmailInput): Email {
  const hello = i.name ? `Hi ${i.name.split(" ")[0]},` : "Hi,";
  const rows = i.lines.map((l) => `<tr><td style="padding:6px 0">${esc(l.title)}</td><td align="right">${formatPrice(l.pence, i.currency)}</td></tr>`).join("");
  const action = i.setupUrl
    ? `<p>Your next step is to create your account. That's where your programme lives.</p>${button(i.setupUrl, "Create your account")}<p style="font-size:14px;color:#4b5750">This link works once and lasts 7 days. If it expires, use "Forgotten password" on the login page with this email address.</p>`
    : `<p>Your new programme has been added to your account.</p>${button(i.loginUrl, "Log in to your programmes")}`;
  const html = wrap(
    i.siteName,
    `<p>${esc(hello)}</p><p>Thank you for your order. Payment received.</p>
<table role="presentation" width="100%" style="border-top:1px solid #ddd3c3;border-bottom:1px solid #ddd3c3;margin:16px 0">${rows}
${i.discountPence ? `<tr><td style="padding:6px 0">Discount</td><td align="right">-${formatPrice(i.discountPence, i.currency)}</td></tr>` : ""}
<tr><td style="padding:8px 0;font-weight:bold">Total</td><td align="right" style="font-weight:bold">${formatPrice(i.totalPence, i.currency)}</td></tr></table>
<p style="font-size:14px;color:#4b5750">Order reference: ${esc(i.orderRef)}</p>${action}
<p>Before you start, read the full guide all the way through, ideally a few times. Everything else builds on it.</p>`,
  );
  const text = [
    hello,
    "",
    "Thank you for your order. Payment received.",
    "",
    ...i.lines.map((l) => `${l.title}: ${formatPrice(l.pence, i.currency)}`),
    ...(i.discountPence ? [`Discount: -${formatPrice(i.discountPence, i.currency)}`] : []),
    `Total: ${formatPrice(i.totalPence, i.currency)}`,
    `Order reference: ${i.orderRef}`,
    "",
    i.setupUrl ? `Create your account (link works once, lasts 7 days): ${i.setupUrl}` : `Log in to your programmes: ${i.loginUrl}`,
    "",
    "Before you start, read the full guide all the way through, ideally a few times.",
  ].join("\n");
  return { to: i.to, template: "order_confirmation", subject: `Your order: ${i.lines.map((l) => l.title).join(", ")}`, html, text };
}

export function linkEmail(i: { siteName: string; to: string; purpose: "setup" | "reset"; url: string }): Email {
  const setup = i.purpose === "setup";
  const subject = setup ? "Create your account" : "Reset your password";
  const intro = setup ? "Use the button below to create your account and see your programmes." : "Someone (hopefully you) asked to reset the password for this email address.";
  const html = wrap(
    i.siteName,
    `<p>${intro}</p>${button(i.url, setup ? "Create your account" : "Choose a new password")}<p style="font-size:14px;color:#4b5750">This link works once and expires in ${setup ? "7 days" : "1 hour"}. If you didn't ask for this, you can ignore this email.</p>`,
  );
  return { to: i.to, template: setup ? "account_setup" : "password_reset", subject, html, text: `${intro}\n\n${i.url}\n\nThis link works once. If you didn't ask for this, ignore this email.` };
}
