
const { gmd } = require("../kiptenden"),
  axios = require("axios"),
  {
    generateWAMessageContent,
    generateWAMessageFromContent,
  } = require("@whiskeysockets/baileys"),
  { sendButtons } = require("gifted-btns");

function extractButtonId(msg) {
    if (!msg) return null;
    if (msg.templateButtonReplyMessage?.selectedId)
        return msg.templateButtonReplyMessage.selectedId;
    if (msg.buttonsResponseMessage?.selectedButtonId)
        return msg.buttonsResponseMessage.selectedButtonId;
    if (msg.listResponseMessage?.singleSelectReply?.selectedRowId)
        return msg.listResponseMessage.singleSelectReply.selectedRowId;
    if (msg.interactiveResponseMessage) {
        const nf = msg.interactiveResponseMessage.nativeFlowResponseMessage;
        if (nf?.paramsJson) {
            try { const p = JSON.parse(nf.paramsJson); if (p.id) return p.id; } catch {}
        }
        return msg.interactiveResponseMessage.buttonId || null;
    }
    return null;
}

function isAbsoluteHttpUrl(value) {
    try {
        const url = new URL(String(value || '').trim());
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function formatTrackDuration(seconds) {
    const total = Number(seconds) || 0;
    const minutes = Math.floor(total / 60);
    const remainder = String(Math.floor(total % 60)).padStart(2, '0');
    return `${minutes}:${remainder}`;
}

function normalizeSpotifyProviderResults(data) {
    const rows = Array.isArray(data?.results)
        ? data.results
        : Array.isArray(data?.data?.results)
            ? data.data.results
            : [];
    return rows.map(track => ({
        title: track.title || track.name || 'Unknown track',
        artist: track.artist || track.artist_name || track.artists?.map?.(item => item.name || item).join(', ') || 'Unknown artist',
        duration: track.duration || track.duration_text || 'Unknown',
        url: track.url || track.link || track.external_urls?.spotify || '',
        preview: track.preview || '',
        thumbnail: track.thumbnail || track.image || track.album?.images?.[0]?.url || '',
    })).filter(track => track.title);
}

async function searchSpotifyLikeTracks(query, configuredBase, apiKey) {
    const base = String(configuredBase || '').trim().replace(/\/+$/, '');
    if (base && isAbsoluteHttpUrl(base)) {
        try {
            const apiUrl = new URL('/api/search/spotifysearch', `${base}/`);
            if (apiKey) apiUrl.searchParams.set('apikey', apiKey);
            apiUrl.searchParams.set('query', query);
            const res = await axios.get(apiUrl.toString(), { timeout: 20000 });
            const tracks = normalizeSpotifyProviderResults(res.data);
            if (tracks.length) return { tracks, provider: 'configured Spotify provider' };
        } catch (error) {
            console.warn('[SPOTIFYSEARCH] Configured provider unavailable:', error.message);
        }
    }

    const res = await axios.get('https://api.deezer.com/search', {
        params: { q: query, limit: 5 },
        timeout: 20000,
        headers: { 'User-Agent': 'Kiptenden Youths Bot/1.0' },
    });
    const tracks = Array.isArray(res.data?.data)
        ? res.data.data.map(track => ({
            title: track.title || 'Unknown track',
            artist: track.artist?.name || 'Unknown artist',
            duration: formatTrackDuration(track.duration),
            url: track.link || '',
            preview: track.preview || '',
            thumbnail: track.album?.cover_medium || '',
        })).filter(track => track.title && isAbsoluteHttpUrl(track.url))
        : [];
    return { tracks, provider: 'Deezer public search fallback' };
}


gmd(
  {
    pattern: "ggleimage",
    aliases: ["googleimage", "gimage", "ggleimagesearch", "googleimagesearch"],
    category: "search",
    react: "🖼️",
    description: "Search Google Images and send first 10 images",
  },
  async (from, Kiptenden, conText) => {
    const { q, mek, reply, react, botFooter, KiptendenTechApi, KiptendenApiKey } =
      conText;

    if (!q) {
      await react("❌");
      return reply("Please provide a search query for images");
    }

    try {
      const apiUrl = `${KiptendenTechApi}/api/search/googleimage?apikey=${KiptendenApiKey}&query=${encodeURIComponent(q)}`;
      const res = await axios.get(apiUrl, { timeout: 60000 });

      if (
        !res.data?.success ||
        !res.data?.results ||
        res.data.results.length === 0
      ) {
        await react("❌");
        return reply("No images found. Please try a different query.");
      }

      const images = res.data.results.slice(0, 10);

      await reply(`Found ${images.length} images for: *${q}*\nSending...`);

      for (let i = 0; i < images.length; i++) {
        try {
          await Kiptenden.sendMessage(
            from,
            {
              image: { url: images[i] },
              caption: `🖼️ Image ${i + 1}/${images.length}\n\n> *${botFooter}*`,
            },
            { quoted: mek },
          );
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (imgErr) {
          console.error("Error sending image:", imgErr.message);
        }
      }

      await react("✅");
    } catch (error) {
      console.error("Google image search error:", error);
      await react("❌");
      return reply("Failed to search images. Please try again.");
    }
  },
);

gmd(
  {
    pattern: "unsplash",
    aliases: ["unsplashphotos", "unsplashsearch"],
    category: "search",
    react: "📷",
    description: "Search Unsplash and send first 10 photos",
  },
  async (from, Kiptenden, conText) => {
    const { q, mek, reply, react, botFooter, KiptendenTechApi, KiptendenApiKey } =
      conText;

    if (!q) {
      await react("❌");
      return reply("Please provide a search query for photos");
    }

    try {
      const apiUrl = `${KiptendenTechApi}/api/search/unsplash?apikey=${KiptendenApiKey}&query=${encodeURIComponent(q)}`;
      const res = await axios.get(apiUrl, { timeout: 60000 });

      if (
        !res.data?.success ||
        !res.data?.results ||
        res.data.results.length === 0
      ) {
        await react("❌");
        return reply("No photos found. Please try a different query.");
      }

      const photos = res.data.results.slice(0, 10);

      await reply(
        `Found ${photos.length} Unsplash photos for: *${q}*\nSending...`,
      );

      for (let i = 0; i < photos.length; i++) {
        try {
          await Kiptenden.sendMessage(
            from,
            {
              image: { url: photos[i] },
              caption: `📷 Unsplash Photo ${i + 1}/${photos.length}\n\n> *${botFooter}*`,
            },
            { quoted: mek },
          );
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (imgErr) {
          console.error("Error sending Unsplash photo:", imgErr.message);
        }
      }

      await react("✅");
    } catch (error) {
      console.error("Unsplash search error:", error);
      await react("❌");
      return reply("Failed to search Unsplash. Please try again.");
    }
  },
);

gmd(
  {
    pattern: "wallpapers",
    aliases: [
      "wallpaper",
      "hdwallpaper",
      "hdwallpapers",
      "getwallpapers",
      "randomwallpapers",
    ],
    category: "search",
    react: "🖼️",
    description: "Search HD wallpapers by category",
  },
  async (from, Kiptenden, conText) => {
    const { q, mek, reply, react, botFooter, KiptendenTechApi, KiptendenApiKey } =
      conText;

    if (!q) {
      await react("❌");
      return reply("Please provide a wallpaper category or search query");
    }

    try {
      const apiUrl = `${KiptendenTechApi}/api/search/wallpaper?apikey=${KiptendenApiKey}&query=${encodeURIComponent(q)}`;
      const res = await axios.get(apiUrl, { timeout: 60000 });

      if (
        !res.data?.success ||
        !res.data?.results ||
        res.data.results.length === 0
      ) {
        await react("❌");
        return reply("No wallpapers found. Please try a different query.");
      }

      const wallpapers = res.data.results.slice(0, 10);

      await reply(
        `Found ${wallpapers.length} wallpapers for: *${q}*\nSending...`,
      );

      for (let i = 0; i < wallpapers.length; i++) {
        try {
          const wp = wallpapers[i];
          const imageUrl = Array.isArray(wp.image) ? wp.image[0] : wp.image;

          await Kiptenden.sendMessage(
            from,
            {
              image: { url: imageUrl },
              caption: `🖼️ *Wallpaper ${i + 1}/${wallpapers.length}*\n📂 Category: ${wp.type || "Unknown"}\n\n> *${botFooter}*`,
            },
            { quoted: mek },
          );
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (wpErr) {
          console.error("Error sending wallpaper:", wpErr.message);
        }
      }

      await react("✅");
    } catch (error) {
      console.error("Wallpaper search error:", error);
      await react("❌");
      return reply("Failed to search wallpapers. Please try again.");
    }
  },
);

gmd(
  {
    pattern: "weather",
    aliases: ["getweather", "clima"],
    category: "search",
    react: "🌤️",
    description: "Get weather information for a location",
  },
  async (from, Kiptenden, conText) => {
    const {
      q,
      mek,
      reply,
      react,
      botName,
      botFooter,
      KiptendenTechApi,
      KiptendenApiKey,
    } = conText;

    if (!q) {
      await react("❌");
      return reply("Please provide a location name");
    }

    try {
      const apiUrl = `${KiptendenTechApi}/api/search/weather?apikey=${KiptendenApiKey}&location=${encodeURIComponent(q)}`;
      const res = await axios.get(apiUrl, { timeout: 60000 });

      if (!res.data?.success || !res.data?.result) {
        await react("❌");
        return reply(
          "Could not get weather for that location. Please try a different location.",
        );
      }

      const w = res.data.result;
      const weatherIcons = {
        Clear: "☀️",
        Clouds: "☁️",
        Rain: "🌧️",
        Drizzle: "🌦️",
        Thunderstorm: "⛈️",
        Snow: "❄️",
        Mist: "🌫️",
        Fog: "🌫️",
        Haze: "🌫️",
      };

      const icon = weatherIcons[w.weather?.main] || "🌡️";

      let txt = `*${botName} 𝐖𝐄𝐀𝐓𝐇𝐄𝐑*\n\n`;
      txt += `${icon} *Location:* ${w.location}, ${w.sys?.country || ""}\n\n`;
      txt += `🌡️ *Temperature:* ${w.main?.temp}°C\n`;
      txt += `🤒 *Feels Like:* ${w.main?.feels_like}°C\n`;
      txt += `📉 *Min Temp:* ${w.main?.temp_min}°C\n`;
      txt += `📈 *Max Temp:* ${w.main?.temp_max}°C\n\n`;
      txt += `☁️ *Weather:* ${w.weather?.main} (${w.weather?.description})\n`;
      txt += `💧 *Humidity:* ${w.main?.humidity}%\n`;
      txt += `🌬️ *Wind Speed:* ${w.wind?.speed} m/s\n`;
      txt += `👁️ *Visibility:* ${w.visibility / 1000} km\n`;
      txt += `🔘 *Pressure:* ${w.main?.pressure} hPa\n\n`;
      txt += `> *${botFooter}*`;

      await reply(txt);
      await react("✅");
    } catch (error) {
      console.error("Weather search error:", error);
      await react("❌");
      return reply("Failed to get weather data. Please try again.");
    }
  },
);

gmd(
  {
    pattern: "npm",
    aliases: ["npmsearch", "npmpack", "npmpackage"],
    category: "search",
    react: "📦",
    description: "Search NPM packages",
  },
  async (from, Kiptenden, conText) => {
    const {
      q,
      mek,
      reply,
      react,
      botName,
      botFooter,
      KiptendenTechApi,
      KiptendenApiKey,
    } = conText;

    if (!q) {
      await react("❌");
      return reply("Please provide a package name");
    }

    try {
      const apiUrl = `${KiptendenTechApi}/api/search/npmsearch?apikey=${KiptendenApiKey}&packagename=${encodeURIComponent(q)}`;
      const res = await axios.get(apiUrl, { timeout: 60000 });

      if (!res.data?.success || !res.data?.result) {
        await react("❌");
        return reply("Package not found. Please check the package name.");
      }

      const pkg = res.data.result;

      let txt = `*${botName} 𝐍𝐏𝐌 𝐏𝐀𝐂𝐊𝐀𝐆𝐄*\n\n`;
      txt += `📦 *Name:* ${pkg.name}\n`;
      txt += `📝 *Description:* ${pkg.description || "No description"}\n`;
      txt += `🏷️ *Version:* ${pkg.version}\n`;
      txt += `📜 *License:* ${pkg.license || "N/A"}\n`;
      txt += `👤 *Owner:* ${pkg.owner || "N/A"}\n`;
      txt += `📅 *Published:* ${pkg.publishedDate || "N/A"}\n`;
      txt += `📅 *Created:* ${pkg.createdDate || "N/A"}\n`;
      txt += `🔗 *Package:* ${pkg.packageLink}\n`;
      if (pkg.homepage) txt += `🏠 *Homepage:* ${pkg.homepage}\n`;
      txt += `\n> *${botFooter}*`;

      if (pkg.downloadLink) {
        const dateNow = Date.now();
        await sendButtons(Kiptenden, from, {
          title: "",
          text: txt,
          footer: botFooter,
          buttons: [
            {
              id: `npm_dl_${dateNow}`,
              text: "📥 Download Package",
            },
          ],
        });

        const handleResponse = async (event) => {
          const messageData = event.messages[0];
          if (!messageData?.message) return;

          const selectedButtonId = extractButtonId(messageData.message);
          if (!selectedButtonId) return;
          if (!selectedButtonId?.includes(`npm_dl_${dateNow}`)) return;

          const isFromSameChat = messageData.key?.remoteJid === from;
          if (!isFromSameChat) return;

          try {
            await Kiptenden.sendMessage(
              from,
              {
                document: { url: pkg.downloadLink },
                fileName: `${pkg.name}-${pkg.version}.tgz`,
                mimetype: "application/gzip",
              },
              { quoted: messageData },
            );
            await react("✅");
          } catch (dlErr) {
            await reply("Failed to download package: " + dlErr.message);
          }

        };

        Kiptenden.ev.on("messages.upsert", handleResponse);
        setTimeout(
          () => Kiptenden.ev.off("messages.upsert", handleResponse),
          300000,
        );
      } else {
        await reply(txt);
      }

      await react("✅");
    } catch (error) {
      console.error("NPM search error:", error);
      await react("❌");
      return reply("Failed to search NPM. Please try again.");
    }
  },
);

gmd(
  {
    pattern: "wattpad",
    aliases: ["watt", "wattsearch", "wattpadsearch"],
    category: "search",
    react: "📚",
    description: "Search Wattpad stories",
  },
  async (from, Kiptenden, conText) => {
    const { q, mek, reply, react, botFooter, KiptendenTechApi, KiptendenApiKey } =
      conText;

    if (!q) {
      await react("❌");
      return reply("Please provide a search query");
    }

    try {
      const apiUrl = `${KiptendenTechApi}/api/search/wattpad?apikey=${KiptendenApiKey}&query=${encodeURIComponent(q)}`;
      const res = await axios.get(apiUrl, { timeout: 60000 });

      if (
        !res.data?.success ||
        !res.data?.results ||
        res.data.results.length === 0
      ) {
        await react("❌");
        return reply("No stories found. Please try a different query.");
      }

      const stories = res.data.results.slice(0, 5);

      const cards = await Promise.all(
        stories.map(async (story) => ({
          header: {
            title: `📚 *${story.tittle}*`,
            hasMediaAttachment: true,
            imageMessage: (
              await generateWAMessageContent(
                { image: { url: story.thumbnail } },
                {
                  upload: Kiptenden.waUploadToServer,
                },
              )
            ).imageMessage,
          },
          body: {
            text: `👁️ Reads: ${story.reads}\n❤️ Likes: ${story.likes}`,
          },
          footer: { text: `> *${botFooter}*` },
          nativeFlowMessage: {
            buttons: [
              {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                  display_text: "Read Story",
                  url: story.link,
                }),
              },
            ],
          },
        })),
      );

      const message = generateWAMessageFromContent(
        from,
        {
          viewOnceMessage: {
            message: {
              messageContextInfo: {
                deviceListMetadata: {},
                deviceListMetadataVersion: 2,
              },
              interactiveMessage: {
                body: { text: `📚 Wattpad Results for: *${q}*` },
                footer: {
                  text: `📂 Displaying first *${stories.length}* stories`,
                },
                carouselMessage: { cards },
              },
            },
          },
        },
        { quoted: mek },
      );

      await Kiptenden.relayMessage(from, message.message, {
        messageId: message.key.id,
      });
      await react("✅");
    } catch (error) {
      console.error("Wattpad search error:", error);
      await react("❌");
      return reply("Failed to search Wattpad. Please try again.");
    }
  },
);

gmd(
  {
    pattern: "spotifysearch",
    aliases: ["spotisearch"],
    category: "search",
    react: "🎵",
    description: "Search Spotify for tracks",
  },
  async (from, Kiptenden, conText) => {
    const {
      q,
      mek,
      reply,
      react,
      botName,
      botFooter,
      botPrefix,
      KiptendenTechApi,
      KiptendenApiKey,
    } = conText;

    if (!q) {
      await react("❌");
      return reply("Please provide a song or artist name to search");
    }

    try {
      const { tracks, provider } = await searchSpotifyLikeTracks(q.trim(), KiptendenTechApi, KiptendenApiKey);
      if (!tracks.length) {
        await react("❌");
        return reply("No tracks found. Please try a different query.");
      }

      const dateNow = Date.now();

      let txt = `*${botName} 𝐒𝐏𝐎𝐓𝐈𝐅𝐘 𝐒𝐄𝐀𝐑𝐂𝐇*\n\n`;
      txt += `🔍 *Query:* ${q}\n`;
      txt += `📡 *Source:* ${provider}\n\n`;

      tracks.forEach((track, i) => {
        txt += `*${i + 1}. ${track.title}*\n`;
        txt += `🎤 Artist: ${track.artist}\n`;
        txt += `⏱️ Duration: ${track.duration}\n\n`;
      });

      const buttons = tracks.map((track, i) => ({
        id: `spotifysearch_dl_${dateNow}_${i}`,
        text: `${i + 1}. ${track.title.substring(0, 30)}`,
      }));

      await sendButtons(Kiptenden, from, {
        title: "",
        text: txt,
        footer: botFooter,
        buttons: buttons,
      });

      const handleResponse = async (event) => {
        const messageData = event.messages[0];
        if (!messageData?.message) return;

        const selectedButtonId = extractButtonId(messageData.message);
        if (!selectedButtonId) return;
        if (!selectedButtonId?.includes(`spotifysearch_dl_${dateNow}`)) return;

        const isFromSameChat = messageData.key?.remoteJid === from;
        if (!isFromSameChat) return;

        const trackIndex = Number(selectedButtonId.split("_").pop());
        const selectedTrack = tracks[trackIndex];

        if (selectedTrack) {
          const searchText = `${botPrefix}play ${selectedTrack.title} ${selectedTrack.artist}`.trim();
          await Kiptenden.sendMessage(
            from,
            { text: searchText },
            { quoted: messageData },
          );
        }
      };

      Kiptenden.ev.on("messages.upsert", handleResponse);
      setTimeout(
        () => Kiptenden.ev.off("messages.upsert", handleResponse),
        300000,
      );
      await react("✅");
    } catch (error) {
      console.error("Spotify search error:", error);
      await react("❌");
      return reply("Failed to search Spotify. Please try again.");
    }
  },
);

// ─── MOVIE / SERIES SEARCH ───────────────────────────────────────────────────

async function fetchImdbSuggestions(query) {
    const url = `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(String(query || '').trim())}.json`;
    const res = await axios.get(url, {
        timeout: 20000,
        headers: { 'User-Agent': 'Kiptenden Youths Bot/1.0' },
    });
    return Array.isArray(res.data?.d) ? res.data.d : [];
}

function buildFooterS2(botFooter, botName) {
    if (botFooter && botName) return `\n\n> _${botName}_`;
    if (botName) return `\n\n> _${botName}_`;
    return '';
}

gmd(
    {
        pattern: "movie",
        aliases: ["film", "imdb", "movieinfo", "findmovie"],
        react: "🎬",
        description: "Search for a movie or series on IMDB. Usage: .movie <title>",
        category: "search",
    },
    async (from, Kiptenden, conText) => {
        const { reply, react, q, mek, botFooter, botName } = conText;
        const footer = buildFooterS2(botFooter, botName);

        if (!q || !q.trim()) {
            return reply(
`┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  🎬  *MOVIE / SERIES SEARCH*
┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━┃
┃  *Usage:*
┃  .movie <title>
┃
┃  *Examples:*
┃  .movie Avengers
┃  .movie Breaking Bad
┃  .movie The Batman 2022
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛${footer}`
            );
        }

        try {
            if (react) await react("🔍");

            const results = (await fetchImdbSuggestions(q.trim())).slice(0, 5);

            if (!results.length) {
                if (react) await react("❌");
                return reply(`❌ No results found for *${q.trim()}*.\n\nTry a different title.${footer}`);
            }
            let msg =
`┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  🎬  *IMDB SEARCH RESULTS*
┃  Query: _${q.trim()}_
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n`;

            results.forEach((item, i) => {
                const title  = item.l || 'Unknown';
                const year   = item.y || '';
                const type   = item.q || '';
                const imdbId = item.id || '';
                const rank   = item.rank || '';
                const actors = item.s || '';
                const typeEmoji = type === 'feature' ? '🎬' : type.includes('tv') ? '📺' : '🎥';
                msg += `*${i + 1}. ${title}* ${year ? `(${year})` : ''} ${typeEmoji}\n`;
                if (actors) msg += `   👥 _${actors.split(',').slice(0, 2).join(', ')}_\n`;
                if (rank)   msg += `   ⭐ IMDB Rank: ${rank}\n`;
                if (imdbId) msg += `   🔗 .movieinfo ${imdbId}\n`;
                msg += '\n';
            });

            msg += `_Use *.movieinfo <imdb-id>* for full details_${footer}`;

            if (react) await react("✅");
            await reply(msg);

        } catch (err) {
            if (react) await react("❌");
            await reply(`❌ Search failed: ${err.message}\n\nTry again shortly.${footer}`);
        }
    }
);

gmd(
    {
        pattern: "movieinfo",
        aliases: ["filminfo", "imdbinfo", "seriesinfo"],
        react: "🎬",
        description: "Get full IMDB details for a movie/series. Usage: .movieinfo <imdb-id>",
        category: "search",
    },
    async (from, Kiptenden, conText) => {
        const { reply, react, q, mek, botFooter, botName } = conText;
        const footer = buildFooterS2(botFooter, botName);

        if (!q || !q.trim()) {
            return reply(`❌ Provide an IMDB ID!\n\nExample: *.movieinfo tt4154796*\n\n_Get IDs from *.movie <title>*_${footer}`);
        }

        try {
            if (react) await react("🔍");

            const imdbId = q.trim().replace(/[^a-zA-Z0-9]/g, '');
            const results = await fetchImdbSuggestions(imdbId);
            const item = results.find(entry => entry.id === imdbId) || results[0];
            if (!item) {
                if (react) await react("❌");
                return reply(`❌ No details found for *${imdbId}*.\n\nMake sure the IMDB ID is correct.${footer}`);
            }

            const title    = item.l || 'Unknown';
            const year     = item.y || '';
            const genre    = item.q || '';
            const rating   = 'N/A';
            const rCount   = '';
            const duration = '';
            const lang     = '';
            const country  = '';
            const desc     = '';
            const actors   = item.s || '';
            const director = '';
            const trailer  = '';
            const imdbLink = `https://www.imdb.com/title/${imdbId}/`;
            const poster   = item.i?.imageUrl || '';

            let info =
`┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  🎬  *${title}* ${year ? `(${year})` : ''}
┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━┃
`;
            if (genre)    info += `┃  🎭 Genre    : ${genre}\n`;
            if (duration) info += `┃  ⏱️  Duration : ${duration}\n`;
            if (rating !== 'N/A') info += `┃  ⭐ Rating   : ${rating}/10 ${rCount}\n`;
            if (lang)     info += `┃  🌐 Language : ${lang}\n`;
            if (country)  info += `┃  🗺️  Country  : ${country}\n`;
            if (director) info += `┃  🎥 Director : ${director}\n`;
            if (actors)   info += `┃  👥 Cast     : ${actors}\n`;
            info += `┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━┃\n`;
            if (desc)     info += `┃  📝 _${desc}_\n┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━┃\n`;
            if (trailer)  info += `┃  🎞️ Trailer  : ${trailer}\n`;
            info += `┃  🔗 IMDB     : ${imdbLink}\n`;
            info += `┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛${footer}`;

            if (react) await react("✅");

            if (poster && poster.startsWith('http')) {
                try {
                    const imgBuf = await axios.get(poster, { responseType: 'arraybuffer', timeout: 15000 });
                    await Kiptenden.sendMessage(from, {
                        image: Buffer.from(imgBuf.data),
                        caption: info,
                    }, { quoted: mek });
                    return;
                } catch {}
            }
            await reply(info);

        } catch (err) {
            if (react) await react("❌");
            await reply(`❌ Failed to fetch info: ${err.message}${footer}`);
        }
    }
);

gmd(
    {
        pattern: "trailer",
        aliases: ["movietrailer", "seriestrailer", "findtrailer"],
        react: "🎞️",
        description: "Find a movie or series trailer. Usage: .trailer <title>",
        category: "search",
    },
    async (from, Kiptenden, conText) => {
        const { reply, react, q, mek, botFooter, botName } = conText;
        const footer = buildFooterS2(botFooter, botName);

        if (!q || !q.trim()) {
            return reply(`❌ Provide a title!\n\nExample: *.trailer Avengers Endgame*${footer}`);
        }

        try {
            if (react) await react("🔍");

            const first  = (await fetchImdbSuggestions(`${q.trim()} trailer`))[0];
            const imdbId = first?.id;
            const title  = first?.l || q.trim();
            const year   = first?.y || '';

            // Build YouTube search link (always works)
            const ytQuery = encodeURIComponent(`${q.trim()} official trailer`);
            const ytLink  = `https://www.youtube.com/results?search_query=${ytQuery}`;

            // The old IMDbOT worker exposed trailer URLs but is no longer
            // reachable. Always provide the official YouTube search link.
            const trailerUrl = '';

            if (react) await react("✅");

            const msg =
`┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  🎞️  *TRAILER FINDER*
┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━┃
┃  🎬 _${title}_ ${year ? `(${year})` : ''}
┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━┃
${trailerUrl ? `┃  🎥 IMDB Trailer:\n┃  ${trailerUrl}\n┃\n` : ''}┃  ▶️ YouTube Search:\n┃  ${ytLink}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛${footer}`;

            await reply(msg);

        } catch (err) {
            if (react) await react("❌");
            const ytQuery = encodeURIComponent(`${q.trim()} official trailer`);
            await reply(`🎞️ *Trailer for:* ${q.trim()}\n\n▶️ https://www.youtube.com/results?search_query=${ytQuery}${footer}`);
        }
    }
);
