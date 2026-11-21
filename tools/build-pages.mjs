// Đóng gói Dead Night thành trang tĩnh trong docs/ để chạy trên GitHub Pages.
// Chạy từ thư mục gốc repo:  npx -y esbuild@0.23.1 --version && node tools/build-pages.mjs
// (cần gói esbuild: npm i -D esbuild, hoặc chạy qua npx như trên để tải sẵn)
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let esbuild;
try { esbuild = require('esbuild'); } catch (e) { console.error('Thiếu esbuild: chạy  npm i -D esbuild  rồi chạy lại.'); process.exit(1); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const st = path.join(root, 'src/main/resources/static');
const out = path.join(root, 'docs');
fs.mkdirSync(out, { recursive: true });
await esbuild.build({
  entryPoints: [path.join(st, 'game/main.js')], bundle: true, minify: true, format: 'esm',
  outfile: path.join(out, 'game.bundle.js'),
  // "three" và "three/addons/..." trỏ về bản three.js đi kèm trong repo (giống importmap của game.html)
  plugins: [{ name: 'three-vendor', setup(b) {
    b.onResolve({ filter: /^three(\/addons\/.*)?$/ }, (a) => ({ path: a.path === 'three' ? path.join(st, 'js/vendor/three/three.module.js') : path.join(st, 'js/vendor/three', a.path.slice(6)) }));
  } }],
  logLevel: 'warning', legalComments: 'eof',
});
let html = fs.readFileSync(path.join(st, 'game.html'), 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/i, '')
  .replace('<script type="module" src="./game/main.js"></script>', '<script type="module" src="game.bundle.js"></script>')
  .replace('<title>Dead Night</title>', '<title>Dead Night</title>\n<meta name="description" content="Dead Night · game zombie pixel HD-2D chơi online cùng bạn bè ngay trên trình duyệt.">');
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log('docs/index.html', html.length, 'docs/game.bundle.js', fs.statSync(path.join(out, 'game.bundle.js')).size);
