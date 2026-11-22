import { documents, readProgress } from "./documents.js";

const title = document.getElementById("page-title");
const materials = document.getElementById("learning-materials");
const library = document.getElementById("library");
const template = document.getElementById("learning-template");
const resume = document.getElementById("resume");
const unlockKey = "fluidsim-lab:materials-unlocked";
const clickGap = 2600;
const requiredClicks = 5;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

let count = 0;
let lastClick = -Infinity;
let pressEffect;

function showProgress() {
  let mostRecent;
  for (const doc of documents) {
    const saved = readProgress(doc);
    const status = document.querySelector('[data-doc-card="' + doc.id + '"] [data-progress]');
    if (!status) continue;
    status.hidden = !saved;
    if (!saved) continue;
    status.textContent = "读到第 " + saved.page + " 页";
    if (!mostRecent || saved.updated > mostRecent.saved.updated) mostRecent = { doc, saved };
  }
  resume.hidden = !mostRecent;
  if (mostRecent) {
    const { doc, saved } = mostRecent;
    resume.href = "./read.html?doc=" + doc.id;
    resume.textContent = "继续阅读 " + doc.shortTitle + " · 第 " + saved.page + " 页";
  }
}

function revealMaterials() {
  if (materials.hidden) {
    library.append(template.content.cloneNode(true));
    materials.hidden = false;
  }
  showProgress();
}

function restoreMaterials() {
  if (!materials.hidden) {
    showProgress();
    return;
  }
  try {
    if (localStorage.getItem(unlockKey) === "1") revealMaterials();
  } catch {
    /* Browsers may partition or disable storage. */
  }
}

title.addEventListener("click", event => {
  if (!reduceMotion.matches && typeof title.animate === "function") {
    pressEffect?.cancel();
    pressEffect = title.animate(
      [{ transform: "translateY(1px) scale(.985)", opacity: .87 },
       { transform: "none", opacity: 1 }],
      { duration: 165, easing: "ease-out" },
    );
  }
  if (!materials.hidden) return;

  const now = performance.now();
  count = now - lastClick <= clickGap ? count + 1 : 1;
  lastClick = now;
  if (count < requiredClicks) return;

  revealMaterials();
  try { localStorage.setItem(unlockKey, "1"); } catch { /* Still available in this tab. */ }
  if (event.detail === 0) materials.focus({ preventScroll: true });
  materials.scrollIntoView({ block: "start", behavior: reduceMotion.matches ? "auto" : "smooth" });
});

document.addEventListener("click", event => {
  if (!title.contains(event.target)) count = 0;
});
window.addEventListener("pageshow", restoreMaterials);
window.addEventListener("storage", event => {
  if (event.key === unlockKey && event.newValue === "1") revealMaterials();
});
restoreMaterials();
