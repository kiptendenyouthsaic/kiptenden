"use strict";

const { DATABASE } = require("./database");
const { DataTypes, Op } = require("sequelize");

const ContactRegistryDB = DATABASE.define(
    "BotContactRegistry",
    {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        jid: { type: DataTypes.STRING(191), allowNull: false, unique: true },
        phone: { type: DataTypes.STRING(32), allowNull: true },
        name: { type: DataTypes.STRING(255), allowNull: true },
        chatJid: { type: DataTypes.STRING(191), allowNull: true },
        chatType: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "dm" },
        messageCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        firstSeenAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        lastSeenAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    {
        tableName: "bot_contact_registry",
        timestamps: true,
        indexes: [
            { fields: ["phone"] },
            { fields: ["lastSeenAt"] },
        ],
    },
);

let initPromise = null;

async function initContactRegistry() {
    if (!initPromise) {
        initPromise = ContactRegistryDB.sync().catch((error) => {
            initPromise = null;
            throw error;
        });
    }
    await initPromise;
}

function normalizeJid(value) {
    if (!value) return "";
    let jid = String(value).trim().toLowerCase();
    if (!jid) return "";
    jid = jid.split(":")[0].split("/")[0];
    if (!jid.includes("@")) jid += "@s.whatsapp.net";
    return jid;
}

function extractPhone(jid) {
    const normalized = normalizeJid(jid);
    if (!normalized || normalized.endsWith("@lid") || normalized.endsWith("@g.us")) return null;
    const number = normalized.split("@")[0].replace(/\D/g, "");
    return number || null;
}

function cleanName(value) {
    const name = String(value || "").trim().replace(/\s+/g, " ");
    if (!name || name === "𝐀𝐓𝐀𝐒𝐒𝐀-𝐌𝐃 User" || name === "WhatsApp user") return null;
    return name.slice(0, 255);
}

function selectContactJid({ sender, rawSender, message, from }) {
    const candidates = [
        sender,
        rawSender,
        message?.key?.senderPn,
        message?.key?.participantPn,
        message?.key?.participantAlt,
        message?.key?.remoteJidAlt,
        message?.key?.participant,
        message?.key?.remoteJid,
        from,
    ].map(normalizeJid).filter(Boolean);

    // Prefer a phone-number JID over a temporary @lid identity when available.
    return candidates.find((jid) => !jid.endsWith("@lid") && !jid.endsWith("@g.us"))
        || candidates.find((jid) => !jid.endsWith("@g.us"))
        || "";
}

function isRegistryEnabled(settings = {}) {
    const configured = process.env.CONTACT_REGISTRY ?? settings.CONTACT_REGISTRY ?? "true";
    return String(configured).toLowerCase() !== "false";
}

/**
 * Record only identity and activity metadata. Message contents are deliberately
 * not stored, and this function never sends an outbound message.
 */
async function registerInboundContact({
    message,
    from,
    sender,
    rawSender,
    pushName,
    isGroup,
    settings,
} = {}) {
    if (!isRegistryEnabled(settings) || message?.key?.fromMe) return null;

    const jid = selectContactJid({ sender, rawSender, message, from });
    if (!jid || jid.endsWith("@g.us")) return null;

    const phone = extractPhone(jid);
    const name = cleanName(pushName || message?.pushName);
    const chatJid = normalizeJid(from) || null;
    const chatType = isGroup ? "group" : "dm";
    const now = new Date();

    await initContactRegistry();

    const [record, created] = await ContactRegistryDB.findOrCreate({
        where: { jid },
        defaults: {
            jid,
            phone,
            name,
            chatJid,
            chatType,
            messageCount: 1,
            firstSeenAt: now,
            lastSeenAt: now,
        },
    });

    if (!created) {
        const updates = {
            phone: phone || record.phone || null,
            chatJid,
            chatType,
            messageCount: Number(record.messageCount || 0) + 1,
            lastSeenAt: now,
        };
        if (name) updates.name = name;
        await record.update(updates);
    }

    return {
        jid,
        phone,
        name: name || record.name || null,
        created,
    };
}

async function countRegisteredContacts() {
    await initContactRegistry();
    return ContactRegistryDB.count();
}

async function listRegisteredContacts({ limit = 100, offset = 0 } = {}) {
    await initContactRegistry();
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const rows = await ContactRegistryDB.findAll({
        order: [["lastSeenAt", "DESC"]],
        limit: safeLimit,
        offset: safeOffset,
    });
    return rows.map((row) => row.get({ plain: true }));
}

async function purgeRegisteredContactsBefore(date) {
    await initContactRegistry();
    const cutoff = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(cutoff.getTime())) throw new Error("Invalid contact purge date");
    return ContactRegistryDB.destroy({ where: { lastSeenAt: { [Op.lt]: cutoff } } });
}

module.exports = {
    ContactRegistryDB,
    initContactRegistry,
    registerInboundContact,
    countRegisteredContacts,
    listRegisteredContacts,
    purgeRegisteredContactsBefore,
    normalizeContactJid: normalizeJid,
};

// Keep the helper pure and easy to exercise without connecting to a WhatsApp account.
module.exports._private = { normalizeJid, extractPhone, cleanName, selectContactJid, isRegistryEnabled };
