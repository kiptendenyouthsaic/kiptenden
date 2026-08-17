"use strict";

const fs = require("fs");
const path = require("path");

const root = __dirname;
const chatbot = require(path.join(root, "kiptenden", "gmdFunctions2.js"));
const eventHandlersSource = fs.readFileSync(
    path.join(root, "kiptenden", "eventHandlers.js"),
    "utf8",
);
const settingsSource = fs.readFileSync(
    path.join(root, "kiptenden-plugins", "settings.js"),
    "utf8",
);

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

(async () => {
    assert(chatbot.shouldChatbotRespond("254700000000@s.whatsapp.net", "inbox") === true,
        "inbox mode must accept private DM JIDs");
    assert(chatbot.shouldChatbotRespond("120363000000000000@g.us", "inbox") === false,
        "inbox mode must reject group JIDs");
    assert(chatbot.shouldChatbotRespond("120363000000000000@g.us", "groups") === true,
        "groups mode must accept group JIDs");
    assert(chatbot.shouldChatbotRespond("254700000000000@s.whatsapp.net", "groups") === false,
        "groups mode must reject private DM JIDs");

    const alternateTarget = await chatbot.resolveChatbotTarget(
        {},
        { key: {
            remoteJid: "1234567890@lid",
            remoteJidAlt: "254700000000@s.whatsapp.net",
        } },
    );
    assert(alternateTarget === "254700000000@s.whatsapp.net",
        "resolver must prefer Baileys remoteJidAlt for @lid messages");

    const mappedTarget = await chatbot.resolveChatbotTarget(
        { getJidFromLid: async () => "254711111111@s.whatsapp.net" },
        { key: { remoteJid: "9876543210@lid" } },
    );
    assert(mappedTarget === "254711111111@s.whatsapp.net",
        "resolver must use Baileys getJidFromLid when no alternate JID is present");

    const longText = "A".repeat(8000);
    const chunks = chatbot.splitWhatsAppText(longText, 3500);
    assert(chunks.length === 3, "long chatbot responses must be split into ordered chunks");
    assert(chunks.join("") === longText, "chunking must preserve the complete response");
    assert(chunks.every((chunk) => chunk.length <= 3500), "chatbot chunks must stay within the limit");

    const startupRegistration = eventHandlersSource.indexOf("KiptendenChatBot(");
    const messageListener = eventHandlersSource.indexOf('Kiptenden.ev.on("messages.upsert"', startupRegistration);
    assert(startupRegistration >= 0 && messageListener > startupRegistration,
        "chatbot must be registered before the anti-link message listener");
    assert(!eventHandlersSource.includes("if (s.CHATBOT === \"true\" || s.CHATBOT === \"audio\")"),
        "chatbot registration must not remain lazy behind the first-message setting check");
    assert(settingsSource.includes('const routingModes = ["inbox", "groups", "allchats"];'),
        ".chatbot must recognize inbox, groups, and allchats routing modes");
    assert(settingsSource.includes('await setSetting("CHATBOT_MODE", raw);'),
        ".chatbot inbox must persist the selected mode");

    console.log("INBOX CHATBOT ROUTING SMOKE PASS");
})()
    .catch((error) => {
        console.error("INBOX CHATBOT ROUTING SMOKE FAIL:", error.message);
        process.exitCode = 1;
    })
    .finally(() => {
        setTimeout(() => process.exit(process.exitCode || 0), 50);
    });

module.exports = {};

