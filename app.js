const PER_PAGE   = 8;
const CURRENCIES = ['All','USD','EUR','GBP','JPY','CAD','AUD','NZD','CNY'];
const IMPACTS    = ['All','High','Medium','Low'];
const NEWS_CATS  = ['All','ForexCrunch','ForexLive'];
const SOURCE_KEY = { ForexCrunch: 'forexcrunch', ForexLive: 'forexlive' };

let allCalendar  = [];
let allNews      = [];
let readSet      = (() => { try { return new Set(JSON.parse(localStorage.getItem('tradelive_read') || '[]')); } catch { return new Set(); } })();
let activeTab    = 'calendar';
let activeImpact = 'All';
let activeCurr   = 'All';
let activeNewsCat = 'All';
let currentPage  = 1;

function saveRead() { localStorage.setItem('tradelive_read', JSON.stringify([...readSet])); }

function formatTime(d) {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date)) return '';
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yest  = new Date(today - 86400000);
  const day   = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const t     = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (day.getTime() === today.getTime()) return 'Today, ' + t;
  if (day.getTime() === yest.getTime())  return 'Yesterday, ' + t;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + t;
}

function isRecent(d) { return d && (Date.now() - new Date(d)) < 6 * 3600000; }

function eh(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function safeUrl(s) { const u = String(s).trim(); return /^https?:\/\//i.test(u) ? eh(u) : '#'; }

// ── Load ──────────────────────────────────────────────────────────────────
async function loadAll() {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('spinning'); btn.disabled = true;
  showLoading();
  try {
    const res  = await fetch('/api/news');
    if (!res.ok) throw new Error('Server returned ' + res.status);
    const data = await res.json();

    allCalendar = data.calendar || [];

    const seen = new Set();
    allNews = (data.news || []).filter(a => { if (seen.has(a.id)) return false; seen.add(a.id); return true; });

    document.getElementById('lastUpdated').textContent =
      'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    currentPage = 1;
    render();
  } catch (e) {
    showError(e.message);
  }
  btn.classList.remove('spinning'); btn.disabled = false;
}

function render() {
  renderTabs();
  renderFilters();
  if (activeTab === 'calendar') renderCalendar();
  else renderNews();
}

// ── Tabs ──────────────────────────────────────────────────────────────────
function renderTabs() {
  document.getElementById('tabRow').innerHTML =
    `<button class="tab-btn${activeTab === 'calendar' ? ' active' : ''}" data-tab="calendar">Economic Calendar</button>` +
    `<button class="tab-btn${activeTab === 'news' ? ' active' : ''}" data-tab="news">Financial News</button>`;
}

function setTab(tab) {
  if (tab === activeTab) return;
  activeTab = tab;
  currentPage = 1;
  render();
}

// ── Filters ───────────────────────────────────────────────────────────────
function renderFilters() {
  const row = document.getElementById('filterRow');
  if (activeTab === 'calendar') {
    const impPills = IMPACTS.map(i =>
      `<button class="pill${i === activeImpact ? ' active' : ''}" data-impact="${eh(i)}">${eh(i)}</button>`
    ).join('');
    const curPills = CURRENCIES.map(c =>
      `<button class="pill${c === activeCurr ? ' active' : ''}" data-curr="${eh(c)}">${eh(c)}</button>`
    ).join('');
    row.innerHTML = `<div class="filter-group">${impPills}</div><div class="filter-sep"></div><div class="filter-group">${curPills}</div>`;
  } else {
    row.innerHTML = NEWS_CATS.map(c =>
      `<button class="pill${c === activeNewsCat ? ' active' : ''}" data-newscat="${eh(c)}">${eh(c)}</button>`
    ).join('');
  }
}

// ── Calendar ──────────────────────────────────────────────────────────────
function getFilteredCalendar() {
  return allCalendar.filter(e => {
    if (activeImpact !== 'All' && e.impact !== activeImpact) return false;
    if (activeCurr   !== 'All' && e.country !== activeCurr)  return false;
    return true;
  });
}

function parseEventDateTime(date, time) {
  if (!date) return 0;
  const [m, d, y] = date.split('-');
  let hours = 0, mins = 0;
  if (time) {
    const tm = time.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
    if (tm) {
      hours = parseInt(tm[1]);
      mins  = parseInt(tm[2]);
      if (tm[3].toLowerCase() === 'pm' && hours !== 12) hours += 12;
      if (tm[3].toLowerCase() === 'am' && hours === 12) hours = 0;
    }
  }
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d), hours, mins).getTime();
}

function formatEventDate(dateStr) {
  if (!dateStr) return '';
  const [m, d, y] = dateStr.split('-');
  const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  if (isNaN(date)) return dateStr;
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

const FLAG = { USD:'🇺🇸', EUR:'🇪🇺', GBP:'🇬🇧', JPY:'🇯🇵', CAD:'🇨🇦', AUD:'🇦🇺', NZD:'🇳🇿', CNY:'🇨🇳', CHF:'🇨🇭', SEK:'🇸🇪', NOK:'🇳🇴' };
function flag(country) { return FLAG[country] || '🌐'; }

function renderCalendar() {
  const filtered = getFilteredCalendar();
  const content  = document.getElementById('content');
  document.getElementById('sectionLabel').textContent = `${filtered.length} event${filtered.length !== 1 ? 's' : ''}`;
  document.getElementById('unreadPill').setAttribute('hidden', '');

  if (!filtered.length) {
    content.innerHTML = `<div class="state-wrap"><div class="state-title">No events found</div><div class="state-sub">Try a different impact level or currency filter.</div></div>`;
    return;
  }

  // Group by date
  const byDate = new Map();
  for (const e of filtered) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }

  // Sort: today first, future dates ascending, past dates most-recent-first
  const calToMs = s => { const [m,d,y] = s.split('-'); return new Date(+y,+m-1,+d).getTime(); };
  const todayMs = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
  const sortedDates = [...byDate.keys()].sort((a, b) => {
    const aMs = calToMs(a), bMs = calToMs(b);
    const aFuture = aMs >= todayMs, bFuture = bMs >= todayMs;
    if (aFuture !== bFuture) return aFuture ? -1 : 1;
    if (aFuture) return aMs - bMs;
    return bMs - aMs;
  });

  let html = '';
  for (const date of sortedDates) {
    const isToday = calToMs(date) === todayMs;
    const events = byDate.get(date).sort((a, b) => parseEventDateTime(a.date, a.time) - parseEventDateTime(b.date, b.time));
    html += `<div class="cal-day">
      <div class="cal-date-header">${eh(formatEventDate(date))}${isToday ? ' <span class="today-badge">Today</span>' : ''}</div>
      <div class="cal-table-wrap"><table class="cal-table">
        <thead><tr><th>Time</th><th>Currency</th><th>Event</th><th>Impact</th><th>Forecast</th><th>Previous</th></tr></thead>
        <tbody>`;
    for (const e of events) {
      const cls  = `impact-${(e.impact || 'low').toLowerCase()}`;
      const link = e.url
        ? `<a href="${safeUrl(e.url)}" target="_blank" rel="noopener noreferrer" class="cal-event-link">${eh(e.title)}</a>`
        : eh(e.title);
      html += `<tr class="cal-row">
        <td class="cal-time">${eh(e.time || 'All day')}</td>
        <td class="cal-currency"><span class="cal-flag">${flag(e.country)}</span>${eh(e.country)}</td>
        <td class="cal-event">${link}</td>
        <td class="cal-impact"><span class="impact-badge ${eh(cls)}">${eh(e.impact)}</span></td>
        <td class="cal-val">${eh(e.forecast || '—')}</td>
        <td class="cal-val">${eh(e.previous || '—')}</td>
      </tr>`;
    }
    html += `</tbody></table></div></div>`;
  }
  content.innerHTML = html;
}

// ── News ──────────────────────────────────────────────────────────────────
function getFilteredNews() {
  if (activeNewsCat === 'All') return allNews;
  const key = SOURCE_KEY[activeNewsCat];
  return allNews.filter(a => a.source === key);
}

function markRead(id) {
  readSet.add(id); saveRead();
  const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
  if (card) { card.classList.remove('unread'); const nb = card.querySelector('.new-badge'); if (nb) nb.remove(); }
  updateUnreadPill();
}

function updateUnreadPill() {
  const n  = getFilteredNews().filter(a => !readSet.has(a.id)).length;
  const el = document.getElementById('unreadPill');
  if (n > 0) { el.removeAttribute('hidden'); el.textContent = n + ' unread'; } else el.setAttribute('hidden', '');
}

function renderNews() {
  const filtered   = getFilteredNews();
  const total      = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (currentPage > totalPages) currentPage = totalPages;

  document.getElementById('sectionLabel').textContent = activeNewsCat === 'All' ? 'All news' : activeNewsCat;
  updateUnreadPill();

  const content = document.getElementById('content');
  if (!total) {
    content.innerHTML = `<div class="state-wrap"><div class="state-title">No articles found</div><div class="state-sub">Try a different category or hit Refresh.</div></div>`;
    return;
  }

  const pageItems = filtered.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);
  const cards = pageItems.map(a => {
    const unread = !readSet.has(a.id), recent = isRecent(a.pubDate), showNew = unread && recent;
    return `<article class="card${unread ? ' unread' : ''}" data-id="${eh(a.id)}" data-link="${eh(a.link)}">
      <div class="card-top">
        <div class="badges"><span class="badge ${eh(a.badgeClass)}">${eh(a.sourceLabel)}</span></div>
        ${showNew ? '<span class="new-badge"><span class="new-dot"></span>NEW</span>' : ''}
      </div>
      <div class="card-title">${eh(a.title)}</div>
      ${a.description
        ? `<div class="card-summary">${eh(a.description)}</div>`
        : `<div class="card-summary card-summary-empty">No preview — click to read full article</div>`}
      <div class="card-footer">
        <span class="card-time">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${formatTime(a.pubDate)}
        </span>
        <a class="read-link" href="${safeUrl(a.link)}" target="_blank" rel="noopener noreferrer" data-id="${eh(a.id)}">
          Read full
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>
      </div>
    </article>`;
  }).join('');

  let pg = '';
  if (totalPages > 1) {
    pg = `<div class="pagination"><button class="page-btn" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>← Prev</button>`;
    for (let i = 1; i <= totalPages; i++) {
      if (totalPages <= 7 || i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1)
        pg += `<button class="page-btn${i === currentPage ? ' active' : ''}" data-page="${i}">${i}</button>`;
      else if (Math.abs(i - currentPage) === 2)
        pg += '<span class="page-ellipsis">…</span>';
    }
    pg += `<button class="page-btn" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Next →</button></div>`;
  }
  content.innerHTML = `<div class="grid">${cards}</div>${pg}`;
  content.querySelectorAll('.card').forEach((card, i) => { card.style.animationDelay = (i * 0.04) + 's'; });
}

function changePage(p) {
  const tp = Math.ceil(getFilteredNews().length / PER_PAGE);
  if (p < 1 || p > tp) return;
  currentPage = p; renderNews(); window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleClick(id, link) { markRead(id); if (/^https?:\/\//i.test(link)) window.open(link, '_blank', 'noopener,noreferrer'); }

// ── State screens ─────────────────────────────────────────────────────────
function showLoading() {
  document.getElementById('content').innerHTML = `<div class="state-wrap">
    <div class="spinner"></div>
    <div class="state-title">Fetching latest data…</div>
    <div class="state-sub">Loading ForexFactory calendar and MoneyControl news</div>
  </div>`;
}

function showError(msg) {
  document.getElementById('content').innerHTML = `<div class="state-wrap"><div class="error-box">
    <strong>Could not fetch data</strong>
    The API is temporarily unavailable. Please wait a moment and hit Refresh.<br><br>
    <span class="error-detail">Error: ${eh(msg || 'Request failed')}</span>
  </div></div>`;
}

// ── Event delegation ──────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn && document.getElementById('tabRow').contains(tabBtn)) {
    setTab(tabBtn.dataset.tab); return;
  }
  const impBtn = e.target.closest('[data-impact]');
  if (impBtn) { activeImpact = impBtn.dataset.impact; renderFilters(); renderCalendar(); return; }

  const curBtn = e.target.closest('[data-curr]');
  if (curBtn) { activeCurr = curBtn.dataset.curr; renderFilters(); renderCalendar(); return; }

  const catBtn = e.target.closest('[data-newscat]');
  if (catBtn) { activeNewsCat = catBtn.dataset.newscat; currentPage = 1; renderFilters(); renderNews(); return; }

  const pageBtn = e.target.closest('[data-page]');
  if (pageBtn && document.getElementById('content').contains(pageBtn)) {
    const p = parseInt(pageBtn.dataset.page, 10);
    if (!isNaN(p)) changePage(p);
    return;
  }
  const readLink = e.target.closest('.read-link');
  if (readLink) { e.stopPropagation(); const id = readLink.dataset.id; if (id) markRead(id); return; }

  const card = e.target.closest('.card[data-id]');
  if (card) { const id = card.dataset.id, link = card.dataset.link; if (id && link) handleClick(id, link); return; }
});

document.getElementById('refreshBtn').addEventListener('click', loadAll);

// ── Init ──────────────────────────────────────────────────────────────────
loadAll();
setInterval(() => { if (document.visibilityState === 'visible') loadAll(); }, 5 * 60 * 1000);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}
