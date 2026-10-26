import type { Email } from "../services/email";
import type { MorningReport } from "../services/automation";
import { formatPrice } from "../services/products";
import { button, esc, wrap } from "./templates";

// Automatic emails: reminders, check-ins, affiliate notices and the owner's reports.

export function setupReminderEmail(i: { siteName: string; to: string; url: string }): Email {
  const html = wrap(
    i.siteName,
    `<p>Hi,</p><p>Thanks again for your order. Your programme is ready and waiting, but your account isn't set up yet.</p>${button(i.url, "Create your account")}<p style="font-size:14px;color:#4b5750">This link works once and lasts 7 days.</p>`,
  );
  return { to: i.to, template: "setup_reminder", subject: "Your programme is waiting for you", html, text: `Your programme is ready, but your account isn't set up yet.\n\nCreate your account: ${i.url}\n\nThis link works once and lasts 7 days.` };
}

export function reviewRequestEmail(i: { siteName: string; to: string; name: string | null; url: string }): Email {
  const hello = i.name ? `Hi ${esc(i.name)},` : "Hi,";
  const html = wrap(
    i.siteName,
    `<p>${hello}</p><p>You've had your programme for about three weeks now. How's it going?</p><p>An honest sentence or two, good or bad, helps other people decide whether it's right for them, and helps us improve. It takes a minute.</p>${button(i.url, "Leave a review")}<p style="font-size:13px;color:#666">We only publish reviews you allow us to.</p>`,
  );
  return { to: i.to, template: "review_request", subject: "How's it going?", html, text: `${i.name ? `Hi ${i.name},` : "Hi,"}\n\nYou've had your programme for about three weeks now. How's it going? An honest sentence or two helps other people decide, and helps us improve.\n\nLeave a review: ${i.url}\n\nWe only publish reviews you allow us to.` };
}

export function checkInEmail(i: { siteName: string; to: string; name: string | null; url: string }): Email {
  const hello = i.name ? `Hi ${esc(i.name)},` : "Hi,";
  const tips = [
    "If you haven't already, read the full guide all the way through before you train. The philosophy behind it is what makes the exercises work.",
    "Once you know the ideas, use Listen mode or the Key points as you practise, and the one-page exercise sheet when you just want the movements.",
    "Go at your own pace. The aim is to release unnecessary effort, not to force progress.",
    "Stop if anything causes pain, and get advice before continuing.",
  ];
  const html = wrap(
    i.siteName,
    `<p>${hello}</p><p>You've had your programme for a week now. Here are a few reminders to help you get the most from it:</p><ul>${tips.map((t) => `<li style="margin-bottom:8px">${esc(t)}</li>`).join("")}</ul>${button(i.url, "Open my programmes")}`,
  );
  return { to: i.to, template: "check_in_7d", subject: "Getting the most from your programme", html, text: `${i.name ? `Hi ${i.name},` : "Hi,"}\n\n${tips.map((t) => `- ${t}`).join("\n")}\n\n${i.url}` };
}

export function commissionReadyEmail(i: { siteName: string; to: string; pence: number; url: string }): Email {
  const amount = formatPrice(i.pence);
  const html = wrap(i.siteName, `<p>Good news: ${amount} of commission from your share link has cleared its hold period and is now owed to you.</p><p>We pay monthly to the payout email in your account. Please check it's up to date.</p>${button(i.url, "View my earnings")}`);
  return { to: i.to, template: "commission_ready", subject: `${amount} commission now owed to you`, html, text: `${amount} of commission is now owed to you. We pay monthly to the payout email in your account: ${i.url}` };
}

export function usageAlertEmail(i: { siteName: string; to: string; lines: string[]; url: string }): Email {
  const html = wrap(i.siteName, `<p><strong>Usage alert:</strong> the site has passed 80% of a plan limit this month.</p><ul>${i.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul><p>Nothing has stopped working. You may want to upgrade the plan before the limit is reached.</p>${button(i.url, "Open admin")}`);
  return { to: i.to, template: "usage_alert", subject: "Usage alert: 80% of a plan limit reached", html, text: `Usage alert (80% of a plan limit):\n${i.lines.join("\n")}\n\n${i.url}` };
}

export function morningReportEmail(i: { siteName: string; to: string; report: MorningReport; url: string }): Email {
  const r = i.report;
  const stats = `<table role="presentation" width="100%" style="margin:12px 0;border-collapse:collapse">
<tr><td style="padding:6px 0">Sales</td><td align="right"><strong>${r.salesYesterday.count} · ${formatPrice(r.salesYesterday.pence)}</strong></td></tr>
<tr><td style="padding:6px 0">New members</td><td align="right"><strong>${r.newMembersYesterday}</strong></td></tr>
<tr><td style="padding:6px 0">Page views</td><td align="right"><strong>${r.viewsYesterday}</strong></td></tr></table>`;
  const todo = r.todo.length ? `<p><strong>Needs your attention:</strong></p><ul>${r.todo.map((t) => `<li style="margin-bottom:6px">${esc(t)}</li>`).join("")}</ul>` : `<p>Nothing needs your attention today.</p>`;
  const html = wrap(i.siteName, `<p>Good morning. Here's yesterday (${r.date}):</p>${stats}${todo}${button(i.url, "Open admin")}`);
  const text = [
    `Yesterday (${r.date})`,
    `Sales: ${r.salesYesterday.count} (${formatPrice(r.salesYesterday.pence)})`,
    `New members: ${r.newMembersYesterday}`,
    `Page views: ${r.viewsYesterday}`,
    "",
    r.todo.length ? "Needs your attention:\n" + r.todo.map((t) => `- ${t}`).join("\n") : "Nothing needs your attention today.",
    "",
    i.url,
  ].join("\n");
  return { to: i.to, template: "morning_report", subject: r.todo.length ? `Morning report: ${r.todo.length} thing(s) to look at` : "Morning report: all clear", html, text };
}

export type Offer = { headline: string; code: string | null; details: string | null };

export function confirmSignupEmail(i: { siteName: string; to: string; url: string }): Email {
  const html = wrap(i.siteName, `<p>Please confirm you'd like to hear from us about new programmes, guides and offers.</p>${button(i.url, "Yes, sign me up")}<p style="font-size:14px;color:#4b5750">If you didn't ask for this, ignore this email and you won't hear from us.</p>`);
  return { to: i.to, template: "signup_confirm", subject: "Please confirm your email", html, text: `Please confirm you'd like to hear from us:\n${i.url}\n\nIf you didn't ask for this, ignore this email.` };
}

export function welcomeEmail(i: { siteName: string; to: string; offer: Offer | null; siteUrl: string; unsubscribeUrl: string | null }): Email {
  const offerHtml = i.offer
    ? `<div style="background:#e9d9c4;border-radius:10px;padding:16px;margin:16px 0"><p style="margin:0 0 6px"><strong>${esc(i.offer.headline)}</strong></p>${i.offer.code ? `<p style="margin:0 0 6px">Use code <strong style="font-size:18px;letter-spacing:1px">${esc(i.offer.code)}</strong> at checkout.</p>` : ""}${i.offer.details ? `<p style="margin:0;font-size:13px">${esc(i.offer.details)}</p>` : ""}</div>`
    : "";
  const footer = i.unsubscribeUrl ? `<br><a href="${esc(i.unsubscribeUrl)}" style="color:#6d756f">Unsubscribe</a>` : "";
  const html = wrap(
    i.siteName,
    `<p>Welcome, and thank you for signing up.</p><p>The Body Regeneration Method is built on one idea: before you build strength, learn to let go of the tension and forcing your body has been holding on to. Everything starts from the ground up, with your feet.</p>${offerHtml}${button(`${i.siteUrl}/programmes/lower-body-regeneration`, "Explore Lower Body Regeneration")}<p>While you're here, our <a href="${esc(i.siteUrl)}/guides" style="color:#8b5e34">free guides</a> explain the thinking behind the method.</p><p>We'll only email you with things worth reading: new programmes, guides and the occasional offer.</p>`,
    footer,
  );
  const text = [
    "Welcome, and thank you for signing up.",
    "",
    i.offer ? `${i.offer.headline}${i.offer.code ? `\nUse code ${i.offer.code} at checkout.` : ""}${i.offer.details ? `\n${i.offer.details}` : ""}\n` : "",
    `Explore Lower Body Regeneration: ${i.siteUrl}/programmes/lower-body-regeneration`,
    i.unsubscribeUrl ? `\nUnsubscribe: ${i.unsubscribeUrl}` : "",
  ].join("\n");
  return {
    to: i.to,
    template: "signup_welcome",
    subject: i.offer ? `Welcome: ${i.offer.headline}` : "Welcome to The Body Regeneration Method",
    html,
    text,
    headers: i.unsubscribeUrl ? { "List-Unsubscribe": `<${i.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined,
  };
}
