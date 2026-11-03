const KEY = 'expense-tracker-v1';
const PALETTE = ['#f59e0b','#3b82f6','#10b981','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16','#06b6d4','#a855f7'];
const DEFAULT_CATS = [
  ['🛒','Продукти'], ['🍔','Кафе'], ['🚌','Транспорт'], ['🏠','Житло'],
  ['💡','Комуналка'], ['📱','Звʼязок'], ['💊','Здоровʼя'], ['👕','Одяг'],
  ['🎉','Розваги'], ['🎁','Подарунки'], ['📚','Навчання'], ['📦','Інше'],
];
const CURRENCIES = ['₴', '$', '€', 'zł', '£'];
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

let state = load();
let viewMonth = monthKey(new Date());
let editingId = null;
let selectedCat = null;

function load() {
  try {
    const s = sanitize(JSON.parse(localStorage.getItem(KEY)));
    if (s) return s;
  } catch {}
  return {
    expenses: [],
    cats: DEFAULT_CATS.map(([emoji, name], i) => ({ id: 'c' + i, emoji, name, color: PALETTE[i % PALETTE.length] })),
    settings: { currency: '₴', budget: 0 },
  };
}
// Rebuilds data from scratch with only known fields of the right shape,
// so a tampered backup file can't smuggle markup or code into the page.
function sanitize(d) {
  if (!d || !Array.isArray(d.expenses) || !Array.isArray(d.cats)) return null;
  const str = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '').slice(0, max);
  const id = v => str(v, 40).replace(/[^\w-]/g, '');
  const cats = d.cats.filter(c => c && id(c.id)).map((c, i) => ({
    id: id(c.id),
    emoji: str(c.emoji, 8) || '🏷️',
    name: str(c.name, 40) || 'Категорія',
    color: COLOR_RE.test(c.color) ? c.color : PALETTE[i % PALETTE.length],
  }));
  if (!cats.length) return null;
  const expenses = d.expenses
    .filter(e => e && Number(e.amount) > 0 && isFinite(e.amount) && DATE_RE.test(e.date))
    .map((e, i) => ({
      id: id(e.id) || 'r' + i,
      ts: Number(e.ts) || 0,
      amount: Math.round(Number(e.amount) * 100) / 100,
      cat: id(e.cat),
      note: str(e.note, 200),
      date: e.date,
    }));
  const s = d.settings || {};
  return {
    expenses, cats,
    settings: { currency: CURRENCIES.includes(s.currency) ? s.currency : '₴', budget: Math.max(0, Number(s.budget) || 0) },
    lastCat: id(d.lastCat),
  };
}
function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

const $ = id => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function pad(n) { return String(n).padStart(2, '0'); }
function monthKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
function today() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function money(n) {
  const s = n.toLocaleString('uk-UA', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return s + ' ' + state.settings.currency;
}
function catById(id) { return state.cats.find(c => c.id === id) || { emoji: '❔', name: 'Без категорії', color: '#9ca3af' }; }
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1800); }

function monthExpenses() { return state.expenses.filter(e => e.date.startsWith(viewMonth)); }

function shiftMonth(delta) {
  const [y, m] = viewMonth.split('-').map(Number);
  viewMonth = monthKey(new Date(y, m - 1 + delta, 1));
  render();
}

// ---------- Rendering ----------
function render() {
  const [y, m] = viewMonth.split('-').map(Number);
  $('monthTitle').textContent = new Date(y, m - 1, 1).toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' }).replace(/\s*р\.$/, '');
  renderHome();
  renderStats();
}

function renderHome() {
  const list = monthExpenses();
  const total = list.reduce((s, e) => s + e.amount, 0);
  const [y, m] = viewMonth.split('-').map(Number);
  const monthName = new Date(y, m - 1, 1).toLocaleDateString('uk-UA', { month: 'long' });
  $('heroLabel').textContent = 'Витрачено за ' + monthName;
  $('total').textContent = money(total);

  const daysInMonth = new Date(y, m, 0).getDate();
  const isCurrent = viewMonth === monthKey(new Date());
  const daysPassed = isCurrent ? new Date().getDate() : daysInMonth;
  $('sCount').textContent = list.length;
  $('sCountLbl').textContent = plural(list.length, 'запис', 'записи', 'записів');
  $('sDay').textContent = money(Math.round(total / daysPassed));

  const budget = Number(state.settings.budget) || 0;
  if (budget) {
    const left = budget - total;
    $('sLeft').textContent = money(Math.round(Math.abs(left)));
    $('sLeftLbl').textContent = left >= 0 ? 'залишок' : 'перевищено';
    $('budgetBar').hidden = false;
    $('budgetBar').classList.toggle('over', left < 0);
    $('budgetBar').firstElementChild.style.width = Math.min(100, total / budget * 100) + '%';
  } else {
    $('sLeft').textContent = '—';
    $('sLeftLbl').textContent = 'бюджет';
    $('budgetBar').hidden = true;
  }

  if (!list.length) {
    $('days').innerHTML = emptyState('i-coins', 'Поки що порожньо', 'Натисніть «+» внизу, щоб додати першу витрату');
    return;
  }
  const byDay = {};
  list.sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts).forEach(e => (byDay[e.date] ||= []).push(e));
  $('days').innerHTML = Object.entries(byDay).map(([date, items]) => {
    const sum = items.reduce((s, e) => s + e.amount, 0);
    return `<div class="day">
      <div class="day-head"><span>${esc(dayLabel(date))}</span><span>${esc(money(sum))}</span></div>
      <div class="list">${items.map(e => {
        const c = catById(e.cat);
        return `<button class="item" data-id="${esc(e.id)}">
          <div class="emoji" style="background:${c.color}22">${esc(c.emoji)}</div>
          <div class="meta"><div class="name">${esc(c.name)}</div>${e.note ? `<div class="note">${esc(e.note)}</div>` : ''}</div>
          <div class="amt">−${esc(money(e.amount))}</div>
        </button>`;
      }).join('')}</div>
    </div>`;
  }).join('');
}

function renderStats() {
  const list = monthExpenses();
  const total = list.reduce((s, e) => s + e.amount, 0);
  if (!total) {
    $('donut').innerHTML = '';
    $('statList').innerHTML = emptyState('i-pie', 'Немає даних', 'Тут зʼявиться розподіл витрат по категоріях');
    return;
  }
  const sums = {};
  list.forEach(e => sums[e.cat] = (sums[e.cat] || 0) + e.amount);
  const rows = Object.entries(sums).sort((a, b) => b[1] - a[1]);

  // Donut chart
  const R = 78, C = 2 * Math.PI * R;
  let offset = 0;
  const arcs = rows.map(([id, v]) => {
    const len = v / total * C;
    const seg = `<circle r="${R}" cx="100" cy="100" fill="none" stroke="${catById(id).color}" stroke-width="20" stroke-linecap="butt"
      stroke-dasharray="${Math.max(len - (rows.length > 1 ? 3 : 0), 0.5)} ${C}" stroke-dashoffset="${-offset}" transform="rotate(-90 100 100)"/>`;
    offset += len;
    return seg;
  }).join('');
  $('donut').innerHTML = `<svg width="200" height="200" viewBox="0 0 200 200">${arcs}
    <text x="100" y="94" text-anchor="middle" font-size="13" fill="var(--muted)">Разом</text>
    <text x="100" y="118" text-anchor="middle" font-size="20" font-weight="750" fill="var(--text)">${esc(money(Math.round(total)))}</text></svg>`;

  $('statList').innerHTML = rows.map(([id, v]) => {
    const c = catById(id), p = v / total * 100;
    return `<div class="stat-row">
      <div class="emoji" style="background:${c.color}22">${esc(c.emoji)}</div>
      <div class="meta">
        <div class="top"><span class="name">${esc(c.name)}<span class="pct">${p.toFixed(0)}%</span></span><b>${esc(money(v))}</b></div>
        <div class="bar"><i style="width:${p}%;background:${c.color}"></i></div>
      </div>
    </div>`;
  }).join('');
}

function renderSettings() {
  $('budget').value = state.settings.budget || '';
  $('currency').value = state.settings.currency;
  $('catEditList').innerHTML = state.cats.map(c => `<div class="cat-edit">
    <div class="emoji" style="background:${c.color}22">${esc(c.emoji)}</div>
    <div class="nm">${esc(c.name)}</div>
    <button data-del-cat="${esc(c.id)}" aria-label="Видалити категорію"><svg class="i"><use href="#i-trash"/></svg></button>
  </div>`).join('');
  renderLockToggle();
}

function emptyState(icon, title, text) {
  return `<div class="empty"><div class="ico"><svg class="i"><use href="#${icon}"/></svg></div><b>${esc(title)}</b>${esc(text)}</div>`;
}

function dayLabel(date) {
  const d = new Date(date + 'T00:00:00');
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t - d) / 86400000);
  if (diff === 0) return 'Сьогодні';
  if (diff === 1) return 'Вчора';
  return d.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
}
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// ---------- Add / edit sheet ----------
function openSheet(exp) {
  editingId = exp ? exp.id : null;
  $('sheetTitle').textContent = exp ? 'Редагувати' : 'Нова витрата';
  $('fAmount').value = exp ? String(exp.amount).replace('.', ',') : '';
  fitAmount();
  $('fNote').value = exp ? exp.note : '';
  const defaultDate = viewMonth === monthKey(new Date()) ? today() : viewMonth + '-01';
  $('fDate').value = exp ? exp.date : defaultDate;
  $('fCur').textContent = state.settings.currency;
  selectedCat = exp ? exp.cat : (state.lastCat && state.cats.some(c => c.id === state.lastCat) ? state.lastCat : state.cats[0]?.id);
  $('del').hidden = !exp;
  renderCatPicker();
  $('backdrop').classList.add('open');
  $('sheet').classList.add('open');
  if (!exp) setTimeout(() => $('fAmount').focus(), 260);
}
// Keep the currency sign right next to the number
function fitAmount() { $('fAmount').style.width = (Math.max(1, $('fAmount').value.length) + 0.5) + 'ch'; }
function closeSheet() {
  $('backdrop').classList.remove('open');
  $('sheet').classList.remove('open');
  document.activeElement?.blur();
}
function renderCatPicker() {
  $('fCats').innerHTML = state.cats.map(c => `<button class="cat ${c.id === selectedCat ? 'on' : ''}" data-cat="${esc(c.id)}">
    <span class="e">${esc(c.emoji)}</span><span class="t">${esc(c.name)}</span></button>`).join('');
}

function submit() {
  const amount = Math.round(parseFloat($('fAmount').value.replace(/\s/g, '').replace(',', '.')) * 100) / 100;
  if (!(amount > 0)) { toast('Введіть суму'); $('fAmount').focus(); return; }
  if (!selectedCat) { toast('Оберіть категорію'); return; }
  const data = { amount, cat: selectedCat, note: $('fNote').value.trim(), date: $('fDate').value || today() };
  if (editingId) {
    Object.assign(state.expenses.find(e => e.id === editingId), data);
  } else {
    state.expenses.push({ id: uid(), ts: Date.now(), ...data });
  }
  state.lastCat = selectedCat;
  save();
  viewMonth = data.date.slice(0, 7);
  closeSheet();
  render();
  toast(editingId ? 'Збережено' : 'Додано ✓');
}

// ---------- Export / import ----------
function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportCsv() {
  const q = s => '"' + String(s).replace(/"/g, '""') + '"';
  const lines = [['Дата', 'Категорія', 'Сума', 'Коментар'].join(';')];
  [...state.expenses].sort((a, b) => a.date.localeCompare(b.date)).forEach(e =>
    lines.push([e.date, q(catById(e.cat).name), String(e.amount).replace('.', ','), q(e.note)].join(';')));
  download(`vytraty-${today()}.csv`, '﻿' + lines.join('\n'), 'text/csv');
}

// ---------- Events ----------
$('prev').onclick = () => shiftMonth(-1);
$('next').onclick = () => shiftMonth(1);
$('addBtn').onclick = () => openSheet();
$('closeSheet').onclick = closeSheet;
$('backdrop').onclick = closeSheet;
$('save').onclick = submit;
$('fAmount').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
$('fAmount').addEventListener('input', fitAmount);
$('fNote').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
$('fCats').onclick = e => {
  const b = e.target.closest('[data-cat]');
  if (b) { selectedCat = b.dataset.cat; renderCatPicker(); }
};
$('days').onclick = e => {
  const b = e.target.closest('[data-id]');
  if (b) openSheet(state.expenses.find(x => x.id === b.dataset.id));
};
$('del').onclick = () => {
  if (!confirm('Видалити цю витрату?')) return;
  state.expenses = state.expenses.filter(e => e.id !== editingId);
  save(); closeSheet(); render(); toast('Видалено');
};

// ---------- Navigation ----------
let currentView = 'home', lastTab = 'home';
function showView(view) {
  currentView = view;
  if (view !== 'settings') lastTab = view;
  ['home', 'stats', 'settings'].forEach(v => $('view-' + v).hidden = v !== view);
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x.dataset.view === view));
  const inSettings = view === 'settings';
  $('monthSwitch').hidden = inSettings;
  $('pageTitle').hidden = !inSettings;
  $('settingsBtn').classList.toggle('ghost', inSettings);
  updateLeftBtn();
  if (inSettings) renderSettings();
  window.scrollTo(0, 0);
}
// Left header slot: "back" in settings, "lock now" when lock is on, otherwise an invisible spacer
function updateLeftBtn() {
  const b = $('leftBtn'), inSettings = currentView === 'settings';
  b.classList.toggle('ghost', !inSettings && !lockEnabled());
  b.setAttribute('aria-label', inSettings ? 'Назад' : 'Заблокувати');
  b.firstElementChild.firstElementChild.setAttribute('href', inSettings ? '#i-left' : '#i-lock');
}
document.querySelectorAll('.tab').forEach(t => t.onclick = () => showView(t.dataset.view));
$('settingsBtn').onclick = () => showView('settings');
$('leftBtn').onclick = () => currentView === 'settings' ? showView(lastTab) : lock();

// ---------- Fingerprint lock (WebAuthn platform authenticator) ----------
// A screen lock, not encryption: it keeps people holding your unlocked phone out of the app.
const LOCK_KEY = 'expense-tracker-lock';
const RELOCK_AFTER_MS = 30000;
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
function lockConfig() { try { return JSON.parse(localStorage.getItem(LOCK_KEY)); } catch { return null; } }
function lockEnabled() { return !!lockConfig()?.id; }
async function lockSupported() {
  try { return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
  catch { return false; }
}
async function registerFingerprint() {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: 'Витрати' },
    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'Витрати', displayName: 'Витрати' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    attestation: 'none', timeout: 60000,
  }});
  localStorage.setItem(LOCK_KEY, JSON.stringify({ id: b64(cred.rawId) }));
}
async function verifyFingerprint() {
  await navigator.credentials.get({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    allowCredentials: [{ type: 'public-key', id: unb64(lockConfig().id), transports: ['internal'] }],
    userVerification: 'required', timeout: 60000,
  }});
}

function lock() {
  if (!lockEnabled()) return;
  closeSheet();
  document.body.classList.add('locked');
  $('lock').hidden = false;
}
let unlocking = false;
// `auto` = prompted without a tap; some browsers refuse that, so stay quiet and wait for the button
async function unlock(auto) {
  if (unlocking) return;
  unlocking = true;
  try {
    await verifyFingerprint();
    document.body.classList.remove('locked');
    $('lock').hidden = true;
  } catch {
    if (!auto) toast('Не вдалося розпізнати');
  } finally { unlocking = false; }
}
$('unlockBtn').onclick = () => unlock(false);
$('lockReset').onclick = () => {
  if (!confirm('Без відбитка увійти не можна. Можна лише скинути додаток — це видалить УСІ витрати на цьому телефоні. Продовжити?')) return;
  if (!confirm('Точно? Відновити дані можна буде тільки з резервної копії.')) return;
  localStorage.removeItem(KEY); localStorage.removeItem(LOCK_KEY);
  location.reload();
};

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (lockEnabled() && Date.now() - hiddenAt > RELOCK_AFTER_MS && $('lock').hidden) { lock(); unlock(true); }
});

async function renderLockToggle() {
  const t = $('lockToggle');
  const supported = await lockSupported();
  t.checked = lockEnabled();
  t.disabled = !supported && !t.checked;
  $('lockHint').textContent = supported ? 'Face ID / Touch ID на iPhone' : 'Недоступно на цьому пристрої';
}
$('lockToggle').onchange = async e => {
  const t = e.target;
  t.disabled = true;
  try {
    if (t.checked) {
      await registerFingerprint();
      toast('Вхід по відбитку увімкнено');
    } else {
      await verifyFingerprint(); // only the owner may switch it off
      localStorage.removeItem(LOCK_KEY);
      toast('Вхід по відбитку вимкнено');
    }
  } catch {
    toast('Скасовано');
  }
  updateLeftBtn();
  renderLockToggle();
};

$('budget').onchange = () => { state.settings.budget = Math.max(0, Number($('budget').value) || 0); save(); render(); };
$('currency').onchange = () => { state.settings.currency = $('currency').value; save(); render(); };

$('addCat').onclick = () => {
  const name = $('newCatName').value.trim();
  if (!name) { toast('Введіть назву'); return; }
  state.cats.push({ id: uid(), emoji: $('newCatEmoji').value.trim() || '🏷️', name, color: PALETTE[state.cats.length % PALETTE.length] });
  $('newCatName').value = ''; $('newCatEmoji').value = '';
  save(); renderSettings(); toast('Категорію додано');
};
$('catEditList').onclick = e => {
  const b = e.target.closest('[data-del-cat]');
  if (!b) return;
  const id = b.dataset.delCat;
  const used = state.expenses.filter(x => x.cat === id).length;
  if (state.cats.length <= 1) { toast('Потрібна хоча б одна категорія'); return; }
  if (used && !confirm(`Ця категорія використана в ${used} записах. Вони залишаться, але без категорії. Видалити?`)) return;
  state.cats = state.cats.filter(c => c.id !== id);
  save(); renderSettings(); render();
};

$('exportJson').onclick = () => download(`vytraty-backup-${today()}.json`, JSON.stringify(state, null, 2), 'application/json');
$('exportCsv').onclick = exportCsv;
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = sanitize(JSON.parse(await file.text()));
    if (!data) throw 0;
    if (confirm(`Відновити ${data.expenses.length} записів? Поточні дані буде замінено.`)) {
      state = data; save(); render(); renderSettings(); toast('Дані відновлено');
    }
  } catch { toast('Невірний файл'); }
  finally { e.target.value = ''; }
};
$('wipe').onclick = () => {
  if (!confirm('Точно видалити ВСІ витрати й налаштування?')) return;
  localStorage.removeItem(KEY); state = load(); save(); render(); renderSettings(); toast('Усе очищено');
};

// Ask the browser not to evict our data under storage pressure
navigator.storage?.persist?.();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');

render();
showView('home');
if (lockEnabled()) { lock(); unlock(true); }
