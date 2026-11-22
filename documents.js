export const documents = [
  { id: "guide", title: "FluidSIM 3.6 视频速学指南", total: 11, shortTitle: "视频速学指南" },
  { id: "reference", title: "液压实训现场速查", total: 7, shortTitle: "现场速查" },
];

export const pdfFilename = doc => doc.title + ".pdf";
export const pdfUrl = doc => new URL("./assets/pdf/" + encodeURIComponent(pdfFilename(doc)), import.meta.url).href;
export const progressKey = doc => "fluidsim-lab:position:" + doc.id;

export function readProgress(doc) {
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey(doc)));
    if (saved && Number.isInteger(saved.page) && saved.page > 0 &&
        saved.page <= doc.total && Number.isFinite(saved.updated)) return saved;
  } catch { /* Private browsing may prevent storage. */ }
  return null;
}

export function writeProgress(doc, state) {
  try {
    localStorage.setItem(progressKey(doc), JSON.stringify({ ...state, updated: Date.now() }));
  } catch { /* Reading does not require storage. */ }
}
