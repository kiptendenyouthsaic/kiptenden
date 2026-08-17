const fs = require('fs');
const path = require('path');

const root = __dirname;
const sourceFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) sourceFiles.push(full);
  }
}
walk(root);
const source = sourceFiles
  .filter(file => path.resolve(file) !== path.resolve(__filename))
  .map(file => fs.readFileSync(file, 'utf8'))
  .join('\n');
for (const forbidden of [
  'giftedtech',
  'search.imdbot.workers.dev',
  'numbersapi.com',
  'http://ip-api.com',
  'http://qaz.wtf',
]) {
  if (source.toLowerCase().includes(forbidden.toLowerCase())) {
    throw new Error(`Legacy provider remains in source: ${forbidden}`);
  }
}

async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

(async () => {
  const [imdb, ip] = await Promise.all([
    json('https://v3.sg.media-imdb.com/suggestion/x/Inception.json'),
    json('https://ipwho.is/8.8.8.8'),
  ]);
  if (!Array.isArray(imdb?.d) || !imdb.d.some(item => item.id === 'tt1375666')) {
    throw new Error('IMDb suggestion schema check failed');
  }
  if (ip?.success !== true || ip.ip !== '8.8.8.8' || !ip.connection) {
    throw new Error('ipwho.is schema check failed');
  }
  console.log('API INTEGRATION SMOKE PASS');
})().catch(error => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
