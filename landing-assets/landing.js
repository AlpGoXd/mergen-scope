// Result rotator for the landing page hero: one example result after another.
// Advances every 7 s, pauses on hover or keyboard focus, never moves under reduced motion.
(() => {
  const root = document.querySelector("[data-rotator]");
  if (!root) return;
  document.documentElement.classList.remove("no-js");

  const steps = Array.from(root.querySelectorAll(".step"));
  const slides = Array.from(root.querySelectorAll(".slide"));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const PERIOD = 7000;
  let index = 0;
  let held = false;
  let elapsed = 0;
  let last = performance.now();

  function show(next) {
    index = (next + slides.length) % slides.length;
    slides.forEach((slide, k) => {
      const on = k === index;
      slide.classList.toggle("off", !on);
      slide.setAttribute("aria-hidden", String(!on));
      slide.inert = !on;
    });
    steps.forEach((step, k) => {
      const on = k === index;
      step.classList.toggle("on", on);
      step.setAttribute("aria-pressed", String(on));
      const track = step.querySelector(".track");
      track.replaceChildren();
      if (on) {
        const fill = document.createElement("span");
        fill.className = held ? "fill held" : "fill";
        track.append(fill);
      }
    });
    elapsed = 0;
  }

  function hold(value) {
    held = value;
    root.querySelectorAll(".fill").forEach((fill) => fill.classList.toggle("held", value));
  }

  steps.forEach((step, k) => step.addEventListener("click", () => show(k)));
  root.addEventListener("mouseenter", () => hold(true));
  root.addEventListener("mouseleave", () => hold(root.contains(document.activeElement)));
  root.addEventListener("focusin", () => hold(true));
  root.addEventListener("focusout", (event) => {
    if (!root.contains(event.relatedTarget)) hold(root.matches(":hover"));
  });

  function tick(now) {
    const dt = now - last;
    last = now;
    if (!held && !reduce.matches && !document.hidden) {
      elapsed += dt;
      if (elapsed >= PERIOD) show(index + 1);
    }
    requestAnimationFrame(tick);
  }

  show(0);
  requestAnimationFrame(tick);
})();
