const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const isLowStock = value => value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) <= 10;
const drawings = {
  office: '<path d="M16 7h24l9 10v39H16z" fill="#fff"/><path d="M40 7v11h9M23 28h19M23 36h19M23 44h13"/>',
  medical: '<rect x="9" y="19" width="46" height="35" rx="7" fill="#fff"/><path d="M23 19v-7h18v7"/><path d="M29 28h6v7h7v6h-7v7h-6v-7h-7v-6h7z" fill="#b62c3c" stroke="none"/>',
  ink: '<rect x="13" y="17" width="38" height="36" rx="5" fill="#fff"/><path d="M22 17V9h20v8M21 46h22"/><path d="M32 24s-7 8-7 12a7 7 0 0 0 14 0c0-4-7-12-7-12z" fill="#12614e"/>',
  computer: '<rect x="8" y="10" width="48" height="33" rx="4" fill="#fff"/><path d="M27 43v10M37 43v10M19 54h26M14 36h36"/>',
  household: '<path d="M26 7h12v10l7 8v30H19V25l7-8z" fill="#fff"/><path d="M26 13h12M19 31h26M19 47h26"/><path d="M31 35h3v8h-3z" fill="#12614e"/>',
  general: '<path d="m9 20 23-11 23 11v29L32 59 9 49z" fill="#fff"/><path d="m9 20 23 11 23-11M32 31v28M21 15l23 11"/>',
};
function placeholder(category = '') {
  const key = /ink|หมึก/i.test(category) ? 'ink' : /medical|med|การแพทย์/i.test(category) ? 'medical' : /computer|com|คอม/i.test(category) ? 'computer' : /house|hsk|งานบ้าน/i.test(category) ? 'household' : /office|off|สำนักงาน/i.test(category) ? 'office' : 'general';
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="#12614e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${drawings[key]}</svg>`);
}
export function imageMarkup(url = '', category = '', name = '') {
  const driveThumbnail = /^https:\/\/drive\.google\.com\/thumbnail\?id=[A-Za-z0-9_-]+&sz=w\d{2,4}$/.test(url);
  const safe = /^\/media\/[a-f0-9]{64}\.png$/.test(url) || driveThumbnail ? url : placeholder(category);
  return `<img class="material-thumbnail" src="${escape(safe)}" alt="${escape(name ? `รูป ${name}` : 'รูปวัสดุ')}" width="48" height="48" loading="lazy" decoding="async">`;
}
export function imageField(url = '', category = '') {
  return `<div class="field full material-image-field" data-image-field data-image-url="${escape(url)}"><label>รูปภาพวัสดุ</label><div class="material-image-editor"><div class="image-paste-target" data-image-preview tabindex="0" role="group" aria-label="วางรูปภาพด้วย Ctrl + V">${imageMarkup(url, category)}<small>Ctrl + V</small></div><div class="material-image-controls"><input type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" aria-label="เลือกรูปภาพวัสดุ"><small class="image-upload-hint">PNG, JPG, WebP ไม่เกิน 20 MB</small><div class="material-image-options"><label class="image-background-option"><input type="checkbox" data-remove-background checked> ตัดพื้นหลังอัตโนมัติ (No BG)</label><button type="button" class="secondary-button" data-image-reset>ใช้รูปเริ่มต้น</button></div><small class="image-background-hint">รองรับพื้นหลังสีขาว สีอ่อน สีเข้ม และสีพื้นทั่วไป</small><span class="image-processing-status" role="status"></span><span class="image-upload-error" role="alert"></span></div></div></div>`;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 255;
}

function colorDistance(a, b) {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

function edgeBackgroundProfile(pixels, width, height) {
  if (!pixels?.length || width < 1 || height < 1) return null;
  const size = Math.max(1, Math.min(8, Math.round(Math.min(width, height) / 24)));
  const areas = [[0, 0], [Math.max(0, width - size), 0], [0, Math.max(0, height - size)], [Math.max(0, width - size), Math.max(0, height - size)]];
  const corners = [];
  for (const [left, top] of areas) {
    const samples = [];
    for (let y = top; y < Math.min(height, top + size); y++) {
      for (let x = left; x < Math.min(width, left + size); x++) {
        const offset = (y * width + x) * 4;
        if (pixels[offset + 3] >= 220) samples.push([pixels[offset], pixels[offset + 1], pixels[offset + 2]]);
      }
    }
    if (samples.length) corners.push([0, 1, 2].map(channel => median(samples.map(sample => sample[channel]))));
  }
  if (!corners.length) return null;
  const ranked = corners.map(candidate => {
    const distances = corners.map(color => colorDistance(candidate, color)).sort((a, b) => a - b);
    return { candidate, score: distances.filter(distance => distance <= 48).length, spread: distances.slice(0, Math.min(3, distances.length)).reduce((sum, distance) => sum + distance, 0) };
  }).sort((a, b) => b.score - a.score || a.spread - b.spread);
  const cluster = corners.filter(color => colorDistance(color, ranked[0].candidate) <= 48);
  const color = [0, 1, 2].map(channel => median(cluster.map(sample => sample[channel])));
  const variation = Math.max(...cluster.map(sample => colorDistance(sample, color)), 0);
  return { color, tolerance: Math.max(28, Math.min(68, variation + 24)) };
}

// Detect the dominant edge colour without assuming that it is white. Only pixels
// connected to the outer edge are cleared, so enclosed product details remain.
export function edgeBackgroundColor(pixels, width, height) {
  return edgeBackgroundProfile(pixels, width, height)?.color || null;
}

export function clearConnectedBackground(pixels, width, height) {
  const profile = edgeBackgroundProfile(pixels, width, height);
  if (!profile) return 0;
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let start = 0, end = 0;
  const visit = index => {
    if (seen[index]) return;
    seen[index] = 1;
    const p = index * 4;
    const color = [pixels[p], pixels[p + 1], pixels[p + 2]];
    const alpha = pixels[p + 3];
    if (alpha < 10 || colorDistance(color, profile.color) <= profile.tolerance) queue[end++] = index;
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  while (start < end) {
    const index = queue[start++];
    pixels[index * 4 + 3] = 0;
    if (index % width) visit(index - 1);
    if (index % width < width - 1) visit(index + 1);
    if (index >= width) visit(index - width);
    if (index < width * (height - 1)) visit(index + width);
  }
  return end;
}

// Kept as a compatibility export for existing callers and tests.
export const clearConnectedLightBackground = clearConnectedBackground;

function removeDetectedBackground(context, width, height) {
  const image = context.getImageData(0, 0, width, height);
  let opaque = 0;
  for (let index = 3; index < image.data.length; index += 4) if (image.data[index] >= 10) opaque++;
  const removed = clearConnectedBackground(image.data, width, height);
  // If the inferred background covers almost the entire image, the object most
  // likely touches every corner. Keep the original instead of returning a blank image.
  if (opaque > 0 && removed / opaque > 0.92) return 0;
  context.putImageData(image, 0, 0);
  return removed;
}

export function bindImageField(root) {
  if (root.imagePasteHandler) {
    root.removeEventListener('paste', root.imagePasteHandler);
    root.imagePasteHandler = null;
  }
  const field = root.querySelector('[data-image-field]');
  if (!field) return;
  const input = field.querySelector('input[type="file"]');
  const error = field.querySelector('.image-upload-error');
  const status = field.querySelector('.image-processing-status');
  let selectedFile = null;
  let revision = 0;
  const process = async () => {
    const current = ++revision;
    const file = selectedFile;
    field.imageData = undefined;
    field.imagePending = Boolean(file);
    error.textContent = '';
    status.textContent = '';
    input.setCustomValidity('');
    if (!file) { field.imagePending = false; return; }
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !/\.(png|jpe?g|webp)$/i.test(file.name)) throw new Error('รองรับ PNG, JPG และ WebP เท่านั้น');
      if (file.size > 20 * 1024 * 1024) throw new Error('รูปภาพต้องไม่เกิน 20 MB');
      const bitmap = await createImageBitmap(file);
      if (current !== revision) { bitmap.close(); return; }
      const ratio = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const context = canvas.getContext('2d');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const removeBackground = field.querySelector('[data-remove-background]').checked;
      const removed = removeBackground ? removeDetectedBackground(context, canvas.width, canvas.height) : 0;
      const result = canvas.toDataURL('image/png');
      if (result.length > 7_000_000) throw new Error('รูปภาพนี้มีรายละเอียดมากเกินไป กรุณาลดขนาดรูป');
      field.imageData = result;
      field.querySelector('[data-image-preview] img').src = result;
      status.textContent = removeBackground
        ? removed > 0 ? 'ตัดพื้นหลังอัตโนมัติแล้ว' : 'ไม่พบพื้นหลังที่แยกจากวัตถุได้ชัดเจน'
        : 'ใช้พื้นหลังเดิม';
    } catch (cause) {
      if (current !== revision) return;
      error.textContent = cause.message || 'อ่านรูปภาพไม่ได้ กรุณาเลือกไฟล์ใหม่';
      input.setCustomValidity(error.textContent);
    } finally { if (current === revision) field.imagePending = false; }
  };
  input.addEventListener('change', () => {
    if (!input.files[0]) return;
    selectedFile = input.files[0];
    process();
  });
  // Read only image data supplied by the user's paste action; ordinary text pasting is untouched.
  root.imagePasteHandler = event => {
    if (root.inert || !field.isConnected) return;
    const file = pastedImage(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file.type] || 'unsupported';
    selectedFile = new File([file], `clipboard.${extension}`, { type: file.type });
    input.value = '';
    process();
  };
  root.addEventListener('paste', root.imagePasteHandler);
  field.querySelector('[data-remove-background]').addEventListener('change', process);
  field.querySelector('[data-image-reset]').addEventListener('click', () => {
    revision++;
    selectedFile = null;
    field.imagePending = false;
    field.imageData = '';
    input.value = '';
    input.setCustomValidity('');
    error.textContent = '';
    status.textContent = '';
    field.querySelector('[data-image-preview] img').src = placeholder();
  });
}

export async function imagePayload(root) {
  const field = root.querySelector('[data-image-field]');
  if (!field) return {};
  if (!field.querySelector('input[type="file"]').checkValidity()) throw new Error('กรุณาเลือกรูปภาพที่ถูกต้อง');
  if (field.imageData === undefined && !field.imagePending) return {};
  if (field.imagePending) throw new Error('กำลังเตรียมรูปภาพ กรุณารอสักครู่');
  if (field.imageData === '') return { imageUrl: '' };
  const response = await fetch('/api/images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: field.imageData }) });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.message || 'อัปโหลดรูปไม่สำเร็จ');
  return { imageUrl: result.data.url };
}

export function pastedImage(clipboard) {
  const item = [...(clipboard?.items || [])].find(item => item.kind === 'file' && item.type.startsWith('image/'));
  return item?.getAsFile() || [...(clipboard?.files || [])].find(file => file.type.startsWith('image/')) || null;
}
