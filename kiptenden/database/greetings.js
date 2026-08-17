"use strict";

const { DataTypes } = require("sequelize");
const { DATABASE } = require("./database");

/**
 * Persistent list of chats and direct-message recipients that receive
 * scheduled greetings. The command handlers live in kiptenden-plugins/greetings.js;
 * this module is intentionally limited to database access.
 */
const GreetingsDB = DATABASE.define(
    "GreetingsChat",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        jid: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
        },
        type: {
            type: DataTypes.STRING(32),
            allowNull: false,
            defaultValue: "dm",
        },
    },
    {
        tableName: "greetings_chats",
        timestamps: true,
        indexes: [{ unique: true, fields: ["jid"] }],
    },
);

let initialized = false;

function normalizeJid(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;

    if (raw === "status@broadcast") return raw;

    const [address, domain = ""] = raw.split("@");
    const cleanAddress = String(address || "").trim();
    const normalizedDomain = domain.toLowerCase();

    if (!cleanAddress) return null;

    // Preserve the JID domains used by Baileys, including LID identities.
    if (["s.whatsapp.net", "g.us", "lid", "newsletter", "broadcast"].includes(normalizedDomain)) {
        return `${cleanAddress}@${normalizedDomain}`;
    }

    // Numeric input is accepted as a convenience for .addchats.
    const digits = raw.replace(/\D/g, "");
    if (!domain && digits.length >= 7) return `${digits}@s.whatsapp.net`;

    return null;
}

function jidType(jid) {
    if (jid.endsWith("@g.us")) return "group";
    if (jid.endsWith("@newsletter")) return "newsletter";
    if (jid === "status@broadcast" || jid.endsWith("@broadcast")) return "broadcast";
    return "dm";
}

async function initGreetingsDB() {
    if (initialized) return GreetingsDB;

    await GreetingsDB.sync();
    initialized = true;
    console.log("✅ Greetings Database Initialized.");
    return GreetingsDB;
}

async function addGreetingsChat(value) {
    const jid = normalizeJid(value);
    if (!jid) throw new Error(`Invalid greetings recipient: ${value}`);

    await initGreetingsDB();
    const [chat] = await GreetingsDB.findOrCreate({
        where: { jid },
        defaults: { jid, type: jidType(jid) },
    });
    return chat;
}

async function removeGreetingsChat(value) {
    const jid = normalizeJid(value);
    if (!jid) return false;

    await initGreetingsDB();
    const deleted = await GreetingsDB.destroy({ where: { jid } });
    return deleted > 0;
}

async function hasGreetingsChat(value) {
    const jid = normalizeJid(value);
    if (!jid) return false;

    await initGreetingsDB();
    return Boolean(await GreetingsDB.findOne({ where: { jid }, attributes: ["id"] }));
}

async function getAllGreetingsChats() {
    await initGreetingsDB();
    return GreetingsDB.findAll({
        order: [["createdAt", "ASC"], ["id", "ASC"]],
        raw: true,
    });
}

async function countGreetingsChats() {
    await initGreetingsDB();
    return GreetingsDB.count();
}

module.exports = {
    GreetingsDB,
    initGreetingsDB,
    addGreetingsChat,
    removeGreetingsChat,
    hasGreetingsChat,
    getAllGreetingsChats,
    countGreetingsChats,
    normalizeJid,
};
