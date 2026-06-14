# TradeLive

Real-time Forex news and economic calendar dashboard. No ads, no tracking.

## Features

- **Economic Calendar** — ForexFactory weekly events with impact levels (High / Medium / Low), filterable by currency and impact. Today's events shown first, future dates ascending, past dates below.
- **Financial News** — FXStreet + ForexLive RSS feeds with read/unread tracking and source filtering. Sorted newest-first, paginated 8 per page.
- **Auto-refresh** — every 5 minutes when the tab is visible
- **PWA** — installable, works offline via Service Worker (cache-first for shell, network-first for API)

## Stack

- Vanilla JS + HTML + CSS (no framework, no build step)
- Vercel Serverless Function (`api/news.js`) — fetches ForexFactory XML + Forex RSS feeds, returns `{ calendar, news }`
- Cloudflare Pages Function (`functions/api/news.js`) — same logic, Workers runtime
- Service Worker (`sw.js`) — offline fallback; hard-refresh safe (does not forward `Cache-Control: no-cache` to the API)

## Data Sources

| Source | Feed | Notes |
|--------|------|-------|
| [ForexFactory](https://www.forexfactory.com) | `https://nfs.faireconomy.media/ff_calendar_thisweek.xml` | Current week only, no auth required |
| [FXStreet](https://www.fxstreet.com) | `https://www.fxstreet.com/rss/news` | Forex analysis and news |
| [ForexLive](https://www.forexlive.com) | `https://www.forexlive.com/feed/` | Breaking Forex news, high update frequency |

> **Weekend note:** Forex markets close Friday ~5 PM ET and reopen Sunday ~5 PM ET. News feeds will show Friday's articles over the weekend — this is expected, not a bug.

## Local Dev

**Prerequisite:** [Vercel CLI](https://vercel.com/docs/cli) — `npm i -g vercel`

```bash
vercel dev
```

Opens at `http://localhost:3000`. The `/api/news` function runs locally — no extra setup needed.

## Deploy

```bash
vercel
```

For Cloudflare Pages, push to your connected repo — the `functions/` directory is picked up automatically. Security headers are configured in `vercel.json` (Vercel) and `_headers` (Cloudflare Pages).

## Project Structure

```
TradeLive/
├── index.html           # SPA shell
├── app.js               # All frontend logic (tabs, calendar, news, filters, pagination)
├── style.css            # All styles
├── sw.js                # Service worker (cache: tradelive-v2)
├── manifest.json        # PWA manifest
├── icon.svg             # Candlestick favicon
├── icons/               # PWA icons (192 + 512 px)
├── api/
│   └── news.js          # Vercel serverless function (Node.js https module)
├── functions/api/
│   └── news.js          # Cloudflare Pages function (Web Fetch API, ES module)
├── vercel.json          # Security headers for Vercel
└── _headers             # Security headers for Cloudflare Pages
```

## Notes

- No build tools, no npm packages — keep it that way
- All external content is passed through `eh()` (HTML escape) before rendering; links validated with `safeUrl()`
- `cleanText()` decodes `&amp;` before numeric entities to handle double-encoded RSS content (e.g. `&amp;#39;` → `'`)
- Bump `CACHE` in `sw.js` (currently `tradelive-v2`) whenever `style.css`, `app.js`, or `index.html` change
- News feeds are in `NEWS_FEEDS` in both API files — add or swap sources there
- Rate limiting: 60 requests / IP / minute on the `/api/news` endpoint

## License

MIT
