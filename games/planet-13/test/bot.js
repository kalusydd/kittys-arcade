// Browser play-test bot. Load in the running game (window.__P13 must exist), then call
// runAll(seeds) to drive the real physics through every level. Enemies are ignored
// (invulnerable) but the lethal sea is not, so every jump must actually be made.
(function () {
  const J = (lv, p) => lv.L.jumps.find((j) => p.x >= j.fx - 0.5 && p.x <= j.fx + 0.1 && Math.abs(j.fy - p.y) < 0.35);
  let target = null;
  function bot(t, p, lv) {
    p.invuln = 99;
    if (!lv.artifact.taken) { lv.artifact.taken = true; lv.activatePortal(); }
    const o = { right: true, left: false, jumpHeld: p.vy > 0, jumpPressed: false };
    const solids = lv.solids.filter((s) => s.active);
    const st = p.standing;
    if (p.grounded) target = null;
    if (st && st.move) {
      o.right = false;
      const next = solids.filter((s) => !s.move && s.x > st.x + 0.5).sort((a, b) => a.x - b.x)[0];
      if (next) {
        const top = next.y + next.h;
        if (next.x - (st.x + st.w) < 1.6 && top - p.y < 1.8) { o.right = true; if (p.x > st.x + st.w - 0.9) o.jumpPressed = true; o.jumpHeld = true; }
        else if (p.x < st.x + st.w - 1.0) o.right = true;
      }
      return o;
    }
    if (!p.grounded) {
      if (target) {
        const gap = target.tx - target.fx, dy = target.ty - target.fy;
        if (gap < 2.8 && dy < 0.8) o.jumpHeld = p.vy > 11;
        const aim = target.tx + 0.9;
        o.right = p.x < aim; o.left = p.x > aim + 0.4;
      }
      return o;
    }
    const j = J(lv, p);
    if (j) { o.jumpPressed = true; o.jumpHeld = true; target = j; return o; }
    const wall = solids.filter((s) => !s.oneway && s.x > p.x + 0.3 && s.x < p.x + 1.0 && s.y + s.h > p.y + 0.3 && s.y < p.y + 1).sort((a, b) => a.x - b.x)[0];
    if (wall) { o.jumpPressed = true; o.jumpHeld = true; target = { fx: p.x, fy: p.y, tx: wall.x + 0.2, ty: wall.y + wall.h }; return o; }
    const x = p.x + 0.9;
    const support = solids.some((s) => !s.move && x >= s.x && x <= s.x + s.w && s.y + s.h <= p.y + 0.35 && s.y + s.h > p.y - 4.5);
    const soon = lv.L.jumps.some((jj) => jj.fx > p.x - 0.5 && jj.fx < p.x + 2.5 && Math.abs(jj.fy - p.y) < 0.35);
    if (!support && !soon) {
      const mv = solids.filter((s) => s.move && s.x + s.w > p.x).sort((a, b) => a.x - b.x)[0];
      if (mv && mv.x - p.x < 16) {
        o.right = false;
        const top = mv.y + mv.h, near = mv.x - (p.x + 0.4);
        const lift = mv.move.ax === mv.move.bx;
        if (lift && near < 1.8 && Math.abs(top - p.y) < 0.35 && mv.dy <= 0.001) { o.right = true; o.jumpPressed = true; o.jumpHeld = false; }
        if (!lift && near < 0.9 && Math.abs(top - p.y) < 0.8 && mv.dx <= 0.0001) { o.right = true; o.jumpPressed = true; }
      }
    }
    return o;
  }
  function runLevel(i) {
    __P13.jumpTo(i); __P13.begin();
    let r;
    for (let k = 0; k < 600 && __P13.S.state === 'playing'; k++) r = __P13.sim(0.25, bot);
    const L = __P13.level.L;
    return { level: i, state: __P13.S.state, x: r.x, portalX: +L.portal.x.toFixed(1), time: +__P13.S.levelTime.toFixed(1) };
  }
  function runAll(from = 100, to = 140) {
    const fails = []; let n = 0, time = 0;
    for (let s = from; s < to; s++) {
      __P13.S.seed = s;
      for (let i = 0; i < 10; i++) { const r = runLevel(i); n++; time += r.time; if (r.state !== 'warp') fails.push(`seed ${s} L${i}: ${r.state} x=${r.x}/${r.portalX}`); }
    }
    return { n, failCount: fails.length, fails: fails.slice(0, 20), avgBotTime: +(time / n).toFixed(1) };
  }
  window.P13Bot = { bot, runLevel, runAll };
})();
