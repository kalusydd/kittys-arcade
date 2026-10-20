// Bundles the game (including three.js) into a single self-contained HTML file.
import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
const NM = process.env.P13_NODE_MODULES || './node_modules';
const require = createRequire(import.meta.url);
const esbuild = require(NM + '/esbuild');
const res = await esbuild.build({
  entryPoints: ['src/main.js'], bundle: true, format: 'iife', minify: true, write: false,
  nodePaths: [NM], target: 'es2020', legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync('index.template.html', 'utf8').split('/*__BUNDLE__*/').join(js);
const out = process.argv[2] || '../../public/games/planet-13/index.html';
writeFileSync(out, html);
console.log('wrote', out, (html.length / 1024).toFixed(0) + ' KB');
