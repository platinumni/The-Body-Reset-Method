// Programme reader script (served as /reader.js): text size, the guide's "jump to" list,
// read-aloud with the device's own voice, and the print button on the exercise sheet.

export default `(() => {
  // Text size: remembered on this device only. The page works at the normal size without it.
  const root = document.documentElement;
  const clamp = (n) => Math.max(0, Math.min(3, n));
  let size = 0;
  try { size = clamp(Number(localStorage.getItem("brm_text_size")) || 0); } catch (e) {}
  const applySize = () => { if (size) root.dataset.textSize = String(size); else delete root.dataset.textSize; };
  applySize();
  document.querySelectorAll("[data-text-size]").forEach((el) => (el.hidden = false));
  document.querySelectorAll("[data-text-size-step]").forEach((b) => b.addEventListener("click", () => {
    size = clamp(size + Number(b.dataset.textSizeStep));
    applySize();
    try { localStorage.setItem("brm_text_size", String(size)); } catch (e) {}
  }));
  // Meal plans: the optional calorie estimate (Mifflin-St Jeor), worked out on the device and never sent anywhere.
  const calc = document.querySelector("[data-calorie-calc]");
  if (calc) {
    calc.hidden = false;
    const val = (id) => Number((document.getElementById(id) || {}).value);
    const out = calc.querySelector("[data-calorie-result]");
    const update = () => {
      const age = val("cc-age"), h = val("cc-height"), w = val("cc-weight"), act = val("cc-activity");
      if (!age || !h || !w) { out.textContent = ""; return; }
      if (age < 18) { out.textContent = "This estimate is for adults only. For children and teenagers, speak to your GP."; return; }
      const male = (document.getElementById("cc-sex") || {}).value === "m";
      const bmr = 10 * w + 6.25 * h - 5 * age + (male ? 5 : -161);
      const kcal = Math.round((bmr * act) / 50) * 50;
      out.textContent = "About " + kcal.toLocaleString("en-GB") + " calories a day to maintain your weight.";
    };
    calc.querySelectorAll("input, select").forEach((el) => el.addEventListener("input", update));
  }
  // "Jump to": go straight away when an item is picked.
  document.querySelectorAll("[data-autosubmit]").forEach((sel) => sel.addEventListener("change", () => sel.form && sel.form.submit()));
  document.querySelectorAll("[data-autosubmit-button]").forEach((b) => (b.hidden = true));
  document.querySelectorAll("[data-print]").forEach((b) => b.addEventListener("click", () => window.print()));
  const buttons = [...document.querySelectorAll("[data-listen]")];
  if (!buttons.length) return;
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
    document.querySelectorAll(".listen-unsupported").forEach((el) => (el.hidden = false));
    buttons.forEach((b) => (b.disabled = true));
    return;
  }
  const speed = document.getElementById("listen-speed");
  let current = null;
  const pickVoice = () => {
    const voices = synth.getVoices();
    const good = /natural|premium|enhanced|neural|google|siri|daniel|serena|kate|libby|sonia|ryan/i;
    return voices.find((v) => v.lang === "en-GB" && good.test(v.name)) || voices.find((v) => v.lang === "en-GB") ||
      voices.find((v) => v.lang.startsWith("en") && good.test(v.name)) || voices.find((v) => v.lang.startsWith("en")) || null;
  };
  const reset = () => { buttons.forEach((b) => (b.textContent = "▶ Play")); current = null; };
  const stop = () => { synth.cancel(); reset(); };
  document.querySelectorAll("[data-listen-stop]").forEach((b) => b.addEventListener("click", stop));
  buttons.forEach((btn) => btn.addEventListener("click", () => {
    if (current === btn) {
      if (synth.paused) { synth.resume(); btn.textContent = "❚❚ Pause"; } else { synth.pause(); btn.textContent = "▶ Resume"; }
      return;
    }
    synth.cancel(); reset();
    const text = (document.getElementById(btn.dataset.listen) || {}).textContent || "";
    // Speak sentence by sentence: some browsers stop long passages part-way through.
    const parts = text.match(/[^.!?]+[.!?]*/g) || [text];
    const voice = pickVoice();
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part.trim());
      u.rate = Number((speed && speed.value) || 0.95);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = "en-GB"; }
      if (i === parts.length - 1) u.onend = () => { if (current === btn) reset(); };
      synth.speak(u);
    });
    current = btn; btn.textContent = "❚❚ Pause";
  }));
  addEventListener("pagehide", stop);
})();
`;
