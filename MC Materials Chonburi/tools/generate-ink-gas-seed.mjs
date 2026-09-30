import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inkData } from '../web/ink-data.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = `/** Generated from web/ink-data.js. Do not edit manually. */\nvar MATERIAL_INK_SEED = Object.freeze(${JSON.stringify(inkData, null, 2)});\n`;
fs.writeFileSync(path.join(root, 'InkSeedData.gs'), output, 'utf8');
console.log(`Generated InkSeedData.gs from ${inkData.sourceName}`);
