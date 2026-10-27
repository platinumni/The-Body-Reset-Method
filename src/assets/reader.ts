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
  // Meal plans: one box per person. Show as many adult and child boxes as chosen.
  document.querySelectorAll("[data-household]").forEach((h) => {
    h.querySelectorAll("[data-count]").forEach((sel) => {
      const kind = sel.dataset.count;
      const show = () => h.querySelectorAll('[data-person="' + kind + '"]').forEach((row) => (row.hidden = Number(row.dataset.index) > Number(sel.value)));
      sel.addEventListener("change", show);
      show();
    });
  });
  // Optional calorie estimate for each adult (Mifflin-St Jeor), worked out on the device and never sent:
  // it suggests a portion size. The figures themselves have no name, so they're never submitted.
  document.querySelectorAll("[data-calorie-calc]").forEach((calc) => {
    calc.hidden = false;
    const field = (k) => calc.querySelector('[data-cc="' + k + '"]');
    const out = calc.querySelector("[data-calorie-result]");
    const size = calc.closest(".person") && calc.closest(".person").querySelector("[data-size]");
    const update = () => {
      const age = Number(field("age").value), h = Number(field("height").value), w = Number(field("weight").value), act = Number(field("activity").value);
      if (!age || !h || !w) { out.textContent = ""; return; }
      if (age < 18) { out.textContent = "This estimate is for adults only."; return; }
      const male = field("sex").value === "m";
      const kcal = Math.round(((10 * w + 6.25 * h - 5 * age + (male ? 5 : -161)) * act) / 50) * 50;
      const suggest = kcal < 1750 ? "0.8" : kcal <= 2350 ? "1" : kcal <= 2900 ? "1.25" : "1.5";
      if (size) size.value = suggest;
      const label = size ? size.options[size.selectedIndex].text : "";
      out.textContent = "About " + kcal.toLocaleString("en-GB") + " calories a day to maintain weight. We've set their portion size to " + label + ".";
    };
    calc.querySelectorAll("input, select").forEach((el) => el.addEventListener("input", update));
  });
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
