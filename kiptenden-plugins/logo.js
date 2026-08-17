
const { gmd, gmdBuffer, KiptendenTechApi, KiptendenApiKey } = require("../kiptenden");
const axios = require("axios");

const LOGO_PROVIDER = String(process.env.LOGO_PROVIDER || "auto").trim().toLowerCase();
const POLLINATIONS_IMAGE_MODEL = process.env.POLLINATIONS_IMAGE_MODEL || "flux";
const LOGO_API_TIMEOUT_MS = Number(process.env.LOGO_API_TIMEOUT_MS) || 60000;
const LOGO_FALLBACK_ENABLED = String(process.env.LOGO_FALLBACK_ENABLED ?? "true").toLowerCase() !== "false";
const MAX_LOGO_TEXT_LENGTH = 120;

function normalizeLogoText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, MAX_LOGO_TEXT_LENGTH);
}

function extractImageUrl(data) {
  const candidates = [
    data?.result?.image_url,
    data?.result?.image,
    data?.result?.url,
    data?.image_url,
    data?.image,
    data?.url,
  ];
  return candidates.find((value) => typeof value === "string" && /^https?:\/\//i.test(value));
}

async function fetchLegacyLogo(endpoint, text, apiBase, apiKey) {
  const base = String(apiBase || "").trim().replace(/\/+$/, "");
  const key = String(apiKey || "").trim();
  if (!base || !key) throw new Error("Legacy logo API is not configured");

  const url = new URL(`${base}/api/ephoto360/${endpoint}`);
  url.searchParams.set("apikey", key);
  url.searchParams.set("text", text);

  const response = await axios.get(url.toString(), { timeout: LOGO_API_TIMEOUT_MS });
  const imageUrl = extractImageUrl(response.data);
  if (!imageUrl) throw new Error("Legacy logo API returned no image URL");

  const imageBuffer = await gmdBuffer(imageUrl, { timeout: LOGO_API_TIMEOUT_MS });
  if (!Buffer.isBuffer(imageBuffer)) throw new Error("Legacy logo image download failed");
  return { imageBuffer, provider: "ephoto360" };
}

async function fetchPollinationsLogo(text, description) {
  const prompt = [
    "Create a professional square logo for a WhatsApp bot.",
    `The exact readable text must be: ${JSON.stringify(text)}.`,
    `Visual direction: ${description}.`,
    "Use a clean centered composition, strong contrast, polished typography, and no extra words.",
  ].join(" ");
  const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${encodeURIComponent(POLLINATIONS_IMAGE_MODEL)}&width=768&height=768&nologo=true&enhance=true&seed=${Math.floor(Math.random() * 1000000)}`;
  const imageBuffer = await gmdBuffer(imageUrl, { timeout: 120000 });
  if (!Buffer.isBuffer(imageBuffer)) throw new Error("Pollinations logo image download failed");
  return { imageBuffer, provider: "pollinations" };
}

async function generateLogo(config, text, context) {
  const apiBase = context.KiptendenTechApi || KiptendenTechApi;
  const apiKey = context.KiptendenApiKey || KiptendenApiKey;
  let legacyError;

  if (LOGO_PROVIDER !== "pollinations") {
    try {
      return await fetchLegacyLogo(config.endpoint, text, apiBase, apiKey);
    } catch (error) {
      legacyError = error;
      if (!LOGO_FALLBACK_ENABLED) throw error;
      console.warn(`[LOGO] Legacy provider unavailable for ${config.pattern}; using fallback: ${error.message}`);
    }
  }

  try {
    return await fetchPollinationsLogo(text, config.description);
  } catch (fallbackError) {
    const detail = legacyError ? `${legacyError.message}; fallback: ${fallbackError.message}` : fallbackError.message;
    throw new Error(`All logo providers failed: ${detail}`);
  }
}

const logoEndpoints = [
  {
    pattern: "glossysilver",
    aliases: ["glossy", "silverlogo"],
    description: "Glossy Silver logo",
    endpoint: "glossysilver",
  },
  {
    pattern: "writetext",
    aliases: ["textwrite", "baby", "writtentext"],
    description: "Write Text logo",
    endpoint: "writetext",
  },
  {
    pattern: "blackpinklogo",
    aliases: ["bplogo", "pinkblack"],
    description: "Black Pink Logo",
    endpoint: "blackpinklogo",
  },
  {
    pattern: "glitchtext",
    aliases: ["glitch", "textglitch"],
    description: "Glitch Text logo",
    endpoint: "glitchtext",
  },
  {
    pattern: "advancedglow",
    aliases: ["advglow", "glowadvanced"],
    description: "Advanced Glow logo",
    endpoint: "advancedglow",
  },
  {
    pattern: "typographytext",
    aliases: ["typography", "typo"],
    description: "Typography Text logo",
    endpoint: "typographytext",
  },
  {
    pattern: "pixelglitch",
    aliases: ["pixelg", "glitchpixel"],
    description: "Pixel Glitch logo",
    endpoint: "pixelglitch",
  },
  {
    pattern: "neonglitch",
    aliases: ["neong", "glitchneon"],
    description: "Neon Glitch logo",
    endpoint: "neonglitch",
  },
  {
    pattern: "nigerianflag",
    aliases: ["ngflag", "nigeria"],
    description: "Nigerian Flag logo",
    endpoint: "nigerianflag",
  },
  {
    pattern: "americanflag",
    aliases: ["usflag", "usaflag", "america"],
    description: "American Flag logo",
    endpoint: "americanflag",
  },
  {
    pattern: "deletingtext",
    aliases: ["deltext", "textdelete"],
    description: "Deleting Text logo",
    endpoint: "deletingtext",
  },
  {
    pattern: "blackpinkstyle",
    aliases: ["bpstyle", "pinkblackstyle"],
    description: "Blackpink Style logo",
    endpoint: "blackpinkstyle",
  },
  {
    pattern: "glowingtext",
    aliases: ["glowtxt", "textglow"],
    description: "Glowing Text logo",
    endpoint: "glowingtext",
  },
  {
    pattern: "underwater",
    aliases: ["underw", "waterlogo"],
    description: "Under Water logo",
    endpoint: "underwater",
  },
  {
    pattern: "logomaker",
    aliases: ["makelogo", "logomake", "logo"],
    description: "Logo Maker",
    endpoint: "logomaker",
  },
  {
    pattern: "cartoonstyle",
    aliases: ["cartoon", "toonlogo"],
    description: "Cartoon Style logo",
    endpoint: "cartoonstyle",
  },
  {
    pattern: "papercut",
    aliases: ["cutpaper", "papercutlogo"],
    description: "Paper Cut logo",
    endpoint: "papercut",
  },
  {
    pattern: "effectclouds",
    aliases: ["cloudeffect", "clouds"],
    description: "Effect Clouds logo",
    endpoint: "effectclouds",
  },
  {
    pattern: "gradienttext",
    aliases: ["gradient", "textgradient"],
    description: "Gradient Text logo",
    endpoint: "gradienttext",
  },
  {
    pattern: "summerbeach",
    aliases: ["beachsummer", "beach"],
    description: "Summer Beach logo",
    endpoint: "summerbeach",
  },
  {
    pattern: "sandsummer",
    aliases: ["summersand", "sand", "sandlogo"],
    description: "Sand Summer logo",
    endpoint: "sandsummer",
  },
  {
    pattern: "luxurygold",
    aliases: ["goldluxury", "luxgold"],
    description: "Luxury Gold logo",
    endpoint: "luxurygold",
  },
  {
    pattern: "galaxy",
    aliases: ["galaxylogo", "space"],
    description: "Galaxy logo",
    endpoint: "galaxy",
  },
  {
    pattern: "logo1917",
    aliases: ["1917", "1917logo"],
    description: "1917 Style logo",
    endpoint: "1917",
  },
  {
    pattern: "makingneon",
    aliases: ["neonmake", "neonlogo"],
    description: "Making Neon logo",
    endpoint: "makingneon",
  },
  {
    pattern: "texteffect",
    aliases: ["effecttext", "fxtext"],
    description: "Text Effect logo",
    endpoint: "texteffect",
  },
  {
    pattern: "galaxystyle",
    aliases: ["stylegalaxy", "galstyle"],
    description: "Galaxy Style logo",
    endpoint: "galaxystyle",
  },
  {
    pattern: "lighteffect",
    aliases: ["effectlight", "lightlogo"],
    description: "Light Effect logo",
    endpoint: "lighteffect",
  },
];

async function createLogoCommand(config) {
  gmd(
    {
      pattern: config.pattern,
      aliases: config.aliases,
      category: "logo",
      react: "🎨",
      description: `Create ${config.description}`,
    },
    async (from, Kiptenden, conText) => {
      const { q, mek, reply, react, pushname, botCaption } = conText;
      const text = normalizeLogoText(q);

      if (!text) {
        await react("❌");
        return reply(
          `Please provide text for the logo.\n\nUsage: .${config.pattern} <text>\nExample: .${config.pattern} ${pushname || "Kiptenden Tech"}`,
        );
      }

      try {
        await react("⏳");
        const { imageBuffer, provider } = await generateLogo(config, text, conText);

        await Kiptenden.sendMessage(
          from,
          {
            image: imageBuffer,
            caption: `✨ *${config.description}*\n\n📝 *Text:* ${text}\n🔧 *Provider:* ${provider}\n\n> ${botCaption}`,
          },
          { quoted: mek },
        );

        await react("✅");
      } catch (e) {
        console.error(`Error in ${config.pattern} command:`, e.message);
        await react("❌");
        await reply("Logo generation is temporarily unavailable. Please try again later or configure the logo API fallback.");
      }
    },
  );
}

logoEndpoints.forEach((config) => createLogoCommand(config));

gmd(
  {
    pattern: "logolist",
    aliases: ["logos", "logohelp", "logomenu"],
    category: "logo",
    react: "📜",
    description: "Show all available logo commands",
  },
  async (from, Kiptenden, conText) => {
    const { mek, reply, react, botCaption, botName, botPrefix } = conText;

    const logoList = logoEndpoints
      .map((l, i) => `${i + 1}. *.${l.pattern}* - ${l.description}`)
      .join("\n");

    await reply(
      `🎨 *${botName} LOGO MAKER*\n\n${logoList}\n\n📝 *Usage:* ${botPrefix}commandname <your text>\n📌 *Example:* ${botPrefix}glossysilver Kiptenden Tech\n\n> ${botCaption}`,
    );
    await react("✅");
  },
);
