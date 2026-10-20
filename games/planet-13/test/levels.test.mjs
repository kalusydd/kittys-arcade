import { generateLevel, validateLevel } from '../src/levelgen.js';
import { generateExpedition } from '../src/worldgen.js';
let bad = 0, n = 0; const stats = {};
for (let s = 0; s < 400; s++) {
  const worlds = generateExpedition('seed' + s);
  if (worlds.length !== 10 || new Set(worlds.map(w => w.theme)).size !== 10) { console.log('world dup', s); bad++; }
  for (let i = 0; i < 10; i++) {
    const L = generateLevel(i, (s * 7919 + i * 104729) >>> 0);
    const p = validateLevel(L); n++;
    if (p.length) { bad++; if (bad < 15) console.log('seed', s, 'lvl', i, p); }
    const st = stats[i] ||= { len: 0, credits: 0, enemies: 0, solids: 0 };
    st.len += L.length; st.credits += L.totalCredits; st.enemies += L.enemies.length; st.solids += L.solids.length;
  }
}
for (const [i, st] of Object.entries(stats)) console.log('L' + (+i + 1), 'len', (st.len / 400).toFixed(0), 'credits', (st.credits / 400).toFixed(1), 'enemies', (st.enemies / 400).toFixed(1), 'solids', (st.solids / 400).toFixed(0));
console.log(bad ? `FAIL ${bad}/${n}` : `OK ${n} levels valid`);
