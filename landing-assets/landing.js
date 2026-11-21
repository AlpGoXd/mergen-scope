// Landing page: theme switch, the live app frame (wide screens only) and the shortened LaTeX export.
(() => {
  const THEME_KEY = "mergen-theme-preference";
  const EMBED_URL = "app.html?demo=1&embed=1";
  const root = document.documentElement;
  root.classList.remove("no-js");

  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  const wide = window.matchMedia("(min-width: 1024px)");
  const effectiveTheme = () => root.dataset.theme === "light" || root.dataset.theme === "dark" ? root.dataset.theme : (systemDark.matches ? "dark" : "light");
  const store = (theme) => { try { localStorage.setItem(THEME_KEY, theme); } catch { /* storage unavailable: the frame follows the system */ } };

  function start() {
    const themeSwitch = document.querySelector("[data-theme-switch]");
    const frame = document.querySelector("[data-live-frame]");

    // The live frame: the real app running the demo. Its theme is the landing theme, passed through the
    // app's own stored preference (same origin). Narrow screens keep only the poster.
    let iframe = null;
    function insertFrame() {
      if (!frame || iframe || !wide.matches) return;
      store(effectiveTheme());
      frame.classList.remove("is-loaded");
      iframe = document.createElement("iframe");
      iframe.title = "Mergen Scope demo";
      iframe.src = EMBED_URL;
      iframe.addEventListener("load", () => frame.classList.add("is-loaded"), { once: true });
      frame.append(iframe);
    }
    function removeFrame() {
      iframe?.remove();
      iframe = null;
      frame?.classList.remove("is-loaded");
    }
    wide.addEventListener("change", () => { if (wide.matches) insertFrame(); else removeFrame(); });
    insertFrame();

    function labelSwitch() { if (themeSwitch) themeSwitch.textContent = effectiveTheme() === "dark" ? "Light" : "Dark"; }
    labelSwitch();
    systemDark.addEventListener("change", () => { labelSwitch(); if (iframe && !root.dataset.theme) { removeFrame(); insertFrame(); } });
    themeSwitch?.addEventListener("click", () => {
      const next = effectiveTheme() === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      store(next);
      labelSwitch();
      if (iframe) { removeFrame(); insertFrame(); }
    });

    // Copy as LaTeX output of the demo's first pane, shortened: the first lines, then the end of the figure.
    const tex = document.querySelector("[data-tex]");
    if (tex) {
      fetch(tex.dataset.tex).then((response) => response.ok ? response.text() : Promise.reject(new Error(String(response.status)))).then((text) => {
        const lines = text.replace(/\s+$/, "").split("\n");
        const clip = (line) => line.length > 76 ? `${line.slice(0, 74)} …` : line;
        const head = lines.slice(0, 13);
        const endAt = lines.findIndex((line) => line.trim() === "\\end{axis}");
        const end = lines.slice(endAt >= 0 ? endAt : -4);
        // The first plot and one row of its coordinates show that the data is in the file.
        const plotAt = lines.findIndex((line, index) => index >= head.length && line.trim().startsWith("\\addplot"));
        const plot = plotAt >= 0 && endAt > plotAt + 1 ? ["      …", lines[plotAt], lines[plotAt + 1], "        …"] : [];
        const shown = end.length && lines.length > head.length + end.length ? [...head, ...plot, "      …", ...end] : lines;
        tex.textContent = shown.map(clip).join("\n");
      }).catch(() => { /* keep the link to the file */ });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
