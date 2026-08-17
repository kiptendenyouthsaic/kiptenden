const { gmd, gmdSticker } = require("../kiptenden"),
  fs = require("fs").promises,
  fss = require("fs"),
  os = require("os"),
  path = require("path"),
  { execSync } = require("child_process"),
  ffmpeg = require("fluent-ffmpeg"),
  axios = require("axios"),
  stream = require("stream"),
  { promisify } = require("util"),
  pipeline = promisify(stream.pipeline),
  {
    generateWAMessageContent,
    generateWAMessageFromContent,
  } = require("@whiskeysockets/baileys"),
  { sendButtons } = require("gifted-btns"),
  { StickerTypes } = require("wa-sticker-formatter");

// Resolve ffmpeg binary: prefer ffmpeg-static, fall back to system ffmpeg
let _srchFfmpegBin;
try {
  const sp = require("ffmpeg-static");
  _srchFfmpegBin = (sp && fss.existsSync(sp)) ? sp : execSync("which ffmpeg").toString().trim();
} catch (_) {
  try { _srchFfmpegBin = execSync("which ffmpeg").toString().trim(); } catch (__) { _srchFfmpegBin = "ffmpeg"; }
}
ffmpeg.setFfmpegPath(_srchFfmpegBin);

gmd(
  {
    pattern: "yts",
    aliases: ["yt-search"],
    category: "search",
    react: "🔍",
    description: "perform youtube search",
  },
  async (from, Kiptenden, conText) => {
    const { q, mek, reply, react, sender, botFooter, gmdBuffer, KiptendenTechApi, KiptendenApiKey } = conText;

    if (!q) {
      await react("❌");
      return reply("Please provide a search query");
    }

    try {
      const apiUrl = `${KiptendenTechApi}/api/search/youtube?apikey=${KiptendenApiKey}&q=${encodeURIComponent(q)}`;
      const res = await axios.get(apiUrl, { timeout: 30000 });
      const results = res.data?.videos;

      if (!Array.isArray(results) || results.length === 0) return;

      const videos = results.slice(0, 5);
      const cards = await Promise.all(
        videos.map(async (vid, i) => ({
          header: {
            title: `🎬 *${vid.name}*`,
            hasMediaAttachment: true,
            imageMessage: (
              await generateWAMessageContent(
                { image: { url: vid.thumbnail } },
                {
                  upload: Kiptenden.waUploadToServer,
                },
              )
            ).imageMessage,
          },
          body: {
            text: `📺 Duration: ${vid.duration}\n👁️ Views: ${vid.views}${vid.published ? `\n📅 Published: ${vid.published}` : ""}`,
          },
          footer: { text: `> *${botFooter}*` },
          nativeFlowMessage: {
            buttons: [
              {
                name: "cta_copy",
                buttonParamsJson: JSON.stringify({
                  display_text: "Copy Link",
                  copy_code: vid.url,
                }),
              },
              {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                  display_text: "Watch on YouTube",
                  url: vid.url,
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
                body: { text: `🔍 YouTube Results for: *${q}*` },
                footer: {
                  text: `📂 Displaying first *${videos.length}* videos`,
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
      console.error("Error during search process:", error);
      await react("❌");
      return reply("Oops! Something went wrong. Please try again.");
    }
  },
);

gmd(
  {
    pattern: "shazam",
    aliases: ["whatmusic", "whatsong", "identify", "accr"],
    category: "search",
    react: "🙄",
    description: "Identify music from audio or video messages",
  },
  async (from, Kiptenden, conText) => {
    const {
      mek,
      q,
      reply,
      react,
      botPic,
      botPrefix,
      quoted,
      quotedMsg,
      sender,
      botName,
      botFooter,
      newsletterJid,
      KiptendenTechApi,
      KiptendenApiKey,
      getMediaBuffer,
      uploadToCatbox,
    } = conText;

    const isUrl = (s) => /^https?:\/\//i.test(s?.trim());

    if (!q?.trim() && !quotedMsg) {
      await react("❌");
      return reply(
        `Please reply to an audio/video message or provide a URL\n\nUsage: ${botPrefix}shazam <audio/video url>`,
      );
    }

    const quotedAudio = quoted?.audioMessage || quoted?.message?.audioMessage;
    const quotedVideo = quoted?.videoMessage || quoted?.message?.videoMessage;

    if (!isUrl(q) && !quotedAudio && !quotedVideo) {
      await react("❌");
      return reply("The quoted message doesn't contain any audio or video");
    }

    try {
      let fileUrl;

      if (isUrl(q)) {
        fileUrl = q.trim();
      } else {
        const mediaMsg = quotedAudio || quotedVideo;
        const isAudio = !!quotedAudio;
        const durationSecs = mediaMsg?.seconds || mediaMsg?.duration || 0;
        let buffer = await getMediaBuffer(mediaMsg, isAudio ? "audio" : "video");
        const ext = isAudio ? "mp3" : "mp4";

        if (durationSecs > 20) {
          const tmpIn  = path.join(os.tmpdir(), `shazam_in_${Date.now()}.${ext}`);
          const tmpOut = path.join(os.tmpdir(), `shazam_out_${Date.now()}.${ext}`);
          fss.writeFileSync(tmpIn, buffer);
          await new Promise((resolve, reject) => {
            ffmpeg(tmpIn)
              .outputOptions(["-t", "20", "-c", "copy"])
              .on("end", resolve)
              .on("error", reject)
              .save(tmpOut);
          });
          buffer = fss.readFileSync(tmpOut);
          fss.unlinkSync(tmpIn);
          fss.unlinkSync(tmpOut);
        }

        ({ url: fileUrl } = await uploadToCatbox(buffer, `audio.${ext}`));
      }

      const apiUrl = `${KiptendenTechApi}/api/search/shazam?apikey=${KiptendenApiKey}&url=${encodeURIComponent(fileUrl)}`;
      const res = await axios.get(apiUrl, { timeout: 60000 });

      if (!res.data?.success || !res.data?.result) {
        await react("❌");
        return reply("❌ Could not identify the music. Please try a clearer audio clip.");
      }

      const r = res.data.result;
      const title     = r.title     || r.track?.title      || "Unknown";
      const artist    = r.artist    || r.track?.subtitle   || r.artists || "";
      const album     = r.album     || r.track?.sections?.find(s => s.type === "SONG")?.metadata?.find(m => m.title === "Album")?.text || "";
      const genres    = r.genres    || r.track?.genres?.primary || "";
      const label     = r.label     || "";
      const releaseDate = r.releasedate || r.release_date  || "";
      const coverart  = r.coverart  || r.track?.images?.coverarthq || r.track?.images?.coverart || botPic;
      const spotifyUrl  = r.spotify || r.spotify_url  || r.track?.hub?.options?.find(o => o.caption === "OPEN IN SPOTIFY")?.actions?.[0]?.uri || "";
      const youtubeUrl  = r.youtube || r.youtube_url  || "";

      let txt = `*${botName} 𝐒𝐇𝐀𝐙𝐀𝐌*\n\n`;
      txt += `🎵 *Title:* ${title}\n`;
      if (artist)      txt += `🎤 *Artist:* ${artist}\n`;
      if (album)       txt += `💿 *Album:* ${album}\n`;
      if (genres)      txt += `🎼 *Genre:* ${genres}\n`;
      if (label)       txt += `🏷️ *Label:* ${label}\n`;
      if (releaseDate) txt += `📅 *Released:* ${releaseDate}\n`;
      if (spotifyUrl)  txt += `\n🟢 *Spotify:* ${spotifyUrl}\n`;
      if (youtubeUrl)  txt += `🔴 *YouTube:* ${youtubeUrl}\n`;
      txt += `\n> *${botFooter}*`;

      await Kiptenden.sendMessage(
        from,
        {
          image: { url: coverart },
          caption: txt,
          contextInfo: {
            mentionedJid: [sender],
            forwardingScore: 5,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
              newsletterJid: newsletterJid,
              newsletterName: botName,
              serverMessageId: 143,
            },
          },
        },
        { quoted: mek },
      );
      await react("✅");
    } catch (e) {
      console.error("Error in shazam command:", e);
      await react("❌");
      if (e.message?.includes("empty media key")) {
        await reply("The media keys have expired — please send a fresh audio/video message.");
      } else {
        await reply(`❌ Error identifying music: ${e.message}`);
      }
    }
  },
);

gmd(
  {
    pattern: "google",
    aliases: ["ggle", "gglesearch", "googlesearch"],
    category: "search",
    react: "🔍",
    description: "Search Google and display first 5 results",
  },
  async (from, Kiptenden, conText) => {
    const { q, mek, reply, react, botFooter, KiptendenTechApi, KiptendenApiKey } =
      conText;

    if (!q) {
      await react("❌");
      return reply("Please provide a search query");
    }

    try {
      const apiUrl = `${KiptendenTechApi}/api/search/google?apikey=${KiptendenApiKey}&query=${encodeURIComponent(q)}`;
      const res = await axios.get(apiUrl, { timeout: 60000 });

      if (
        !res.data?.success ||
        !res.data?.results ||
        !Array.isArray(res.data.results) ||
        res.data.results.length === 0
      ) {
        await react("❌");
        return reply("No results found. Please try a different query.");
      }

      const results = res.data.results.slice(0, 5);

      const defaultImg =
        "https://res.cloudinary.com/dqxlb29uz/image/upload/v1780267810/bwm_uploads/media-1780267810008.jpg";

      const cards = await Promise.all(
        results.map(async (result) => ({
          header: {
            title: `🔍 *${result.title}*`,
            hasMediaAttachment: true,
            imageMessage: (
              await generateWAMessageContent(
                { image: { url: defaultImg } },
                { upload: Kiptenden.waUploadToServer },
              )
            ).imageMessage,
          },
          body: {
            text: `📝 ${result.description || "No description"}`,
          },
          footer: { text: `> *${botFooter}*` },
          nativeFlowMessage: {
            buttons: [
              {
                name: "cta_copy",
                buttonParamsJson: JSON.stringify({
                  display_text: "Copy Link",
                  copy_code: result.link,
                }),
              },
              {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                  display_text: "Open Link",
                  url: result.link,
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
                body: { text: `🔍 Google Results for: *${q}*` },
                footer: {
                  text: `📂 Displaying first *${results.length}* results`,
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
      console.error("Google search error:", error);
      await react("❌");
      return reply("Failed to perform Google search. Please try again.");
    }
  },
);

const LYRICS_API_BASE_URL = (
  process.env.LYRICS_API_BASE_URL || "https://lrclib.net"
).replace(/\/+$/, "");
const LYRICS_USER_AGENT =
  process.env.LYRICS_USER_AGENT || "Kiptenden Youths Bot/1.0 (lyrics command)";

function stripSyncedTimestamps(value) {
  return String(value || "")
    .replace(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]\s?/g, "")
    .trim();
}

function selectLyricsRecord(records) {
  if (!Array.isArray(records)) return null;
  return records.find((record) => {
    const lyrics = record?.plainLyrics || stripSyncedTimestamps(record?.syncedLyrics);
    return Boolean(String(lyrics || "").trim());
  }) || null;
}

gmd(
  {
    pattern: "lyrics",
    aliases: ["songlyrics", "getlyrics"],
    category: "search",
    react: "🎵",
    description: "Get song lyrics with copy button",
  },
  async (from, Kiptenden, conText) => {
    const { q, reply, react, botName, botFooter } = conText;
    const query = q?.trim();

    if (!query) {
      await react("❌");
      return reply("Please provide a song name or artist. Example: `.lyrics Adele Hello`");
    }

    try {
      const res = await axios.get(`${LYRICS_API_BASE_URL}/api/search`, {
        params: { q: query },
        timeout: 15000,
        headers: {
          Accept: "application/json",
          "User-Agent": LYRICS_USER_AGENT,
        },
      });

      const record = selectLyricsRecord(res.data);
      if (!record) {
        await react("❌");
        return reply("No lyrics found. Try including the artist name, for example `.lyrics Adele Hello`.");
      }

      const lyrics = String(
        record.plainLyrics || stripSyncedTimestamps(record.syncedLyrics),
      ).trim();
      const artist = record.artistName || "Unknown";
      const title = record.trackName || record.name || query;

      let text = `*${botName || "KIPTENDEN YOUTHS"} 𝐋𝐘𝐑𝐈𝐂𝐒*\n\n`;
      text += `🎤 *Artist:* ${artist}\n`;
      text += `🎵 *Title:* ${title}\n\n`;
      text += `${lyrics}\n\n`;

      try {
        await sendButtons(Kiptenden, from, {
          title: "",
          text,
          footer: botFooter,
          buttons: [
            {
              name: "cta_copy",
              buttonParamsJson: JSON.stringify({
                display_text: "📋 Copy Lyrics",
                copy_code: lyrics,
              }),
            },
          ],
        });
      } catch (buttonError) {
        console.warn("Lyrics button delivery failed; using text reply:", buttonError.message);
        await reply(`${text}\n> _${botFooter || "Powered by Kiptenden Youths"}_`);
      }

      await react("✅");
    } catch (error) {
      console.error("Lyrics search error:", error.message);
      await react("❌");

      if (error.response?.status === 429) {
        const retryAfter = error.response.headers?.["retry-after"];
        return reply(
          retryAfter
            ? `Lyrics service is rate-limited. Please try again in about ${retryAfter} seconds.`
            : "Lyrics service is temporarily rate-limited. Please try again later.",
        );
      }

      if (error.response?.status === 404) {
        return reply("No lyrics found. Try including the artist name, for example `.lyrics Adele Hello`.");
      }

      return reply("Failed to get lyrics because the lyrics service is temporarily unavailable. Please try again later.");
    }
  },
);

gmd(
  {
    pattern: "happymod",
    aliases: ["modapks", "apkmod"],
    category: "search",
    react: "📱",
    description: "Search HappyMod for modded APKs",
  },
  async (from, Kiptenden, conText) => {
    const { q, mek, reply, react, botFooter, KiptendenTechApi, KiptendenApiKey } =
      conText;

    if (!q) {
      await react("❌");
      return reply("Please provide an app name to search");
    }

    try {
      const apiUrl = `${KiptendenTechApi}/api/search/happymod?apikey=${KiptendenApiKey}&query=${encodeURIComponent(q)}`;
      const res = await axios.get(apiUrl, { timeout: 60000 });

      if (!res.data?.success || !res.data?.results?.data) {
        await react("❌");
        return reply("No results found. Please try a different query.");
      }

      const results = res.data.results.data.slice(0, 5);

      const cards = await Promise.all(
        results.map(async (app) => ({
          header: {
            title: `📱 *${app.name}*`,
            hasMediaAttachment: true,
            imageMessage: (
              await generateWAMessageContent(
                { image: { url: app.icon } },
                {
                  upload: Kiptenden.waUploadToServer,
                },
              )
            ).imageMessage,
          },
          body: {
            text: `📝 ${app.summary || "No description"}\n📦 Source: ${app.source || "Unknown"}`,
          },
          footer: { text: `> *${botFooter}*` },
          nativeFlowMessage: {
            buttons: [
              {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                  display_text: "Download",
                  url: app.url,
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
                body: { text: `📱 HappyMod Results for: *${q}*` },
                footer: {
                  text: `📂 Displaying first *${results.length}* apps`,
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
      console.error("HappyMod search error:", error);
      await react("❌");
      return reply("Failed to search HappyMod. Please try again.");
    }
  },
);

gmd(
  {
    pattern: "apkmirror",
    aliases: ["apkmirrorsearch"],
    category: "search",
    react: "📦",
    description: "Search APK Mirror for apps",
  },
  async (from, Kiptenden, conText) => {
    const { q, mek, reply, react, botFooter, KiptendenTechApi, KiptendenApiKey } =
      conText;

    if (!q) {
      await react("❌");
      return reply("Please provide an app name to search");
    }

    try {
      const apiUrl = `${KiptendenTechApi}/api/search/apkmirror?apikey=${KiptendenApiKey}&query=${encodeURIComponent(q)}`;
      const res = await axios.get(apiUrl, { timeout: 60000 });

      if (!res.data?.success || !res.data?.results?.data) {
        await react("❌");
        return reply("No results found. Please try a different query.");
      }

      const results = res.data.results.data.slice(0, 5);

      const cards = await Promise.all(
        results.map(async (app) => ({
          header: {
            title: `📦 *${app.name}*`,
            hasMediaAttachment: true,
            imageMessage: (
              await generateWAMessageContent(
                { image: { url: app.icon } },
                {
                  upload: Kiptenden.waUploadToServer,
                },
              )
            ).imageMessage,
          },
          body: {
            text: `📦 Source: ${app.source || "APK Mirror"}`,
          },
          footer: { text: `> *${botFooter}*` },
          nativeFlowMessage: {
            buttons: [
              {
                name: "cta_url",
                buttonParamsJson: JSON.stringify({
                  display_text: "Download",
                  url: app.url,
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
                body: { text: `📦 APK Mirror Results for: *${q}*` },
                footer: {
                  text: `📂 Displaying first *${results.length}* apps`,
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
      console.error("APK Mirror search error:", error);
      await react("❌");
      return reply("Failed to search APK Mirror. Please try again.");
    }
  },
);

gmd(
  {
    pattern: "stickersearch",
    aliases: ["searchsticker", "findsticker"],
    category: "search",
    react: "🎨",
    description: "Search and send stickers",
  },
  async (from, Kiptenden, conText) => {
    const {
      q,
      mek,
      reply,
      react,
      packName,
      packAuthor,
      KiptendenTechApi,
      KiptendenApiKey,
    } = conText;

    if (!q) {
      await react("❌");
      return reply("Please provide a search query for stickers");
    }

    try {
      const apiUrl = `${KiptendenTechApi}/api/search/stickersearch?apikey=${KiptendenApiKey}&query=${encodeURIComponent(q)}`;
      const res = await axios.get(apiUrl, { timeout: 60000 });

      if (
        !res.data?.success ||
        !res.data?.results ||
        res.data.results.length === 0
      ) {
        await react("❌");
        return reply("No stickers found. Please try a different query.");
      }

      const stickers = res.data.results.slice(0, 10);

      for (const stickerUrl of stickers) {
        try {
          const response = await axios.get(stickerUrl, {
            responseType: "arraybuffer",
            timeout: 30000,
          });
          const stickerBuffer = Buffer.from(response.data);

          const processedSticker = await gmdSticker(stickerBuffer, {
            pack: packName || "𝐀𝐓𝐀𝐒𝐒𝐀-𝐌𝐃",
            author: packAuthor || "GIFTED-TECH",
            type: StickerTypes.FULL,
            categories: ["🤩", "🎉"],
            quality: 75,
          });

          await Kiptenden.sendMessage(
            from,
            { sticker: processedSticker },
            { quoted: mek },
          );
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (stickerErr) {
          console.error("Error sending sticker:", stickerErr.message);
        }
      }

      await react("✅");
    } catch (error) {
      console.error("Sticker search error:", error);
      await react("❌");
      return reply("Failed to search stickers. Please try again.");
    }
  },
);

// ─── URBAN DICTIONARY ─────────────────────────────────────────────────────────

gmd({
  pattern: "urban",
  aliases: ["ud", "slang", "urbandict"],
  react: "📖",
  category: "search",
  description: "Look up any word on Urban Dictionary. Usage: .urban slay",
}, async (from, Kiptenden, conText) => {
  const { reply, react, q, mek, botFooter } = conText;
  if (!q) return reply("❌ Provide a word!\nExample: `.urban no cap`");
  try {
    await react("🔍");
    const res = await axios.get(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(q)}`, { timeout: 15000 });
    const entry = res.data?.list?.[0];
    if (!entry) return reply(`❌ No definition found for *"${q}"*`);
    const def = entry.definition.replace(/\[|\]/g, "").slice(0, 600);
    const ex  = (entry.example || "").replace(/\[|\]/g, "").slice(0, 250);
    const up  = entry.thumbs_up || 0;
    const dn  = entry.thumbs_down || 0;
    await react("✅");
    await Kiptenden.sendMessage(from, {
      text: `📖 *Urban Dictionary*\n\n🔤 *Word:* ${q}\n\n*Definition:*\n${def}\n${ex ? `\n*Example:*\n_${ex}_\n` : ""}\n👍 ${up}  👎 ${dn}\n\n> _${botFooter}_`,
    }, { quoted: mek });
  } catch {
    await react("❌");
    reply("❌ Failed to fetch definition. Try again.");
  }
});
