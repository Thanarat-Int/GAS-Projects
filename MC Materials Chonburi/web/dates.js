const dateParts = value => {
  if (!value) return null;
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.split('-').map(Number);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map(key => Number(parts.find(part => part.type === key).value));
};

const thaiMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const englishMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function displayDate(value, lang = 'th') {
  const parts = dateParts(value);
  if (!parts) return '—';
  const [year, month, day] = parts;
  return `${day} ${(lang === 'th' ? thaiMonths : englishMonths)[month - 1]} ${year + (lang === 'th' ? 543 : 0)}`;
}

export function parseDisplayDate(value, lang = 'th') {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  const numeric = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const written = /^(\d{1,2})\s+(.+?)\s+(\d{4})$/u.exec(text);
  if (!numeric && !written) return '';
  const day = Number((numeric || written)[1]);
  const month = numeric ? Number(numeric[2]) : (lang === 'th' ? thaiMonths : englishMonths).findIndex(name => name.toLocaleLowerCase() === written[2].toLocaleLowerCase()) + 1;
  const year = Number((numeric || written)[3]) - (lang === 'th' ? 543 : 0);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 9999 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export const parseThaiDate = value => parseDisplayDate(value, 'th');

export function dateField(name, label, value, extra = '', prefix = 'ink', lang = 'th') {
  // Keep ISO values in the named native input; present a localized, written-out date.
  const max = /max="([0-9-]+)"/.exec(extra)?.[1] || '';
  const id = `${prefix}-${name}`;
  return `<div class="field"><label for="${id}-display">${label}${lang === 'th' ? ' (พ.ศ.)' : ''}</label><div class="date-control"><input id="${id}-display" type="text" data-date-display="${id}" value="${value ? displayDate(value, lang) : ''}" placeholder="${lang === 'th' ? 'วัน เดือน ปี พ.ศ.' : 'Day Month Year'}" autocomplete="off" maxlength="32" ${extra.includes('required') ? 'required' : ''}><button type="button" class="date-picker-button" data-date-picker="${id}" aria-label="${lang === 'th' ? 'เลือก' : 'Choose '}${label}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg></button><input id="${id}" name="${name}" type="date" class="date-native" tabindex="-1" aria-hidden="true" value="${value}" ${max ? `max="${max}"` : ''}></div></div>`;
}

export function bindDateFields(root, lang = 'th') {
  root.querySelectorAll('[data-date-display]').forEach(display => {
    const native = root.querySelector(`#${display.dataset.dateDisplay}`);
    const language = () => display.dataset.dateLanguage || lang;
    display.value = native.value ? displayDate(native.value, language()) : '';
    const sync = () => {
      const currentLang = language();
      const iso = parseDisplayDate(display.value, currentLang);
      native.value = iso;
      display.setCustomValidity(display.value && !iso ? currentLang === 'th' ? 'กรุณาระบุวันที่ เช่น 1 มกราคม 2569' : 'Enter a date such as 1 January 2026' : iso && native.max && iso > native.max ? currentLang === 'th' ? 'วันที่ต้องไม่เกินวันปัจจุบัน' : 'Date must not be in the future' : '');
    };
    display.addEventListener('input', sync);
    display.addEventListener('blur', () => {
      sync();
      if (native.value) display.value = displayDate(native.value, language());
    });
    native.addEventListener('change', () => {
      display.value = native.value ? displayDate(native.value, language()) : '';
      sync();
      display.dispatchEvent(new Event('input', { bubbles: true }));
    });
    root.querySelector(`[data-date-picker="${native.id}"]`).addEventListener('click', () => {
      try { native.showPicker(); } catch { display.focus(); }
    });
    sync();
  });
}
