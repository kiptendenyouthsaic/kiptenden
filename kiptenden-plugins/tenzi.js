const { gmd } = require('../kiptenden');
const {
  getAllTenzi,
  findTenzi,
  searchTenzi,
  getRandomTenzi,
  formatTenziSong,
  splitTenziText,
} = require('../kiptenden/tenziLibrary');

async function sendTenziSong(reply, react, song, botName) {
  const chunks = splitTenziText(formatTenziSong(song, botName));
  for (const chunk of chunks) await reply(chunk);
  await react('✅');
}

function formatSearchResults(results, page = '') {
  let output = `*TENZI ZA ROHONI SEARCH*\n\n`;
  if (page) output += `🔍 *Search:* ${page}\n\n`;
  output += results.map(song => {
    const english = song.englishTitle ? ` — ${song.englishTitle}` : '';
    return `*${song.number}.* ${song.swahiliTitle || 'Untitled'}${english}`;
  }).join('\n');
  output += '\n\nUse *.tenzi <number>* to read a complete song.';
  return output;
}

function formatIndexPage(songs, page, totalPages) {
  let output = `*TENZI ZA ROHONI INDEX*\n\n`;
  output += `Page *${page}/${totalPages}* · ${getAllTenzi().length} songs\n\n`;
  output += songs.map(song => {
    const english = song.englishTitle ? ` — ${song.englishTitle}` : '';
    return `*${song.number}.* ${song.swahiliTitle || 'Untitled'}${english}`;
  }).join('\n');
  if (page < totalPages) output += `\n\nNext page: *.tenzilist ${page + 1}*`;
  return output;
}

gmd(
  {
    pattern: 'tenzi',
    aliases: ['hymn', 'hymnbook', 'tenzirohoni'],
    category: 'religion',
    react: '🎶',
    description: 'Read Tenzi za Rohoni songs by number or title',
  },
  async (from, Kiptenden, conText) => {
    const { q, reply, react, botName } = conText;
    const query = q?.trim();
    if (!query) {
      await react('❌');
      return reply(
        `*TENZI ZA ROHONI*\n\n` +
        `Use *.tenzi <number>* or *.tenzi <title>*.\n` +
        `Examples:\n` +
        `• .tenzi 1\n` +
        `• .tenzi Mwokozi umeokoa\n` +
        `• .tenzilist\n` +
        `• .tenzirandom`,
      );
    }

    await react('⏳');
    const exact = findTenzi(query);
    if (exact) return sendTenziSong(reply, react, exact, botName);

    const results = searchTenzi(query, 10);
    if (!results.length) {
      await react('❌');
      return reply(`No Tenzi song matched *${query}*. Try a song number, title, or *.tenzilist*.`);
    }
    await react('✅');
    return reply(formatSearchResults(results, query));
  },
);

gmd(
  {
    pattern: 'tenzilist',
    aliases: ['tenziindex', 'hymnlist'],
    category: 'religion',
    react: '📚',
    description: 'List Tenzi za Rohoni songs',
  },
  async (from, Kiptenden, conText) => {
    const { q, reply, react } = conText;
    const allSongs = getAllTenzi();
    const requestedPage = Number.parseInt(q?.trim() || '1', 10);
    const pageSize = 20;
    const totalPages = Math.max(1, Math.ceil(allSongs.length / pageSize));
    const page = Number.isInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, totalPages)
      : 1;
    const start = (page - 1) * pageSize;
    await react('✅');
    return reply(formatIndexPage(allSongs.slice(start, start + pageSize), page, totalPages));
  },
);

gmd(
  {
    pattern: 'tenzirandom',
    aliases: ['randomtenzi', 'randomhymn'],
    category: 'religion',
    react: '🎲',
    description: 'Read a random Tenzi za Rohoni song',
  },
  async (from, Kiptenden, conText) => {
    const { reply, react, botName } = conText;
    const song = getRandomTenzi();
    if (!song) {
      await react('❌');
      return reply('Tenzi songs are not available right now.');
    }
    await react('⏳');
    return sendTenziSong(reply, react, song, botName);
  },
);

module.exports = { formatSearchResults, formatIndexPage, sendTenziSong };
