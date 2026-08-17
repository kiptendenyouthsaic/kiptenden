"use strict";

const { gmd }          = require("../kiptenden");
const moment           = require("moment-timezone");

const {
    buildThemedMenu,
    sendMenuMsg,
    getSortedCategories,
    CAT_ICONS,
} = require("./design");

// ─── 1. MENU ──────────────────────────────────────────────────────────────────

gmd(
    {
        pattern: "menu",
        aliases: ["help", "cmds", "commands", "start"],
        react: "📋",
        category: "general",
        description: "Show the bot command menu",
    },
    async (from, Kiptenden, conText) => {
        const { react, mek } = conText;
        await react("📋");
        const text = await buildThemedMenu(conText, Kiptenden);
        await sendMenuMsg(Kiptenden, from, text, conText);
        await react("✅");

        // ── Live clock below the menu — ticks every second for 60s ──────────
        const tz = process.env.TIME_ZONE || 'Africa/Nairobi';
        const buildClock = () => {
            const t     = moment().tz(tz);
            const time  = t.format('hh:mm:ss A');
            const date  = t.format('ddd, DD MMM YYYY');
            const total = Math.floor((Date.now() - (global._botStartTime || Date.now())) / 1000);
            const d     = Math.floor(total / 86400);
            const h     = Math.floor((total % 86400) / 3600);
            const m     = Math.floor((total % 3600) / 60);
            const s     = total % 60;
            const alive = [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' : ');
            return `🕐 *${time}*\n📅 ${date}\n⏱️ Alive: *${alive}*`;
        };

        try {
            const clockMsg = await Kiptenden.sendMessage(from, { text: buildClock() }, { quoted: mek });
            let ticks = 0;
            const timer = setInterval(async () => {
                ticks++;
                try {
                    await Kiptenden.sendMessage(from, { text: buildClock(), edit: clockMsg.key });
                } catch (_) {}
                if (ticks >= 60) clearInterval(timer);
            }, 1000);
        } catch (_) {}
    }
);

// ─── 2. CATEGORY BODY HANDLER (reply with a number from the menu) ─────────────
// Uses getSortedCategories() from design.js — SAME source of truth as the menu.

gmd(
    {
        pattern: /^\d+$/,
        on: "body",
        dontAddCommandList: true,
        react: "📂",
        category: "general",
        description: "Reply with a category number to browse commands",
    },
    async (from, Kiptenden, conText) => {
        const HARDCODED_PIC = "";
        const { body, mek, botName, botPrefix, botFooter, newsletterJid, newsletterUrl, sender } = conText;

        const n    = parseInt(body.trim(), 10);
        const cats = getSortedCategories();

        if (isNaN(n) || n < 1 || n > cats.length) return;

        const { cat, cmds } = cats[n - 1];
        const icon  = CAT_ICONS[cat] || "⚡";
        const label = (cat[0].toUpperCase() + cat.slice(1)).toUpperCase();

        const cmdList = cmds.map(c => {
            const desc = c.description ? ` — _${c.description}_` : "";
            const alts = (c.aliases || []).length
                ? `\n┃   ↳ _${c.aliases.map(a => `${botPrefix}${a}`).join(", ")}_`
                : "";
            return `┃ ◈ *${botPrefix}${c.pattern}*${desc}${alts}`;
        }).join("\n");

        const text =
`┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  ${icon}  *${label}*
┃  _${cmds.length} command${cmds.length !== 1 ? 's' : ''} available_
┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━┃
${cmdList}
┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
> ✨ _${botFooter || "Powered by KIPTENDEN YOUTHS"}_`;

        try {
            await Kiptenden.sendMessage(from, {
                text: text.trim(),
                contextInfo: {
                    mentionedJid: [sender],
                    forwardingScore: 5,
                    isForwarded: true,
                    ...(newsletterJid ? {
                        forwardedNewsletterMessageInfo: {
                            newsletterJid,
                            newsletterName: botName || "KIPTENDEN YOUTHS",
                            serverMessageId: 0,
                        },
                    } : {}),
                    ...(newsletterUrl ? {
                        externalAdReply: {
                            title: botName || "KIPTENDEN YOUTHS",
                            body: botFooter || "Powered by KIPTENDEN YOUTHS",
                            ...(HARDCODED_PIC ? { thumbnailUrl: HARDCODED_PIC, mediaType: 1, mediaUrl: HARDCODED_PIC } : {}),
                            sourceUrl: newsletterUrl,
                            showAdAttribution: true,
                            renderLargerThumbnail: true,
                        },
                    } : {}),
                },
            }, { quoted: mek });
        } catch {
            await Kiptenden.sendMessage(from, { text: text.trim() }, { quoted: mek });
        }
    }
);

// ─── 3. PING / ALIVE ─────────────────────────────────────────────────────────

// Track exact moment the process started (set once, never changes)
if (!global._botStartTime) global._botStartTime = Date.now();

function getAliveCount() {
    const totalMs  = Date.now() - global._botStartTime;
    const totalSec = Math.floor(totalMs / 1000);
    const days     = Math.floor(totalSec / 86400);
    const hours    = Math.floor((totalSec % 86400) / 3600);
    const minutes  = Math.floor((totalSec % 3600) / 60);
    const seconds  = totalSec % 60;

    const parts = [];
    if (days)    parts.push(`${days}d`);
    if (hours)   parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    return parts.join(' : ');
}

gmd(
    {
        pattern: "ping",
        aliases: ["alive", "status", "check"],
        react: "🏓",
        category: "general",
        description: "Check if the bot is online and responsive",
    },
    async (from, Kiptenden, conText) => {
        const { mek, react, botName, botPrefix } = conText;
        const start = Date.now();
        await react("🏓");
        const ping = Date.now() - start;

        const buildMsg = () => {
            const alive = getAliveCount();
            return `╭─⌈ 🏓 *${botName || "KIPTENDEN YOUTHS"}* ⌋
│ Status  : ✅ Online & Ready
│ Ping    : *${ping}ms*
│ Alive   : *${alive}*
│ Prefix  : *${botPrefix || "."}*
╰⊷ _counting live..._ ⏱️`;
        };

        // Send the first message
        const sent = await Kiptenden.sendMessage(from, { text: buildMsg() }, { quoted: mek });

        // Edit it every second for 30 ticks so user sees it count live
        let ticks = 0;
        const timer = setInterval(async () => {
            ticks++;
            try {
                await Kiptenden.sendMessage(from, {
                    text: buildMsg(),
                    edit: sent.key,
                });
            } catch (_) {}
            if (ticks >= 30) {
                clearInterval(timer);
                // Final edit — remove the "counting live" footer
                try {
                    await Kiptenden.sendMessage(from, {
                        text: buildMsg().replace('_counting live..._ ⏱️', `*${botName || "KIPTENDEN YOUTHS"}*`),
                        edit: sent.key,
                    });
                } catch (_) {}
            }
        }, 1000);
    }
);

// ─── 4. UPTIME / RUNTIME ─────────────────────────────────────────────────────

gmd(
    {
        pattern: "uptime",
        aliases: ["runtime", "ut"],
        react: "⏱️",
        category: "general",
        description: "Check how long the bot has been running",
    },
    async (from, Kiptenden, conText) => {
        const { react, botName, timeZone, mek } = conText;
        await react("⏱️");

        const tz = timeZone || process.env.TIME_ZONE || "Africa/Nairobi";
        const bn = botName || "KIPTENDEN YOUTHS";

        const buildMsg = () => {
            const t     = moment().tz(tz);
            const time  = t.format("hh:mm:ss A");
            const date  = t.format("ddd, DD MMM YYYY");
            const total = Math.floor((Date.now() - (global._botStartTime || Date.now())) / 1000);
            const d     = Math.floor(total / 86400);
            const h     = Math.floor((total % 86400) / 3600);
            const m     = Math.floor((total % 3600) / 60);
            const s     = total % 60;
            const parts = [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean);
            return (
`╭─⌈ ⏱️ *${bn}* ⌋
│ Uptime  : *${parts.join(' : ')}*
│ Time    : ${time}
│ Date    : ${date}
╰⊷ *${bn}* _counting live..._ ⏱️`
            );
        };

        const sent = await Kiptenden.sendMessage(from, { text: buildMsg() }, { quoted: mek });

        let ticks = 0;
        const timer = setInterval(async () => {
            ticks++;
            try {
                await Kiptenden.sendMessage(from, { text: buildMsg(), edit: sent.key });
            } catch (_) {}
            if (ticks >= 30) {
                clearInterval(timer);
                try {
                    await Kiptenden.sendMessage(from, {
                        text: buildMsg().replace("_counting live..._ ⏱️", `*${bn}*`),
                        edit: sent.key,
                    });
                } catch (_) {}
            }
        }, 1000);
        await react("✅");
    }
);

// ─── 5. BOTINFO / INFO ────────────────────────────────────────────────────────

gmd(
    {
        pattern: "botinfo",
        aliases: ["info", "about", "mybot"],
        react: "🤖",
        category: "general",
        description: "Show information about this bot",
    },
    async (from, Kiptenden, conText) => {
        const { reply, react, botName, botPrefix, botVersion,
                botMode, ownerName } = conText;
        await react("🤖");

        const { commands } = require("../kiptenden");
        const totalCmds = commands.filter(c => c.pattern && !c.dontAddCommandList).length;
        const up = process.uptime();
        const h  = Math.floor(up / 3600);
        const m  = Math.floor((up % 3600) / 60);

        await reply(
`╭─⌈ 🤖 *${botName || "KIPTENDEN YOUTHS"}* ⌋
│ Version   : *v${botVersion || "5.0.0"}*
│ Prefix    : *${botPrefix || "."}*
│ Mode      : *${(botMode || "public").toUpperCase()}*
│ Commands  : *${totalCmds}*
│ Uptime    : *${h}h ${m}m*
│ Owner     : *${ownerName || "Kiptenden Youths"}*
│ Library   : Baileys
╰⊷ *${botName || "KIPTENDEN YOUTHS"}*`
        );
    }
);

module.exports = {};
