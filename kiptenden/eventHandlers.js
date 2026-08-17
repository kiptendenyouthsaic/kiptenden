const { getContentType } = require("@whiskeysockets/baileys");
const googleTTS = require("google-tts-api");

const {
    getAllSettings,
    emojis,
    KiptendenAutoReact,
    KiptendenAutoBio,
    KiptendenAntiDelete,
    KiptendenAnticall,
    KiptendenPresence,
    KiptendenChatBot,
    createContext,
    createContext2,
    KiptendenAntiLink,
    KiptendenAntibad,
    KiptendenAntiBot,
    KiptendenAntiSticker,
    handleGameMessage,
    KiptendenAntiGroupMention,
    getGroupMetadata,
    KiptendenAntiEdit,
    DEFAULT_SETTINGS,
} = require(".");

const {
    findAntiDelete,
    removeAntiDelete,
    saveAntiDelete,
} = require("./database/messageStore");

async function resolveRealJid(Kiptenden, jid) {
    if (!jid) return null;
    if (!jid.endsWith("@lid")) return jid;
    try {
        const { getLidMapping } = require("./connection/groupCache");
        const cached = getLidMapping(jid);
        if (cached) return cached;
    } catch (_) {}
    try {
        const resolved = await Kiptenden.getJidFromLid(jid);
        if (resolved && !resolved.endsWith("@lid")) return resolved;
    } catch (_) {}
    try {
        const { getLidMappingFromDb } = require("./database/lidMapping");
        const fromDb = await getLidMappingFromDb(jid);
        if (fromDb) return fromDb;
    } catch (_) {}
    return jid;
}

function setupAutoReact(Kiptenden) {
    Kiptenden.ev.on("messages.upsert", async (mek) => {
        try {
            const ms = mek.messages[0];
            const s = await getAllSettings();
            const autoReactMode = s.AUTO_REACT || "off";

            if (
                autoReactMode === "off" ||
                autoReactMode === "false" ||
                ms.key.fromMe ||
                !ms.message
            )
                return;

            const from = ms.key.remoteJid;
            const isGroup = from?.endsWith("@g.us");
            const isDm = from?.endsWith("@s.whatsapp.net");

            let shouldReact = false;
            if (autoReactMode === "all" || autoReactMode === "true") {
                shouldReact = true;
            } else if (autoReactMode === "dm" && isDm) {
                shouldReact = true;
            } else if (autoReactMode === "groups" && isGroup) {
                shouldReact = true;
            }

            if (!shouldReact) return;

            const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
            await KiptendenAutoReact(randomEmoji, ms, Kiptenden);
        } catch (err) {
            console.error("Error during auto reaction:", err);
        }
    });
}

function setupAntiDelete(Kiptenden) {
    const botJid = `${Kiptenden.user?.id.split(":")[0]}@s.whatsapp.net`;
    const botOwnerJid = botJid;

    const getSender = (ms) => {
        const key = ms.key;
        const realJid = (j) => j && !j.endsWith("@lid") ? j : null;
        return (
            realJid(key.participantPn) ||
            realJid(key.senderPn) ||
            realJid(ms.senderPn) ||
            realJid(key.participant) ||
            realJid(ms.participant) ||
            key.participantPn ||
            key.participant ||
            ms.participant ||
            (key.remoteJid?.endsWith("@g.us") ? null : realJid(key.remoteJid) || key.remoteJid)
        );
    };

    const getPushName = (ms) => {
        return ms.pushName || ms.key?.pushName || ms.verifiedBizName || "Unknown";
    };

    const isProtocolMessage = (ms) => {
        return (
            ms.message?.protocolMessage ||
            ms.message?.ephemeralMessage?.message?.protocolMessage ||
            ms.message?.viewOnceMessage?.message?.protocolMessage ||
            ms.message?.viewOnceMessageV2?.message?.protocolMessage
        );
    };

    const getProtocolMessage = (ms) => {
        return (
            ms.message?.protocolMessage ||
            ms.message?.ephemeralMessage?.message?.protocolMessage ||
            ms.message?.viewOnceMessage?.message?.protocolMessage ||
            ms.message?.viewOnceMessageV2?.message?.protocolMessage
        );
    };

    const getActualMessage = (ms) => {
        const msg = ms.message;
        if (!msg) return null;
        return (
            msg.ephemeralMessage?.message ||
            msg.viewOnceMessage?.message ||
            msg.viewOnceMessageV2?.message ||
            msg.documentWithCaptionMessage?.message ||
            msg
        );
    };

    Kiptenden.ev.on("messages.upsert", async ({ messages }) => {
        for (const ms of messages) {
            try {
                if (!ms?.message) continue;

                const { key } = ms;
                if (
                    !key?.remoteJid ||
                    key.fromMe ||
                    key.remoteJid === "status@broadcast"
                )
                    continue;

                const protocolMsg = getProtocolMessage(ms);
                if (protocolMsg?.type === 0) {
                    const deleteKey = protocolMsg.key;
                    const deletedId = deleteKey?.id;
                    const chatJid = key.remoteJid;

                    if (!deletedId) continue;

                    const deletedMsg = findAntiDelete(chatJid, deletedId);
                    if (!deletedMsg?.message) continue;

                    const deleter = getSender(ms) || key.remoteJid;
                    const deleterPushName = getPushName(ms);

                    if (deleter === botJid || deleter === botOwnerJid) continue;

                    await KiptendenAntiDelete(
                        Kiptenden,
                        deletedMsg,
                        key,
                        deleter,
                        deletedMsg.originalSender,
                        botOwnerJid,
                        deleterPushName,
                        deletedMsg.originalPushName,
                    );

                    removeAntiDelete(chatJid, deletedId);
                    continue;
                }

                if (isProtocolMessage(ms)) continue;

                const actualMessage = getActualMessage(ms);
                if (!actualMessage) continue;

                const sender = getSender(ms);
                const senderPushName = getPushName(ms);

                if (!sender || sender === botJid || sender === botOwnerJid)
                    continue;

                const _jid = key.remoteJid;
                const _entry = {
                    ...ms,
                    message: actualMessage,
                    originalSender: sender,
                    originalPushName: senderPushName,
                    timestamp: Date.now(),
                };
                setImmediate(() => saveAntiDelete(_jid, _entry));
            } catch (error) {
                console.error("Anti-delete system error:", error);
            }
        }
    });
}

function setupAutoBio(Kiptenden) {
    (async () => {
        const s = await getAllSettings();
        if (s.AUTO_BIO === "true") {
            setTimeout(() => KiptendenAutoBio(Kiptenden), 1000);
            setInterval(() => KiptendenAutoBio(Kiptenden), 1000 * 60);
        }
    })();
}

function setupAntiCall(Kiptenden) {
    Kiptenden.ev.on("call", async (json) => {
        await KiptendenAnticall(json, Kiptenden);
    });
}

function setupPresence(Kiptenden) {
    Kiptenden.ev.on("messages.upsert", async ({ messages }) => {
        if (messages?.length > 0) {
            await KiptendenPresence(Kiptenden, messages[0].key.remoteJid);
        }
    });

    Kiptenden.ev.on("connection.update", ({ connection }) => {
        if (connection === "open") {
            KiptendenPresence(Kiptenden, "status@broadcast");
        }
    });
}

function setupChatBotAndAntiLink(Kiptenden) {
    // Register the chatbot at socket startup. It reads current settings for
    // every message, so owner toggles take effect without a stale listener.
    KiptendenChatBot(
        Kiptenden,
        "true",
        process.env.CHATBOT_MODE || "allchats",
        createContext,
        createContext2,
        googleTTS,
    );

    Kiptenden.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type === "append") return;

        for (const message of messages) {
            if (!message?.message) continue;
            const from = message.key?.remoteJid || "";
            if (message.key.fromMe && !from.endsWith("@g.us")) continue;

            if (from.endsWith("@g.us")) {
                await KiptendenAntiLink(Kiptenden, message, getGroupMetadata);
                await KiptendenAntibad(Kiptenden, message, getGroupMetadata);
                await KiptendenAntiBot(Kiptenden, message, getGroupMetadata);
                await KiptendenAntiSticker(Kiptenden, message, getGroupMetadata);
            }
            await KiptendenAntiGroupMention(Kiptenden, message, getGroupMetadata);
            await handleGameMessage(Kiptenden, message);
        }
    });
}

function setupAntiEdit(Kiptenden) {
    Kiptenden.ev.on("messages.update", async (updates) => {
        for (const update of updates) {
            try {
                if (!update?.update?.message) continue;
                if (update.key?.fromMe) continue;
                if (update.key?.remoteJid === "status@broadcast") continue;
                await KiptendenAntiEdit(Kiptenden, update, findAntiDelete);
            } catch (err) {
                console.error("Anti-edit handler error:", err.message);
            }
        }
    });
}

function setupStatusHandlers(Kiptenden) {
    Kiptenden.ev.on("messages.upsert", async (mek) => {
        try {
            mek = mek.messages[0];
            if (!mek || !mek.message) return;

            mek.message =
                getContentType(mek.message) === "ephemeralMessage"
                    ? mek.message.ephemeralMessage.message
                    : mek.message;

            if (mek.key?.remoteJid !== "status@broadcast") return;

            const s = await getAllSettings();

            const rawParticipant =
                mek.participant || mek.key.participantPn || mek.key.participant;
            const participantJid = await resolveRealJid(Kiptenden, rawParticipant);

            const shouldView = s.AUTO_READ_STATUS === "true";

            const readKey =
                participantJid && participantJid !== mek.key.participant
                    ? { ...mek.key, participant: participantJid }
                    : mek.key;

            if (shouldView) {
                await Kiptenden.readMessages([readKey]);
            }

            if (
                shouldView &&
                s.AUTO_LIKE_STATUS === "true" &&
                participantJid
            ) {
                const statusEmojis = (
                    s.STATUS_LIKE_EMOJIS ||
                    "🥼,🏅,🎖️,🧧,🎐,🏅,🏆,🥇,🥈,🏆"
                )
                    .split(",")
                    .map((e) => e.trim())
                    .filter(Boolean);
                const randomEmoji =
                    statusEmojis[Math.floor(Math.random() * statusEmojis.length)];
                const reactKey = { ...mek.key, participant: participantJid };
                await Kiptenden.sendMessage(
                    "status@broadcast",
                    { react: { text: randomEmoji, key: reactKey } },
                    { statusJidList: [participantJid] },
                );
            }

            if (
                shouldView &&
                s.AUTO_REPLY_STATUS === "true" &&
                !mek.key.fromMe &&
                participantJid
            ) {
                await Kiptenden.sendMessage(
                    participantJid,
                    {
                        text:
                            s.STATUS_REPLY_TEXT ||
                            DEFAULT_SETTINGS.STATUS_REPLY_TEXT,
                    },
                    { quoted: mek },
                );
            }
        } catch (error) {
            const code = error?.output?.statusCode || error?.code || "";
            const msg = error?.message || "";
            const transient =
                code === 428 ||
                msg === "Connection Closed" ||
                msg.includes("ECONNRESET") ||
                msg.includes("ETIMEDOUT") ||
                msg.includes("ECONNREFUSED") ||
                msg.includes("EPIPE") ||
                msg.includes("Connection Terminated") ||
                msg.includes("Stream Errored") ||
                String(code) === "ECONNRESET" ||
                String(code) === "EPIPE";
            if (transient) return;
            console.error("Error Processing Status Actions:", error);
        }
    });
}

module.exports = {
    setupAutoReact,
    setupAntiDelete,
    setupAutoBio,
    setupAntiCall,
    setupPresence,
    setupChatBotAndAntiLink,
    setupAntiEdit,
    setupStatusHandlers,
};
