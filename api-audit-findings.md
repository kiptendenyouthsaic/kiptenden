# Kiptenden API audit findings

## Probe date
2026-08-16 (sandbox network)

## Confirmed reachable providers

- Dictionary API: `https://api.dictionaryapi.dev/api/v2/entries/en/hello` returned HTTP 200 JSON.
- Datamuse: `https://api.datamuse.com/words?sp=hello*&max=3` returned HTTP 200 JSON.
- Bible API: `https://bible-api.com/john%203:16?translation=web` returned HTTP 200 JSON.
- LRCLIB: `https://lrclib.net/api/search?q=Adele%20Hello` returned HTTP 200 JSON.
- ZenQuotes: `https://zenquotes.io/api/random` returned HTTP 200 JSON.
- Urban Dictionary: `https://api.urbandictionary.com/v0/define?term=test` returned HTTP 200 JSON.
- Open-Meteo geocoding and forecast endpoints returned HTTP 200 JSON.
- IP-API HTTP endpoint returned HTTP 200 JSON.
- Sports base `https://apiskeith.top/` returned HTTP 200 HTML, but command-specific routes still require testing.
- Ryzendesu and Siputzx root hosts returned HTML, but command-specific routes still require testing.

## Confirmed or suspicious failures

- `https://cdn.giftedtech.co.ke/api/upload.php` failed DNS resolution.
- `https://ghbcdn.giftedtech.co.ke/api/upload.php` failed DNS resolution.
- `http://numbersapi.com/42` returned an empty reply; the texttools integration should be migrated to HTTPS or replaced.
- `https://search.imdbot.workers.dev/?q=Inception` returned HTTP 500; search2 IMDb commands depend on this host and need a fallback or graceful replacement.
- Google DNS `https://dns.google/resolve?...` timed out in this probe; retest before changing because this may be transient.
- Catbox API root returned HTTP 412 without a multipart request; command-specific upload testing is still required.
- Telegra.ph upload root timed out without a multipart request; command-specific upload testing is still required.
- `api.nexray.web.id` timed out at root; command-specific route needs testing.
- `api.sidycoders.xyz` failed TLS connection at root; command-specific route likely unreliable.
- Hard-coded legacy video fallbacks remain in `kiptenden-plugins/play.js`: GiftedTech, Nexray, Sidycoders, Ryzendesu, Siputzx, and Apiskeith. The audio `.play` path uses local yt-dlp; the `.video` path still uses these remote providers.
- `kiptenden/gmdFunctions3.js` still has dead GiftedTech CDN upload URLs in `uploadToGithubCdn` and `uploadToKiptendenCdn`.
- `kiptenden/gmdFunctions.js` still uses plaintext HTTP `qaz.wtf` for fancy text.
- `kiptenden-plugins/texttools.js` still uses plaintext HTTP `numbersapi.com`.
- `kiptenden-plugins/ultracore.js` still uses plaintext HTTP `ip-api.com`; it responded successfully but should be upgraded to HTTPS if supported.

## Environment observations

- `.env.example` leaves `LEGACY_API_BASE_URL` and `LEGACY_API_KEY` blank.
- Several plugins build URLs from `KiptendenTechApi`; with the blank base these can produce malformed URLs such as `/api/tools/...` unless the plugin checks for a configured base first.
- The latest `.play` audio implementation already uses local yt-dlp/FFmpeg, while `.video` retains external API fallbacks.

## IMDb fallback validation

- IMDb public suggestions endpoint `https://v3.sg.media-imdb.com/suggestion/x/Inception.json` returned HTTP 200 JSON with `d[]` records containing `id`, `l` (title), `y` (year), `q` (type), `s` (cast summary), `rank`, and optional image metadata.
- The same endpoint with `tt1375666` returned HTTP 200 JSON for direct-ID lookup.
- `https://search.imdbot.workers.dev/?q=Inception` and its `?tt=tt1375666` form both returned HTTP 500 and are being removed from active movie/trailer paths.

## Live provider audit summary

The bounded live probe returned HTTP 200 and JSON-shaped responses for Dictionary API, Datamuse, Official Joke API, Useless Facts, ZenQuotes, ExchangeRate API, Meme API, OpenTDB, Advice Slip, ipapi.co, GitHub API, Urban Dictionary, Open-Meteo geocoding and forecast, Bible API, LRCLIB, IMDb suggestions, and ipwho.is. The Google DNS HTTPS endpoint timed out from the sandbox at 20 seconds, so the existing DNS command should retain its existing per-request error handling rather than be treated as a code-confirmed outage. Google Translate loaded successfully as a web page for translation host use.

The previously failing providers confirmed by application-shaped probes were `http://qaz.wtf` (plaintext transport / no response), `search.imdbot.workers.dev` (HTTP 500), `http://numbersapi.com` (TLS/transport failure), `http://ip-api.com` (plaintext transport failure), and the GiftedTech CDN URLs (DNS failure). Active source references to these providers were patched or converted to safe local fallbacks.

Validated replacement URLs: `https://qaz.wtf/u/convert.cgi?text=...`, `https://v3.sg.media-imdb.com/suggestion/x/<query>.json`, `https://ipwho.is/<ip-or-domain>`, and Catbox for the legacy CDN compatibility helpers.
