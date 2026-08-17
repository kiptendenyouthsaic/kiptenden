const { gmd } = require("../kiptenden");
const axios = require("axios");
const { sendButtons } = require("gifted-btns");

const BIBLE_API_BASE_URL = (
  process.env.BIBLE_API_BASE_URL || "https://bible-api.com"
).replace(/\/+$/, "");
const BIBLE_TRANSLATION = process.env.BIBLE_TRANSLATION || "web";

function buildBibleUrl(reference) {
  const encodedReference = encodeURIComponent(reference.trim()).replace(
    /%20/g,
    "+",
  );
  return `${BIBLE_API_BASE_URL}/${encodedReference}`;
}

function formatBibleResponse(data, requestedReference, botName) {
  const text = String(data?.text || "").trim();
  if (!text) return null;

  const reference = data.reference || requestedReference;
  const versesCount = Array.isArray(data.verses) && data.verses.length
    ? data.verses.length
    : 1;

  let output = `*${botName || "KIPTENDEN YOUTHS"} BIBLE*\n\n`;
  output += `📖 *Verse:* ${reference}\n`;
  output += `📊 *Verse Count:* ${versesCount}\n\n`;
  output += `*English:*\n${text}`;
  return output;
}

gmd(
  {
    pattern: "bible",
    aliases: ["verse", "bibleverse", "scripture"],
    react: "📖",
    category: "religion",
    description: "Get Bible verses",
  },
  async (from, Kiptenden, conText) => {
    const { reply, react, q, botFooter, botName } = conText;

    const verse = q?.trim();
    if (!verse) {
      await react("❌");
      return reply(
        "Please provide a Bible verse reference\n\nUsage:\n.bible John 3:16\n.bible John 3:16-20\n.bible John 3",
      );
    }

    await react("⏳");

    try {
      const url = buildBibleUrl(verse);
      const res = await axios.get(url, {
        params: { translation: BIBLE_TRANSLATION },
        timeout: 15000,
        headers: { Accept: "application/json" },
      });

      const text = formatBibleResponse(res.data, verse, botName);
      if (!text) {
        await react("❌");
        return reply(
          "I could not find that Bible reference. Try a format such as `.bible John 3:16`.",
        );
      }

      const copyContent = String(res.data.text || "").trim();

      try {
        await sendButtons(Kiptenden, from, {
          title: "",
          text,
          footer: botFooter,
          buttons: [
            {
              name: "cta_copy",
              buttonParamsJson: JSON.stringify({
                display_text: "📋 Copy Verse",
                copy_code: copyContent,
              }),
            },
          ],
        });
      } catch (buttonError) {
        console.warn("Bible verse button delivery failed; using text reply:", buttonError.message);
        await reply(`${text}\n\n> _${botFooter || "Powered by Kiptenden Youths"}_`);
      }

      await react("✅");
    } catch (error) {
      console.error("Bible verse error:", error.message);
      await react("❌");

      if (error.response?.status === 404) {
        return reply(
          "I could not find that Bible reference. Try a format such as `.bible John 3:16`.",
        );
      }

      if (error.response?.status === 429) {
        return reply(
          "The Bible verse service is temporarily rate-limited. Please try again in a moment.",
        );
      }

      return reply(
        "The Bible verse service is temporarily unavailable. Please try again later.",
      );
    }
  },
);

module.exports = { buildBibleUrl, formatBibleResponse };
