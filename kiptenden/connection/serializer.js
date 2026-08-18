"use strict";

const {
    getContentType,
    downloadContentFromMessage,
    downloadMediaMessage,
} = require("@whiskeysockets/baileys");
const { getLidMapping } = require("./groupCache");

/**
 * Normalize a WhatsApp JID while preserving LID JIDs until they can be
 * resolved through an alternate JID, the in-memory mapping, or Baileys.
 */
const standardizeJid = (jid) => {
    if (!jid) return "";

    try {
        jid = typeof jid === "string"
            ? jid
            : (jid.decodeJid ? jid.decodeJid() : String(jid));

        jid = jid.split(":")[0].split("/")[0];

        if (!jid.includes("@")) {
            jid += "@s.whatsapp.net";
        } else if (jid.endsWith("@lid")) {
            return jid.toLowerCase();
        }

        return jid.toLowerCase();
    } catch (error) {
        console.error("JID standardization error:", error);
        return "";
    }
};

const isLidJid = (jid) =>
    String(jid || "").toLowerCase().endsWith("@lid");

/**
 * Return true for a usable one-to-one chat JID. Group, LID, status, and
 * newsletter identifiers are deliberately excluded from DM resolution.
 */
const isUsableDirectJid = (jid) => {
    const normalized = standardizeJid(jid);
    if (!normalized) return false;

    return !normalized.endsWith("@lid")
        && !normalized.endsWith("@g.us")
        && !normalized.endsWith("@broadcast")
        && !normalized.endsWith("@newsletter");
};

/**
 * Convert a LID to a normal JID when a mapping is available. If no mapping is
 * available, preserve the original LID so callers retain the same fallback
 * behavior supported by some Baileys versions.
 */
const convertLidToJid = (jid) => {
    const normalized = standardizeJid(jid);
    if (!normalized || !isLidJid(normalized)) return normalized;

    try {
        const cached = getLidMapping(normalized);
        if (cached) return standardizeJid(cached);
    } catch (_) {}

    return normalized;
};

/**
 * Resolve a direct-message LID into the JID that should be used for replies.
 *
 * Baileys may expose a DM as remoteJid=...@lid while also providing a usable
 * phone JID in remoteJidAlt, senderPn, or participantPn. If those fields are
 * absent, try the local LID cache, Baileys' resolver, and the persisted LID
 * mapping database before falling back to the original LID.
 */
const resolveMessageTarget = async (ms, Kiptenden, botId, isMessageYourself) => {
    if (isMessageYourself) return botId;

    const key = ms?.key || {};
    const rawRemoteJid = key.remoteJid || key.remoteJidAlt || "";
    const normalizedRemoteJid = standardizeJid(rawRemoteJid);

    if (!normalizedRemoteJid || !isLidJid(normalizedRemoteJid)) {
        return normalizedRemoteJid;
    }

    const directCandidates = [
        key.remoteJidAlt,
        key.senderPn,
        key.participantPn,
        key.participantAlt,
        ms?.remoteJidAlt,
        ms?.senderPn,
    ];

    for (const candidate of directCandidates) {
        if (isUsableDirectJid(candidate)) {
            return standardizeJid(candidate);
        }
    }

    try {
        const cached = getLidMapping(normalizedRemoteJid);
        if (isUsableDirectJid(cached)) {
            return standardizeJid(cached);
        }
    } catch (_) {}

    try {
        if (typeof Kiptenden?.getJidFromLid === "function") {
            const resolved = await Kiptenden.getJidFromLid(normalizedRemoteJid);
            if (isUsableDirectJid(resolved)) {
                return standardizeJid(resolved);
            }
        }
    } catch (_) {}

    try {
        const { getLidMappingFromDb } = require("../database/lidMapping");
        const persisted = await getLidMappingFromDb(normalizedRemoteJid);
        if (isUsableDirectJid(persisted)) {
            return standardizeJid(persisted);
        }
    } catch (_) {}

    // Some Baileys versions accept @lid directly. Keep the original as the
    // final fallback when no normal JID can be discovered.
    return normalizedRemoteJid;
};

const serializeMessage = async (ms, Kiptenden, settings = {}) => {
    if (!ms?.message || !ms?.key) return null;

    const botId = standardizeJid(Kiptenden?.user?.id);
    const type = getContentType(ms.message);

    const remoteJid = String(ms.key.remoteJid || ms.key.remoteJidAlt || "");
    const hasEntryPointContext =
        ms.message?.extendedTextMessage?.contextInfo?.entryPointConversionApp === "whatsapp" ||
        ms.message?.imageMessage?.contextInfo?.entryPointConversionApp === "whatsapp" ||
        ms.message?.videoMessage?.contextInfo?.entryPointConversionApp === "whatsapp" ||
        ms.message?.documentMessage?.contextInfo?.entryPointConversionApp === "whatsapp" ||
        ms.message?.audioMessage?.contextInfo?.entryPointConversionApp === "whatsapp";

    const isMessageYourself =
        hasEntryPointContext
        && remoteJid.endsWith("@lid")
        && ms.key.fromMe;

    // Critical DM fix: resolve @lid before the command reply helper uses `from`.
    const from = await resolveMessageTarget(
        ms,
        Kiptenden,
        botId,
        isMessageYourself,
    );
    const isGroup = from.endsWith("@g.us");

    const botNumber = String(Kiptenden?.user?.id || "").split(":")[0];
    const senderCandidates = ms.key.fromMe
        ? (botNumber
            ? `${botNumber}@s.whatsapp.net`
            : botId)
        : (
            ms.key.senderPn
            || ms.key.participantPn
            || ms.key.participantAlt
            || ms.key.remoteJidAlt
            || ms.key.remoteJid
            || ms.key.participant
            || ""
        );
    const sendr = standardizeJid(senderCandidates);

    let body = "";
    let isButtonResponse = false;
    let buttonId = null;

    if (ms.message?.interactiveResponseMessage) {
        isButtonResponse = true;
        try {
            const paramsJson =
                ms.message.interactiveResponseMessage.nativeFlowResponseMessage?.paramsJson;
            if (paramsJson) {
                buttonId = JSON.parse(paramsJson)?.id || null;
            }
        } catch (_) {
            buttonId = null;
        }

        if (!buttonId) {
            buttonId = ms.message.interactiveResponseMessage.buttonId || null;
        }

        body =
            buttonId
            || ms.message.interactiveResponseMessage?.body?.text
            || "";
    } else if (ms.message?.buttonsResponseMessage?.selectedButtonId) {
        isButtonResponse = true;
        buttonId = ms.message.buttonsResponseMessage.selectedButtonId;
        body = buttonId;
    } else if (ms.message?.listResponseMessage?.singleSelectReply?.selectedRowId) {
        isButtonResponse = true;
        buttonId = ms.message.listResponseMessage.singleSelectReply.selectedRowId;
        body = buttonId;
    } else if (ms.message?.templateButtonReplyMessage?.selectedId) {
        isButtonResponse = true;
        buttonId = ms.message.templateButtonReplyMessage.selectedId;
        body = buttonId;
    } else if (type === "conversation") {
        body = ms.message.conversation || "";
    } else if (type === "extendedTextMessage") {
        body = ms.message.extendedTextMessage?.text || "";
    } else if (type === "imageMessage" && ms.message.imageMessage?.caption) {
        body = ms.message.imageMessage.caption;
    } else if (type === "videoMessage" && ms.message.videoMessage?.caption) {
        body = ms.message.videoMessage.caption;
    }

    const botPrefix = settings.PREFIX || ".";
    const isCommand = typeof body === "string" && body.startsWith(botPrefix);
    const command = isCommand
        ? body.slice(botPrefix.length).trim().split(" ").shift().toLowerCase()
        : "";
    const args = typeof body === "string"
        ? body.trim().split(/\s+/).slice(1)
        : [];

    const repliedMessage =
        ms.message?.extendedTextMessage?.contextInfo?.quotedMessage || null;
    const quoted =
        type === "extendedTextMessage"
        && ms.message.extendedTextMessage.contextInfo != null
            ? ms.message.extendedTextMessage.contextInfo.quotedMessage || []
            : [];

    const mentionedJid = (
        ms.message?.extendedTextMessage?.contextInfo?.mentionedJid || []
    ).map(standardizeJid);

    const tagged =
        ms.mtype === "extendedTextMessage"
        && ms.message.extendedTextMessage.contextInfo != null
            ? ms.message.extendedTextMessage.contextInfo.mentionedJid
            : [];

    const contextInfo =
        ms.message?.extendedTextMessage?.contextInfo
        || ms.message?.imageMessage?.contextInfo
        || ms.message?.videoMessage?.contextInfo
        || ms.message?.audioMessage?.contextInfo
        || ms.message?.documentMessage?.contextInfo
        || ms.message?.stickerMessage?.contextInfo
        || null;

    const quotedMsg = contextInfo?.quotedMessage || null;
    const rawQuotedUser = contextInfo?.participant || contextInfo?.remoteJid;
    const quotedUser = convertLidToJid(standardizeJid(rawQuotedUser));
    const repliedMessageAuthor = convertLidToJid(
        standardizeJid(contextInfo?.participant),
    );

    const quotedStanzaId = contextInfo?.stanzaId || null;
    const quotedKey = quotedStanzaId
        ? {
            remoteJid: from,
            fromMe:
                rawQuotedUser === botId
                || contextInfo?.participant === botId,
            id: quotedStanzaId,
            participant: isGroup ? rawQuotedUser : undefined,
        }
        : null;

    let messageAuthor = isGroup
        ? standardizeJid(ms.key.participant || ms.participant || from)
        : from;
    if (ms.key.fromMe) messageAuthor = botId;

    const user = mentionedJid.length > 0
        ? mentionedJid[0]
        : repliedMessage
            ? repliedMessageAuthor
            : "";

    return {
        ms,
        mek: ms,
        type,
        from,
        isGroup,
        sender: sendr,
        botId,
        body,
        isCommand,
        command,
        args,
        q: args.join(" "),
        pushName:
            ms.pushName
            || (ms.key.fromMe ? Kiptenden?.user?.name : null)
            || "𝐀𝐓𝐀𝐒𝐒𝐀-𝐌𝐃 User",
        quoted,
        repliedMessage,
        mentionedJid,
        tagged,
        quotedMsg,
        quotedKey,
        quotedUser,
        repliedMessageAuthor,
        messageAuthor,
        user,
        prefix: botPrefix,
        isButtonResponse,
        buttonId,
    };
};

module.exports = {
    standardizeJid,
    convertLidToJid,
    serializeMessage,
    downloadContentFromMessage,
    downloadMediaMessage,
};
