import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { AppError } from './store.mjs';

export function createImageStore(directory) {
  const indexFile = path.join(directory, 'index.json');
  let index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : {};
  const valid = url => url === '' || /^\/media\/[a-f0-9]{64}\.png$/.test(url);
  return {
    get: key => index[key] || '',
    validate(url) {
      if (typeof url !== 'string' || !valid(url) || (url && !fs.existsSync(path.join(directory, path.basename(url))))) throw new AppError(400, 'IMAGE', 'รูปภาพไม่ถูกต้อง กรุณาเลือกรูปใหม่');
    },
    set(key, url) {
      const next = { ...index, [key]: url };
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(indexFile + '.tmp', JSON.stringify(next));
      if (fs.existsSync(indexFile)) fs.copyFileSync(indexFile, indexFile + '.bak');
      fs.renameSync(indexFile + '.tmp', indexFile);
      index = next;
    },
    upload(value) {
      if (typeof value !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new AppError(400, 'IMAGE', 'รูปภาพไม่ถูกต้อง');
      const bytes = Buffer.from(value.split(',')[1], 'base64');
      if (bytes.length > 5 * 1024 * 1024) throw new AppError(413, 'IMAGE', 'รูปภาพต้องไม่เกิน 5 MB');
      if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.toString('ascii', 12, 16) !== 'IHDR' || !bytes.readUInt32BE(16) || !bytes.readUInt32BE(20) || bytes.readUInt32BE(16) > 4096 || bytes.readUInt32BE(20) > 4096) throw new AppError(400, 'IMAGE', 'รูปภาพไม่ถูกต้อง');
      const name = createHash('sha256').update(bytes).digest('hex') + '.png';
      fs.mkdirSync(directory, { recursive: true });
      if (!fs.existsSync(path.join(directory, name))) fs.writeFileSync(path.join(directory, name), bytes, { flag: 'wx' });
      return { url: '/media/' + name };
    },
    serve(url, response) {
      if (!valid(url) || !url) return false;
      const file = path.join(directory, path.basename(url));
      if (!fs.existsSync(file)) return false;
      response.writeHead(200, { 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=31536000, immutable' });
      fs.createReadStream(file).pipe(response);
      return true;
    },
  };
}
