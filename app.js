const KEY = 'expense-tracker-v1';
const PALETTE = ['#f59e0b','#3b82f6','#10b981','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16','#06b6d4','#a855f7'];
const DEFAULT_CATS = [
  ['🛒','Продукти'], ['🍔','Кафе'], ['🚌','Транспорт'], ['🏠','Житло'],
  ['💡','Комуналка'], ['📱','Звʼязок'], ['💊','Здоровʼя'], ['👕','Одяг'],
  ['🎉','Розваги'], ['🎁','Подарунки'], ['📚','Навчання'], ['📦','Інше'],
];
// Income sources are fixed (not editable) and live outside state.cats
const INCOME_CATS = [
  { id: 'i0', emoji: '💼', name: 'Зарплата', color: '#16a34a' },
  { id: 'i1', emoji: '💻', name: 'Підробіток', color: '#0d9488' },
  { id: 'i2', emoji: '🎁', name: 'Подарунок', color: '#d946ef' },
  { id: 'i3', emoji: '↩️', name: 'Повернення', color: '#0ea5e9' },
  { id: 'i5', emoji: '🏦', name: 'Кешбек, %', color: '#6366f1' },
  { id: 'i4', emoji: '💰', name: 'Інше', color: '#ca8a04' },
];
const CURRENCIES = ['₴', '$', '€', 'zł', '£'];
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
const MONTH_SHORT = ['січ','лют','бер','кві','тра','чер','лип','сер','вер','жов','лис','гру'];
const MONTH_GEN = ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];

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
    favs: [],
    recurring: [],
  };
}
// Rebuilds data from scratch with only known fields of the right shape,
// so a tampered backup file can't smuggle markup or code into the page.
function sanitize(d) {
  if (!d || !Array.isArray(d.expenses) || !Array.isArray(d.cats)) return null;
  const str = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '').slice(0, max);
  const id = v => str(v, 40).replace(/[^\w-]/g, '');
  const okAmount = v => Number(v) > 0 && isFinite(v);
  const amount = v => Math.round(Number(v) * 100) / 100;
  const list = v => Array.isArray(v) ? v : [];
  const cats = d.cats.filter(c => c && id(c.id)).map((c, i) => ({
    id: id(c.id),
    emoji: str(c.emoji, 8) || '🏷️',
    name: str(c.name, 40) || 'Категорія',
    color: COLOR_RE.test(c.color) ? c.color : PALETTE[i % PALETTE.length],
    budget: Math.max(0, Math.round(Number(c.budget) || 0)),
  }));
  if (!cats.length) return null;
  const expenses = d.expenses
    .filter(e => e && okAmount(e.amount) && DATE_RE.test(e.date))
    .map((e, i) => {
      const x = { id: id(e.id) || 'r' + i, ts: Number(e.ts) || 0, amount: amount(e.amount), cat: id(e.cat), note: str(e.note, 200), date: e.date };
      if (id(e.rec)) x.rec = id(e.rec);
      if (e.photo === true) x.photo = true;
      if (e.inc === true) x.inc = true;
      return x;
    });
  const favs = list(d.favs).filter(f => f && okAmount(f.amount)).slice(0, 30).map((f, i) => ({
    id: id(f.id) || 'f' + i, amount: amount(f.amount), cat: id(f.cat), note: str(f.note, 80),
  }));
  const recurring = list(d.recurring).filter(r => r && okAmount(r.amount)).slice(0, 100).map((r, i) => ({
    id: id(r.id) || 'p' + i, amount: amount(r.amount), cat: id(r.cat), note: str(r.note, 80),
    day: Math.min(31, Math.max(1, parseInt(r.day, 10) || 1)),
    last: MONTH_RE.test(r.last) ? r.last : monthKey(new Date()),
    ...(r.inc === true && { inc: true }),
  }));
  const s = d.settings || {};
  return {
    expenses, cats, favs, recurring,
    settings: { currency: CURRENCIES.includes(s.currency) ? s.currency : '₴', budget: Math.max(0, Number(s.budget) || 0) },
    lastCat: id(d.lastCat),
    lastIncCat: id(d.lastIncCat),
  };
}
function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

const $ = id => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const icon = name => `<svg class="i"><use href="#${name}"/></svg>`;
const sumOf = list => list.reduce((s, e) => s + e.amount, 0);
function pad(n) { return String(n).padStart(2, '0'); }
function monthKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
function shiftKey(key, delta) { const [y, m] = key.split('-').map(Number); return monthKey(new Date(y, m - 1 + delta, 1)); }
function daysIn(key) { const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); }
function today() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function money(n) {
  const s = n.toLocaleString('uk-UA', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return s + ' ' + state.settings.currency;
}
function catById(id) {
  return state.cats.find(c => c.id === id) || INCOME_CATS.find(c => c.id === id) || { emoji: '❔', name: 'Без категорії', color: '#9ca3af' };
}
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }

// Toast with an optional action button (used for "undo")
function toast(msg, action) {
  const t = $('toast'), btn = $('toastBtn');
  $('toastMsg').textContent = msg;
  btn.hidden = !action;
  if (action) {
    btn.textContent = action.label;
    btn.onclick = () => { action.fn(); t.classList.remove('show'); };
  }
  t.classList.toggle('actionable', !!action);
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), action ? 5000 : 1800);
}

// state.expenses holds both kinds of entries; incomes are marked with inc: true
function monthEntries(key = viewMonth) { return state.expenses.filter(e => e.date.startsWith(key)); }
function monthExpenses(key = viewMonth) { return monthEntries(key).filter(e => !e.inc); }
function monthIncome(key = viewMonth) { return monthEntries(key).filter(e => e.inc); }
function catSpent(catId, key = viewMonth) { return sumOf(monthExpenses(key).filter(e => e.cat === catId)); }
// Previous month's expenses for a fair comparison: for the current month only up to today's day
function prevPeriod() {
  const upTo = viewMonth === monthKey(new Date()) ? new Date().getDate() : 31;
  return monthExpenses(shiftKey(viewMonth, -1)).filter(e => Number(e.date.slice(8)) <= upTo);
}

function shiftMonth(delta) {
  viewMonth = shiftKey(viewMonth, delta);
  render();
}

// ---------- Photo storage (IndexedDB — photos are too big for localStorage) ----------
let dbPromise;
function photoDb() {
  return dbPromise ||= new Promise((res, rej) => {
    const r = indexedDB.open('expense-tracker', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function photoStore(mode, fn) {
  const db = await photoDb();
  return new Promise((res, rej) => {
    const tx = db.transaction('photos', mode);
    const req = fn(tx.objectStore('photos'));
    tx.oncomplete = () => res(req.result);
    tx.onerror = () => rej(tx.error);
  });
}
const photoGet = id => photoStore('readonly', s => s.get(id));
const photoPut = (id, blob) => photoStore('readwrite', s => s.put(blob, id));
const photoDel = id => photoStore('readwrite', s => s.delete(id));
const photoClear = () => photoStore('readwrite', s => s.clear());
const photoKeys = () => photoStore('readonly', s => s.getAllKeys());

async function cleanupPhotos() {
  try {
    const used = new Set(state.expenses.filter(e => e.photo).map(e => e.id));
    for (const k of await photoKeys()) if (!used.has(k)) await photoDel(k);
  } catch {}
}
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
// Downscale to ~1280px JPEG so a receipt photo takes ~150 KB instead of several MB
async function shrinkImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImg(url);
    const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(), 'image/jpeg', 0.75));
  } finally { URL.revokeObjectURL(url); }
}
const blobToDataUrl = b => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
function dataUrlToBlob(url) {
  const [head, data] = url.split(',');
  return new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))], { type: head.slice(5, head.indexOf(';')) });
}

// ---------- Recurring payments ----------
// Adds any monthly payments that came due since they were last added (catches up missed months).
function applyRecurring() {
  const now = new Date(), cur = monthKey(now);
  let added = 0;
  state.recurring.forEach(r => {
    for (let m = shiftKey(r.last, 1), guard = 0; m <= cur && guard < 36; m = shiftKey(m, 1), guard++) {
      const day = Math.min(r.day, daysIn(m));
      if (m === cur && now.getDate() < day) break;
      state.expenses.push({ id: uid(), ts: Date.now(), amount: r.amount, cat: r.cat, note: r.note, date: `${m}-${pad(day)}`, rec: r.id, ...(r.inc && { inc: true }) });
      r.last = m;
      added++;
    }
  });
  if (added) {
    save();
    toast(`Додано регулярних платежів: ${added}`);
  }
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
  const total = sumOf(list);
  const [y, m] = viewMonth.split('-').map(Number);
  $('heroLabel').textContent = 'Витрачено за ' + new Date(y, m - 1, 1).toLocaleDateString('uk-UA', { month: 'long' });
  $('total').textContent = money(total);

  const isCurrent = viewMonth === monthKey(new Date());
  const daysPassed = isCurrent ? new Date().getDate() : daysIn(viewMonth);
  $('sDay').textContent = money(Math.round(total / daysPassed));

  // With income this month the side columns show income and balance; otherwise count and budget left
  const income = sumOf(monthIncome());
  const budget = Number(state.settings.budget) || 0;
  const left = budget - total;
  const leftText = left >= 0 ? `Залишок бюджету ${money(Math.round(left))}` : `Бюджет перевищено на ${money(Math.round(-left))}`;
  if (income) {
    const bal = income - total;
    $('s1').textContent = money(Math.round(income));
    $('s1l').textContent = 'дохід';
    $('s3').textContent = (bal >= 0 ? '+' : '−') + money(Math.round(Math.abs(bal)));
    $('s3l').textContent = 'баланс';
  } else {
    $('s1').textContent = list.length;
    $('s1l').textContent = plural(list.length, 'запис', 'записи', 'записів');
    $('s3').textContent = budget ? money(Math.round(Math.abs(left))) : '—';
    $('s3l').textContent = budget ? (left >= 0 ? 'залишок' : 'перевищено') : 'бюджет';
  }
  $('budgetBar').hidden = !budget;
  $('budgetCap').hidden = !(budget && income);
  if (budget) {
    $('budgetBar').classList.toggle('over', left < 0);
    $('budgetBar').firstElementChild.style.width = Math.min(100, total / budget * 100) + '%';
    $('budgetCap').textContent = leftText;
  }

  // Forecast and comparison with the previous month
  const pills = [];
  if (isCurrent && total > 0) pills.push(`Прогноз ~${money(Math.round(forecast() / 10) * 10)}`);
  const prevTotal = sumOf(prevPeriod());
  if (prevTotal && total) {
    const p = Math.round((total - prevTotal) / prevTotal * 100);
    const prevName = MONTH_GEN[Number(shiftKey(viewMonth, -1).slice(5)) - 1];
    pills.push(p === 0 ? `Як до ${prevName}` : `${p > 0 ? '↑' : '↓'} ${Math.abs(p)}% до ${prevName}`);
  }
  $('heroMeta').innerHTML = pills.map(p => `<span class="pill">${esc(p)}</span>`).join('');
  $('heroMeta').hidden = !pills.length;

  renderQuick();
  renderSearchControls();

  if (searchActive()) {
    const found = searchResults();
    const out = sumOf(found.filter(e => !e.inc)), inc = sumOf(found.filter(e => e.inc));
    $('alerts').innerHTML = '';
    $('searchInfo').hidden = false;
    $('searchInfo').innerHTML = found.length
      ? `Знайдено <b>${found.length}</b> ${plural(found.length, 'запис', 'записи', 'записів')}` +
        (out ? ` · витрати <b>${esc(money(out))}</b>` : '') + (inc ? ` · доходи <b>${esc(money(inc))}</b>` : '')
      : '';
    $('days').innerHTML = found.length ? renderDays(found) : emptyState('i-search', 'Нічого не знайдено', 'Спробуйте інший запит або скиньте фільтри');
    return;
  }
  $('searchInfo').hidden = true;
  renderAlerts();

  const entries = monthEntries();
  $('days').innerHTML = entries.length ? renderDays(entries)
    : emptyState('i-coins', 'Поки що порожньо', 'Натисніть «+» внизу, щоб додати першу витрату');
}

function renderDays(entries) {
  const byDay = {};
  [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts).forEach(e => (byDay[e.date] ||= []).push(e));
  const thisYear = String(new Date().getFullYear());
  return Object.entries(byDay).map(([date, items]) => {
    const out = sumOf(items.filter(e => !e.inc)), inc = sumOf(items.filter(e => e.inc));
    const label = dayLabel(date) + (date.startsWith(thisYear) ? '' : ' ' + date.slice(0, 4));
    return `<div class="day">
      <div class="day-head"><span>${esc(label)}</span><span>${out ? esc(money(out)) : ''}${out && inc ? ' · ' : ''}${inc ? `<span class="inc">+${esc(money(inc))}</span>` : ''}</span></div>
      <div class="list">${items.map(e => {
        const c = catById(e.cat);
        const flags = (e.rec ? icon('i-repeat') : '') + (e.photo ? icon('i-camera') : '');
        return `<button class="item" data-id="${esc(e.id)}">
          <div class="emoji" style="background:${c.color}22">${esc(c.emoji)}</div>
          <div class="meta"><div class="name">${esc(c.name)}</div>${flags || e.note ? `<div class="note">${flags}${esc(e.note)}</div>` : ''}</div>
          <div class="amt${e.inc ? ' inc' : ''}">${e.inc ? '+' : '−'}${esc(money(e.amount))}</div>
        </button>`;
      }).join('')}</div>
    </div>`;
  }).join('');
}

// Categories that reached 80%+ of their monthly limit
function renderAlerts() {
  const rows = state.cats.filter(c => c.budget)
    .map(c => ({ c, spent: catSpent(c.id) }))
    .filter(x => x.spent >= x.c.budget * 0.8)
    .sort((a, b) => b.spent / b.c.budget - a.spent / a.c.budget);
  $('alerts').innerHTML = rows.map(({ c, spent }) => {
    const p = Math.round(spent / c.budget * 100), over = spent > c.budget;
    return `<div class="alert${over ? ' over' : ''}">
      <div class="emoji" style="background:${c.color}22">${esc(c.emoji)}</div>
      <div class="meta">
        <div class="top"><span>${esc(c.name)}</span><span>${over ? 'Ліміт перевищено' : p + '% ліміту'}</span></div>
        <div class="sub2">${esc(money(spent))} з ${esc(money(c.budget))}${over ? ' · +' + esc(money(spent - c.budget)) : ' · лишилось ' + esc(money(c.budget - spent))}</div>
        <div class="bar"><i style="width:${Math.min(100, p)}%"></i></div>
      </div>
    </div>`;
  }).join('');
}

// ---------- Search & filters ----------
const filters = { q: '', type: 'all', period: 'all', cat: '', min: '', max: '' };
function filterCount() {
  return (filters.type !== 'all') + (filters.period !== 'all') + !!filters.cat + (filters.min !== '') + (filters.max !== '');
}
function searchActive() { return !!filters.q.trim() || filterCount() > 0; }
function searchResults() {
  const q = filters.q.trim().toLowerCase();
  const cur = monthKey(new Date());
  const from = { month: null, '3m': shiftKey(cur, -2) + '-01', year: shiftKey(cur, -11) + '-01' }[filters.period];
  const min = filters.min === '' ? -Infinity : Number(filters.min), max = filters.max === '' ? Infinity : Number(filters.max);
  return state.expenses.filter(e => {
    if (filters.type === 'out' && e.inc || filters.type === 'in' && !e.inc) return false;
    if (filters.cat && e.cat !== filters.cat) return false;
    if (e.amount < min || e.amount > max) return false;
    if (filters.period === 'month' && !e.date.startsWith(viewMonth)) return false;
    if (from && e.date < from) return false;
    if (q && !`${e.note} ${catById(e.cat).name} ${e.amount}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
function renderSearchControls() {
  $('qClear').hidden = !filters.q;
  const n = filterCount();
  $('filterDot').hidden = !n;
  $('filterDot').textContent = n;
  $('filterBtn').classList.toggle('on', !$('filters').hidden || n > 0);
  document.querySelectorAll('#fType button').forEach(b => b.classList.toggle('on', b.dataset.v === filters.type));
  document.querySelectorAll('#fPeriod button').forEach(b => b.classList.toggle('on', b.dataset.v === filters.period));
  const opt = c => `<option value="${esc(c.id)}"${c.id === filters.cat ? ' selected' : ''}>${esc(c.emoji + ' ' + c.name)}</option>`;
  $('fCat').innerHTML = `<option value="">Усі категорії</option><optgroup label="Витрати">${state.cats.map(opt).join('')}</optgroup>` +
    `<optgroup label="Доходи">${INCOME_CATS.map(opt).join('')}</optgroup>`;
}

// Day-to-day spending extrapolated to the whole month, plus fixed monthly payments
function forecast() {
  const list = monthExpenses();
  const recurringDone = sumOf(list.filter(e => e.rec));
  const variable = sumOf(list) - recurringDone;
  const recurringPending = sumOf(state.recurring.filter(r => !r.inc && r.last < viewMonth));
  return variable / new Date().getDate() * daysIn(viewMonth) + recurringDone + recurringPending;
}

function renderQuick() {
  $('quick').innerHTML = state.favs.map(f => {
    const c = catById(f.cat);
    return `<button class="chip" data-fav="${esc(f.id)}"><span>${esc(c.emoji)}</span>${esc(f.note || c.name)}<b>${esc(money(f.amount))}</b></button>`;
  }).join('') + `<button class="chip add" data-fav-new>${state.favs.length ? '+' : '+ Швидка кнопка'}</button>`;
}

function renderStats() {
  renderBalance();
  renderTrend();
  renderRecurring();
  const list = monthExpenses();
  const total = sumOf(list);
  if (!total) {
    $('donut').innerHTML = '';
    $('statList').innerHTML = emptyState('i-pie', 'Немає даних', 'Тут зʼявиться розподіл витрат по категоріях');
    return;
  }
  const sums = {}, prevSums = {};
  list.forEach(e => sums[e.cat] = (sums[e.cat] || 0) + e.amount);
  prevPeriod().forEach(e => prevSums[e.cat] = (prevSums[e.cat] || 0) + e.amount);
  const rows = Object.entries(sums).sort((a, b) => b[1] - a[1]);

  // Donut chart
  const R = 78, C = 2 * Math.PI * R;
  let offset = 0;
  const arcs = rows.map(([id, v]) => {
    const len = v / total * C;
    const seg = `<circle r="${R}" cx="100" cy="100" fill="none" stroke="${catById(id).color}" stroke-width="20"
      stroke-dasharray="${Math.max(len - (rows.length > 1 ? 3 : 0), 0.5)} ${C}" stroke-dashoffset="${-offset}" transform="rotate(-90 100 100)"/>`;
    offset += len;
    return seg;
  }).join('');
  $('donut').innerHTML = `<svg width="200" height="200" viewBox="0 0 200 200">${arcs}
    <text x="100" y="94" text-anchor="middle" class="donut-t1">Разом</text>
    <text x="100" y="118" text-anchor="middle" class="donut-t2">${esc(money(Math.round(total)))}</text></svg>`;

  // With a limit the bar shows progress towards it; without one, the share of the month's total
  $('statList').innerHTML = rows.map(([id, v]) => {
    const c = catById(id), p = v / total * 100;
    const lim = c.budget ? v / c.budget * 100 : 0;
    const barColor = !c.budget ? c.color : lim > 100 ? 'var(--danger)' : lim >= 80 ? '#f59e0b' : c.color;
    return `<div class="stat-row">
      <div class="emoji" style="background:${c.color}22">${esc(c.emoji)}</div>
      <div class="meta">
        <div class="top"><span class="name">${esc(c.name)}<span class="pct">${p.toFixed(0)}%</span>${delta(v, prevSums[id])}</span><b>${esc(money(v))}</b></div>
        <div class="bar"><i style="width:${Math.min(100, c.budget ? lim : p)}%;background:${barColor}"></i></div>
        ${c.budget ? `<div class="sub2">${Math.round(lim)}% ліміту ${esc(money(c.budget))}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderBalance() {
  const inc = sumOf(monthIncome()), out = sumOf(monthExpenses());
  $('balance').hidden = !inc;
  if (!inc) return;
  const bal = inc - out;
  const bySource = INCOME_CATS.map(c => ({ c, v: sumOf(monthIncome().filter(e => e.cat === c.id)) })).filter(x => x.v);
  $('balance').innerHTML = `<div class="card-head"><b>Баланс місяця</b></div>
    <div class="bal">
      <div><b class="pos">${esc(money(Math.round(inc)))}</b><span>дохід</span></div>
      <div><b>${esc(money(Math.round(out)))}</b><span>витрати</span></div>
      <div><b class="${bal >= 0 ? 'pos' : 'neg'}">${bal >= 0 ? '+' : '−'}${esc(money(Math.round(Math.abs(bal))))}</b><span>залишок</span></div>
    </div>
    <p class="bal-note">${bal >= 0 ? `Відкладено <b>${Math.round(bal / inc * 100)}%</b> доходу` : `Витрати перевищили дохід на <b>${esc(money(Math.round(-bal)))}</b>`}</p>` +
    bySource.map(({ c, v }) => `<div class="stat-row">
      <div class="emoji" style="background:${c.color}22">${esc(c.emoji)}</div>
      <div class="meta"><div class="top"><span class="name">${esc(c.name)}</span><b class="pos" style="color:var(--good)">+${esc(money(v))}</b></div></div>
    </div>`).join('');
}
function delta(cur, prev) {
  if (!prev) return '';
  const p = Math.round((cur - prev) / prev * 100);
  return p ? `<span class="delta ${p > 0 ? 'up' : 'down'}">${p > 0 ? '↑' : '↓'}${Math.abs(p)}%</span>` : '';
}

// Bar chart of the 12 months ending with the selected one; tap a bar to open that month
function renderTrend() {
  const months = Array.from({ length: 12 }, (_, i) => shiftKey(viewMonth, i - 11));
  const totals = months.map(k => sumOf(monthExpenses(k)));
  const max = Math.max(...totals, 1);
  const W = 336, H = 110, gap = 6, bw = (W - gap * 11) / 12;
  const bars = months.map((k, i) => {
    const h = totals[i] ? Math.max(totals[i] / max * H, 4) : 2;
    const x = i * (bw + gap), on = k === viewMonth ? ' on' : '';
    return `<g data-month="${k}"><rect x="${x}" y="0" width="${bw}" height="${H + 20}" fill="transparent"/>
      <rect class="b${on}" x="${x}" y="${H - h}" width="${bw}" height="${h}" rx="4"/>
      <text class="${on}" x="${x + bw / 2}" y="${H + 16}" text-anchor="middle">${MONTH_SHORT[Number(k.slice(5)) - 1]}</text></g>`;
  }).join('');
  const withData = totals.filter(Boolean);
  const avg = withData.length ? withData.reduce((a, b) => a + b, 0) / withData.length : 0;
  $('trend').innerHTML = `<div class="card-head"><b>За рік</b><span>${avg ? 'у середньому ' + esc(money(Math.round(avg))) + '/міс' : ''}</span></div>
    <svg class="trend" viewBox="0 0 ${W} ${H + 20}" width="100%">${bars}</svg>`;
}

function renderRecurring() {
  const rs = state.recurring;
  if (!rs.length) {
    $('recList').innerHTML = `<div class="card-head"><b>Регулярні платежі</b></div>
      <p class="muted-p">Увімкніть «Повторювати щомісяця» при додаванні витрати — оренда, звʼязок і підписки додаватимуться самі.</p>`;
    return;
  }
  const monthly = sumOf(rs.filter(r => !r.inc));
  $('recList').innerHTML = `<div class="card-head"><b>Регулярні платежі</b><span>${monthly ? esc(money(monthly)) + '/міс' : ''}</span></div>` +
    rs.map(r => {
      const c = catById(r.cat);
      return `<div class="stat-row">
        <div class="emoji" style="background:${c.color}22">${esc(c.emoji)}</div>
        <div class="meta"><div class="top"><span class="name">${esc(r.note || c.name)}</span><b${r.inc ? ' style="color:var(--good)"' : ''}>${r.inc ? '+' : ''}${esc(money(r.amount))}</b></div>
          <div class="sub2">${r.day} числа щомісяця · ${esc(money(r.amount * 12))} на рік</div></div>
        <button class="icon-sm" data-del-rec="${esc(r.id)}" aria-label="Видалити платіж">${icon('i-trash')}</button>
      </div>`;
    }).join('') +
    (monthly ? `<div class="rec-total">Обовʼязкові витрати на рік: <b>${esc(money(monthly * 12))}</b></div>` : '');
}

function renderSettings() {
  $('budget').value = state.settings.budget || '';
  $('currency').value = state.settings.currency;
  $('catEditList').innerHTML = state.cats.map(c => `<div class="cat-edit">
    <div class="emoji" style="background:${c.color}22">${esc(c.emoji)}</div>
    <div class="nm">${esc(c.name)}</div>
    <input type="number" inputmode="numeric" min="0" placeholder="ліміт" value="${c.budget || ''}" data-budget-cat="${esc(c.id)}" aria-label="Ліміт для ${esc(c.name)}">
    <button data-del-cat="${esc(c.id)}" aria-label="Видалити категорію">${icon('i-trash')}</button>
  </div>`).join('');
  $('favEditList').innerHTML = state.favs.length ? state.favs.map(f => {
    const c = catById(f.cat);
    return `<div class="cat-edit">
      <div class="emoji" style="background:${c.color}22">${esc(c.emoji)}</div>
      <div class="nm">${esc(f.note || c.name)} · ${esc(money(f.amount))}</div>
      <button data-del-fav="${esc(f.id)}" aria-label="Видалити кнопку">${icon('i-trash')}</button>
    </div>`;
  }).join('') : `<p class="muted-p" style="padding:16px 4px">Поки немає. Увімкніть «Швидка кнопка» у формі витрати.</p>`;
  renderLockToggle();
}

function emptyState(name, title, text) {
  return `<div class="empty"><div class="ico">${icon(name)}</div><b>${esc(title)}</b>${esc(text)}</div>`;
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
let sheetPhoto = { blob: null, changed: false, url: null };
const findFav = x => state.favs.find(f => f.amount === x.amount && f.cat === x.cat && f.note === x.note);

let sheetType = 'out';
function setSheetType(type) {
  sheetType = type;
  document.querySelectorAll('#typeSeg button').forEach(b => b.classList.toggle('on', b.dataset.type === type));
  $('sheetTitle').textContent = editingId ? 'Редагувати' : type === 'in' ? 'Новий дохід' : 'Нова витрата';
  $('amountWrap').classList.toggle('inc', type === 'in');
  $('rowFav').hidden = type === 'in';
  $('repHint').textContent = type === 'in' ? 'Зарплата, стипендія, оренда від квартирантів' : 'Оренда, звʼязок, підписки';
  $('del').textContent = type === 'in' ? 'Видалити дохід' : 'Видалити витрату';
  const pool = type === 'in' ? INCOME_CATS : state.cats;
  if (!pool.some(c => c.id === selectedCat)) {
    const last = type === 'in' ? state.lastIncCat : state.lastCat;
    selectedCat = pool.some(c => c.id === last) ? last : pool[0]?.id;
  }
  renderCatPicker();
  renderSuggest();
}

function openSheet(exp, opts = {}) {
  editingId = exp ? exp.id : null;
  $('fAmount').value = exp ? String(exp.amount).replace('.', ',') : '';
  fitAmount();
  $('fNote').value = exp ? exp.note : '';
  const defaultDate = viewMonth === monthKey(new Date()) ? today() : viewMonth + '-01';
  $('fDate').value = exp ? exp.date : defaultDate;
  $('fCur').textContent = state.settings.currency;
  selectedCat = exp ? exp.cat : null;
  $('tFav').checked = !!opts.fav || (exp ? !!findFav(exp) : false);
  $('tRep').checked = !!(exp?.rec && state.recurring.some(r => r.id === exp.rec));
  $('del').hidden = !exp;
  setSheetPhoto(null, false);
  if (exp?.photo) photoGet(exp.id).then(b => { if (b && editingId === exp.id) setSheetPhoto(b, false); }).catch(() => {});
  setSheetType(exp?.inc ? 'in' : 'out');
  $('backdrop').classList.add('open');
  $('sheet').classList.add('open');
  openLayer('sheet');
  if (!exp) setTimeout(() => $('fAmount').focus(), 260);
}
// Keep the currency sign right next to the number
function fitAmount() { $('fAmount').style.width = (Math.max(1, $('fAmount').value.length) + 0.5) + 'ch'; }
function hideSheet() {
  $('backdrop').classList.remove('open');
  $('sheet').classList.remove('open');
  document.activeElement?.blur();
}
function closeSheet() {
  hideSheet();
  dropLayers('sheet');
}
function renderCatPicker() {
  $('fCats').classList.toggle('three', sheetType === 'in'); // 6 income sources → even 3×2 grid
  $('fCats').innerHTML = (sheetType === 'in' ? INCOME_CATS : state.cats).map(c => `<button class="cat ${c.id === selectedCat ? 'on' : ''}" data-cat="${esc(c.id)}">
    <span class="e">${esc(c.emoji)}</span><span class="t">${esc(c.name)}</span></button>`).join('');
}

function setSheetPhoto(blob, changed) {
  if (sheetPhoto.url) URL.revokeObjectURL(sheetPhoto.url);
  sheetPhoto = { blob, changed, url: blob ? URL.createObjectURL(blob) : null };
  $('photoBox').innerHTML = blob
    ? `<div class="photo-has"><button class="v" data-photo="view"><img src="${sheetPhoto.url}" alt="">Чек</button>
        <button class="icon-sm" data-photo="remove" aria-label="Прибрати фото">${icon('i-x')}</button></div>`
    : `<label class="photo-btn" for="photoInput">${icon('i-camera')}Фото чека</label>`;
}

// Past comments as one-tap suggestions; picking one also sets its category (and amount, if empty)
function renderSuggest() {
  const q = $('fNote').value.trim().toLowerCase();
  const stats = new Map();
  state.expenses.forEach(e => {
    if (!e.note || !!e.inc !== (sheetType === 'in')) return;
    const k = e.note.toLowerCase();
    const s = stats.get(k) || { n: 0, ts: '' };
    s.n++;
    const ts = e.date + String(e.ts).padStart(15, '0'); // most recent by date, then by entry time
    if (ts >= s.ts) Object.assign(s, { ts, note: e.note, cat: e.cat, amount: e.amount });
    stats.set(k, s);
  });
  const items = [...stats.entries()]
    .filter(([k]) => k !== q && k.includes(q))
    .sort(([ka, a], [kb, b]) => kb.startsWith(q) - ka.startsWith(q) || b.n - a.n || b.ts.localeCompare(a.ts))
    .slice(0, 6).map(([, s]) => s);
  $('suggest').innerHTML = items.map(s => `<button class="sg" data-note="${esc(s.note)}" data-cat="${esc(s.cat)}" data-amount="${s.amount}">${esc(catById(s.cat).emoji)} ${esc(s.note)}</button>`).join('');
  $('suggest').hidden = !items.length;
}

let saving = false;
async function submit() {
  if (saving) return;
  const amount = Math.round(parseFloat($('fAmount').value.replace(/\s/g, '').replace(',', '.')) * 100) / 100;
  if (!(amount > 0)) { toast('Введіть суму'); $('fAmount').focus(); return; }
  if (!selectedCat) { toast('Оберіть категорію'); return; }
  saving = true;
  const wasEditing = !!editingId;
  const isInc = sheetType === 'in';
  const data = { amount, cat: selectedCat, note: $('fNote').value.trim(), date: DATE_RE.test($('fDate').value) ? $('fDate').value : today() };
  let exp;
  if (wasEditing) {
    exp = state.expenses.find(e => e.id === editingId);
    Object.assign(exp, data);
  } else {
    exp = { id: uid(), ts: Date.now(), ...data };
    state.expenses.push(exp);
  }
  if (isInc) exp.inc = true; else delete exp.inc;

  const fav = findFav(exp);
  if (!isInc && $('tFav').checked && !fav) state.favs.push({ id: uid(), amount: exp.amount, cat: exp.cat, note: exp.note });
  if ((isInc || !$('tFav').checked) && fav) state.favs = state.favs.filter(f => f !== fav);

  const rule = exp.rec && state.recurring.find(r => r.id === exp.rec);
  const day = Number(exp.date.slice(8));
  if ($('tRep').checked) {
    if (rule) {
      Object.assign(rule, { amount: exp.amount, cat: exp.cat, note: exp.note, day });
      if (isInc) rule.inc = true; else delete rule.inc;
    } else {
      const r = { id: uid(), amount: exp.amount, cat: exp.cat, note: exp.note, day, last: exp.date.slice(0, 7), ...(isInc && { inc: true }) };
      state.recurring.push(r);
      exp.rec = r.id;
    }
  } else if (rule) {
    state.recurring = state.recurring.filter(r => r !== rule);
    delete exp.rec;
  }

  if (sheetPhoto.changed) {
    try {
      if (sheetPhoto.blob) { await photoPut(exp.id, sheetPhoto.blob); exp.photo = true; }
      else { await photoDel(exp.id); delete exp.photo; }
    } catch { toast('Не вдалося зберегти фото'); }
  }

  if (isInc) state.lastIncCat = selectedCat; else state.lastCat = selectedCat;
  save();
  applyRecurring();
  viewMonth = data.date.slice(0, 7);
  closeSheet();
  render();
  saving = false;
  const warn = wasEditing ? '' : limitWarning(exp);
  toast(warn || (wasEditing ? 'Збережено' : isInc ? 'Дохід додано ✓' : 'Додано ✓'));
}

// Warn once when a new expense pushes its category past 80% or 100% of the limit
function limitWarning(exp) {
  const c = !exp.inc && state.cats.find(x => x.id === exp.cat);
  if (!c?.budget) return '';
  const spent = catSpent(c.id, exp.date.slice(0, 7)), before = spent - exp.amount;
  if (spent > c.budget && before <= c.budget) return `⚠️ Ліміт «${c.name}» перевищено`;
  if (spent >= c.budget * 0.8 && before < c.budget * 0.8) return `⚠️ «${c.name}»: ${Math.round(spent / c.budget * 100)}% ліміту`;
  return '';
}

function addFromFav(f) {
  const exp = { id: uid(), ts: Date.now(), amount: f.amount, cat: f.cat, note: f.note, date: today() };
  state.expenses.push(exp);
  save();
  viewMonth = monthKey(new Date());
  render();
  toast(limitWarning(exp) || `Додано: ${f.note || catById(f.cat).name}, ${money(f.amount)}`, {
    label: 'Скасувати',
    fn: () => { state.expenses = state.expenses.filter(e => e.id !== exp.id); save(); render(); },
  });
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
  const lines = [['Дата', 'Тип', 'Категорія', 'Сума', 'Коментар'].join(';')];
  [...state.expenses].sort((a, b) => a.date.localeCompare(b.date)).forEach(e =>
    lines.push([e.date, e.inc ? 'Дохід' : 'Витрата', q(catById(e.cat).name), String(e.amount).replace('.', ','), q(e.note)].join(';')));
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
$('fNote').addEventListener('input', renderSuggest);
$('typeSeg').onclick = e => {
  const b = e.target.closest('[data-type]');
  if (b && b.dataset.type !== sheetType) setSheetType(b.dataset.type);
};
$('fCats').onclick = e => {
  const b = e.target.closest('[data-cat]');
  if (b) { selectedCat = b.dataset.cat; renderCatPicker(); }
};
$('suggest').onclick = e => {
  const b = e.target.closest('[data-note]');
  if (!b) return;
  $('fNote').value = b.dataset.note;
  if (state.cats.some(c => c.id === b.dataset.cat)) { selectedCat = b.dataset.cat; renderCatPicker(); }
  if (!$('fAmount').value) { $('fAmount').value = b.dataset.amount.replace('.', ','); fitAmount(); }
  renderSuggest();
};
$('photoInput').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try { setSheetPhoto(await shrinkImage(file), true); }
  catch { toast('Не вдалося відкрити фото'); }
};
$('photoBox').onclick = e => {
  const act = e.target.closest('[data-photo]')?.dataset.photo;
  if (act === 'view') { $('viewerImg').src = sheetPhoto.url; $('viewer').hidden = false; openLayer('viewer'); }
  if (act === 'remove') setSheetPhoto(null, true);
};
$('viewer').onclick = () => { $('viewer').hidden = true; dropLayers('viewer'); };
$('days').onclick = e => {
  const b = e.target.closest('[data-id]');
  if (b) openSheet(state.expenses.find(x => x.id === b.dataset.id));
};
$('quick').onclick = e => {
  const b = e.target.closest('[data-fav]');
  if (b) { const f = state.favs.find(x => x.id === b.dataset.fav); if (f) addFromFav(f); }
  else if (e.target.closest('[data-fav-new]')) openSheet(null, { fav: true });
};
// Delete with undo: the expense (and its photo) can be restored for a few seconds
$('del').onclick = () => {
  const i = state.expenses.findIndex(e => e.id === editingId);
  if (i < 0) return;
  const [exp] = state.expenses.splice(i, 1);
  save(); closeSheet(); render();
  const purge = setTimeout(() => { if (exp.photo) photoDel(exp.id).catch(() => {}); }, 6000);
  toast(exp.inc ? 'Дохід видалено' : 'Витрату видалено', {
    label: 'Повернути',
    fn: () => { clearTimeout(purge); state.expenses.push(exp); save(); render(); },
  });
};
// Search & filter controls
$('q').addEventListener('input', () => { filters.q = $('q').value; renderHome(); });
$('q').addEventListener('keydown', e => { if (e.key === 'Enter') $('q').blur(); });
$('qClear').onclick = e => { e.preventDefault(); $('q').value = filters.q = ''; renderHome(); };
$('filterBtn').onclick = () => {
  const open = $('filters').hidden;
  $('filters').hidden = !open;
  if (open) openLayer('filters'); else dropLayers('filters');
  renderSearchControls();
};
$('fType').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { filters.type = b.dataset.v; renderHome(); } };
$('fPeriod').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { filters.period = b.dataset.v; renderHome(); } };
$('fCat').onchange = () => { filters.cat = $('fCat').value; renderHome(); };
$('fMin').oninput = () => { filters.min = $('fMin').value; renderHome(); };
$('fMax').oninput = () => { filters.max = $('fMax').value; renderHome(); };
$('fReset').onclick = () => {
  Object.assign(filters, { type: 'all', period: 'all', cat: '', min: '', max: '' });
  $('fMin').value = $('fMax').value = '';
  renderHome();
};

$('trend').onclick = e => {
  const g = e.target.closest('[data-month]');
  if (g) { viewMonth = g.dataset.month; render(); }
};
$('recList').onclick = e => {
  const b = e.target.closest('[data-del-rec]');
  if (!b) return;
  const r = state.recurring.find(x => x.id === b.dataset.delRec);
  if (!r || !confirm(`Більше не додавати «${r.note || catById(r.cat).name}» щомісяця? Уже додані записи залишаться.`)) return;
  state.recurring = state.recurring.filter(x => x !== r);
  save(); render();
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
document.querySelectorAll('.tab').forEach(t => t.onclick = () => goView(t.dataset.view));
$('settingsBtn').onclick = () => goView('settings');
$('leftBtn').onclick = () => currentView === 'settings' ? goView(lastTab) : lock();

// ---------- Phone "back" gesture ----------
// Every open layer (form, photo, filters, stats, settings) owns a history entry, so the system back
// gesture closes the top layer instead of leaving the app. Back on the home screen exits as usual.
const layers = [];
let ignorePops = 0;
function openLayer(name) {
  if (layers.includes(name)) return;
  layers.push(name);
  history.pushState({ layer: layers.length }, '');
}
// Called when a layer is closed from the UI: drop its history entries without re-running the close
function dropLayers(...names) {
  let n = 0;
  while (layers.length && names.includes(layers[layers.length - 1])) { layers.pop(); n++; }
  names.forEach(name => { const i = layers.indexOf(name); if (i >= 0) layers.splice(i, 1); });
  if (n) { ignorePops++; history.go(-n); }
}
function hideLayer(name) {
  if (name === 'sheet') hideSheet();
  if (name === 'viewer') $('viewer').hidden = true;
  if (name === 'filters') { $('filters').hidden = true; renderSearchControls(); }
  if (name === 'settings') showView(layers.includes('stats') ? 'stats' : 'home');
  if (name === 'stats') showView('home');
}
window.addEventListener('popstate', () => {
  if (ignorePops) { ignorePops--; return; }
  const name = layers.pop();
  if (name) hideLayer(name);
});
function goView(view) {
  if (view === currentView) return;
  if (view === 'home') dropLayers('settings', 'stats');
  else if (view === 'settings') openLayer('settings');
  else if (layers.includes('stats')) dropLayers('settings'); // settings → back down to stats
  else if (layers[layers.length - 1] === 'settings') layers[layers.length - 1] = 'stats'; // reuse the entry
  else openLayer('stats');
  showView(view);
}

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
$('catEditList').addEventListener('change', e => {
  const input = e.target.closest('[data-budget-cat]');
  const c = input && state.cats.find(x => x.id === input.dataset.budgetCat);
  if (!c) return;
  c.budget = Math.max(0, Math.round(Number(input.value) || 0));
  input.value = c.budget || '';
  save(); render();
  toast(c.budget ? `Ліміт «${c.name}»: ${money(c.budget)}` : `Ліміт «${c.name}» прибрано`);
});
$('favEditList').onclick = e => {
  const b = e.target.closest('[data-del-fav]');
  if (!b) return;
  state.favs = state.favs.filter(f => f.id !== b.dataset.delFav);
  save(); renderSettings(); render();
};

$('exportJson').onclick = async () => {
  const photos = {};
  try {
    for (const e of state.expenses) if (e.photo) { const b = await photoGet(e.id); if (b) photos[e.id] = await blobToDataUrl(b); }
  } catch {}
  download(`vytraty-backup-${today()}.json`, JSON.stringify({ ...state, photos }, null, 2), 'application/json');
};
$('exportCsv').onclick = exportCsv;
$('importFile').onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    const data = sanitize(raw);
    if (!data) throw 0;
    if (confirm(`Відновити ${data.expenses.length} записів? Поточні дані буде замінено.`)) {
      const photos = raw.photos && typeof raw.photos === 'object' ? raw.photos : {};
      await photoClear().catch(() => {});
      for (const x of data.expenses) {
        const p = Object.prototype.hasOwnProperty.call(photos, x.id) ? photos[x.id] : null;
        if (typeof p === 'string' && PHOTO_RE.test(p)) { await photoPut(x.id, dataUrlToBlob(p)); x.photo = true; }
        else delete x.photo;
      }
      state = data; save(); applyRecurring(); render(); renderSettings(); toast('Дані відновлено');
    }
  } catch { toast('Невірний файл'); }
  finally { e.target.value = ''; }
};
$('wipe').onclick = async () => {
  if (!confirm('Точно видалити ВСІ витрати й налаштування?')) return;
  localStorage.removeItem(KEY); await photoClear().catch(() => {});
  state = load(); save(); render(); renderSettings(); toast('Усе очищено');
};

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
let unlocking = false, pendingAdd = false;
// `auto` = prompted without a tap; some browsers refuse that, so stay quiet and wait for the button
async function unlock(auto) {
  if (unlocking) return;
  unlocking = true;
  try {
    await verifyFingerprint();
    document.body.classList.remove('locked');
    $('lock').hidden = true;
    if (pendingAdd) { pendingAdd = false; openSheet(); }
  } catch {
    if (!auto) toast('Не вдалося розпізнати');
  } finally { unlocking = false; }
}
$('unlockBtn').onclick = () => unlock(false);
$('lockReset').onclick = () => {
  if (!confirm('Без відбитка увійти не можна. Можна лише скинути додаток — це видалить УСІ витрати на цьому телефоні. Продовжити?')) return;
  if (!confirm('Точно? Відновити дані можна буде тільки з резервної копії.')) return;
  localStorage.removeItem(KEY); localStorage.removeItem(LOCK_KEY);
  indexedDB.deleteDatabase('expense-tracker');
  location.reload();
};

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  applyRecurring();
  render();
  if (lockEnabled() && Date.now() - hiddenAt > RELOCK_AFTER_MS && $('lock').hidden) { lock(); unlock(true); }
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

// Ask the browser not to evict our data under storage pressure
navigator.storage?.persist?.();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js');

// Home-screen shortcut "Додати витрату" opens the app with ?add=1
if (new URLSearchParams(location.search).has('add')) {
  pendingAdd = true;
  history.replaceState(null, '', location.pathname);
}

applyRecurring();
render();
showView('home');
cleanupPhotos();
if (lockEnabled()) { lock(); unlock(true); }
else if (pendingAdd) { pendingAdd = false; openSheet(); }
