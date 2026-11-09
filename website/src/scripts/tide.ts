// "The tide": wave edges between neighbouring [data-tide] blocks with different backgrounds.
// Each block that starts a new colour reaches MID px up over the end of the previous block, and its
// top edge is clipped to a moving wave. The wave is the block's own paint, so it scrolls with the
// page by construction: a separate canvas layer drifted out of sync while scrolling and exposed
// the straight section edge as a hard line.
const rm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const CLEAR = "rgba(0, 0, 0, 0)";
const MID = 90; // overlap into the previous block; the wave reaches at most ~78px either side of the seam
const ready = new WeakSet<HTMLElement>();
let vel = 0;
let lastSy: number | null = null;
let raf = 0;

function overlap(el: HTMLElement, before: HTMLElement, beforeCol: string, col: string) {
  if (ready.has(el)) return;
  ready.add(el);
  const cs = getComputedStyle(el);
  // Where the wave dips below the seam, the next block is clipped away: the previous block's colour has to be there.
  before.style.boxShadow = `0 ${MID}px 0 0 ${beforeCol}`;
  if (cs.backgroundColor === CLEAR) el.style.backgroundColor = col;
  if (cs.position === "static") el.style.position = "relative";
  el.style.marginTop = `calc(${cs.marginTop} - ${MID}px)`;
  el.style.paddingTop = `calc(${cs.paddingTop} + ${MID}px)`;
}

function draw(now: number) {
  const vh = innerHeight;
  const T = rm ? 0 : now / 1000, sy = window.scrollY;
  const v = lastSy == null ? 0 : sy - lastSy;
  lastSy = sy;
  vel = vel * 0.93 + Math.abs(v) * 0.07;
  const A = rm ? 18 : 22 + Math.min(48, vel * 1.8);

  let prev: string | null = null, prevEl: HTMLElement | null = null, j = 0;
  document.querySelectorAll<HTMLElement>("[data-tide]").forEach((el) => {
    let col = getComputedStyle(el).backgroundColor;
    let p = el.parentElement;
    while (col === CLEAR && p) { col = getComputedStyle(p).backgroundColor; p = p.parentElement; }
    if (prev && col !== prev && col !== CLEAR) {
      const jj = j++;
      overlap(el, prevEl!, prev, col);
      const yv = el.getBoundingClientRect().top + MID;
      if (yv > -140 && yv < vh + 140) {
        const VW = el.clientWidth, k = Math.min(1, VW / 1000); // shorter wavelength on phones so the waves read
        const pts: string[] = [];
        for (let x = 0; x <= VW + 8; x += 8) {
          const y = MID + A * (0.62 * Math.sin(x / (230 * k) + T * 0.6 + jj * 1.7 + sy * 0.0025) + 0.38 * Math.sin(x / (97 * k) - T * 0.85 + jj));
          pts.push(`${x}px ${y.toFixed(1)}px`);
        }
        el.style.clipPath = `polygon(${pts.join(",")},100% 100%,0 100%)`;
      }
    }
    if (col !== CLEAR) { prev = col; prevEl = el; }
  });
}

const loop = (t: number) => { draw(t); raf = requestAnimationFrame(loop); };
raf = requestAnimationFrame(loop);
document.addEventListener("visibilitychange", () => {
  cancelAnimationFrame(raf);
  if (!document.hidden) raf = requestAnimationFrame(loop);
});
