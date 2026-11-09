// "The tide": wave edges between neighbouring [data-tide] blocks with different backgrounds.
// Port of design_handoff_driftfetch_website/pages/tide.js, plus a pause while the tab is hidden.
// Each seam gets its own canvas inside the section, so it scrolls with the page natively. A single
// fixed canvas redrawn per frame lags the compositor-scrolled DOM, which exposed the straight
// section edge as a hard line while scrolling.
const rm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const CLEAR = "rgba(0, 0, 0, 0)";
const H = 180, MID = H / 2; // canvas height, and the seam's y inside it (wave reaches at most ~78px either side)
const canvases = new WeakMap<HTMLElement, HTMLCanvasElement>();
let vel = 0;
let lastSy: number | null = null;
let raf = 0;

function seamCanvas(el: HTMLElement) {
  let cv = canvases.get(el);
  if (!cv) {
    cv = document.createElement("canvas");
    cv.setAttribute("aria-hidden", "true");
    cv.style.cssText = `position:absolute;left:0;top:-${MID}px;width:100%;height:${H}px;pointer-events:none;z-index:1`;
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    el.appendChild(cv);
    canvases.set(el, cv);
  }
  return cv;
}

function draw(now: number) {
  const dpr = window.devicePixelRatio || 1, vh = innerHeight;
  const T = rm ? 0 : now / 1000, sy = window.scrollY;
  const v = lastSy == null ? 0 : sy - lastSy;
  lastSy = sy;
  vel = vel * 0.93 + Math.abs(v) * 0.07;
  const A = rm ? 18 : 22 + Math.min(48, vel * 1.8);

  let prev: string | null = null, j = 0;
  document.querySelectorAll<HTMLElement>("[data-tide]").forEach((el) => {
    let col = getComputedStyle(el).backgroundColor;
    let p = el.parentElement;
    while (col === CLEAR && p) { col = getComputedStyle(p).backgroundColor; p = p.parentElement; }
    if (prev && col !== prev && col !== CLEAR) {
      const jj = j++, yv = el.getBoundingClientRect().top;
      if (yv > -140 && yv < vh + 140) {
        const cv = seamCanvas(el), VW = el.clientWidth;
        const w = Math.round(VW * dpr), h = Math.round(H * dpr);
        if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
        const ctx = cv.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, VW, H);
        const k = Math.min(1, VW / 1000); // shorter wavelength on phones so the waves read
        const wy = (x: number) => MID + A * (0.62 * Math.sin(x / (230 * k) + T * 0.6 + jj * 1.7 + sy * 0.0025) + 0.38 * Math.sin(x / (97 * k) - T * 0.85 + jj));
        // prev colour only below the seam, next colour only above it: the section's own
        // background (gradients included) shows everywhere else, so no hard line at the edge.
        const fill = (c: string, edge: number) => {
          ctx.save();
          ctx.beginPath();
          if (edge < MID) ctx.rect(0, MID - 1, VW, H); else ctx.rect(0, 0, VW, MID + 1); // 1px overlap hides the anti-alias seam
          ctx.clip();
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.moveTo(0, edge);
          for (let x = 0; x <= VW + 8; x += 8) ctx.lineTo(x, wy(x));
          ctx.lineTo(VW + 8, edge);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        };
        fill(prev, MID - A - 8);
        fill(col, MID + A + 8);
      }
    }
    if (col !== CLEAR) prev = col;
  });
}

const loop = (t: number) => { draw(t); raf = requestAnimationFrame(loop); };
raf = requestAnimationFrame(loop);
document.addEventListener("visibilitychange", () => {
  cancelAnimationFrame(raf);
  if (!document.hidden) raf = requestAnimationFrame(loop);
});
