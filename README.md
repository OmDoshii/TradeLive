# TradeLive

Real-time economic calendar and financial news dashboard. No ads, no tracking.

## Features

- **Economic Calendar** — ForexFactory weekly events with impact levels (High / Medium / Low), filterable by currency pair and impact
- **Financial News** — MoneyControl RSS feeds (Latest, Markets, Economy) with read/unread tracking
- **Auto-refresh** — every 5 minutes when the tab is visible
- **PWA** — installable, works offline via Service Worker

## Stack

- Vanilla JS + HTML + CSS (no framework, no build step)
- Vercel Serverless Function (`api/news.js`) — fetches ForexFactory XML + MoneyControl RSS, returns `{ calendar, news }`
- Cloudflare Pages Function (`functions/api/news.js`) — identical logic, Workers runtime
- Service Worker — offline support, network-first for API calls

## Data Sources

| Source | Feed | Notes |
|--------|------|-------|
| [ForexFactory](https://www.forexfactory.com) | `https://nfs.faireconomy.media/ff_calendar_thisweek.xml` | This week only, no auth |
| [MoneyControl](https://www.moneycontrol.com) | RSS (latestnews, markets, economy) | Unofficial, personal use |

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

Headers and caching are configured in `vercel.json`. For Cloudflare Pages, the `functions/` directory is used automatically.

## Project Structure

```
TradeLive/
├── index.html           # SPA shell
├── app.js               # All frontend logic (tabs, calendar, news, filters)
├── style.css            # All styles
├── sw.js                # Service worker (cache: tradelive-v1)
├── manifest.json        # PWA manifest
├── icon.svg             # Candlestick favicon
├── icons/               # PWA icons (192 + 512px)
├── api/
│   └── news.js          # Vercel serverless function
├── functions/api/
│   └── news.js          # Cloudflare Pages function (same logic, Workers runtime)
└── vercel.json          # Security headers + caching config
```

## Notes

- No build tools, no npm packages — keep it that way
- All external content goes through `eh()` (HTML escape) before rendering
- Bump `CACHE` in `sw.js` whenever `style.css`, `app.js`, or `index.html` change
- MoneyControl feeds are unofficial; if they break, swap the URLs in `MC_FEEDS`

## License

MIT
