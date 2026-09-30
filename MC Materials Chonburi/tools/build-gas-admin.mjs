import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const web = path.join(root, 'web');
const read = file => fs.readFileSync(path.join(web, file), 'utf8');
const dataUri = (file, mime) => `data:${mime};base64,${fs.readFileSync(path.join(web, file)).toString('base64')}`;

const logo = dataUri('assets/medical-center-logo.png', 'image/png');
const fonts = {
  '/assets/fonts/THSarabunPSK%20Regular.ttf': dataUri('assets/fonts/THSarabunPSK Regular.ttf', 'font/ttf'),
  '/assets/fonts/THSarabunPSK%20Bold.ttf': dataUri('assets/fonts/THSarabunPSK Bold.ttf', 'font/ttf'),
  '/assets/fonts/THSarabunPSK%20Italic.ttf': dataUri('assets/fonts/THSarabunPSK Italic.ttf', 'font/ttf'),
  '/assets/fonts/THSarabunPSK%20BoldItalic.ttf': dataUri('assets/fonts/THSarabunPSK BoldItalic.ttf', 'font/ttf'),
};

let index = read('index.html');
index = index
  .replace(/\s*<link rel="icon"[^>]+>/g, '')
  .replace(/\s*<link rel="apple-touch-icon"[^>]+>/g, '')
  .replace(/\s*<link rel="stylesheet" href="\/styles\.css">/g, '')
  .replace(/\s*<link rel="stylesheet" href="\/theme\.css">/g, '')
  .replace('</head>', '  <?!= include(\'AdminStyles\'); ?>\n</head>')
  .replaceAll('/assets/medical-center-logo.png', logo)
  .replace('  <script type="module" src="/app.js"></script>', "  <?!= include('AdminBridge'); ?>\n  <?!= include('AdminFont1'); ?>\n  <?!= include('AdminFont2'); ?>\n  <?!= include('AdminFont3'); ?>\n  <?!= include('AdminFont4'); ?>\n  <?!= include('AdminScripts'); ?>");
fs.writeFileSync(path.join(root, 'AdminIndex.html'), index);

let css = `${read('styles.css')}\n${read('theme.css')}`;
css = css.replaceAll('/assets/medical-center-logo.png', logo);
fs.writeFileSync(path.join(root, 'AdminStyles.html'), `<style>\n${css}\n</style>\n`);

const result = await build({
  entryPoints: [path.join(web, 'app.js')],
  bundle: true,
  write: false,
  format: 'iife',
  target: ['es2020'],
  charset: 'utf8',
  sourcemap: false,
  legalComments: 'none',
});
let javascript = result.outputFiles[0].text;
const fontVariables = {};
Object.keys(fonts).forEach((source, index) => {
  const variable = `__gasFont${index + 1}`;
  fontVariables[variable] = fonts[source];
  javascript = javascript.replaceAll(source, `\${${variable}}`);
});
const fontDeclarations = Object.entries(fontVariables).map(([name, value]) => `const ${name}=${JSON.stringify(value)};`);
const fontParts = [fontDeclarations.slice(0, 1), fontDeclarations.slice(1, 2), fontDeclarations.slice(2, 3), fontDeclarations.slice(3, 4)];
for (const [index, declarations] of fontParts.entries()) {
  fs.writeFileSync(path.join(root, `AdminFont${index + 1}.html`), `<script>\n${declarations.join('\n')}\n</script>\n`);
}
if (javascript.includes('•')) throw new Error('Generated AdminScripts.html contains forbidden U+2022.');
fs.writeFileSync(path.join(root, 'AdminScripts.html'), `<script>\n${javascript}\n</script>\n`);

console.log(JSON.stringify({
  files: ['AdminIndex.html', 'AdminStyles.html', 'AdminFont1.html', 'AdminFont2.html', 'AdminFont3.html', 'AdminFont4.html', 'AdminScripts.html'],
  bytes: {
    index: fs.statSync(path.join(root, 'AdminIndex.html')).size,
    styles: fs.statSync(path.join(root, 'AdminStyles.html')).size,
    scripts: fs.statSync(path.join(root, 'AdminScripts.html')).size,
    fonts: fontParts.map((_, index) => fs.statSync(path.join(root, `AdminFont${index + 1}.html`)).size),
  },
}, null, 2));
