// "The tide": wave edges between neighbouring [data-tide] blocks with different backgrounds.
// Port of design_handoff_driftfetch_website/pages/tide.js, plus a pause while the tab is hidden.
const cv = document.createElement("canvas");
cv.setAttribute("aria-hidden", "true");
cv.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:1";
document.body.appendChild(cv);

const rm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const CLEAR = "rgba(0, 0, 0, 0)";
let vel = 0;
let lastSy: number | null = null;
let raf = 0;

function draw(now: number) {
  const dpr = window.devicePixelRatio || 1, VW = innerWidth, vh = innerHeight;
  if (cv.width !== Math.round(VW * dpr) || cv.height !== Math.round(vh * dpr)) {
    cv.width = Math.round(VW * dpr);
    cv.height = Math.round(vh * dpr);
  }
  const ctx = cv.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, VW, vh);
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
      const yv = el.getBoundingClientRect().top, jj = j++;
      if (yv > -140 && yv < vh + 140) {
        const wy = (x: number) => yv + A * (0.62 * Math.sin(x / 230 + T * 0.6 + jj * 1.7 + sy * 0.0025) + 0.38 * Math.sin(x / 97 - T * 0.85 + jj));
        const fill = (c: string, edge: number) => {
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.moveTo(0, edge);
          for (let x = 0; x <= VW + 8; x += 8) ctx.lineTo(x, wy(x));
          ctx.lineTo(VW + 8, edge);
          ctx.closePath();
          ctx.fill();
        };
        fill(prev, yv - A - 8);
        fill(col, yv + A + 8);
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
