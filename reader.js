import * as pdfjs from "./vendor/pdfjs/pdf.min.js";
import { documents, pdfFilename, pdfUrl, readProgress, writeProgress } from "./documents.js";

const $ = id => document.getElementById(id);
const stage = $("stage");
const wall = $("pages");
const pageInput = $("page-number");
const pageTotal = $("page-total");
const currentDocument = documents.find(doc => doc.id === (new URL(location.href).searchParams.get("doc") || "guide"));
const minZoom = 0.75;
const maxZoom = 3.5;
const maxCanvasPixels = 4_500_000;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

pdfjs.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.js", import.meta.url).href;

let pdf;
let aspect;
let pageNodes = [];
let activePage = 1;
let size = { width: 1, height: 1, gutter: 12 };
let zoom = 1;
let layoutRevision = 0;
let renderLoopActive = false;
let wanted = [];
let refreshFrame = 0;
let saveTimer = 0;
let pinch;
let initialized = false;

function setDocumentLinks(doc) {
  $("document-title").textContent = doc.title;
  $("document-title").title = doc.title;
  document.title = doc.title + " · 液压实训";
  const download = $("download");
  download.href = pdfUrl(doc);
  download.download = pdfFilename(doc);
  download.hidden = false;
  $("open-original").href = download.href;
}

function fail(message) {
  $("message-text").textContent = message;
  $("message").hidden = false;
  $("open-original").hidden = !currentDocument;
}

function guideLine() {
  return Math.min(30, size.height * 0.2);
}

function positionAt(x = stage.clientWidth / 2, y = guideLine()) {
  const top = stage.scrollTop + y;
  const index = pageNodes.findIndex(node => top < node.offsetTop + node.offsetHeight + 6);
  const i = index < 0 ? pageNodes.length - 1 : index;
  const node = pageNodes[i];
  return {
    page: i + 1,
    dx: clamp((stage.scrollLeft + x - node.offsetLeft) / size.width, 0, 1),
    dy: clamp((top - node.offsetTop) / size.height, 0, 1),
  };
}

function placePosition(anchor, x = stage.clientWidth / 2, y = guideLine()) {
  const node = pageNodes[clamp(anchor.page, 1, pageNodes.length) - 1];
  const dx = Number.isFinite(anchor.dx) ? clamp(anchor.dx, 0, 1) : 0.5;
  const dy = Number.isFinite(anchor.dy) ? clamp(anchor.dy, 0, 1) : 0;
  stage.scrollLeft = node.offsetLeft + size.width * dx - x;
  stage.scrollTop = node.offsetTop + size.height * dy - y;
}

function applyLayout(anchor, focus) {
  const gutter = stage.clientWidth <= 680 ? 8 : 16;
  const width = Math.max(1, Math.round((stage.clientWidth - 2 * gutter) * zoom));
  const height = Math.max(1, Math.round(width * aspect));
  if (size.width !== width || size.height !== height) layoutRevision++;
  size = { width, height, gutter };
  wall.style.setProperty("--gutter", gutter + "px");
  wall.style.setProperty("--page-width", width + "px");
  wall.style.setProperty("--page-height", height + "px");
  wall.style.width = Math.max(stage.clientWidth, width + gutter * 2) + "px";
  wall.style.paddingBottom = Math.max(gutter, stage.clientHeight - height - gutter) + "px";
  if (anchor) placePosition(anchor, focus?.x, focus?.y);
}

function setPageUi(page) {
  activePage = page;
  if (document.activeElement !== pageInput) pageInput.value = String(page);
  $("prev").disabled = page === 1;
  $("next").disabled = page === pageNodes.length;
  $("zoom-level").textContent = Math.round(zoom * 100) + "%";
  $("fit").setAttribute("aria-pressed", String(Math.abs(zoom - 1) < .01));
  $("zoom-out").disabled = zoom <= minZoom;
  $("zoom-in").disabled = zoom >= maxZoom;
}

function savePosition() {
  clearTimeout(saveTimer);
  if (initialized) writeProgress(currentDocument, { ...positionAt(), zoom });
}

function refresh() {
  refreshFrame = 0;
  if (!initialized) return;
  setPageUi(positionAt().page);
  if (pinch) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(savePosition, 160);
  const first = stage.scrollTop - size.height * .65;
  const last = stage.scrollTop + stage.clientHeight + size.height * .65;
  wanted = pageNodes.map((node, i) => ({
    node, i, distance: Math.abs(node.offsetTop - stage.scrollTop),
  })).filter(({ node }) => node.offsetTop + node.offsetHeight >= first && node.offsetTop <= last)
    .sort((a, b) => a.distance - b.distance);
  const showing = new Set(wanted.map(({ i }) => i));
  pageNodes.forEach((node, i) => {
    if (showing.has(i)) return;
    const canvas = node.querySelector("canvas");
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
      canvas.remove();
      delete node.dataset.revision;
    }
  });
  renderWanted();
}

function scheduleRefresh() {
  if (!refreshFrame) refreshFrame = requestAnimationFrame(refresh);
}

async function renderWanted() {
  if (renderLoopActive || pinch) return;
  renderLoopActive = true;
  try {
    while (!pinch) {
      const target = wanted.find(({ node }) => node.dataset.revision !== String(layoutRevision));
      if (!target) break;
      const { node, i } = target;
      const revision = layoutRevision;
      const width = size.width;
      try {
        const page = await pdf.getPage(i + 1);
        if (revision !== layoutRevision || !wanted.some(item => item.i === i)) continue;
        const full = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: width / full.width });
        const multiplier = Math.min(devicePixelRatio || 1, 2, Math.sqrt(maxCanvasPixels / (viewport.width * viewport.height)));
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width * multiplier);
        canvas.height = Math.ceil(viewport.height * multiplier);
        canvas.setAttribute("aria-label", "第 " + (i + 1) + " 页图像");
        canvas.setAttribute("role", "img");
        await page.render({
          canvasContext: canvas.getContext("2d", { alpha: false }),
          viewport,
          transform: multiplier === 1 ? null : [multiplier, 0, 0, multiplier, 0, 0],
          background: "#fff",
        }).promise;
        if (revision !== layoutRevision || !wanted.some(item => item.i === i)) continue;
        const previous = node.querySelector("canvas");
        if (previous) {
          previous.width = 0;
          previous.height = 0;
        }
        node.replaceChildren(canvas);
        node.dataset.revision = String(revision);
      } catch (error) {
        const message = document.createElement("span");
        message.dataset.renderError = "";
        message.textContent = "本页显示失败，可下载原 PDF 查看。";
        node.replaceChildren(message);
        node.dataset.revision = String(revision);
        console.error("PDF page render failed", i + 1, error);
      }
    }
  } finally {
    renderLoopActive = false;
  }
}

function goTo(page) {
  if (!initialized || !Number.isFinite(page)) return;
  const target = clamp(Math.trunc(page), 1, pageNodes.length);
  const node = pageNodes[target - 1];
  stage.scrollTop = node.offsetTop - size.gutter;
  pageInput.value = String(target);
  setPageUi(target);
  scheduleRefresh();
  savePosition();
}

function changeZoom(value, anchor = positionAt(), focus) {
  zoom = clamp(value, minZoom, maxZoom);
  applyLayout(anchor, focus);
  setPageUi(anchor.page);
  scheduleRefresh();
}

function touchPair(touches) {
  const a = touches[0];
  const b = touches[1];
  const bounds = stage.getBoundingClientRect();
  return {
    distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
    x: (a.clientX + b.clientX) / 2 - bounds.left,
    y: (a.clientY + b.clientY) / 2 - bounds.top,
  };
}

function attachReaderControls() {
  $("prev").addEventListener("click", () => goTo(activePage - 1));
  $("next").addEventListener("click", () => goTo(activePage + 1));
  $("jump").addEventListener("submit", event => {
    event.preventDefault();
    if (/^\d+$/.test(pageInput.value.trim())) goTo(Number(pageInput.value));
    pageInput.value = String(activePage);
    stage.focus({ preventScroll: true });
  });
  pageInput.addEventListener("blur", () => { pageInput.value = String(activePage); });
  $("zoom-in").addEventListener("click", () => changeZoom(zoom * 1.25));
  $("zoom-out").addEventListener("click", () => changeZoom(zoom / 1.25));
  $("fit").addEventListener("click", () => changeZoom(1));
  stage.addEventListener("scroll", scheduleRefresh, { passive: true });
  stage.addEventListener("keydown", event => {
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      goTo(activePage + (event.key === "PageDown" ? 1 : -1));
    }
  });
  stage.addEventListener("touchstart", event => {
    if (event.touches.length !== 2) return;
    const pair = touchPair(event.touches);
    if (!pair.distance) return;
    pinch = { initial: pair.distance, zoom, anchor: positionAt(pair.x, pair.y) };
  }, { passive: true });
  stage.addEventListener("touchmove", event => {
    if (!pinch || event.touches.length !== 2) return;
    event.preventDefault();
    const pair = touchPair(event.touches);
    changeZoom(pinch.zoom * pair.distance / pinch.initial, pinch.anchor, pair);
  }, { passive: false });
  const endPinch = event => {
    if (!pinch || event.touches.length >= 2) return;
    pinch = null;
    scheduleRefresh();
  };
  stage.addEventListener("touchend", endPinch, { passive: true });
  stage.addEventListener("touchcancel", endPinch, { passive: true });
  let previousWidth = stage.clientWidth;
  let previousHeight = stage.clientHeight;
  new ResizeObserver(() => {
    if (previousWidth === stage.clientWidth && previousHeight === stage.clientHeight) return;
    const anchor = positionAt();
    previousWidth = stage.clientWidth;
    previousHeight = stage.clientHeight;
    applyLayout(anchor);
    scheduleRefresh();
  }).observe(stage);
  window.addEventListener("pagehide", savePosition);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") savePosition();
  });
}

async function startReader() {
  if (!currentDocument) {
    fail("找不到这份资料，请返回资料站选择。");
    return;
  }
  setDocumentLinks(currentDocument);
  try {
    pdf = await pdfjs.getDocument({
      url: pdfUrl(currentDocument),
      isEvalSupported: false,
      enableXfa: false,
      useWasm: false,
    }).promise;
    const firstPage = await pdf.getPage(1);
    const original = firstPage.getViewport({ scale: 1 });
    aspect = original.height / original.width;
    pageNodes = Array.from({ length: pdf.numPages }, (_, i) => {
      const page = document.createElement("figure");
      page.className = "pdf-page";
      page.dataset.label = "第 " + (i + 1) + " 页";
      page.dataset.page = String(i + 1);
      page.setAttribute("aria-label", page.dataset.label);
      return page;
    });
    pageTotal.textContent = "/ " + pdf.numPages;
    wall.replaceChildren(...pageNodes);
    wall.hidden = false;
    $("message").hidden = true;
    const saved = readProgress(currentDocument);
    zoom = typeof saved?.zoom === "number" ? clamp(saved.zoom, minZoom, maxZoom) : 1;
    applyLayout(saved);
    pageInput.disabled = false;
    $("fit").disabled = false;
    initialized = true;
    attachReaderControls();
    refresh();
  } catch (error) {
    fail("阅读器暂时无法显示，请打开原 PDF。");
    console.error("Could not open PDF", error);
  }
}

startReader();
