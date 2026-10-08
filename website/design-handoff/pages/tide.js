// <df-tide>: draws flowing wave edges between consecutive [data-tide] blocks with different backgrounds.
(function () {
  if (customElements.get('df-tide')) return;
  class DfTide extends HTMLElement {
    connectedCallback() {
      if (this.cv) return;
      this.style.display = 'contents';
      const cv = this.cv = document.createElement('canvas');
      cv.setAttribute('aria-hidden', 'true');
      cv.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:1';
      this.appendChild(cv);
      this.rm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.vel = 0; this.lastSy = null;
      const loop = t => { this.draw(t); this.raf = requestAnimationFrame(loop); };
      this.raf = requestAnimationFrame(loop);
    }
    disconnectedCallback() { cancelAnimationFrame(this.raf); }
    draw(now) {
      const cv = this.cv, dpr = window.devicePixelRatio || 1, VW = innerWidth, vh = innerHeight;
      if (cv.width !== Math.round(VW * dpr) || cv.height !== Math.round(vh * dpr)) { cv.width = Math.round(VW * dpr); cv.height = Math.round(vh * dpr); }
      const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, VW, vh);
      const T = this.rm ? 0 : now / 1000, sy = window.scrollY;
      const v = this.lastSy == null ? 0 : sy - this.lastSy; this.lastSy = sy;
      this.vel = this.vel * 0.93 + Math.abs(v) * 0.07;
      const A = this.rm ? 18 : 22 + Math.min(48, this.vel * 1.8);
      const els = document.querySelectorAll('[data-tide]');
      let prev = null, j = 0;
      els.forEach(el => {
        let col = getComputedStyle(el).backgroundColor, p = el.parentElement;
        while (col === 'rgba(0, 0, 0, 0)' && p) { col = getComputedStyle(p).backgroundColor; p = p.parentElement; }
        if (prev && col !== prev && col !== 'rgba(0, 0, 0, 0)') {
          const yv = el.getBoundingClientRect().top, jj = j++;
          if (yv > -140 && yv < vh + 140) {
            const wy = x => yv + A * (0.62 * Math.sin(x / 230 + T * 0.6 + jj * 1.7 + sy * 0.0025) + 0.38 * Math.sin(x / 97 - T * 0.85 + jj));
            const fill = (c, edge) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(0, edge); for (let x = 0; x <= VW + 8; x += 8) ctx.lineTo(x, wy(x)); ctx.lineTo(VW + 8, edge); ctx.closePath(); ctx.fill(); };
            fill(prev, yv - A - 8); fill(col, yv + A + 8);
          }
        }
        if (col !== 'rgba(0, 0, 0, 0)') prev = col;
      });
    }
  }
  customElements.define('df-tide', DfTide);
})();
