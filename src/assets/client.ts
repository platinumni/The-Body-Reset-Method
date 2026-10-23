// The site's only JavaScript (served as /app.js). Everything works without it; it only
// opens the sign-up pop-up once per visitor, after 25 seconds or halfway down the page.
// Remembering "already shown" in localStorage is a preference the visitor's action sets,
// so it needs no cookie consent.

export default `(() => {
  const d = document.getElementById("signup-dialog");
  if (!d || typeof d.showModal !== "function") return;
  const KEY = "brm_signup_seen";
  try { if (localStorage.getItem(KEY)) return; } catch (e) { return; }
  let shown = false;
  const show = () => {
    if (shown || document.querySelector("dialog[open]")) return;
    shown = true;
    try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
    d.showModal();
  };
  setTimeout(show, 25000);
  const onScroll = () => {
    const h = document.scrollingElement || document.documentElement;
    if ((scrollY + innerHeight) / h.scrollHeight > 0.55) { show(); removeEventListener("scroll", onScroll); }
  };
  addEventListener("scroll", onScroll, { passive: true });
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
})();
`;
