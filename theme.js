(() => {
  const root = document.documentElement;
  const key = "fluidsim-lab:theme";
  try {
    if (localStorage.getItem(key) === "light") root.dataset.theme = "light";
  } catch { /* The theme remains available in this tab. */ }

  document.addEventListener("DOMContentLoaded", () => {
    for (const button of document.querySelectorAll("[data-theme-toggle]")) {
      function update() {
        const light = root.dataset.theme === "light";
        button.textContent = light ? "夜间模式" : "日间模式";
        button.setAttribute("aria-pressed", String(light));
      }
      update();
      button.addEventListener("click", () => {
        root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
        try { localStorage.setItem(key, root.dataset.theme); } catch { /* Tab-only mode. */ }
        update();
      });
    }
  });
})();
