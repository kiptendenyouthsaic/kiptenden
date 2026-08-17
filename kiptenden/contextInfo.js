
async function getContextInfo(mentionedJid = []) {
    const { getSetting } = require("./database/settings");
    const botName = await getSetting("BOT_NAME") || "KIPTENDEN YOUTHS";
    const channelJid = await getSetting("NEWSLETTER_JID").catch(() => "");
    const context = { mentionedJid, forwardingScore: 1, isForwarded: true };
    if (channelJid) {
        context.forwardedNewsletterMessageInfo = {
            newsletterJid: channelJid,
            newsletterName: botName,
            serverMessageId: -1,
        };
    }
    return context;
}

module.exports = { getContextInfo };
