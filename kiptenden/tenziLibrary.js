const fs = require('fs');
const path = require('path');

const TENZI_DIR = path.join(__dirname, 'tenzi');
let cachedSongs = null;

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseField(lines, label) {
  const line = lines.find(item => item.toLowerCase().startsWith(`${label.toLowerCase()}:`));
  return line ? line.slice(label.length + 1).trim() : '';
}

function parseSongFile(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const number = Number.parseInt(parseField(lines, 'Song Number'), 10);
  const swahiliTitle = parseField(lines, 'Swahili Title');
  const englishTitle = parseField(lines, 'English Title');
  const headerEnd = lines.findIndex(item => /^English Title:/i.test(item));
  const lyrics = lines.slice(headerEnd >= 0 ? headerEnd + 1 : 0)
    .join('\n')
    .replace(/^\s*\n+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    number,
    swahiliTitle,
    englishTitle,
    lyrics,
    searchText: normalizeSearch(`${number} ${swahiliTitle} ${englishTitle}`),
  };
}

function getAllTenzi() {
  if (cachedSongs) return cachedSongs;
  const files = fs.readdirSync(TENZI_DIR)
    .filter(file => /^\d+\.txt$/i.test(file))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
  cachedSongs = files
    .map(file => parseSongFile(path.join(TENZI_DIR, file)))
    .filter(song => Number.isInteger(song.number) && song.number > 0)
    .sort((a, b) => a.number - b.number);
  return cachedSongs;
}

function findTenzi(query) {
  const raw = String(query || '').trim();
  if (!raw) return null;
  const number = Number.parseInt(raw.replace(/^#/, ''), 10);
  if (/^#?\d+$/.test(raw)) {
    return getAllTenzi().find(song => song.number === number) || null;
  }
  const needle = normalizeSearch(raw);
  return getAllTenzi().find(song =>
    normalizeSearch(song.swahiliTitle) === needle || normalizeSearch(song.englishTitle) === needle,
  ) || null;
}

function searchTenzi(query, limit = 10) {
  const needle = normalizeSearch(query);
  if (!needle) return [];
  const words = needle.split(' ').filter(Boolean);
  return getAllTenzi()
    .map(song => {
      const exact = song.searchText === needle ? 100 : 0;
      const starts = song.searchText.startsWith(needle) ? 30 : 0;
      const matches = words.filter(word => song.searchText.includes(word)).length;
      return { song, score: exact + starts + matches * 10 };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.song.number - b.song.number)
    .slice(0, limit)
    .map(item => item.song);
}

function getRandomTenzi() {
  const songs = getAllTenzi();
  return songs[Math.floor(Math.random() * songs.length)] || null;
}

function formatTenziSong(song, botName = 'KIPTENDEN YOUTHS') {
  let output = `*${botName} TENZI ZA ROHONI*\n\n`;
  output += `🎵 *Wimbo #${song.number}*\n`;
  output += `🇹🇿 *Kiswahili:* ${song.swahiliTitle || '—'}\n`;
  if (song.englishTitle) output += `🌍 *English:* ${song.englishTitle}\n`;
  output += `\n${song.lyrics || '_Lyrics were not included in the supplied source for this song._'}`;
  return output.trim();
}

function splitTenziText(text, maxLength = 3500) {
  const value = String(text || '').trim();
  if (!value) return [];
  const chunks = [];
  let remaining = value;
  while (remaining.length > maxLength) {
    let cut = remaining.lastIndexOf('\n', maxLength);
    if (cut < Math.floor(maxLength * 0.55)) cut = remaining.lastIndexOf(' ', maxLength);
    if (cut < 1) cut = maxLength;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

module.exports = {
  getAllTenzi,
  findTenzi,
  searchTenzi,
  getRandomTenzi,
  formatTenziSong,
  splitTenziText,
  normalizeSearch,
};
