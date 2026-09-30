import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const web = path.join(root, 'web');
const read = name => fs.readFileSync(path.join(web, name), 'utf8');
const save = (name, contents) => fs.writeFileSync(path.join(root, name), contents);
const logo = `data:image/png;base64,${fs.readFileSync(path.join(web, 'assets/medical-center-logo.png')).toString('base64')}`;

const accessBody = read('user-access.html').match(/<body[^>]*>([\s\S]*?)\s*<script type="module"/)[1];
let index = read('user.html')
  .replace(/\s*<link rel="(?:icon|apple-touch-icon)"[^>]+>/g, '')
  .replace(/\s*<link rel="stylesheet" href="\/(?:styles|theme|user)\.css">/g, '')
  .replace('</head>', "  <?!= includeUser_('UserStyles'); ?>\n</head>")
  .replace('<body class="user-portal">', `<body class="user-access-page">\n<div id="gasUserAuthLoading" class="access-layout" role="status" aria-live="polite">\n  <section class="access-card user-auth-card">\n    <img class="access-logo" src="" data-user-logo width="471" height="450" alt="ตราศูนย์แพทยศาสตรศึกษาชั้นคลินิก โรงพยาบาลชลบุรี">\n    <span class="user-auth-spinner" aria-hidden="true"></span>\n    <strong>กำลังตรวจสอบสิทธิ์เข้าใช้งาน</strong>\n  </section>\n</div>\n<div id="gasUserAccess" hidden>\n${accessBody}\n</div>\n<div id="gasUserPortal" hidden>`)
  .replace('  <script type="module" src="/user.js"></script>', "  </div>\n  <?!= includeUser_('UserLogo'); ?>\n  <?!= includeUser_('UserBridge'); ?>\n  <?!= includeUser_('UserAccessScripts'); ?>\n  <?!= includeUser_('UserScripts'); ?>")
  .replaceAll('src="/assets/medical-center-logo.png"', 'src="" data-user-logo')
  .replace('href="/user"', 'href="#"');
if (!index.includes('id="gasUserAuthLoading"') || !index.includes('id="gasUserAccess"') || !index.includes('id="gasUserPortal"')) throw new Error('User page assembly failed.');
save('UserIndex.html', index);
save('UserLogo.html', `<script>\nconst __userLogo=${JSON.stringify(logo)};\ndocument.querySelectorAll('[data-user-logo]').forEach(function (image) { image.src = __userLogo; });\n</script>\n`);

const css = ['styles.css', 'theme.css', 'user-access.css', 'user.css'].map(read).join('\n');
save('UserStyles.html', `<style>\n${css}\n#gasUserAuthLoading[hidden],#gasUserAccess[hidden],#gasUserPortal[hidden]{display:none!important}\n</style>\n`);

for (const [entry, output] of [['user-access.js', 'UserAccessScripts.html'], ['user.js', 'UserScripts.html']]) {
  const result = await build({
    entryPoints: [path.join(web, entry)], bundle: true, write: false,
    format: 'iife', target: ['es2020'], charset: 'utf8', sourcemap: false, legalComments: 'none',
  });
  const script = result.outputFiles[0].text;
  if (script.includes('•')) throw new Error(`${output} contains forbidden U+2022.`);
  save(output, `<script>\n${script}\n</script>\n`);
}

console.log(JSON.stringify(['UserIndex.html', 'UserLogo.html', 'UserStyles.html', 'UserAccessScripts.html', 'UserScripts.html'].map(name => ({
  file: name, bytes: fs.statSync(path.join(root, name)).size,
})), null, 2));
