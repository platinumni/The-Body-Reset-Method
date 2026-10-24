// Programme reader script (served as /reader.js): read-aloud with the device's own voice,
// and the print button on the exercise sheet. Only loaded on those two views.

export default `(() => {
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
