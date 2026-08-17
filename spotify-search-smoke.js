const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, 'kiptenden-plugins', 'search2.js');
const source = fs.readFileSync(sourcePath, 'utf8');

if (source.includes('`${KiptendenTechApi}/api/search/spotifysearch')) {
  throw new Error('Spotify search still constructs a relative URL from KiptendenTechApi');
}
for (const required of [
  "https://api.deezer.com/search",
  'isAbsoluteHttpUrl',
  'spotifysearch_dl_',
  '${botPrefix}play',
]) {
  if (!source.includes(required)) throw new Error(`Spotify fallback assertion missing: ${required}`);
}

(async () => {
  const response = await fetch('https://api.deezer.com/search?q=fainali&limit=5', {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Deezer returned HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload?.data) || payload.data.length === 0) {
    throw new Error('Deezer returned no search results');
  }
  const first = payload.data[0];
  if (!first.title || !first.artist?.name || !/^https?:\/\//.test(first.link || '')) {
    throw new Error('Deezer result schema is incomplete');
  }
  console.log('SPOTIFY SEARCH SMOKE PASS');
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
