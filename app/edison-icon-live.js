// Edison's live icon, drawn fresh every frame. His rainbow as flat rings (no dots),
// a classic red-to-violet rainbow that steps outward one ring at a time, a gentle highlight rippling through, and his
// soft lavender eye in the middle that blinks. Design rounds: public/mockups/icon-options.html; old icons in icons-old\.
// window.EdisonIcon.draw(ctx, size, tMs, opts) draws one frame; window.EdisonIcon.start() animates the tab and taskbar icon.
(function () {
  const RAINBOW = ['#FF3B3B', '#FF8A1F', '#FFD60A', '#3DDC5A', '#2F8CFF', '#5B3DFF', '#B13DFF'];
  const BANDS = 6, OUTER = 236, INNER = 44;
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16));
  const RGB = RAINBOW.map(rgb);
  // The rainbow's colour at position p (0..7, wrapping), blended smoothly between neighbours, lightened by w.
  function colourAt(p, w) {
    const n = RGB.length, i = ((Math.floor(p) % n) + n) % n, f = p - Math.floor(p), a = RGB[i], b = RGB[(i + 1) % n];
    return 'rgb(' + a.map((x, j) => { const v = x + (b[j] - x) * f; return Math.round(v + (255 - v) * w); }).join(',') + ')';
  }

  // opts.bare: just the rainbow disc and eye, no dark tile (the O in the EDISON wordmark); opts.noBlink skips the blink.
  function draw(c, S, t, opts) {
    opts = opts || {};
    const k = S / 512, cx = 256 * k, cy = 256 * k;
    c.clearRect(0, 0, S, S);
    if (!opts.bare) {
      const r = 112 * k; c.beginPath(); c.moveTo(8 * k + r, 8 * k); c.arcTo(504 * k, 8 * k, 504 * k, 504 * k, r); c.arcTo(504 * k, 504 * k, 8 * k, 504 * k, r); c.arcTo(8 * k, 504 * k, 8 * k, 8 * k, r); c.arcTo(8 * k, 8 * k, 504 * k, 8 * k, r); c.closePath();
      const bg = c.createLinearGradient(0, 0, S, S); bg.addColorStop(0, '#150B3E'); bg.addColorStop(1, '#04020D'); c.fillStyle = bg; c.fill();
    }
    const outer = (opts.bare ? 252 : OUTER) * k, inner = (opts.bare ? 64 : INNER) * k, w = (outer - inner) / BANDS;
    const shift = t / 900; // colours flow smoothly outward, about one ring a second (2026-10-24: stepping looked jumpy)
    for (let i = BANDS - 1; i >= 0; i--) {
      const f = i / (BANDS - 1), wave = Math.sin(f * 6 - t / 500);
      c.fillStyle = colourAt(i - shift, wave > 0.6 ? (wave - 0.6) * 0.3 : 0); // a little brighter as the highlight passes
      c.beginPath(); c.arc(cx, cy, inner + (i + 1) * w, 0, 6.283); c.arc(cx, cy, inner + i * w + 1.5 * k, 0, 6.283, true); c.fill();
    }
    if (!opts.bare) { // soft violet glow just outside the rings
      const g = c.createRadialGradient(cx, cy, outer * 0.98, cx, cy, outer * 1.08); g.addColorStop(0, 'rgba(156,61,255,.35)'); g.addColorStop(1, 'rgba(156,61,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(cx, cy, outer * 1.08, 0, 6.283); c.arc(cx, cy, outer, 0, 6.283, true); c.fill();
    }
    // his soft lavender eye, blinking every ~4.5 s
    const bt = (t % 4500) / 220, lid = !opts.noBlink && bt < 1 ? Math.sin(bt * Math.PI) : 0, sq = 1 - lid * 0.9;
    c.fillStyle = '#1A0E45'; c.beginPath(); c.arc(cx, cy, inner, 0, 6.283); c.fill();
    c.globalAlpha = 0.55; c.fillStyle = '#9C7BFF'; c.beginPath(); c.ellipse(cx, cy, inner * 0.85, inner * 0.85 * sq, 0, 0, 6.283); c.fill();
    c.globalAlpha = 0.65; c.fillStyle = '#D9CCFF'; c.beginPath(); c.ellipse(cx, cy, inner * 0.42, inner * 0.42 * sq, 0, 0, 6.283); c.fill();
    c.globalAlpha = 1;
  }

  // Animate the page's icon (tab and taskbar): about 10 frames a second, held still while minimized.
  // Under prefers-reduced-motion it does not animate (the page's own still icon stays), and it follows the
  // setting if someone changes it mid-visit: switching reduced motion on stops the timer at once.
  let started = false;
  function start() {
    if (started) return;
    started = true;
    const S = 64, cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d');
    let link = null, timer = 0;
    const t0 = performance.now(), mq = matchMedia('(prefers-reduced-motion: reduce)');
    const paint = () => {
      if (!link) link = document.querySelector('link[rel="icon"]');
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
      link.type = 'image/png';
      draw(c, S, performance.now() - t0); link.href = cv.toDataURL('image/png');
    };
    const run = () => {
      clearInterval(timer); timer = 0;
      if (mq.matches) return;
      timer = setInterval(() => { if (!document.hidden) paint(); }, 100);
    };
    if (mq.addEventListener) mq.addEventListener('change', run); else if (mq.addListener) mq.addListener(run);
    run();
  }

  window.EdisonIcon = { draw: draw, start: start };
})();
