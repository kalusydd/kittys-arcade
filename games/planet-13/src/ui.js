// DOM interface: screens, HUD, the Registry terminal, menu navigation, toasts.
import { audio } from './audio.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- The Registry hologram
// An ancient three-eyed cosmic squid, monocled, flickering inside a CRT.
function drawRegistry(g, w, h, t, talk, mood) {
  g.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h * 0.42, s = w / 150;
  const flick = 0.82 + 0.18 * Math.sin(t * 37) * Math.sin(t * 13.1);
  g.save();
  g.globalAlpha = flick;
  g.translate(cx, cy + Math.sin(t * 1.6) * 3 * s);
  g.scale(s, s);
  const hue = (t * 20) % 360;
  const c1 = `hsl(${170 + Math.sin(t) * 20},100%,65%)`, c2 = `hsl(${300 + Math.sin(t * 0.7) * 25},100%,68%)`;
  // tentacles
  g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const bx = -30 + i * 10;
    g.beginPath();
    let x = bx, y = 18;
    g.moveTo(x, y);
    for (let k = 1; k <= 10; k++) {
      const u = k / 10;
      x = bx + (bx * 0.5) * u + Math.sin(t * 3 + i * 1.3 + u * 5) * 9 * u;
      y = 18 + u * 52;
      g.lineTo(x, y);
    }
    const grad = g.createLinearGradient(0, 18, 0, 70);
    grad.addColorStop(0, c1); grad.addColorStop(1, 'rgba(255,90,210,0)');
    g.strokeStyle = grad; g.lineWidth = 7 - Math.abs(i - 3) * 0.6;
    g.stroke();
    // suckers
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let k = 3; k < 9; k += 2) { const u = k / 10; g.beginPath(); g.arc(bx + bx * 0.5 * u + Math.sin(t * 3 + i * 1.3 + u * 5) * 9 * u, 18 + u * 52, 1.4, 0, 6.3); g.fill(); }
  }
  // mantle
  const pulse = 1 + (talk ? Math.sin(t * 22) * 0.035 : Math.sin(t * 2) * 0.015);
  g.save(); g.scale(pulse, 1 / pulse);
  const mg = g.createRadialGradient(-10, -30, 5, 0, -10, 52);
  mg.addColorStop(0, 'rgba(230,255,250,0.95)'); mg.addColorStop(0.45, c1); mg.addColorStop(1, c2);
  g.fillStyle = mg;
  g.beginPath();
  g.moveTo(-38, 18);
  g.bezierCurveTo(-48, -20, -30, -62, 0, -66);
  g.bezierCurveTo(30, -62, 48, -20, 38, 18);
  g.bezierCurveTo(20, 26, -20, 26, -38, 18);
  g.fill();
  // brain-ish swirls
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5;
  for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(-8 + k * 9, -42 + k * 3, 8 + k * 2, 0.5 + t + k, 3.5 + t + k); g.stroke(); }
  g.restore();
  // eyes: three, of differing sizes, one with a monocle
  const eyes = [[-17, -6, 11], [15, -8, 13], [-1, -28, 7]];
  const blink = (Math.sin(t * 0.9) > 0.985) || (Math.sin(t * 1.37 + 2) > 0.992);
  const look = [Math.sin(t * 0.7) * 3 + (mood === 'excited' ? Math.sin(t * 8) * 2 : 0), Math.cos(t * 0.53) * 2];
  eyes.forEach(([x, y, r], i) => {
    g.fillStyle = '#0b1a24';
    g.beginPath(); g.ellipse(x, y, r, blink ? 1.5 : r * (mood === 'excited' ? 1.15 : 1), 0, 0, 6.3); g.fill();
    if (!blink) {
      g.fillStyle = `hsl(${(hue + i * 60) % 360},100%,62%)`;
      g.beginPath(); g.arc(x + look[0] * (r / 12), y + look[1] * (r / 12), r * 0.55, 0, 6.3); g.fill();
      g.fillStyle = '#05010f';
      g.beginPath(); g.ellipse(x + look[0] * (r / 12), y + look[1] * (r / 12), r * 0.18, r * 0.42, 0, 0, 6.3); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x + look[0] * (r / 12) + r * 0.25, y - r * 0.3, r * 0.15, 0, 6.3); g.fill();
    }
  });
  // monocle on the big eye
  g.strokeStyle = '#ffd23a'; g.lineWidth = 2.2;
  g.beginPath(); g.arc(15, -8, 16, 0, 6.3); g.stroke();
  g.beginPath(); g.moveTo(29, 0); g.quadraticCurveTo(36, 14, 30, 30); g.stroke();
  // beak / mouth
  g.fillStyle = '#0b1a24';
  const mo = talk ? 2 + Math.abs(Math.sin(t * 18)) * 5 : 1.5;
  g.beginPath(); g.ellipse(0, 12, 6, mo, 0, 0, 6.3); g.fill();
  g.restore();
  // glyph particles when talking
  if (talk) {
    g.fillStyle = c1; g.font = `${12 * s}px VT323, monospace`;
    for (let i = 0; i < 4; i++) {
      const u = (t * 0.8 + i * 0.25) % 1;
      g.globalAlpha = (1 - u) * 0.8;
      g.fillText('⟁◊⌬∴✶'[i % 5], cx + Math.sin(i * 2.3 + t) * 50 * s, cy - 40 * s - u * 40 * s);
    }
    g.globalAlpha = 1;
  }
  // hologram scan band
  const band = ((t * 0.6) % 1) * h;
  g.fillStyle = 'rgba(58,255,232,0.08)';
  g.fillRect(0, band, w, 10 * s);
}

class Terminal {
  constructor(slot, label = 'THE REGISTRY // INTERGALACTIC ARCHIVE v13.0') {
    slot.innerHTML = `<div class="terminal"><div class="screenbox"><canvas width="300" height="300"></canvas></div>
      <div class="txt"><div class="who"><i></i>${label}</div><div class="line"></div><div class="next"></div></div></div>`;
    this.canvas = $('canvas', slot);
    this.g = this.canvas.getContext('2d');
    this.lineEl = $('.line', slot);
    this.nextEl = $('.next', slot);
    this.slot = slot;
    this.full = ''; this.shown = 0; this.talking = false; this.mood = 'calm';
    this.resolve = null;
  }
  say(text, { wait = false, next = '' } = {}) {
    this.full = text; this.shown = 0; this.talking = true;
    this.nextEl.innerHTML = next;
    this.render();
    return new Promise((res) => { this.resolve = wait ? res : null; if (!wait) res(); });
  }
  skip() {
    if (this.shown < this.full.length) { this.shown = this.full.length; this.render(); return true; }
    return false;
  }
  advance() {
    if (this.skip()) return;
    if (this.resolve) { const r = this.resolve; this.resolve = null; r(); }
  }
  render() {
    const done = this.shown >= this.full.length;
    this.lineEl.innerHTML = esc(this.full.slice(0, Math.floor(this.shown))) + (done ? '' : '<span class="cursor"></span>');
  }
  tick(dt, t) {
    if (this.shown < this.full.length) {
      const before = Math.floor(this.shown);
      this.shown = Math.min(this.full.length, this.shown + dt * 52);
      if (Math.floor(this.shown) !== before) { this.render(); if (before % 3 === 0) audio.blip(); }
      this.talking = true;
    } else this.talking = false;
    if (this.slot.offsetParent !== null) drawRegistry(this.g, 300, 300, t, this.talking, this.mood);
  }
}

// ---------------------------------------------------------------- UI singleton
export const UI = {
  init(handlers) {
    this.h = handlers;
    this.screens = {};
    for (const s of $$('.screen')) this.screens[s.id] = s;
    this.terms = {
      intro: new Terminal($('#intro .term-slot')),
      shop: new Terminal($('#shop .term-slot'), 'CUSTOMS OFFICER // THE REGISTRY'),
      gameover: new Terminal($('#gameover .term-slot')),
      victory: new Terminal($('#victory .term-slot')),
    };
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      audio.init();
      audio.click();
      this.h.action(b.dataset.act, b);
    });
    document.addEventListener('mouseover', (e) => {
      const b = e.target.closest('.btn');
      if (b && this.active && this.screens[this.active].contains(b)) this.focus(b);
    });
    $('#mute').addEventListener('click', (e) => { e.stopPropagation(); audio.init(); this.h.action('mute'); });
    this.updateMute();
    this.active = null;
    this.overlay = null;
  },
  updateMute() { $('#mute').textContent = audio.muted ? '♪ SOUND OFF' : '♪ SOUND ON'; },
  tick(dt, t) { for (const k in this.terms) this.terms[k].tick(dt, t); },

  show(name, { keep = [] } = {}) {
    for (const [k, el] of Object.entries(this.screens)) {
      const on = k === name || keep.includes(k);
      el.classList.toggle('on', on);
    }
    this.active = name;
    const first = this.buttons()[0];
    if (first) this.focus($('.btn.primary:not([disabled])', this.screens[name]) || first);
  },
  hide(name) { this.screens[name].classList.remove('on'); },
  buttons() { return this.active ? $$('.btn:not([disabled])', this.screens[this.active]) : []; },
  focus(b) {
    $$('.btn.focus').forEach((x) => x.classList.remove('focus'));
    if (b) { b.classList.add('focus'); this.focused = b; }
  },
  // keyboard navigation for any menu screen
  navKey(code) {
    const list = this.buttons();
    if (!list.length) return false;
    let i = list.indexOf(this.focused);
    if (['ArrowDown', 'ArrowRight', 'KeyS', 'KeyD', 'Tab'].includes(code)) i = (i + 1) % list.length;
    else if (['ArrowUp', 'ArrowLeft', 'KeyW', 'KeyA'].includes(code)) i = (i - 1 + list.length) % list.length;
    else if (['Enter', 'Space'].includes(code)) { const b = list[Math.max(0, i)]; if (b) { audio.click(); this.h.action(b.dataset.act, b); } return true; }
    else return false;
    audio.move();
    this.focus(list[i]);
    return true;
  },
  fade(on) { $('#fade').classList.toggle('on', on); },
  hideLoading() { const l = $('#loading'); l.style.opacity = 0; setTimeout(() => l.remove(), 700); },

  // ---------- select
  setCharacter(c, index, total) {
    const s = this.screens.select;
    $('.who-name', s).textContent = c.name;
    $('.who-title', s).textContent = c.title;
    $('.who-tag', s).textContent = '“' + c.tagline + '”';
    $('.who-bio', s).textContent = c.bio;
    $('.dots', s).innerHTML = Array.from({ length: total }, (_, i) => `<i class="${i === index ? 'on' : ''}"></i>`).join('');
  },

  // ---------- briefing
  briefing(w, level, dangers, isFinal) {
    const el = $('#briefing .panel');
    el.innerHTML = `
      <div class="num">WORLD ${level + 1} / 10 · ARRIVAL BRIEFING</div>
      <div class="h1" style="margin-top:6px">${esc(w.name.toUpperCase())}</div>
      <div class="wtype">${esc(w.type)}</div>
      <p>${esc(w.overview)} ${esc(w.culture)}</p>
      <div class="sec"><b>WATCH OUT FOR</b>${esc(dangers)}</div>
      <div class="sec art"><b>REQUIRED ARTIFACT</b>${esc(w.artifact.name)} — ${esc(w.artifact.desc)}</div>
      <div class="reg">“${esc(w.registry.arrival)}”</div>
      ${isFinal ? `<div class="final-note">⚠ ${esc(isFinal)}</div>` : ''}
      <div class="go"><button class="btn primary" data-act="begin">Begin Exploration</button></div>`;
  },

  // ---------- HUD
  hud(d) {
    const s = this.screens.hud;
    $('.lv', s).textContent = String(d.level + 1).padStart(2, '0');
    $('.wn', s).textContent = d.worldName;
    $('.wt', s).textContent = 'WORLD ' + (d.level + 1) + ' OF 10';
    $('.lives', s).innerHTML = [0, 1, 2].map((i) => `<div class="life ${i < d.lives ? '' : 'off'}"></div>`).join('');
    const cv = $('.cv', s);
    if (cv.textContent !== String(d.credits)) {
      cv.textContent = d.credits;
      const c = $('.credits', s); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
    }
    $('.slot.art', s).classList.toggle('got', !!d.artifact);
    $('.slot.shield', s).classList.toggle('got', !!d.shield);
  },
  hint(text) {
    const el = $('#hud .hint');
    el.textContent = text || '';
    el.style.opacity = text ? 1 : 0;
  },
  pointer(p) {
    const el = $('#pointer');
    if (!p) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    $('.ar', el).style.transform = `rotate(${p.angle}rad)`;
    $('.ar', el).style.borderBottomColor = p.color;
    $('.lbl', el).textContent = p.label;
    $('.lbl', el).style.color = p.color;
  },
  toast(text, kind = '', sub = '', life = 2.4) {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.style.setProperty('--life', life + 's');
    t.innerHTML = esc(text) + (sub ? `<span class="r">${esc(sub)}</span>` : '');
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), (life + 0.5) * 1000);
  },
  pop(x, y, text, mega) {
    const p = document.createElement('div');
    p.className = 'pop' + (mega ? ' mega' : '');
    p.style.left = x + 'px'; p.style.top = y + 'px';
    p.textContent = text;
    $('#pops').appendChild(p);
    setTimeout(() => p.remove(), 850);
  },

  artifactCard(w) {
    const s = this.screens.artifact;
    $('.an', s).textContent = w.artifact.name;
    $('.desc', s).textContent = w.artifact.desc;
    $('.lore', s).textContent = w.artifact.lore;
    $('.reg', s).textContent = '“' + w.registry.artifact + '”';
  },

  shop(d) {
    const s = this.screens.shop;
    $('.bv', s).textContent = d.credits;
    const life = $('[data-act="buylife"]', s), shield = $('[data-act="buyshield"]', s);
    life.disabled = d.lives >= 3 || d.credits < 25;
    shield.disabled = d.shield || d.credits < 15;
    life.innerHTML = d.lives >= 3 ? 'Lives full' : 'Buy · <span class="price">25 P13</span>';
    shield.innerHTML = d.shield ? 'Equipped' : 'Buy · <span class="price">15 P13</span>';
    $('.dest', s).innerHTML = d.nextLabel;
    if (this.focused && this.focused.disabled) this.focus($('[data-act="continue"]', s));
  },

  endScreen(id, st, worlds) {
    const s = this.screens[id];
    $('.stats', s).innerHTML = [
      ['Worlds completed', st.completed + ' / 10'], ['Artifacts', st.artifacts.length], ['Credits collected', st.creditsTotal], [id === 'victory' ? 'Lives remaining' : 'Lives lost', id === 'victory' ? st.lives : st.deaths],
    ].map(([k, v]) => `<div class="stat panel"><div class="v">${v}</div><div class="k">${k}</div></div>`).join('');
    $('.arts', s).innerHTML = worlds.map((w, i) => {
      const got = st.artifacts.includes(i);
      return `<div class="${got ? '' : 'miss'}"><i>${String(i + 1).padStart(2, '0')}</i><span>${got ? '✦ ' + esc(w.artifact.name) : '??? — ' + (i < st.completed + 1 ? esc(w.name) : 'uncharted world')}</span></div>`;
    }).join('');
  },
};
