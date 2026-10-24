import { raw } from "hono/html";
import type { Child } from "hono/jsx";
import { assetUrl } from "../../routes/assets";
import { CsrfField } from "../layout";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/programmes", label: "Programmes" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/affiliates", label: "Affiliates" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/wording", label: "Site wording" },
  { href: "/admin/campaigns", label: "Email campaigns" },
  { href: "/admin/stats", label: "Stats" },
  { href: "/admin/activity", label: "Activity" },
  { href: "/admin/backups", label: "Backups" },
  { href: "/admin/emails", label: "Emails" },
  { href: "/admin/launch", label: "Launch checklist" },
];

export type AdminMeta = { title: string; path: string; csrfToken: string; email?: string; isTestSite: boolean; flash?: string | null; error?: string | null };

export function AdminLayout(props: { meta: AdminMeta; children: Child; bare?: boolean }) {
  const { meta } = props;
  const current = (href: string) => (href === "/admin" ? meta.path === "/admin" : meta.path.startsWith(href));
  return (
    <>
      {raw("<!DOCTYPE html>")}
      <html lang="en-GB">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>{`${meta.title} · Admin`}</title>
        <link rel="icon" href={assetUrl("/favicon.svg")} type="image/svg+xml" />
        <link rel="stylesheet" href={assetUrl("/styles.css")} />
      </head>
      <body class="admin">
        {meta.isTestSite && <div class="test-banner">Test site admin: changes here don't affect the live site.</div>}
        {!props.bare && (
          <header class="admin-header">
            <div class="wrap admin-header-inner">
              <a class="brand" href="/admin">
                <span class="brand-mark" aria-hidden="true" />
                <span class="brand-name">Admin</span>
              </a>
              <details class="admin-nav-mobile">
                <summary>Menu</summary>
                <nav aria-label="Admin">
                  {NAV.map((n) => (
                    <a href={n.href} aria-current={current(n.href) ? "page" : undefined}>
                      {n.label}
                    </a>
                  ))}
                  <a href="/" target="_blank" rel="noopener">
                    View site ↗
                  </a>
                </nav>
              </details>
              <form method="post" action="/admin/logout" class="admin-logout">
                <CsrfField token={meta.csrfToken} />
                <button class="link-button" type="submit">
                  Log out
                </button>
              </form>
            </div>
            <nav class="wrap admin-nav" aria-label="Admin">
              {NAV.map((n) => (
                <a href={n.href} aria-current={current(n.href) ? "page" : undefined}>
                  {n.label}
                </a>
              ))}
              <a href="/" target="_blank" rel="noopener">
                View site ↗
              </a>
            </nav>
          </header>
        )}
        <main id="main" class="wrap admin-main">
          {meta.flash && (
            <p class="notice notice-ok" role="status">
              {meta.flash}
            </p>
          )}
          {meta.error && (
            <div class="form-errors" role="alert">
              <p>{meta.error}</p>
            </div>
          )}
          {props.children}
        </main>
      </body>
      </html>
    </>
  );
}

export const Confirm = (props: { label: string }) => (
  <label class="confirm-check">
    <input type="checkbox" name="confirm" value="yes" required /> {props.label}
  </label>
);

export const StatusPill = (props: { status: string }) => <span class={`pill pill-${props.status.replace(/_/g, "-")}`}>{props.status.replace(/_/g, " ")}</span>;
