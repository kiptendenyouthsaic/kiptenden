"use strict";

const { gmd } = require("../kiptenden");
const { getSetting, setSetting } = require("../kiptenden/database/settings");

const ORG_FIELDS = {
    mission: "ORG_MISSION",
    location: "ORG_LOCATION",
    programs: "ORG_PROGRAMS",
    contact: "ORG_CONTACT",
    email: "ORG_EMAIL",
    link: "ORG_LINK",
};

async function orgValue(key, fallback = "") {
    return (await getSetting(key).catch(() => "")) || fallback;
}

function programLines(value) {
    return String(value || "")
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((item, index) => `${index + 1}. ${item}`)
        .join("\n");
}

async function profileText(botName, botPrefix) {
    const [mission, location, programs, contact, email, link] = await Promise.all([
        orgValue("ORG_MISSION"),
        orgValue("ORG_LOCATION"),
        orgValue("ORG_PROGRAMS"),
        orgValue("ORG_CONTACT"),
        orgValue("ORG_EMAIL"),
        orgValue("ORG_LINK"),
    ]);
    const links = [email && `✉️ Email: ${email}`, link && `🔗 Link: ${link}`].filter(Boolean);
    return (
`┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  🌱  *${botName}*
┃  _Youth connection • growth • service_
┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━┃
┃  📍 ${location || "Kiptenden community"}
┃
┃  *Our mission*
┃  ${mission || "Empowering young people through connection and service."}
┃
┃  *Suggested focus areas*
${programLines(programs).split("\n").map((line) => `┃  ${line}`).join("\n")}
┃
┃  *Get involved*
┃  ${contact || "Ask an administrator for the official contact."}
${links.map((line) => `┃  ${line}`).join("\n")}
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
> _${botName} • type ${botPrefix}menu for more tools_`
    );
}

gmd({
    pattern: "kiptenden",
    aliases: ["youths", "ky", "community"],
    react: "🌱",
    category: "general",
    description: "Show the Kiptenden Youths community profile and ways to participate",
}, async (from, Kiptenden, conText) => {
    const { reply, botName, botPrefix } = conText;
    await reply(await profileText(botName || "KIPTENDEN YOUTHS", botPrefix || "."));
});

gmd({
    pattern: "programs",
    aliases: ["activities", "focusareas"],
    react: "📚",
    category: "general",
    description: "List Kiptenden Youths focus areas",
}, async (from, Kiptenden, conText) => {
    const { reply, botName } = conText;
    const programs = await orgValue("ORG_PROGRAMS");
    await reply(`📚 *${botName || "KIPTENDEN YOUTHS"} — Focus Areas*\n\n${programLines(programs) || "Program information has not been configured yet."}\n\n_Use .orginfo for official contact details._`);
});

gmd({
    pattern: "volunteer",
    aliases: ["getinvolved", "participate", "joinus"],
    react: "🤝",
    category: "general",
    description: "Show how to connect with or support the youth community",
}, async (from, Kiptenden, conText) => {
    const { reply, botName } = conText;
    const [contact, email, link] = await Promise.all([orgValue("ORG_CONTACT"), orgValue("ORG_EMAIL"), orgValue("ORG_LINK")]);
    const lines = [
        `🤝 *Get involved with ${botName || "KIPTENDEN YOUTHS"}*`,
        "",
        "You can support the community by volunteering, sharing skills, joining activities, mentoring, or helping with youth-led projects.",
        "",
        `📞 ${contact || "Official contact details are not configured yet."}`,
        email && `✉️ ${email}`,
        link && `🔗 ${link}`,
        "",
        "Please confirm current activities and registration details with an administrator before attending an event.",
    ].filter(Boolean);
    await reply(lines.join("\n"));
});

gmd({
    pattern: "orginfo",
    aliases: ["organization", "aboutky"],
    react: "ℹ️",
    category: "general",
    description: "Show official Kiptenden Youths organization information",
}, async (from, Kiptenden, conText) => {
    const { reply, botName, botPrefix } = conText;
    await reply(await profileText(botName || "KIPTENDEN YOUTHS", botPrefix || "."));
});

gmd({
    pattern: "setorginfo",
    aliases: ["setcommunity", "setyouthinfo"],
    react: "🛠️",
    category: "owner",
    description: "Configure organization information. Usage: .setorginfo field | value",
}, async (from, Kiptenden, conText) => {
    const { q, reply, isSuperUser } = conText;
    if (!isSuperUser) return reply("❌ Owner only.");
    const raw = String(q || "");
    const [fieldRaw, ...valueParts] = raw.split("|");
    const field = String(fieldRaw || "").trim().toLowerCase();
    const value = valueParts.join("|").trim();
    if (!ORG_FIELDS[field] || !value) {
        return reply("🛠️ *Organization settings*\n\nUsage: `.setorginfo field | value`\n\nFields: `mission`, `location`, `programs`, `contact`, `email`, `link`\nFor `programs`, separate items with `|`.");
    }
    await setSetting(ORG_FIELDS[field], value);
    await reply(`✅ Updated *${field}*.\n\nUse *.orginfo* or *.kiptenden* to review the public profile.`);
});
