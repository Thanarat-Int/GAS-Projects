import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const scripts = ['UserConfig.gs', 'UserData.gs', 'UserRequests.gs', 'UserWeb.gs'];
const html = ['UserIndex.html', 'UserLogo.html', 'UserStyles.html', 'UserBridge.html', 'UserAccessScripts.html', 'UserScripts.html'];
for (const file of scripts) {
  const source = read(file);
  assert.doesNotThrow(() => new Function(source), `${file} must parse`);
  assert.equal(source.includes('•'), false);
}
for (const file of html) assert.equal(read(file).includes('•'), false, `${file} must not contain forbidden U+2022`);
for (const file of html) assert.equal(read(file).includes('CHANGE_ME'), false, `${file} must not expose the access code`);
const web = read('UserWeb.gs');
for (const route of ['/api/public/access', '/api/public/state', '/api/public/session/touch', '/api/public/requisitions/create']) assert.match(web, new RegExp(route));
assert.match(read('UserConfig.gs'), /SESSION_SECONDS:\s*3600/);
assert.match(web, /cache\.put\(key, 'valid', USER_CONFIG\.SESSION_SECONDS\)/);
assert.equal(web.includes('/api/requisitions/approve'), false, 'public app must not have admin routes');
const index = read('UserIndex.html');
for (const name of ['UserLogo', 'UserStyles', 'UserBridge', 'UserAccessScripts', 'UserScripts']) assert.match(index, new RegExp(`includeUser_\\('${name}'\\)`));
assert.match(index, /id="gasUserAccess"/);
assert.match(index, /id="gasUserPortal"/);
assert.match(index, /id="gasUserAuthLoading"/);
assert.match(index, /id="gasUserAccess" hidden/);
assert.equal(index.includes('/assets/medical-center-logo.png'), false);
const bridge = read('UserBridge.html');
assert.match(bridge, /idleTimeoutMs = 60 \* 60 \* 1000/);
assert.match(bridge, /material-user-gas-last-activity/);
assert.match(bridge, /\/api\/public\/session\/touch/);
assert.match(bridge, /setPanel\('loading'\)|gasUserAuthLoading/);
for (const file of ['UserBridge.html', 'UserLogo.html', 'UserAccessScripts.html', 'UserScripts.html']) {
  const script = read(file).replace(/^<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
  assert.doesNotThrow(() => new Function(script), `${file} must parse`);
}
console.log(`PASS GAS user package: ${scripts.length + html.length} runtime files, server-gated catalog and requisition routes are ready.`);
