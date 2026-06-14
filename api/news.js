const https = require('https');
const http  = require('http');

const FF_URL     = 'https://nfs.faireconomy.media/ff_calendar_thisweek.xml';
const CHROME_UA  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const NEWS_FEEDS = [
  { key: 'fxstreet',  label: 'FXStreet',  badgeClass: 'badge-fxstreet',  url: 'https://www.fxstreet.com/rss/news' },
  { key: 'forexlive', label: 'ForexLive', badgeClass: 'badge-forexlive', url: 'https://www.forexlive.com/feed/' },
];

const VALID_BADGE_CLASSES = new Set(['badge-fxstreet', 'badge-forexlive']);
const VALID_IMPACTS       = new Set(['High', 'Medium', 'Low', 'Holiday']);

const rateMap = new Map();
const RATE_LIMIT  = 60;
const RATE_WINDOW = 60 * 1000;
function checkRate(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) { rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW }); return true; }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

const MAX_BODY = 5 * 1024 * 1024;

function isSafeHttpsUrl(rawUrl) {
  if (typeof rawUrl !== 'string') return false;
  let u;
  try { u = new URL(rawUrl); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h === '0.0.0.0') return false;
  if (/^127\./.test(h)) return false;
  if (/^10\./.test(h)) return false;
  if (/^192\.168\./.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (/^169\.254\./.test(h)) return false;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)) return false;
  if (/^::1$|^::ffff:/i.test(h)) return false;
  return true;
}

function fetchUrl(url, redirects = 0, ua = 'Mozilla/5.0 (compatible; TradeLive/1.0)') {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'));
    if (redirects > 0 && !url.startsWith('https://')) return reject(new Error('Redirect to non-HTTPS blocked'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: {
        'User-Agent': ua,
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, redirects + 1, ua).then(resolve).catch(reject);
      }
      const chunks = [];
      let totalBytes = 0;
      res.on('data', c => {
        totalBytes += c.length;
        if (totalBytes > MAX_BODY) { req.destroy(); return reject(new Error('Feed response too large')); }
        chunks.push(c);
      });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function cleanText(raw) {
  if (!raw) return '';
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'").replace(/&rsquo;/g, '’').replace(/&lsquo;/g, '‘')
    .replace(/&rdquo;/g, '”').replace(/&ldquo;/g, '“').replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/\s+/g, ' ').trim();
}

function stripHtml(s) {
  return typeof s === 'string' ? s.replace(/<[^>]+>/g, '').trim() : '';
}

function getTag(xml, tagName) {
  const re = new RegExp(`<${tagName}[^>]*>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tagName}>`, 'i');
  const m = xml.match(re);
  return m ? (m[1] !== undefined ? m[1] : (m[2] || '')) : '';
}

// ── ForexFactory XML parser ───────────────────────────────────────────────
function parseForexCalendar(xmlText) {
  const events = [];
  const blocks = xmlText.match(/<event>[\s\S]*?<\/event>/g) || [];
  for (const block of blocks) {
    const title    = cleanText(getTag(block, 'title'));
    const country  = cleanText(getTag(block, 'country'));
    const date     = cleanText(getTag(block, 'date'));
    const time     = cleanText(getTag(block, 'time'));
    const impact   = cleanText(getTag(block, 'impact'));
    const forecast = cleanText(getTag(block, 'forecast'));
    const previous = cleanText(getTag(block, 'previous'));
    const url      = cleanText(getTag(block, 'url'));

    if (!title || !country) continue;

    events.push({
      title:    stripHtml(title).slice(0, 200),
      country:  stripHtml(country).slice(0, 10),
      date:     stripHtml(date).slice(0, 12),
      time:     stripHtml(time).slice(0, 12),
      impact:   VALID_IMPACTS.has(impact) ? impact : 'Low',
      forecast: stripHtml(forecast).slice(0, 50),
      previous: stripHtml(previous).slice(0, 50),
      url:      isSafeHttpsUrl(url) ? url.slice(0, 2048) : '',
    });
  }
  return events;
}

// ── RSS parser (FXStreet + ForexLive) ────────────────────────────────────
function parseRSS(xmlText, feedMeta) {
  const items = [];
  const blocks = xmlText.match(/<item[\s>][\s\S]*?<\/item>/g) || [];
  for (const block of blocks.slice(0, 40)) {
    const title   = cleanText(getTag(block, 'title'));
    const link    = getTag(block, 'link') || getTag(block, 'guid');
    const rawDesc = getTag(block, 'content:encoded') || getTag(block, 'description');
    const pub     = getTag(block, 'pubDate');

    if (!title || !link) continue;
    const trimmedLink = link.trim();
    if (!trimmedLink.startsWith('https://')) continue;

    const words = cleanText(rawDesc).split(/\s+/);
    let summary = words.slice(0, 65).join(' ') + (words.length > 65 ? '…' : '');
    if (summary.trim().toLowerCase() === title.trim().toLowerCase()) summary = '';

    items.push({
      id:          trimmedLink.slice(0, 2048),
      title:       title.slice(0, 500),
      link:        trimmedLink.slice(0, 2048),
      description: summary.slice(0, 2000),
      pubDate:     pub,
      source:      feedMeta.key,
      sourceLabel: feedMeta.label,
      badgeClass:  feedMeta.badgeClass,
    });
  }
  return items;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  if (!checkRate(ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');

  const [ffResult, ...feedResults] = await Promise.allSettled([
    fetchUrl(FF_URL),
    ...NEWS_FEEDS.map(f => fetchUrl(f.url, 0, CHROME_UA)),
  ]);

  let calendar = [];
  if (ffResult.status === 'fulfilled') {
    calendar = parseForexCalendar(ffResult.value);
  } else {
    console.error('ForexFactory error:', ffResult.reason?.message);
  }

  const allItems = [];
  const seen = new Set();
  for (let i = 0; i < NEWS_FEEDS.length; i++) {
    const r = feedResults[i];
    if (r.status === 'fulfilled') {
      for (const item of parseRSS(r.value, NEWS_FEEDS[i])) {
        if (!seen.has(item.id)) { seen.add(item.id); allItems.push(item); }
      }
    } else {
      console.error(`Feed (${NEWS_FEEDS[i].key}) error:`, r.reason?.message);
    }
  }

  allItems.sort((a, b) => {
    const td = d => { try { return new Date(d).getTime(); } catch { return 0; } };
    return td(b.pubDate) - td(a.pubDate);
  });

  const news = allItems.slice(0, 80).map(a => ({
    id:          stripHtml(a.id).slice(0, 2048),
    title:       stripHtml(a.title).slice(0, 500),
    link:        /^https:\/\//.test(stripHtml(a.link)) ? stripHtml(a.link).slice(0, 2048) : '',
    description: stripHtml(a.description).slice(0, 2000),
    pubDate:     a.pubDate,
    source:      stripHtml(a.source).slice(0, 50),
    sourceLabel: stripHtml(a.sourceLabel).slice(0, 100),
    badgeClass:  VALID_BADGE_CLASSES.has(a.badgeClass) ? a.badgeClass : '',
  }));

  res.status(200).json({ status: 'ok', calendar, news });
};
