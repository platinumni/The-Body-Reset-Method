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

export function checkInEmail(i: { siteName: string; to: string; name: string | null; url: string }): Email {
  const hello = i.name ? `Hi ${esc(i.name)},` : "Hi,";
  const tips = [
    "If you haven't already, read the Full Programme all the way through before you train. The philosophy behind it is what makes the exercises work.",
    "Use the Quick Run-Through as you practise, to keep the key points in mind.",
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
