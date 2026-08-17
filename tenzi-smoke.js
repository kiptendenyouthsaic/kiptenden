const assert = require('assert');
const {
  getAllTenzi,
  findTenzi,
  searchTenzi,
  getRandomTenzi,
  formatTenziSong,
  splitTenziText,
} = require('./kiptenden/tenziLibrary');
const fs = require('fs');
const tenziPluginSource = fs.readFileSync('./kiptenden-plugins/tenzi.js', 'utf8');

const songs = getAllTenzi();
assert.strictEqual(songs.length, 161, 'Expected all 161 Tenzi songs');
assert.strictEqual(songs[0].number, 1, 'First song should be number 1');
assert.strictEqual(songs[songs.length - 1].number, 161, 'Last song should be number 161');
assert.ok(songs.every(song => song.swahiliTitle), 'Every song should contain a Swahili title');
assert.strictEqual(songs.find(song => song.number === 51).lyrics, '', 'Song 51 should preserve its supplied title-only source');

const first = findTenzi('1');
assert.strictEqual(first.swahiliTitle, 'Mwokozi umeokoa');
assert.strictEqual(findTenzi('Mwokozi umeokoa').number, 1);
assert.strictEqual(findTenzi('Precious Saviour').number, 1);
assert.ok(searchTenzi('mwokozi').some(song => song.number === 1));
assert.ok(searchTenzi('mungu').length > 0);
assert.ok(getRandomTenzi()?.number >= 1 && getRandomTenzi()?.number <= 161);

const rendered = formatTenziSong(first, 'KIPTENDEN YOUTHS');
assert.ok(rendered.includes('TENZI ZA ROHONI'));
assert.ok(rendered.includes('Mwokozi umeokoa'));
assert.ok(rendered.includes('Mwokozi umeokoa,'));
assert.ok(formatTenziSong(songs.find(song => song.number === 51), 'KIPTENDEN YOUTHS').includes('Lyrics were not included'));
assert.ok(tenziPluginSource.includes("pattern: 'tenzi'"));
assert.ok(tenziPluginSource.includes("pattern: 'tenzilist'"));
assert.ok(tenziPluginSource.includes("pattern: 'tenzirandom'"));
assert.ok(tenziPluginSource.includes('formatSearchResults'));
assert.ok(tenziPluginSource.includes('formatIndexPage'));

const longText = Array.from({ length: 800 }, (_, i) => `Mstari ${i + 1}`).join('\n');
const chunks = splitTenziText(longText, 350);
assert.ok(chunks.length > 1);
assert.strictEqual(chunks.join('\n'), longText);
assert.ok(chunks.every(chunk => chunk.length <= 350));

console.log('TENZI SMOKE PASS: 161 SONGS');
