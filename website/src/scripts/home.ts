// Homepage behaviour: copy-detection demo + share button. No data leaves the page.
import { SAMPLES, type Sample } from "../data/home";

const $ = (id: string) => document.getElementById(id);
const ICONS: Record<string, string> = JSON.parse($("demo-icons")?.textContent ?? "{}");
const ic = (name: string, size: number, stroke = 1.75, spin = false) =>
  `<svg class="${spin ? "spin" : ""}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const copyText = (t: string) => { try { navigator.clipboard?.writeText(t).catch(() => {}); } catch {} };

const STRIPE = "repeating-linear-gradient(135deg,#171c29 0 5px,#121722 5px 10px)";
const MONO = "'Cascadia Mono',ui-monospace,Consolas,monospace";
const SITE_URL = location.origin + location.pathname.replace(/[^/]*$/, "").replace(/\/$/, "");

type Row = { id: number; s: Sample & { raw?: boolean }; t0: number; dup: boolean; chose: number | null };
let rows: Row[] = [];
let toast = "", toastT = 0, pickedT = 0;

const rowsEl = $("demo-rows"), emptyEl = $("demo-empty"), countEl = $("demo-count"), clearEl = $("demo-clear");
const toastEl = $("demo-toast"), toastText = $("demo-toast-text"), subEl = $("demo-sub");

function phase(r: Row) {
  const now = Date.now(), e = now - r.t0, s = r.s;
  if (r.dup) return { k: "dup" as const, p: 0, live: false };
  if (e < 1300) return { k: "checking" as const, p: 0, live: true };
  if (s.kind === "locked") return { k: "failed" as const, p: 0, live: false };
  let start = r.t0 + 1300;
  if (s.kind === "gallery") { if (!r.chose) return { k: "choose" as const, p: 0, live: false }; start = r.chose; }
  const p = (now - start) / (s.kind === "gallery" ? 3500 : 4800);
  if (p < 1) return { k: "down" as const, p: Math.max(0, p), live: true };
  return { k: "saved" as const, p: 1, live: false };
}

function rowHtml(r: Row) {
  const s = r.s, ph = phase(r);
  let v = {
    thumb: s.thumb || STRIPE, ticon: s.thumb ? "" : s.kind === "locked" ? "film" : "link", tspin: false, op: 1, bg: "transparent",
    tfg: s.raw ? "#a6adbe" : "#e9ecf4", tff: s.raw ? MONO : "inherit", tfs: s.raw ? "12px" : "13px",
    fg: "#a6adbe", sicon: "check", sspin: false, label: "", pct: "", bar: false, barW: "0%", sub: "", choose: false,
  };
  if (ph.k === "checking") v = { ...v, thumb: STRIPE, ticon: "loader-circle", tspin: true, sicon: "loader-circle", sspin: true, label: "Checking link", sub: "Finding the best version", bg: "rgba(106,166,255,0.05)" };
  else if (ph.k === "failed") v = { ...v, fg: "#f2847b", sicon: "circle-alert", label: "Sign-in needed", sub: "Members-only post" };
  else if (ph.k === "choose") v = { ...v, fg: "#6aa6ff", sicon: "list-checks", label: "Choose items", choose: true };
  else if (ph.k === "dup") v = { ...v, op: 0.45, tfg: "#a6adbe", sicon: "copy", label: "Already in list", sub: "Not downloaded twice" };
  else if (ph.k === "down") {
    const pc = Math.min(99, Math.round(ph.p * 100)), left = Math.max(1, Math.ceil((1 - ph.p) * (s.kind === "gallery" ? 3.5 : 4.8)));
    v = { ...v, fg: "#5fe3ee", sicon: "arrow-down-to-line", label: s.kind === "gallery" ? "Saving 18 images" : `Downloading · ${left} s`, pct: pc + "%", bar: true, barW: pc + "%" };
  } else v = { ...v, fg: "#5fcf98", sicon: "check", label: "Saved", sub: s.kind === "gallery" ? `18 images · ${s.mb} MB` : `${s.mb} MB · MP4` };

  return `<div style="display:flex;align-items:center;gap:12px;height:58px;flex:none;padding:0 14px;border-bottom:1px solid #151a25;background:${v.bg};transition:background .4s">
<div style="width:56px;height:32px;flex:none;border-radius:6px;background:${v.thumb};opacity:${v.op};box-shadow:inset 0 0 0 1px rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;color:#6f788c">${v.ticon ? ic(v.ticon, 14, 1.75, v.tspin) : ""}</div>
<div style="flex:1;min-width:0;opacity:${v.op}">
<div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${v.tfg};font-family:${v.tff};font-size:${v.tfs}">${esc(s.title)}</div>
<div style="display:flex;align-items:center;gap:6px;font-size:12px;line-height:16px;color:#7f879a;white-space:nowrap"><span>${esc(s.site)}</span>${s.q ? `<span style="height:16px;padding:0 5px;border-radius:4px;border:1px solid #2b3345;color:#b4bbcb;font-size:10.5px;font-weight:600;line-height:14px;box-sizing:border-box">${s.q}</span>` : ""}</div>
</div>
<div style="width:150px;flex:none;display:flex;flex-direction:column;gap:5px;opacity:${v.op}">
<div style="display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:500;color:${v.fg};white-space:nowrap">${ic(v.sicon, 13, 2, v.sspin)}<span style="overflow:hidden;text-overflow:ellipsis">${v.label}</span>${v.pct ? `<span style="margin-left:auto;color:#e9ecf4;font-variant-numeric:tabular-nums">${v.pct}</span>` : ""}</div>
${v.bar ? `<div style="height:4px;border-radius:2px;background:#1e2433;overflow:hidden"><div style="height:100%;width:${v.barW};border-radius:2px;background:linear-gradient(90deg,#0b67fe,#0cf3fe);transition:width .25s"></div></div>` : ""}
${v.sub ? `<div style="font-size:12px;line-height:16px;color:#7f879a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v.sub}</div>` : ""}
${v.choose ? `<button data-choose="${r.id}" style="align-self:flex-start;height:22px;padding:0 8px;border:none;border-radius:5px;background:#0b67fe;color:#fff;font-family:inherit;font-size:11.5px;font-weight:600;cursor:pointer">Download all 18</button>` : ""}
</div></div>`;
}

function render() {
  if (!rowsEl) return;
  rowsEl.innerHTML = rows.map(rowHtml).join("");
  if (emptyEl) emptyEl.hidden = rows.length > 0;
  if (clearEl) clearEl.hidden = rows.length === 0;
  if (countEl) countEl.textContent = rows.length + (rows.length === 1 ? " item" : " items");
  if (subEl) subEl.textContent = rows.length ? "Copy another link and it lands at the top." : "Copy a video or gallery link and it appears here.";
  if (toastEl && toastText) { toastEl.hidden = !toast; toastText.textContent = toast; }
}

function add(url: string, msg: string) {
  const norm = url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  let s: Row["s"] | undefined = SAMPLES.find((x) => x.url.replace(/^https?:\/\//, "") === norm);
  if (!s) {
    let host = "link";
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch {}
    s = { url, label: url, hint: "", icon: "link", title: url, site: host, kind: "video", mb: 140, raw: true };
  }
  const dup = rows.some((r) => r.s.url === s!.url && !r.dup);
  rows = [{ id: Date.now() + Math.random(), s, t0: Date.now(), dup, chose: null }, ...rows].slice(0, 4);
  toast = dup ? "Already in your list" : msg;
  clearTimeout(toastT);
  toastT = window.setTimeout(() => { toast = ""; render(); }, 2200);
  render();
}

function pick() {
  const hint = $("hero-hint"), done = $("hero-picked");
  if (!hint || !done) return;
  hint.hidden = true; done.hidden = false;
  clearTimeout(pickedT);
  pickedT = window.setTimeout(() => { hint.hidden = false; done.hidden = true; }, 5000);
}

$("hero-link")?.addEventListener("click", (e) => {
  const url = (e.currentTarget as HTMLElement).dataset.url!;
  copyText(url); add(url, "Link picked up from your clipboard"); pick();
});
document.querySelectorAll<HTMLElement>("[data-chip]").forEach((b) =>
  b.addEventListener("click", () => { copyText(b.dataset.url!); add(b.dataset.url!, "Link copied, and DriftFetch picked it up"); }));

// Any real copy of something URL-shaped, like the app's clipboard watcher.
document.addEventListener("copy", () => {
  const t = String(window.getSelection?.() ?? "").trim();
  const m = t.match(/https?:\/\/\S+|(?:[a-z0-9-]+\.)+[a-z]{2,}\/\S*/i);
  if (m) { add(m[0].startsWith("http") ? m[0] : "https://" + m[0], "Link picked up from your clipboard"); pick(); }
});

rowsEl?.addEventListener("click", (e) => {
  const id = (e.target as HTMLElement).closest<HTMLElement>("[data-choose]")?.dataset.choose;
  if (!id) return;
  rows = rows.map((r) => (String(r.id) === id ? { ...r, chose: Date.now() } : r));
  render();
});
clearEl?.addEventListener("click", () => { rows = []; render(); });

// Redraw while anything is checking or downloading.
setInterval(() => { if (rows.some((r) => phase(r).live)) render(); }, 150);

// Share: copy link
const share = $("share-copy");
if (share) {
  const slot = share.querySelector<HTMLElement>("[data-icon-slot]")!, label = share.querySelector<HTMLElement>("[data-label]")!;
  const idle = slot.innerHTML;
  let t = 0;
  share.addEventListener("click", () => {
    copyText(SITE_URL);
    slot.innerHTML = `<span class="ic">${ic("check", 16, 2)}</span>`; label.textContent = "Link copied";
    clearTimeout(t);
    t = window.setTimeout(() => { slot.innerHTML = idle; label.textContent = "Copy link"; }, 1800);
  });
}

render();
