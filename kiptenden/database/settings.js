const { DATABASE } = require("./database");
const { DataTypes } = require("sequelize");
const path = require("path");
const config = require("../config");

const packageJson = require("../../package.json");

const DEFAULT_OWNER_NUMBER = (process.env.OWNER_NUMBER || "254796271291").replace(/\D/g, "");

const SettingsDB = DATABASE.define(
    "BotSettings",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        key: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        value: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    },
    {
        tableName: "bot_settings",
        timestamps: true,
    },
);

const DEFAULT_SETTINGS = {
    PREFIX: ".",
    OWNER_NAME: "Kiptenden Youths",
    OWNER_NUMBER: DEFAULT_OWNER_NUMBER,
    BOT_NAME: "KIPTENDEN YOUTHS",
    FOOTER: "Powered by Kiptenden Youths",
    CAPTION: "🌱 Kiptenden Youths | Empowering youth, growing together",
    BOT_PIC: process.env.BOT_PIC || "",
    VERSION: packageJson.version || "2.0.0",
    MODE: config.MODE || "public",
    WARN_COUNT: "3",  // legacy alias — WARN_LIMIT (in extended settings) is the canonical key
    TIME_ZONE: config.TIME_ZONE || "Africa/Nairobi",
    DM_PRESENCE: "online",
    GC_PRESENCE: "online",
    CHATBOT: "false",
    CHATBOT_MODE: process.env.CHATBOT_MODE || "allchats",
    STARTING_MESSAGE: "true",
    ANTIDELETE: "indm",
    ANTI_EDIT: "indm",
    ANTICALL: "false",
    ANTICALL_MSG: "*_📞 Auto Call Reject Mode Active. 📵 No Calls Allowed!_*",
    AUTO_LIKE_STATUS: config.AUTO_LIKE_STATUS || "true",
    AUTO_READ_STATUS: config.AUTO_READ_STATUS || "true",
    STATUS_LIKE_EMOJIS: "🥼,🏅,🎖️,🧧,🎐,🏅,🏆,🥇,🥈,🏆",
    AUTO_REPLY_STATUS: "false",
    STATUS_REPLY_TEXT: "*✨ Your status viewed successfully! ✨*",
    AUTO_REACT: "off",
    AUTO_REPLY: "false",
    AUTO_READ_MESSAGES: "off",
    AUTO_BIO: "true",
    AUTO_BLOCK: "",
    AUTO_JOIN: "true",  // Added auto join setting
    YT: process.env.YT || "",
    NEWSLETTER_JID: process.env.NEWSLETTER_JID || "",
    GC_JID: process.env.GC_JID || "",  // Updated group invite code
    NEWSLETTER_URL: process.env.NEWSLETTER_URL || "",
    BOT_REPO: process.env.BOT_REPO || "",
    AUTO_UPDATE: process.env.AUTO_UPDATE || "false",
    PACK_NAME: "KIPTENDEN YOUTHS",
    PACK_AUTHOR: "KIPTENDEN YOUTHS",
    SUDO_NUMBERS: "",
    PM_PERMIT: "false",
    GREETINGS_ENABLED: "false",
    GREETINGS_GM_TIME: "06:00",
    GREETINGS_GN_TIME: "22:00",
    GREETINGS_GM_MSG: "",
    GREETINGS_GN_MSG: "",
    GREETINGS_AUTOTRACK: "true",
    // Kiptenden Youths organization profile (customize with .setorginfo)
    ORG_MISSION: "Empowering young people through connection, skills, leadership, and service.",
    ORG_LOCATION: "Kiptenden community",
    ORG_PROGRAMS: "Skills and digital literacy | Mentorship and leadership | Entrepreneurship and livelihoods | Sports, arts and wellbeing | Community service and volunteering",
    ORG_CONTACT: "Ask an administrator to configure the official contact.",
    ORG_EMAIL: "",
    ORG_LINK: "",
    // Extended settings (settings3)
    WARN_LIMIT: "3",
    AUTO_MUTE: "false",
    REJECT_CALL: "false",
    BOT_LANG: "en",
    GROUP_JOIN_ACTION: "join",
    TAG_PROTECT: "false",
    GLOBAL_SPAM_FILTER: "false",
    BOT_PREFIX: ".",
    BOT_BIO: "Kiptenden Youths — Empowering youth, growing together.",
    BOT_VERSION: packageJson.version || "5.0.0",
    MENU_THEME: "community",
    // Anti-viewonce / VV tracker
    ANTIVIEWONCE: "indm",
    VV_TRACKER: "true",
    AUTO_CHANNEL_LIKE: "true",
    // DM permit action
    DM_PERMIT_ACTION: "warn",
    DM_PERMIT_MSG: "⚠️ *PM Permit Active!* You are not allowed to DM this bot. Please contact the owner.",
};

let initialized = false;

const SETTINGS_CACHE_TTL = 30000;
let _settingsCache = null;
let _settingsCacheTs = 0;

function invalidateSettingsCache() {
    _settingsCache = null;
    _settingsCacheTs = 0;
}

const GROUP_ONLY_SETTINGS = [
    "WELCOME_MESSAGE",
    "GOODBYE_MESSAGE",
    "GROUP_EVENTS",
    "ANTILINK",
];

async function initializeSettings() {
    if (initialized) return;

    await SettingsDB.sync();

    await SettingsDB.destroy({
        where: { key: GROUP_ONLY_SETTINGS },
    });

    for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
        await SettingsDB.findOrCreate({
            where: { key },
            defaults: { key, value: defaultValue },
        });
    }

    // Force-sync settings that must always match the current default.
    // Uses UPDATE (not upsert) so it works reliably on both SQLite and PostgreSQL.
    const ALWAYS_SYNC = ["BOT_PIC", "BOT_REPO"];
    for (const key of ALWAYS_SYNC) {
        const defaultValue = DEFAULT_SETTINGS[key];
        if (defaultValue) {
            await SettingsDB.update({ value: defaultValue }, { where: { key } });
        }
    }

    // If an older database has no owner number, seed the configured default.
    // A non-empty database value remains editable through the owner settings command.
    const ownerRecord = await SettingsDB.findOne({ where: { key: "OWNER_NUMBER" } });
    if (ownerRecord && !String(ownerRecord.value || "").replace(/\D/g, "") && DEFAULT_OWNER_NUMBER) {
        await ownerRecord.update({ value: DEFAULT_OWNER_NUMBER });
    }

    initialized = true;
    console.log("✅ KIPTENDEN YOUTHS Settings Initialized");
}

async function getSetting(key) {
    if (!initialized) await initializeSettings();

    const now = Date.now();
    if (_settingsCache && (now - _settingsCacheTs) < SETTINGS_CACHE_TTL) {
        return _settingsCache[key] ?? DEFAULT_SETTINGS[key] ?? null;
    }

    const record = await SettingsDB.findOne({ where: { key } });
    if (record) {
        return record.value;
    }

    return DEFAULT_SETTINGS[key] || null;
}

async function setSetting(key, value) {
    if (!initialized) await initializeSettings();

    const [record, created] = await SettingsDB.findOrCreate({
        where: { key },
        defaults: { key, value },
    });

    if (!created) {
        record.value = value;
        await record.save();
    }

    invalidateSettingsCache();
    return true;
}

async function getAllSettings() {
    if (!initialized) await initializeSettings();

    const now = Date.now();
    if (_settingsCache && (now - _settingsCacheTs) < SETTINGS_CACHE_TTL) {
        return { ..._settingsCache };
    }

    const records = await SettingsDB.findAll();
    const settings = { ...DEFAULT_SETTINGS };
    for (const record of records) {
        settings[record.key] = record.value;
    }

    _settingsCache = settings;
    _settingsCacheTs = now;

    return { ...settings };
}

async function resetSetting(key) {
    if (!initialized) await initializeSettings();

    const defaultValue = DEFAULT_SETTINGS[key];
    if (defaultValue !== undefined) {
        await setSetting(key, defaultValue);
        invalidateSettingsCache();
        return defaultValue;
    }
    return null;
}

async function resetAllSettings() {
    if (!initialized) await initializeSettings();

    for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
        await setSetting(key, defaultValue);
    }
    invalidateSettingsCache();
    return true;
}

module.exports = {
    SettingsDB,
    DEFAULT_SETTINGS,
    initializeSettings,
    getSetting,
    setSetting,
    getAllSettings,
    resetSetting,
    resetAllSettings,
};
