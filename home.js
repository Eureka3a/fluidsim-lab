import { documents, readProgress } from "./documents.js";

function showProgress() {
  let mostRecent;
  const resume = document.getElementById("resume");
  for (const doc of documents) {
    const saved = readProgress(doc);
    const status = document.querySelector('[data-doc-card="' + doc.id + '"] [data-progress]');
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

window.addEventListener("pageshow", showProgress);
showProgress();
