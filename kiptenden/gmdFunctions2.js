
const fs = require("fs-extra");
const path = require("path");
const { pipeline } = require("stream/promises");
const { createContext } = require("./gmdHelpers");
const { getSetting, getAllSettings } = require("./database/settings");
const logger = require("@whiskeysockets/baileys/lib/Utils/logger").default.child({});
const { isJidGroup, downloadMediaMessage } = require("@whiskeysockets/baileys");
const { queryAI } = require("./aiProvider");



const formatTime = (timestamp, timeZone = 'Africa/Nairobi') => {
    const date = new Date(timestamp);
    const options = { hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true, timeZone };
    return new Intl.DateTimeFormat('en-US', options).format(date);
};

const formatDate = (timestamp, timeZone = 'Africa/Nairobi') => {
    const date = new Date(timestamp);
    const options = { day: '2-digit', month: '2-digit', year: 'numeric', timeZone };
    return new Intl.DateTimeFormat('en-GB', options).format(date); 
};

const isMediaMessage = message => {
    const typeOfMessage = getContentType(message);
    const mediaTypes = [
        'imageMessage',
        'videoMessage',
        'audioMessage',
        'documentMessage',
        'stickerMessage'
    ];
    return mediaTypes.includes(typeOfMessage);
};


const isAnyLink = (message) => {
    if (!message || typeof message !== 'string') return false;
    if (/https?:\/\/[^\s]+/i.test(message)) return true;
    if (/(?:^|\s)www\.[a-z0-9-]+\.[a-z]{2,}[^\s]*/i.test(message)) return true;
    if (/(?:^|\s)(?:chat\.whatsapp\.com|wa\.me|t\.me|youtu\.be|bit\.ly|tinyurl\.com|goo\.gl|rb\.gy|is\.gd|shorturl\.at|cutt\.ly|ow\.ly)\/[^\s]*/i.test(message)) return true;
    return false;
};

// Detect if a message is a forwarded channel post
const isChannelForward = (message) => {
    const ctx = message?.message?.[Object.keys(message.message || {})[0]]?.contextInfo;
    if (!ctx) return false;
    if (ctx.forwardedNewsletterMessageInfo?.newsletterJid) return true;
    if (ctx.forwardingScore && ctx.forwardingScore > 0) return true;
    return false;
};

// Detect WhatsApp group invite links
const isGroupInvite = (message) => {
    if (message?.message?.groupInviteMessage) return true;
    const body = message?.message?.conversation || message?.message?.extendedTextMessage?.text || '';
    return /chat\.whatsapp\.com\/[A-Za-z0-9]{20,}/i.test(body);
};


const emojis = ['💘', '💝', '💖', '💗', '💓', '💞', '💕', '💟', '❣️', '💔', '❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '❤️‍', '🔥', '❤️‍', '🩹', '💯', '♨️', '💢', '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '💤', '🌐', '♠️', '♥️', '♦️', '♣️', '🃏', '🀄️', '🎴', '🎭️', '🔇', '🔈️', '🔉', '🔊', '🔔', '🔕', '🎼', '🎵', '🎶', '💹', '🏧', '🚮', '🚰', '♿️', '🚹️', '🚺️', '🚻', '🚼️', '🚾', '🛂', '🛃', '🛄', '🛅', '⚠️', '🚸', '⛔️', '🚫', '🚳', '🚭️', '🚯', '🚱', '🚷', '📵', '🔞', '☢️', '☣️', '⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️', '↕️', '↔️', '↩️', '↪️', '⤴️', '⤵️', '🔃', '🔄', '🔙', '🔚', '🔛', '🔜', '🔝', '🛐', '⚛️', '🕉️', '✡️', '☸️', '☯️', '✝️', '☦️', '☪️', '☮️', '🕎', '🔯', '♈️', '♉️', '♊️', '♋️', '♌️', '♍️', '♎️', '♏️', '♐️', '♑️', '♒️', '♓️', '⛎', '🔀', '🔁', '🔂', '▶️', '⏩️', '⏭️', '⏯️', '◀️', '⏪️', '⏮️', '🔼', '⏫', '🔽', '⏬', '⏸️', '⏹️', '⏺️', '⏏️', '🎦', '🔅', '🔆', '📶', '📳', '📴', '♀️', '♂️', '⚧', '✖️', '➕', '➖', '➗', '♾️', '‼️', '⁉️', '❓️', '❔', '❕', '❗️', '〰️', '💱', '💲', '⚕️', '♻️', '⚜️', '🔱', '📛', '🔰', '⭕️', '✅', '☑️', '✔️', '❌', '❎', '➰', '➿', '〽️', '✳️', '✴️', '❇️', '©️', '®️', '™️', '#️⃣', '*️⃣', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔠', '🔡', '🔢', '🔣', '🔤', '🅰️', '🆎', '🅱️', '🆑', '🆒', '🆓', 'ℹ️', '🆔', 'Ⓜ️', '🆕', '🆖', '🅾️', '🆗', '🅿️', '🆘', '🆙', '🆚', '🈁', '🈂️', '🈷️', '🈶', '🈯️', '🉐', '🈹', '🈚️', '🈲', '🉑', '🈸', '🈴', '🈳', '㊗️', '㊙️', '🈺', '🈵', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '🟤', '⚫️', '⚪️', '🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '🟫', '⬛️', '⬜️', '◼️', '◻️', '◾️', '◽️', '▪️', '▫️', '🔶', '🔷', '🔸', '🔹', '🔺', '🔻', '💠', '🔘', '🔳', '🔲', '🕛️', '🕧️', '🕐️', '🕜️', '🕑️', '🕝️', '🕒️', '🕞️', '🕓️', '🕟️', '🕔️', '🕠️', '🕕️', '🕡️', '🕖️', '🕢️', '🕗️', '🕣️', '🕘️', '🕤️', '🕙️', '🕥️', '🕚️', '🕦️', '*️', '#️', '0️', '1️', '2️', '3️', '4️', '5️', '6️', '7️', '8️', '9️', '🛎️', '🧳', '⌛️', '⏳️', '⌚️', '⏰', '⏱️', '⏲️', '🕰️', '🌡️', '🗺️', '🧭', '🎃', '🎄', '🧨', '🎈', '🎉', '🎊', '🎎', '🎏', '🎐', '🎀', '🎁', '🎗️', '🎟️', '🎫', '🔮', '🧿', '🎮️', '🕹️', '🎰', '🎲', '♟️', '🧩', '🧸', '🖼️', '🎨', '🧵', '🧶', '👓️', '🕶️', '🥽', '🥼', '🦺', '👔', '👕', '👖', '🧣', '🧤', '🧥', '🧦', '👗', '👘', '🥻', '🩱', '🩲', '🩳', '👙', '👚', '👛', '👜', '👝', '🛍️', '🎒', '👞', '👟', '🥾', '🥿', '👠', '👡', '🩰', '👢', '👑', '👒', '🎩', '🎓️', '🧢', '⛑️', '📿', '💄', '💍', '💎', '📢', '📣', '📯', '🎙️', '🎚️', '🎛️', '🎤', '🎧️', '📻️', '🎷', '🎸', '🎹', '🎺', '🎻', '🪕', '🥁', '📱', '📲', '☎️', '📞', '📟️', '📠', '🔋', '🔌', '💻️', '🖥️', '🖨️', '⌨️', '🖱️', '🖲️', '💽', '💾', '💿️', '📀', '🧮', '🎥', '🎞️', '📽️', '🎬️', '📺️', '📷️', '📸', '📹️', '📼', '🔍️', '🔎', '🕯️', '💡', '🔦', '🏮', '🪔', '📔', '📕', '📖', '📗', '📘', '📙', '📚️', '📓', '📒', '📃', '📜', '📄', '📰', '🗞️', '📑', '🔖', '🏷️', '💰️', '💴', '💵', '💶', '💷', '💸', '💳️', '🧾', '✉️', '💌', '📧', '🧧', '📨', '📩', '📤️', '📥️', '📦️', '📫️', '📪️', '📬️', '📭️', '📮', '🗳️', '✏️', '✒️', '🖋️', '🖊️', '🖌️', '🖍️', '📝', '💼', '📁', '📂', '🗂️', '📅', '📆', '🗒️', '🗓️', '📇', '📈', '📉', '📊', '📋️', '📌', '📍', '📎', '🖇️', '📏', '📐', '✂️', '🗃️', '🗄️', '🗑️', '🔒️', '🔓️', '🔏', '🔐', '🔑', '🗝️', '🔨', '🪓', '⛏️', '⚒️', '🛠️', '🗡️', '⚔️', '💣️', '🏹', '🛡️', '🔧', '🔩', '⚙️', '🗜️', '⚖️', '🦯', '🔗', '⛓️', '🧰', '🧲', '⚗️', '🧪', '🧫', '🧬', '🔬', '🔭', '📡', '💉', '🩸', '💊', '🩹', '🩺', '🚪', '🛏️', '🛋️', '🪑', '🚽', '🚿', '🛁', '🪒', '🧴', '🧷', '🧹', '🧺', '🧻', '🧼', '🧽', '🧯', '🛒', '🚬', '⚰️', '⚱️', '🏺', '🕳️', '🏔️', '⛰️', '🌋', '🗻', '🏕️', '🏖️', '🏜️', '🏝️', '🏟️', '🏛️', '🏗️', '🧱', '🏘️', '🏚️', '🏠️', '🏡', '🏢', '🏣', '🏤', '🏥', '🏦', '🏨', '🏩', '🏪', '🏫', '🏬', '🏭️', '🏯', '🏰', '💒', '🗼', '🗽', '⛪️', '🕌', '🛕', '🕍', '⛩️', '🕋', '⛲️', '⛺️', '🌁', '🌃', '🏙️', '🌄', '🌅', '🌆', '🌇', '🌉', '🗾', '🏞️', '🎠', '🎡', '🎢', '💈', '🎪', '🚂', '🚃', '🚄', '🚅', '🚆', '🚇️', '🚈', '🚉', '🚊', '🚝', '🚞', '🚋', '🚌', '🚍️', '🚎', '🚐', '🚑️', '🚒', '🚓', '🚔️', '🚕', '🚖', '🚗', '🚘️', '🚙', '🚚', '🚛', '🚜', '🏎️', '🏍️', '🛵', '🦽', '🦼', '🛺', '🚲️', '🛴', '🛹', '🚏', '🛣️', '🛤️', '🛢️', '⛽️', '🚨', '🚥', '🚦', '🛑', '🚧', '⚓️', '⛵️', '🛶', '🚤', '🛳️', '⛴️', '🛥️', '🚢', '✈️', '🛩️', '🛫', '🛬', '🪂', '💺', '🚁', '🚟', '🚠', '🚡', '🛰️', '🚀', '🛸', '🎆', '🎇', '🎑', '🗿', '⚽️', '⚾️', '🥎', '🏀', '🏐', '🏈', '🏉', '🎾', '🥏', '🎳', '🏏', '🏑', '🏒', '🥍', '🏓', '🏸', '🥊', '🥋', '🥅', '⛳️', '⛸️', '🎣', '🤿', '🎽', '🎿', '🛷', '🥌', '🎯', '🪀', '🪁', '🎱', '🎖️', '🏆️', '🏅', '🥇', '🥈', '🥉', '🍇', '🍈', '🍉', '🍊', '🍋', '🍌', '🍍', '🥭', '🍎', '🍏', '🍐', '🍑', '🍒', '🍓', '🥝', '🍅', '🥥', '🥑', '🍆', '🥔', '🥕', '🌽', '🌶️', '🥒', '🥬', '🥦', '🧄', '🧅', '🍄', '🥜', '🌰', '🍞', '🥐', '🥖', '🥨', '🥯', '🥞', '🧇', '🧀', '🍖', '🍗', '🥩', '🥓', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🥙', '🧆', '🥚', '🍳', '🥘', '🍲', '🥣', '🥗', '🍿', '🧈', '🧂', '🥫', '🍱', '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣', '🍤', '🍥', '🥮', '🍡', '🥟', '🥠', '🥡', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', '🍭', '🍮', '🍯', '🍼', '🥛', '☕️', '🍵', '🍶', '🍾', '🍷', '🍸️', '🍹', '🍺', '🍻', '🥂', '🥃', '🥤', '🧃', '🧉', '🧊', '🥢', '🍽️', '🍴', '🥄', '🔪', '🐵', '🐒', '🦍', '🦧', '🐶', '🐕️', '🦮', '🐕‍', '🦺', '🐩', '🐺', '🦊', '🦝', '🐱', '🐈️', '🐈‍', '🦁', '🐯', '🐅', '🐆', '🐴', '🐎', '🦄', '🦓', '🦌', '🐮', '🐂', '🐃', '🐄', '🐷', '🐖', '🐗', '🐽', '🐏', '🐑', '🐐', '🐪', '🐫', '🦙', '🦒', '🐘', '🦏', '🦛', '🐭', '🐁', '🐀', '🐹', '🐰', '🐇', '🐿️', '🦔', '🦇', '🐻', '🐻‍', '❄️', '🐨', '🐼', '🦥', '🦦', '🦨', '🦘', '🦡', '🐾', '🦃', '🐔', '🐓', '🐣', '🐤', '🐥', '🐦️', '🐧', '🕊️', '🦅', '🦆', '🦢', '🦉', '🦩', '🦚', '🦜', '🐸', '🐊', '🐢', '🦎', '🐍', '🐲', '🐉', '🦕', '🦖', '🐳', '🐋', '🐬', '🐟️', '🐠', '🐡', '🦈', '🐙', '🦑', '🦀', '🦞', '🦐', '🦪', '🐚', '🐌', '🦋', '🐛', '🐜', '🐝', '🐞', '🦗', '🕷️', '🕸️', '🦂', '🦟', '🦠', '💐', '🌸', '💮', '🏵️', '🌹', '🥀', '🌺', '🌻', '🌼', '🌷', '🌱', '🌲', '🌳', '🌴', '🌵', '🎋', '🎍', '🌾', '🌿', '☘️', '🍀', '🍁', '🍂', '🍃', '🌍️', '🌎️', '🌏️', '🌑', '🌒', '🌓', '🌔', '🌕️', '🌖', '🌗', '🌘', '🌙', '🌚', '🌛', '🌜️', '☀️', '🌝', '🌞', '🪐', '💫', '⭐️', '🌟', '✨', '🌠', '🌌', '☁️', '⛅️', '⛈️', '🌤️', '🌥️', '🌦️', '🌧️', '🌨️', '🌩️', '🌪️', '🌫️', '🌬️', '🌀', '🌈', '🌂', '☂️', '☔️', '⛱️', '⚡️', '❄️', '☃️', '⛄️', '☄️', '🔥', '💧', '🌊', '💥', '💦', '💨', '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '☺️', '😚', '😙', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐️', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '😮‍', '💨', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '😶‍', '🌫️', '🥴', '😵‍', '💫', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽️', '👾', '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '🙈', '🙉', '🙊', '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈️', '👉️', '👆️', '🖕', '👇️', '☝️', '👍️', '👎️', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂️', '🦻', '👃', '🧠', '🦷', '🦴', '👀', '👁️', '👅', '👄', '💋', '👶', '🧒', '👦', '👧', '🧑', '👨', '👩', '🧔', '🧔‍♀️', '🧔‍♂️', '🧑', '👨‍', '🦰', '👩‍', '🦰', '🧑', '👨‍', '🦱', '👩‍', '🦱', '🧑', '👨‍', '🦳', '👩‍', '🦳', '🧑', '👨‍', '🦲', '👩‍', '🦲', '👱', '👱‍♂️', '👱‍♀️', '🧓', '👴', '👵', '🙍', '🙍‍♂️', '🙍‍♀️', '🙎', '🙎‍♂️', '🙎‍♀️', '🙅', '🙅‍♂️', '🙅‍♀️', '🙆', '🙆‍♂️', '🙆‍♀️', '💁', '💁‍♂️', '💁‍♀️', '🙋', '🙋‍♂️', '🙋‍♀️', '🧏', '🧏‍♂️', '🧏‍♀️', '🙇', '🙇‍♂️', '🙇‍♀️', '🤦', '🤦‍♂️', '🤦‍♀️', '🤷', '🤷‍♂️', '🤷‍♀️', '🧑‍⚕️', '👨‍⚕️', '👩‍⚕️', '🧑‍🎓', '👨‍🎓', '👩‍🎓', '🧑‍🏫', '👨‍🏫', '👩‍🏫', '🧑‍⚖️', '👨‍⚖️', '👩‍⚖️', '🧑‍🌾', '👨‍🌾', '👩‍🌾', '🧑‍🍳', '👨‍🍳', '👩‍🍳', '🧑‍🔧', '👨‍🔧', '👩‍🔧', '🧑‍🏭', '👨‍🏭', '👩‍🏭', '🧑‍💼', '👨‍💼', '👩‍💼', '🧑‍🔬', '👨‍🔬', '👩‍🔬', '🧑‍💻', '👨‍💻', '👩‍💻', '🧑‍🎤', '👨‍🎤', '👩‍🎤', '🧑‍🎨', '👨‍🎨', '👩‍🎨', '🧑‍✈️', '👨‍✈️', '👩‍✈️', '🧑‍🚀', '👨‍🚀', '👩‍🚀', '🧑‍🚒', '👨‍🚒', '👩‍🚒', '👮', '👮‍♂️', '👮‍♀️', '🕵️', '🕵️‍♂️', '🕵️‍♀️', '💂', '💂‍♂️', '💂‍♀️', '👷', '👷‍♂️', '👷‍♀️', '🤴', '👸', '👳', '👳‍♂️', '👳‍♀️', '👲', '🧕', '🤵', '🤵‍♂️', '🤵‍♀️', '👰', '👰‍♂️', '👰‍♀️', '🤰', '🤱', '👩‍', '🍼', '👨‍', '🍼', '🧑‍', '🍼', '👼', '🎅', '🤶', '🧑‍', '🎄', '🦸', '🦸‍♂️', '🦸‍♀️', '🦹', '🦹‍♂️', '🦹‍♀️', '🧙', '🧙‍♂️', '🧙‍♀️', '🧚', '🧚‍♂️', '🧚‍♀️', '🧛', '🧛‍♂️', '🧛‍♀️', '🧜', '🧜‍♂️', '🧜‍♀️', '🧝', '🧝‍♂️', '🧝‍♀️', '🧞', '🧞‍♂️', '🧞‍♀️', '🧟', '🧟‍♂️', '🧟‍♀️', '💆', '💆‍♂️', '💆‍♀️', '💇', '💇‍♂️', '💇‍♀️', '🚶', '🚶‍♂️', '🚶‍♀️', '🧍', '🧍‍♂️', '🧍‍♀️', '🧎', '🧎‍♂️', '🧎‍♀️', '🧑‍', '🦯', '👨‍', '🦯', '👩‍', '🦯', '🧑‍', '🦼', '👨‍', '🦼', '👩‍', '🦼', '🧑‍', '🦽', '👨‍', '🦽', '👩‍', '🦽', '🏃', '🏃‍♂️', '🏃‍♀️', '💃', '🕺', '🕴️', '👯', '👯‍♂️', '👯‍♀️', '🧖', '🧖‍♂️', '??‍♀️', '🧗', '🧗‍♂️', '🧗‍♀️', '🤺', '🏇', '⛷️', '🏂️', '🏌️', '🏌️‍♂️', '🏌️‍♀️', '🏄️', '🏄‍♂️', '🏄‍♀️', '🚣', '🚣‍♂️', '🚣‍♀️', '🏊️', '🏊‍♂️', '🏊‍♀️', '⛹️', '⛹️‍♂️', '⛹️‍♀️', '🏋️', '🏋️‍♂️', '🏋️‍♀️', '🚴', '🚴‍♂️', '🚴‍♀️', '🚵', '🚵‍♂️', '🚵‍♀️', '🤸', '🤸‍♂️', '🤸‍♀️', '🤼', '🤼‍♂️', '🤼‍♀️', '🤽', '🤽‍♂️', '🤽‍♀️', '🤾', '🤾‍♂️', '🤾‍♀️', '🤹', '🤹‍♂️', '🤹‍♀️', '🧘', '🧘‍♂️', '🧘‍♀️', '🛀', '🛌', '🧑‍', '🤝‍', '🧑', '👭', '👫', '👬', '💏', '👩‍❤️‍💋‍👨', '👨‍❤️‍💋‍👨', '👩‍❤️‍💋‍👩', '💑', '👩‍❤️‍👨', '👨‍❤️‍👨', '👩‍❤️‍👩', '👪️', '👨‍👩‍👦', '👨‍👩‍👧', '👨‍👩‍👧‍👦', '👨‍👩‍👦‍👦', '👨‍👩‍👧‍👧', '👨‍👨‍👦', '👨‍👨‍👧', '👨‍👨‍👧‍👦', '👨‍👨‍👦‍👦', '👨‍👨‍👧‍👧', '👩‍👩‍👦', '👩‍👩‍👧', '👩‍👩‍👧‍👦', '👩‍👩‍👦‍👦', '👩‍👩‍👧‍👧', '👨‍👦', '👨‍👦‍👦', '👨‍👧', '👨‍👧‍👦', '👨‍👧‍👧', '👩‍👦', '👩‍👦‍👦', '👩‍👧', '👩‍👧‍👦', '👩‍👧‍👧', '🗣️', '👤', '👥', '👣']; const KiptendenApiKey = process.env.LEGACY_API_KEY || "";
const KiptendenTechApi = process.env.LEGACY_API_BASE_URL || "";
async function KiptendenAutoReact(emoji, ms,Kiptenden) {
  try {
    const react = {
      react: {
        text: emoji,
        key: ms.key,
      },
    };

    await Kiptenden.sendMessage(ms.key.remoteJid, react);
  } catch (error) {
    console.error('Error sending auto reaction:', error);
  }
}


const KiptendenAntiLink = async (Kiptenden, message, getGroupMetadata) => {
    try {
        if (!message?.message || message.key.fromMe) return;
        const from = message.key.remoteJid; 
        const isGroup = from.endsWith('@g.us');

        if (!isGroup) return;

        const { getGroupSetting, addAntilinkWarning, resetAntilinkWarnings } = require('./database/groupSettings');
        const { getSudoNumbers } = require('./database/sudo');
        const { getLidMapping } = require('./connection/groupCache');
        const antiLink = await getGroupSetting(from, 'ANTILINK');
        
        if (!antiLink || antiLink === 'false' || antiLink === 'off') return;

        const messageType = Object.keys(message.message)[0];
        const body = messageType === 'conversation'
            ? message.message.conversation
            : message.message[messageType]?.text || message.message[messageType]?.caption || '';

        // Check for channel forwarding or group invite even if no text link
        const channelFwd  = isChannelForward(message);
        const groupInvite = isGroupInvite(message);
        const hasLink     = body && isAnyLink(body);

        if (!hasLink && !channelFwd && !groupInvite) return;

        // Respect per-setting: ANTILINK_CHANNEL toggles channel-forward blocking
        const blockChannels = (await getGroupSetting(from, 'ANTILINK_CHANNEL')) !== 'false';
        if (channelFwd && !blockChannels && !hasLink && !groupInvite) return;

        let sender = message.key.participantPn || message.key.participant || message.participant;
        if (!sender || sender.endsWith('@g.us')) {
            return;
        }

        const settings = await getAllSettings();
        const botName = settings.BOT_NAME || 'KIPTENDEN YOUTHS';
        
        if (sender.endsWith('@lid')) {
            const cached = getLidMapping(sender);
            if (cached) {
                sender = cached;
            } else {
                try {
                    const resolved = await Kiptenden.getJidFromLid(sender);
                    if (resolved) sender = resolved;
                } catch (e) {}
            }
        }
        const senderNum = sender.split('@')[0];

        const sudoNumbers = await getSudoNumbers() || [];
        const isSuperUser = sudoNumbers.includes(senderNum);
        
        if (isSuperUser) {
            const action = antiLink.toLowerCase();
            const actionText = action === 'warn' ? 'warn' : action === 'kick' ? 'kick' : 'delete';
            await Kiptenden.sendMessage(from, {
                text: `⚠️ *${botName} Antilink Active!*\nAction: *${actionText}*\n\nLink detected from @${senderNum}, but they are a *SuperUser* on this bot and cannot be actioned.`,
                mentions: [sender],
            });
            return;
        }

        const groupMetadata = await getGroupMetadata(Kiptenden, from);
        if (!groupMetadata || !groupMetadata.participants) return;

        const botJid = Kiptenden.user?.id?.split(':')[0] + '@s.whatsapp.net';
        const botAdmin = groupMetadata.participants.find(p => {
            const pNum = (p.pn || p.phoneNumber || p.id || '').split('@')[0];
            const botNum = botJid.split('@')[0];
            return pNum === botNum && p.admin;
        });
        if (!botAdmin) return;

        const groupAdmins = groupMetadata.participants
            .filter((member) => member.admin)
            .map((admin) => admin.pn || admin.phoneNumber || admin.id);

        const senderNormalized = sender.split('@')[0];
        const isAdmin = groupAdmins.some(admin => {
            const adminNum = (admin || '').split('@')[0];
            return adminNum === senderNormalized || admin === sender;
        });

        if (isAdmin) {
            const action = antiLink.toLowerCase();
            const actionText = action === 'warn' ? 'warn' : action === 'kick' ? 'kick' : 'delete';
            await Kiptenden.sendMessage(from, {
                text: `⚠️ *${botName} Antilink Active!*\nAction: *${actionText}*\n\nLink detected from @${senderNum}, but they are a *Group Admin* and cannot be actioned.`,
                mentions: [sender],
            });
            return;
        }

        try {
            await Kiptenden.sendMessage(from, { delete: message.key });
        } catch (delErr) {
            console.error('Failed to delete message:', delErr.message);
        }

        const action = antiLink.toLowerCase();

        if (action === 'kick') {
            try {
                await Kiptenden.groupParticipantsUpdate(from, [sender], 'remove');
                await Kiptenden.sendMessage(from, {
                    text: `⚠️ ${botName} anti-link active!\n@${senderNum} has been kicked for sharing a link.`,
                    mentions: [sender],
                });
            } catch (kickErr) {
                console.error('Failed to kick user:', kickErr.message);
                await Kiptenden.sendMessage(from, {
                    text: `⚠️ Link detected from @${senderNum}! Could not remove user.`,
                    mentions: [sender],
                });
            }
        } else if (action === 'delete') {
            await Kiptenden.sendMessage(from, {
                text: `⚠️ ${botName} anti-link active!\nLinks are not allowed here @${senderNum}!`,
                mentions: [sender],
            });
        } else if (action === 'warn') {
            const warnLimit = parseInt(await getGroupSetting(from, 'ANTILINK_WARN_COUNT')) || 5;
            const currentWarns = await addAntilinkWarning(from, sender);
            
            if (currentWarns >= warnLimit) {
                try {
                    await Kiptenden.groupParticipantsUpdate(from, [sender], 'remove');
                    await resetAntilinkWarnings(from, sender);
                    await Kiptenden.sendMessage(from, {
                        text: `🚫 ${botName} anti-link!\n@${senderNum} reached ${warnLimit} warnings and has been kicked!`,
                        mentions: [sender],
                    });
                } catch (kickErr) {
                    console.error('Failed to kick user:', kickErr.message);
                    await Kiptenden.sendMessage(from, {
                        text: `⚠️ @${senderNum} has ${currentWarns}/${warnLimit} warnings! Could not kick.`,
                        mentions: [sender],
                    });
                }
            } else {
                await Kiptenden.sendMessage(from, {
                    text: `⚠️ Warning ${currentWarns}/${warnLimit} for @${senderNum}!\nLinks are not allowed. You will be kicked after ${warnLimit} warnings.`,
                    mentions: [sender],
                });
            }
        }
    } catch (err) {
        console.error('Anti-link error:', err);
    }
};

const KiptendenAntibad = async (Kiptenden, message, getGroupMetadata) => {
    try {
        if (!message?.message || message.key.fromMe) return;
        const from = message.key.remoteJid;
        const isGroup = from.endsWith('@g.us');

        if (!isGroup) return;

        let sender = message.key.participantPn || message.key.participant || message.participant;
        if (!sender || sender.endsWith('@g.us')) {
            return;
        }

        const { getGroupSetting, addAntibadWarning, resetAntibadWarnings, getBadWords } = require('./database/groupSettings');
        const { getSudoNumbers } = require('./database/sudo');
        const { getLidMapping } = require('./connection/groupCache');
        const antibad = await getGroupSetting(from, 'ANTIBAD');
        
        if (!antibad || antibad === 'false' || antibad === 'off') return;

        const badWords = await getBadWords(from);
        if (!badWords || badWords.length === 0) return;

        const settings = await getAllSettings();
        const botName = settings.BOT_NAME || '𝐀𝐓𝐀𝐒𝐒𝐀-𝐌𝐃';
        
        if (sender.endsWith('@lid')) {
            const cached = getLidMapping(sender);
            if (cached) sender = cached;
        }
        const senderNum = sender.split('@')[0];

        const messageType = Object.keys(message.message)[0];
        const body = messageType === 'conversation'
            ? message.message.conversation
            : message.message[messageType]?.text || message.message[messageType]?.caption || '';

        if (!body) return;

        const bodyLower = body.toLowerCase();
        const foundBadWord = badWords.find(word => {
            const wordLower = word.toLowerCase();
            const escapedWord = wordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const wordPattern = new RegExp(`\\b${escapedWord}\\b`, 'i');
            return wordPattern.test(bodyLower);
        });

        if (!foundBadWord) return;

        const sudoNumbers = await getSudoNumbers() || [];
        const isSuperUser = sudoNumbers.includes(senderNum);
        
        if (isSuperUser) {
            const action = antibad.toLowerCase();
            const actionText = action === 'warn' ? 'warn' : action === 'kick' ? 'kick' : 'delete';
            await Kiptenden.sendMessage(from, {
                text: `⚠️ *${botName} Anti-BadWords Active!*\nAction: *${actionText}*\n\nBad word detected from @${senderNum}, but they are a *SuperUser* on this bot and cannot be actioned.`,
                mentions: [sender],
            });
            return;
        }

        const groupMetadata = await getGroupMetadata(Kiptenden, from);
        if (!groupMetadata || !groupMetadata.participants) return;

        const botJid = Kiptenden.user?.id?.split(':')[0] + '@s.whatsapp.net';
        const botAdmin = groupMetadata.participants.find(p => {
            const pNum = (p.pn || p.phoneNumber || p.id || '').split('@')[0];
            const botNum = botJid.split('@')[0];
            return pNum === botNum && p.admin;
        });
        if (!botAdmin) return;

        const groupAdmins = groupMetadata.participants
            .filter((member) => member.admin)
            .map((admin) => admin.pn || admin.phoneNumber || admin.id);

        const senderNormalized = sender.split('@')[0];
        const isAdmin = groupAdmins.some(admin => {
            const adminNum = (admin || '').split('@')[0];
            return adminNum === senderNormalized || admin === sender;
        });

        if (isAdmin) {
            const action = antibad.toLowerCase();
            const actionText = action === 'warn' ? 'warn' : action === 'kick' ? 'kick' : 'delete';
            await Kiptenden.sendMessage(from, {
                text: `⚠️ *${botName} Anti-BadWords Active!*\nAction: *${actionText}*\n\nBad word detected from @${senderNum}, but they are a *Group Admin* and cannot be actioned.`,
                mentions: [sender],
            });
            return;
        }

        try {
            await Kiptenden.sendMessage(from, { delete: message.key });
        } catch (delErr) {
            console.error('Failed to delete bad word message:', delErr.message);
        }

        const action = antibad.toLowerCase();

        if (action === 'kick') {
            try {
                await Kiptenden.groupParticipantsUpdate(from, [sender], 'remove');
                await Kiptenden.sendMessage(from, {
                    text: `🚫 ${botName} Anti-BadWords!\n@${senderNum} has been kicked for using prohibited language.`,
                    mentions: [sender],
                });
            } catch (kickErr) {
                console.error('Failed to kick user:', kickErr.message);
                await Kiptenden.sendMessage(from, {
                    text: `⚠️ Bad word detected from @${senderNum}! Could not remove user.`,
                    mentions: [sender],
                });
            }
        } else if (action === 'delete' || action === 'true') {
            await Kiptenden.sendMessage(from, {
                text: `⚠️ ${botName} Anti-BadWords!\nProhibited language detected @${senderNum}! Keep it clean.`,
                mentions: [sender],
            });
        } else if (action === 'warn') {
            const warnLimit = parseInt(await getGroupSetting(from, 'ANTIBAD_WARN_COUNT')) || 5;
            const currentWarns = await addAntibadWarning(from, sender);
            
            if (currentWarns >= warnLimit) {
                try {
                    await Kiptenden.groupParticipantsUpdate(from, [sender], 'remove');
                    await resetAntibadWarnings(from, sender);
                    await Kiptenden.sendMessage(from, {
                        text: `🚫 ${botName} Anti-BadWords!\n@${senderNum} reached ${warnLimit} warnings and has been kicked!`,
                        mentions: [sender],
                    });
                } catch (kickErr) {
                    console.error('Failed to kick user:', kickErr.message);
                    await Kiptenden.sendMessage(from, {
                        text: `⚠️ @${senderNum} has ${currentWarns}/${warnLimit} warnings! Could not kick.`,
                        mentions: [sender],
                    });
                }
            } else {
                await Kiptenden.sendMessage(from, {
                    text: `⚠️ Warning ${currentWarns}/${warnLimit} for @${senderNum}!\nProhibited language is not allowed. You will be kicked after ${warnLimit} warnings.`,
                    mentions: [sender],
                });
            }
        }
    } catch (err) {
        console.error('Anti-badwords error:', err);
    }
};

// ─── ANTI-BOT: kick non-admins who send bot commands in groups ────────────────
// Detects any message starting with a common bot prefix (single or multi-char),
// plus common no-prefix trigger words used by prefix-less public bots.
// Also catches users operating public bots (their bot replies trigger the same check).
const BOT_PREFIXES = /^([./!#$?;~\\^%@&*+=|`_-]{1,3}|>>|<<|>|\.\.|!!)/;
const BOT_KEYWORDS = new Set([
    'menu', 'help', 'ping', 'alive', 'owner', 'script', 'sourcecode',
    'source', 'speed', 'uptime', 'runtime', 'botinfo', 'about', 'info',
    'settings', 'panel', 'commands', 'cmdlist', 'listcmd', 'jid', 'repo',
]);

const KiptendenAntiBot = async (Kiptenden, message, getGroupMetadata) => {
    try {
        if (!message?.message || message.key.fromMe) return;
        const from = message.key.remoteJid;
        if (!from?.endsWith('@g.us')) return;

        const { getGroupSetting } = require('./database/groupSettings');
        const { getSudoNumbers } = require('./database/sudo');
        const { getLidMapping } = require('./connection/groupCache');

        const antiBot = await getGroupSetting(from, 'ANTIBOT');
        if (!antiBot || antiBot === 'false' || antiBot === 'off') return;

        // Extract message text
        const msgType = Object.keys(message.message)[0];
        const body = msgType === 'conversation'
            ? message.message.conversation
            : (message.message[msgType]?.text || message.message[msgType]?.caption || '');

        if (!body) return;
        const trimmed = body.trim();
        const firstWord = trimmed.split(/\s+/)[0]?.toLowerCase().replace(/^[./!#$?;~\\^%@&*+=|`_-]+/, '');
        const isPrefixed = BOT_PREFIXES.test(trimmed);
        const isBareKeyword = !isPrefixed && firstWord && BOT_KEYWORDS.has(firstWord) && trimmed.split(/\s+/).length <= 2;
        if (!isPrefixed && !isBareKeyword) return;

        // Resolve sender JID
        let sender = message.key.participantPn || message.key.participant || message.participant;
        if (!sender || sender.endsWith('@g.us')) return;

        if (sender.endsWith('@lid')) {
            const cached = getLidMapping(sender);
            if (cached) sender = cached;
            else {
                try { const r = await Kiptenden.getJidFromLid(sender); if (r) sender = r; } catch {}
            }
        }
        const senderNum = sender.split('@')[0];

        // Exempt database-managed sudo users
        const sudoNumbers = await getSudoNumbers() || [];
        if (sudoNumbers.includes(senderNum)) return;

        // Fetch group metadata to check admins + bot admin status
        const groupMetadata = await getGroupMetadata(Kiptenden, from);
        if (!groupMetadata?.participants) return;

        const botJid = Kiptenden.user?.id?.split(':')[0] + '@s.whatsapp.net';
        const botNum = botJid.split('@')[0];
        const isBotAdmin = groupMetadata.participants.some(p => {
            const pNum = (p.pn || p.phoneNumber || p.id || '').split('@')[0];
            return pNum === botNum && p.admin;
        });
        if (!isBotAdmin) return; // Can't act without admin rights

        const groupAdmins = groupMetadata.participants
            .filter(m => m.admin)
            .map(m => (m.pn || m.phoneNumber || m.id || '').split('@')[0]);

        if (groupAdmins.includes(senderNum)) return; // Spare admins

        const settings = await getAllSettings();
        const botName = settings.BOT_NAME || 'KIPTENDEN YOUTHS';

        // Delete the offending command message silently
        try { await Kiptenden.sendMessage(from, { delete: message.key }); } catch {}

        // Kick the user
        try {
            await Kiptenden.groupParticipantsUpdate(from, [sender], 'remove');
            await Kiptenden.sendMessage(from, {
                text:
`┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃  🤖  *ANTI-BOT TRIGGERED*
┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━┃
┃  👤 @${senderNum}
┃  ❌ was *removed* for using
┃     bot commands in this group.
┃━━━━━━━━━━━━━━━━━━━━━━━━━━━━┃
┃  _Bot commands are not allowed_
┃  _by non-admins in this group._
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`,
                mentions: [sender],
            });
        } catch (kickErr) {
            await Kiptenden.sendMessage(from, {
                text: `⚠️ *${botName} Anti-Bot:* Bot command detected from @${senderNum}! Failed to remove — make sure bot is admin.`,
                mentions: [sender],
            });
        }
    } catch (err) {
        console.error('[AntiBot] Error:', err.message);
    }
};

const KiptendenAntiGroupMention = async (Kiptenden, message, getGroupMetadata) => {
    try {
        if (!message?.message) return;
        
        const messageKeys = Object.keys(message.message);
        const hasGroupStatusMention = messageKeys.includes('groupStatusMentionMessage');
        
        if (!hasGroupStatusMention) return;
        if (message.key.fromMe) return;
        
        const groupJid = message.key.remoteJid;
        if (!groupJid || !groupJid.endsWith('@g.us')) return;
        
        const { getGroupSetting, addAntiGroupMentionWarning, resetAntiGroupMentionWarnings } = require('./database/groupSettings');
        const { getSudoNumbers } = require('./database/sudo');
        const { getLidMapping } = require('./connection/groupCache');
        
        const antiGroupMention = await getGroupSetting(groupJid, 'ANTIGROUPMENTION');
        
        if (!antiGroupMention || antiGroupMention === 'false' || antiGroupMention === 'off') return;
        
        let sender = message.key.participantPn || message.key.participant || message.participant;
        if (!sender || sender.endsWith('@g.us')) return;
        
        const settings = await getAllSettings();
        const botName = settings.BOT_NAME || 'KIPTENDEN YOUTHS';
        
        if (sender.endsWith('@lid')) {
            const cached = getLidMapping(sender);
            if (cached) {
                sender = cached;
            } else {
                try {
                    const jidResult = await Kiptenden.getJidFromLid(sender);
                    if (jidResult) sender = jidResult;
                } catch (e) {}
            }
        }
        const senderNum = sender.split('@')[0];
        
        const sudoNumbers = await getSudoNumbers() || [];
        const isSuperUser = sudoNumbers.includes(senderNum);
        
        const action = antiGroupMention.toLowerCase();
        const actionText = action === 'warn' || action === 'on' || action === 'true' ? 'warn' : action === 'kick' ? 'kick' : action === 'delete' ? 'delete' : 'warn';
        
        if (isSuperUser) {
            return;
        }
        
        const groupMetadata = await getGroupMetadata(Kiptenden, groupJid);
        if (!groupMetadata || !groupMetadata.participants) return;
        
        const botJid = Kiptenden.user?.id?.split(':')[0] + '@s.whatsapp.net';
        const botAdmin = groupMetadata.participants.find(p => {
            const pNum = (p.pn || p.phoneNumber || p.id || '').split('@')[0];
            const botNum = botJid.split('@')[0];
            return pNum === botNum && p.admin;
        });
        if (!botAdmin) return;
        
        const groupAdmins = groupMetadata.participants
            .filter((member) => member.admin)
            .map((admin) => admin.pn || admin.phoneNumber || admin.id);
        
        const senderNormalized = sender.split('@')[0];
        const isAdmin = groupAdmins.some(admin => {
            const adminNum = (admin || '').split('@')[0];
            return adminNum === senderNormalized || admin === sender;
        });
        
        if (isAdmin) {
            return;
        }
        
        if (action === 'delete') {
            try {
                await Kiptenden.sendMessage(groupJid, { delete: message.key });
                await Kiptenden.sendMessage(groupJid, {
                    text: `⚠️ *${botName} Anti-Status-Mention*\n\n@${senderNum}, mentioning this group in your status is not allowed. Your message has been deleted.`,
                    mentions: [sender],
                });
            } catch (delErr) {
                console.error('Failed to delete status mention message:', delErr.message);
            }
        } else if (action === 'kick') {
            try {
                await Kiptenden.groupParticipantsUpdate(groupJid, [sender], 'remove');
                await Kiptenden.sendMessage(groupJid, {
                    text: `🚫 *${botName} Anti-Group-Mention!*\n\n@${senderNum} has been kicked for mentioning this group in their status!`,
                    mentions: [sender],
                });
            } catch (kickErr) {
                console.error('Failed to kick user:', kickErr.message);
                await Kiptenden.sendMessage(groupJid, {
                    text: `⚠️ Group mentioned in status by @${senderNum}! Could not remove user.`,
                    mentions: [sender],
                });
            }
        } else if (action === 'warn' || action === 'true' || action === 'on') {
            const warnLimit = parseInt(await getGroupSetting(groupJid, 'ANTIGROUPMENTION_WARN_COUNT')) || 3;
            const currentWarns = await addAntiGroupMentionWarning(groupJid, sender);
            
            if (currentWarns >= warnLimit) {
                try {
                    await Kiptenden.groupParticipantsUpdate(groupJid, [sender], 'remove');
                    await resetAntiGroupMentionWarnings(groupJid, sender);
                    await Kiptenden.sendMessage(groupJid, {
                        text: `🚫 *${botName} Anti-Group-Mention!*\n\n@${senderNum} reached ${warnLimit} warnings and has been kicked for mentioning this group in status!`,
                        mentions: [sender],
                    });
                } catch (kickErr) {
                    console.error('Failed to kick user:', kickErr.message);
                    await Kiptenden.sendMessage(groupJid, {
                        text: `⚠️ @${senderNum} has ${currentWarns}/${warnLimit} warnings! Could not kick.`,
                        mentions: [sender],
                    });
                }
            } else {
                await Kiptenden.sendMessage(groupJid, {
                    text: `⚠️ *Warning ${currentWarns}/${warnLimit}* for @${senderNum}!\n\nMentioning this group in status is not allowed. You will be kicked after ${warnLimit} warnings.`,
                    mentions: [sender],
                });
            }
        }
    } catch (err) {
        console.error('Anti-group-mention error:', err);
    }
};

function getTimeBlock() {
            const hour = new Date().getHours();
            if (hour >= 5 && hour < 11) return "morning";
            if (hour >= 11 && hour < 16) return "afternoon";
            if (hour >= 16 && hour < 21) return "evening";
            if (hour >= 21 || hour < 2) return "night";
            return "latenight";
        }

        const quotes = {
            morning: [ "☀️ ʀɪsᴇ ᴀɴᴅ sʜɪɴᴇ. ɢʀᴇᴀᴛ ᴛʜɪɴɢs ɴᴇᴠᴇʀ ᴄᴀᴍᴇ ғʀᴏᴍ ᴄᴏᴍғᴏʀᴛ ᴢᴏɴᴇs.", "🌅 ᴇᴀᴄʜ �ᴍᴏʀɴɪɴɢ ᴡᴇ ᴀʀᴇ ʙᴏʀɴ ᴀɢᴀɪɴ. ᴡʜᴀᴛ ᴡᴇ ᴅᴏ ᴛᴏᴅᴀʏ ɪs ᴡʜᴀᴛ ᴍᴀᴛᴛᴇʀs �ᴍᴏsᴛ.", "⚡ sᴛᴀʀᴛ ʏᴏᴜʀ ᴅᴀʏ ᴡɪᴛʜ ᴅᴇᴛᴇʀᴍɪɴᴀᴛɪᴏɴ, ᴇɴᴅ ɪᴛ ᴡɪᴛʜ sᴀᴛɪsғᴀᴄᴛɪᴏɴ.", "🌞 ᴛʜᴇ sᴜɴ ɪs ᴜᴘ, ᴛʜᴇ ᴅᴀʏ ɪs ʏᴏᴜʀs.", "📖 ᴇᴠᴇʀʏ ᴍᴏʀɴɪɴɢ ɪs ᴀ ɴᴇᴡ ᴘᴀɢᴇ ᴏғ ʏᴏᴜʀ sᴛᴏʀʏ. ᴍᴀᴋᴇ ɪᴛ ᴄᴏᴜɴᴛ." ], 
            afternoon: [ "⏳ ᴋᴇᴇᴘ ɢᴏɪɴɢ. ʏᴏᴜ'ʀᴇ ʜᴀʟғᴡᴀʏ ᴛᴏ ɢʀᴇᴀᴛɴᴇss.", "🔄 sᴛᴀʏ ғᴏᴄᴜsᴇᴅ. ᴛʜᴇ ɢʀɪɴᴅ ᴅᴏᴇsɴ'ᴛ sᴛᴏᴘ ᴀᴛ ɴᴏᴏɴ.", "🏗️ sᴜᴄᴄᴇss ɪs ʙᴜɪʟᴛ ɪɴ ᴛʜᴇ ʜᴏᴜʀs ɴᴏʙᴏᴅʏ ᴛᴀʟᴋs ᴀʙᴏᴜᴛ.", "🔥 ᴘᴜsʜ ᴛʜʀᴏᴜɢʜ. ᴄʜᴀᴍᴘɪᴏɴs ᴀʀᴇ ᴍᴀᴅᴇ ɪɴ ᴛʜᴇ ᴍɪᴅᴅʟᴇ ᴏғ ᴛʜᴇ ᴅᴀʏ.", "⏰ ᴅᴏɴ'ᴛ ᴡᴀᴛᴄʜ ᴛʜᴇ ᴄʟᴏᴄᴋ, ᴅᴏ ᴡʜᴀᴛ ɪᴛ ᴅᴏᴇs—ᴋᴇᴇᴘ ɢᴏɪɴɢ." ],
            evening: [ "🛌 ʀᴇsᴛ ɪs ᴘᴀʀᴛ ᴏғ ᴛʜᴇ ᴘʀᴏᴄᴇss. ʀᴇᴄʜᴀʀɢᴇ ᴡɪsᴇʟʏ.", "🌇 ᴇᴠᴇɴɪɴɢ ʙʀɪɴɢꜱ ꜱɪʟᴇɴᴄᴇ ᴛʜᴀᴛ ꜱᴘᴇᴀᴋꜱ ʟᴏᴜᴅᴇʀ ᴛʜᴀɴ ᴅᴀʏʟɪɢʜᴛ.", "✨ ʏᴏᴜ ᴅɪᴅ ᴡᴇʟʟ ᴛᴏᴅᴀʏ. ᴘʀᴇᴘᴀʀᴇ ғᴏʀ ᴀɴ ᴇᴠᴇɴ ʙᴇᴛᴛᴇʀ �ᴛᴏᴍᴏʀʀᴏᴡ.", "🌙 ʟᴇᴛ ᴛʜᴇ ɴɪɢʜᴛ sᴇᴛᴛʟᴇ ɪɴ, ʙᴜᴛ ᴋᴇᴇᴘ ʏᴏᴜʀ ᴅʀᴇᴀᴍs ᴡɪᴅᴇ ᴀᴡᴀᴋᴇ.", "🧠 ɢʀᴏᴡᴛʜ ᴅᴏᴇsɴ'ᴛ ᴇɴᴅ ᴀᴛ sᴜɴsᴇᴛ. ɪᴛ sʟᴇᴇᴘs ᴡɪᴛʜ ʏᴏᴜ." ],
            night: [ "🌌 ᴛʜᴇ ɴɪɢʜᴛ ɪs sɪʟᴇɴᴛ, ʙᴜᴛ ʏᴏᴜʀ ᴅʀᴇᴀᴍs ᴀʀᴇ ʟᴏᴜᴅ.", "⭐ sᴛᴀʀs sʜɪɴᴇ ʙʀɪɢʜᴛᴇsᴛ ɪɴ ᴛʜᴇ ᴅᴀʀᴋ. sᴏ ᴄᴀɴ ʏᴏᴜ.", "🧘‍♂️ ʟᴇᴛ ɢᴏ ᴏғ ᴛʜᴇ ɴᴏɪsᴇ. ᴇᴍʙʀᴀᴄᴇ ᴛʜᴇ ᴘᴇᴀᴄᴇ.", "✅ ʏᴏᴜ ᴍᴀᴅᴇ ɪᴛ ᴛʜʀᴏᴜɢʜ ᴛʜᴇ ᴅᴀʏ. ɴᴏᴡ ᴅʀᴇᴀᴍ ʙɪɢ.", "🌠 ᴍɪᴅɴɪɢʜᴛ ᴛʜᴏᴜɢʜᴛs ᴀʀᴇ ᴛʜᴇ ʙʟᴜᴇᴘʀɪɴᴛ ᴏғ ᴛᴏᴍᴏʀʀᴏᴡ's ɢʀᴇᴀᴛɴᴇss." ],
            latenight: [ "🕶️ ᴡʜɪʟᴇ ᴛʜᴇ ᴡᴏʀʟᴅ sʟᴇᴇᴘs, ᴛʜᴇ ᴍɪɴᴅs ᴏғ ʟᴇɢᴇɴᴅs ᴡᴀɴᴅᴇʀ.", "⏱️ ʟᴀᴛᴇ ɴɪɢʜᴛs ᴛᴇᴀᴄʜ ᴛʜᴇ ᴅᴇᴇᴘᴇsᴛ ʟᴇssᴏɴs.", "🔕 sɪʟᴇɴᴄᴇ ɪsɴ'ᴛ ᴇᴍᴘᴛʏ—ɪᴛ's ғᴜʟʟ ᴏғ ᴀɴsᴡᴇʀs.", "✨ ᴄʀᴇᴀᴛɪᴠɪᴛʏ ᴡʜɪsᴘᴇʀs ᴡʜᴇɴ �ᴛʜᴇ ᴡᴏʀʟᴅ ɪs ǫᴜɪᴇᴛ.", "🌌 ʀᴇsᴛ ᴏʀ ʀᴇғʟᴇᴄᴛ, ʙᴜᴛ ɴᴇᴠᴇʀ ᴡᴀsᴛᴇ ᴛʜᴇ ɴɪɢʜᴛ." ] 
        };

        function getCurrentDateTime() {
            return new Intl.DateTimeFormat("en", {
                year: "numeric",
                month: "long",
                day: "2-digit"
            }).format(new Date());
        }

const KiptendenAutoBio = async (Kiptenden) => {
                try {
                    const settings = await getAllSettings();
                    const botName = settings.BOT_NAME || 'KIPTENDEN YOUTHS';
                    
                    const block = getTimeBlock();
                    const timeDate = getCurrentDateTime();
                    const timeQuotes = quotes[block];
                    const quote = timeQuotes[Math.floor(Math.random() * timeQuotes.length)];

                    const bioText = `${botName} Online ||\n\n📅 ${timeDate}\n\n➤ ${quote}`;

                    await Kiptenden.updateProfileStatus(bioText);
                } catch (error) {
                }
            };


function processForTTS(text) {
    if (!text || typeof text !== 'string') return '';
    return text.replace(/[\[\]\(\)\{\}]/g, ' ')
              .replace(/\s+/g, ' ')
              .substring(0, 190);
}

const identityPatterns = [
                /who\s*(made|created|built)\s*you/i,
                /who\s*is\s*your\s*(creator|developer|maker|owner|father|parent)/i,
                /what('?s| is)\s*your\s*name\??/i,
                /who\s*are\s*you\??/i,
                /who\s*a?you\??/i,
                /who\s*au\??/i,
                /what('?s| is)\s*ur\s*name\??/i,
                /wat('?s| is)\s*(ur|your)\s*name\??/i,
                /wats?\s*(ur|your)\s*name\??/i,
                /wot('?s| is)\s*(ur|your)\s*name\??/i,
                /hoo\s*r\s*u\??/i,
                /who\s*u\??/i,
                /whos\s*u\??/i,
                /whos?\s*this\??/i,
                /you\s*called\s*kiptenden(?:\s*youths)?/i,
                /are\s*you\s*kiptenden(?:\s*youths)?/i,
                /are\s*u\s*kiptenden(?:\s*youths)?/i,
                /u\s*gifted\??/i,
                /who\s*is\s*your\s*boss\??/i,
                /who\s*ur\s*boss\??/i,
                /who\s*your\s*boss\??/i,
                /whoa\s*created\s*you\??/i,
                /who\s*made\s*u\??/i,
                /who\s*create\s*u\??/i,
                /who\s*built\s*u\??/i,
                /who\s*ur\s*owner\??/i,
                /who\s*is\s*u\??/i,
                /what\s*are\s*you\??/i,
                /what\s*r\s*u\??/i,
                /wat\s*r\s*u\??/i
            ];

function isIdentityQuestion(query) {
    return identityPatterns.some(pattern => 
        typeof query === 'string' && pattern.test(query)
    );
}

async function getAIResponse(query) {
    if (isIdentityQuestion(query)) {
        return 'I am the Kiptenden Youths AI Assistant, created and operated by Kiptenden Youths!';
    }

    try {
        return await queryAI(query, {
            timeoutMs: 60000,
            maxTokens: 1400,
            temperature: 0.7,
        });
    } catch (error) {
        console.error("AI provider error:", error);
        return "Sorry, I couldn't get a response right now. Please try again in a moment.";
    }
}

const WHATSAPP_TEXT_CHUNK_SIZE = 3500;
const CHATBOT_CHUNK_DELAY_MS = 250;

function splitWhatsAppText(value, maxLength = WHATSAPP_TEXT_CHUNK_SIZE) {
    const text = String(value ?? "").trim();
    if (!text) return [];
    if (text.length <= maxLength) return [text];

    const chunks = [];
    let remaining = text;
    while (remaining.length > maxLength) {
        let cut = remaining.lastIndexOf("\n", maxLength);
        if (cut < Math.floor(maxLength * 0.5)) {
            cut = remaining.lastIndexOf(" ", maxLength);
        }
        if (cut <= 0) cut = maxLength;
        chunks.push(remaining.slice(0, cut).trim());
        remaining = remaining.slice(cut).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
}

async function sendChatbotText(Kiptenden, jid, response, quotedMessage) {
    const chunks = splitWhatsAppText(response);
    for (let index = 0; index < chunks.length; index += 1) {
        await Kiptenden.sendMessage(
            jid,
            { text: chunks[index] },
            index === 0 ? { quoted: quotedMessage } : undefined,
        );
        if (index < chunks.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, CHATBOT_CHUNK_DELAY_MS));
        }
    }
}

function normalizeChatbotMode(value) {
    return String(value || "allchats").toLowerCase().replace(/[\s_-]/g, "");
}

function shouldChatbotRespond(jid, configuredMode) {
    const normalizedJid = String(jid || "");
    if (!normalizedJid || normalizedJid === "status@broadcast" || normalizedJid.endsWith("@broadcast")) return false;

    const mode = normalizeChatbotMode(configuredMode);
    const isGroup = normalizedJid.endsWith("@g.us");
    if (mode === "groups") return isGroup;
    if (mode === "inbox") return !isGroup;
    return true;
}

const chatbotListeners = new WeakSet();
const chatbotProcessedMessages = new WeakMap();

async function resolveChatbotTarget(Kiptenden, msg) {
    const key = msg?.key || {};
    const rawJid = key.remoteJid || key.remoteJidAlt || "";
    if (!rawJid) return null;
    if (!rawJid.endsWith("@lid")) return rawJid;

    const directCandidates = [
        key.remoteJidAlt,
        key.senderPn,
        key.participantPn,
        msg?.remoteJidAlt,
        msg?.senderPn,
    ];
    for (const candidate of directCandidates) {
        if (candidate && !candidate.endsWith("@lid") && !candidate.endsWith("@g.us")) {
            return candidate;
        }
    }

    try {
        const { getLidMapping } = require("./connection/groupCache");
        const cached = getLidMapping(rawJid);
        if (cached && !cached.endsWith("@lid")) return cached;
    } catch (_) {}

    try {
        if (typeof Kiptenden.getJidFromLid === "function") {
            const resolved = await Kiptenden.getJidFromLid(rawJid);
            if (resolved && !resolved.endsWith("@lid")) return resolved;
        }
    } catch (_) {}

    try {
        const { getLidMappingFromDb } = require("./database/lidMapping");
        const persisted = await getLidMappingFromDb(rawJid);
        if (persisted && !persisted.endsWith("@lid")) return persisted;
    } catch (_) {}

    // Keep the original target as a final fallback. Some Baileys versions
    // accept @lid directly, while newer versions expose a real JID above.
    return rawJid;
}

async function processChatbotMessage(Kiptenden, msg, chatBotMode, createContext2, googleTTS) {
    try {
        if (!msg?.message || msg.key?.fromMe) return;

        const rawJid = msg.key?.remoteJid || msg.key?.remoteJidAlt || "";
        if (!rawJid || rawJid === "status@broadcast" || rawJid.endsWith("@broadcast")) return;

        const targetJid = await resolveChatbotTarget(Kiptenden, msg);
        if (!targetJid) return;

        const messageId = msg.key?.id;
        const seenMessages = chatbotProcessedMessages.get(Kiptenden);
        if (messageId && seenMessages?.has(messageId)) return;
        if (messageId && seenMessages) {
            seenMessages.add(messageId);
            setTimeout(() => seenMessages.delete(messageId), 120000);
        }

        const settings = await getAllSettings();
        const activeChatBot = settings.CHATBOT;
        const configuredMode = settings.CHATBOT_MODE || process.env.CHATBOT_MODE || chatBotMode || "allchats";
        if (activeChatBot !== "true" && activeChatBot !== "audio") return;
        if (!shouldChatbotRespond(rawJid, configuredMode)) return;

        const messageContent = msg.message?.ephemeralMessage?.message || msg.message;
        const text = messageContent.conversation
            || messageContent.extendedTextMessage?.text
            || messageContent.imageMessage?.caption
            || messageContent.videoMessage?.caption
            || "";
        if (!text || typeof text !== "string") return;

        const commandPrefix = String(settings.PREFIX || process.env.PREFIX || ".");
        if (commandPrefix && text.trim().startsWith(commandPrefix)) return;

        console.log(`[CHATBOT] Processing ${rawJid} via ${targetJid} (${normalizeChatbotMode(configuredMode)})`);
        const aiResponse = await getAIResponse(text);

        if (activeChatBot === "true") {
            // Plain text avoids newsletter/channel preview metadata and sends
            // every long answer in ordered, complete message chunks.
            await sendChatbotText(Kiptenden, targetJid, aiResponse, msg);
        }

        if (activeChatBot === "audio") {
            const ttsText = processForTTS(String(aiResponse));
            if (ttsText) {
                const audioUrl = googleTTS.getAudioUrl(ttsText, {
                    lang: "en",
                    slow: false,
                    host: "https://translate.google.com",
                });
                await Kiptenden.sendMessage(targetJid, {
                    audio: { url: audioUrl },
                    mimetype: "audio/mpeg",
                    ptt: true,
                    waveform: [1000, 0, 1000, 0, 1000, 0, 1000],
                    ...(await createContext2(targetJid, {
                        title: "KIPTENDEN YOUTHS AUDIO-CHAT BOT",
                        body: "Powered by Kiptenden Youths",
                    })),
                }, { quoted: msg });
            }
        }
    } catch (error) {
        console.error("Message processing error:", error);
    }
}

function KiptendenChatBot(Kiptenden, chatBot, chatBotMode, createContext, createContext2, googleTTS) {
    if (chatbotListeners.has(Kiptenden)) return;

    chatbotListeners.add(Kiptenden);
    chatbotProcessedMessages.set(Kiptenden, new Set());
    Kiptenden.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type === "append" || !Array.isArray(messages)) return;
        // Process every message in the batch; the previous code only handled
        // messages[0], which could silently ignore contacts in busy inboxes.
        for (const msg of messages) {
            await processChatbotMessage(Kiptenden, msg, chatBotMode, createContext2, googleTTS);
        }
    });
}


const presenceTimers = new Map();

const KiptendenPresence = async (Kiptenden, jid) => {
    try {
        const isGroup = jid.endsWith('@g.us');
        const duration = 15 * 60 * 1000; // minutes duration

        if (presenceTimers.has(jid)) {
            clearTimeout(presenceTimers.get(jid));
            presenceTimers.delete(jid);
        }

        const currentGcPresence = await getSetting('GC_PRESENCE') || 'offline';
        const currentDmPresence = await getSetting('DM_PRESENCE') || 'offline';
        const presenceType = isGroup ? currentGcPresence : currentDmPresence;
        if (!presenceType) return;

        const presence = presenceType.toLowerCase();

        if (presence === 'offline') return;

        let whatsappPresence;

        switch(presence) {
            case 'online':
                whatsappPresence = "available";
                break;
            case 'typing':
                whatsappPresence = "composing";
                break;
            case 'recording':
                whatsappPresence = "recording";
                break;
            default:
                logger.warn(`Invalid ${isGroup ? 'group' : ''}presence: ${presenceType}`);
                return;
        }

        await Kiptenden.sendPresenceUpdate(whatsappPresence, jid);
        logger.debug(`${isGroup ? 'Group' : 'Chat'} presence activated: ${presence} for ${jid}`);
        presenceTimers.set(jid, setTimeout(() => {
            presenceTimers.delete(jid);
            logger.debug(`${isGroup ? 'Group' : 'Chat'} presence duration ended for ${jid}`);
        }, duration));

    } catch (e) {
        logger.error('Presence update failed:', e.message);
    }
};


const KiptendenAnticall = async (json, Kiptenden) => {
   const settings = await getAllSettings();
   const antiCall = settings.ANTICALL || 'false';
   const antiCallMsg = settings.ANTICALL_MSG || 'Calls are not allowed. This bot automatically rejects calls.';

   for (const id of json) {
      try {
         if (id.status !== 'offer') continue;
         if (antiCall !== 'true' && antiCall !== 'decline' && antiCall !== 'block') continue;

         // Reject first — this is the actual security action and must not be
         // skipped if the caller's JID is a @lid we can't message (a known
         // Baileys 7.x quirk where call events carry @lid instead of the
         // real number). rejectCall works fine with a @lid; sendMessage often
         // does not, so it must never block the reject.
         await Kiptenden.rejectCall(id.id, id.from);

         try {
            await Kiptenden.sendMessage(id.from, {
               text: antiCall === 'block'
                  ? `${antiCallMsg}\nYou are being blocked due to calling while Anticall action is *"block"*!`
                  : antiCallMsg,
               mentions: [id.from],
            });
         } catch (msgErr) {
            logger.warn(`Anticall: could not message caller ${id.from} (likely @lid-only): ${msgErr.message}`);
         }

         if (antiCall === 'block') {
            try {
               await Kiptenden.updateBlockStatus(id.from, 'block');
            } catch (blockErr) {
               logger.warn(`Anticall: could not block caller ${id.from}: ${blockErr.message}`);
            }
         }
      } catch (rejectErr) {
         logger.error(`Anticall: failed to reject call from ${id?.from}:`, rejectErr.message);
      }
   }
};


const processMediaMessage = async (deletedMessage) => {
    let mediaType, mediaInfo;
    
    const mediaTypes = {
        imageMessage: 'image',
        videoMessage: 'video',
        audioMessage: 'audio',
        stickerMessage: 'sticker',
        documentMessage: 'document'
    };

    for (const [key, type] of Object.entries(mediaTypes)) {
        if (deletedMessage.message?.[key]) {
            mediaType = type;
            mediaInfo = deletedMessage.message[key];
            break;
        }
    }

    if (!mediaType || !mediaInfo) return null;

    try {
        const mediaStream = await downloadMediaMessage(deletedMessage, { logger });
        
        const extensions = {
            image: 'jpg',
            video: 'mp4',
            audio: mediaInfo.mimetype?.includes('mpeg') ? 'mp3' : 'ogg',
            sticker: 'webp',
            document: mediaInfo.fileName?.split('.').pop() || 'bin'
        };
        
        const tempPath = path.join(__dirname, `./temp/temp_${Date.now()}.${extensions[mediaType]}`);
        await fs.ensureDir(path.dirname(tempPath));
        await pipeline(mediaStream, fs.createWriteStream(tempPath));
        
        return {
            path: tempPath,
            type: mediaType,
            caption: mediaInfo.caption || '',
            mimetype: mediaInfo.mimetype,
            fileName: mediaInfo.fileName || `${mediaType}_${Date.now()}.${extensions[mediaType]}`,
            ptt: mediaInfo.ptt
        };
    } catch (error) {
        logger.error(`Media processing failed:`, error);
        return null;
    }
};

const KiptendenAntiDelete = async (Kiptenden, deletedMsg, key, deleter, sender, botOwnerJid, deleterPushName, senderPushName) => {
    const settings = await getAllSettings();
    const botName = settings.BOT_NAME || '𝐀𝐓𝐀𝐒𝐒𝐀-𝐌𝐃';
    const botPic = settings.BOT_PIC || '';
    const botFooter = settings.FOOTER || '';
    const antiDelete = settings.ANTIDELETE || 'indm';
    const timeZone = settings.TIME_ZONE || 'Africa/Nairobi';

    const context = await createContext(deleter, {
        title: "Anti-Delete",
        body: botName,
        thumbnail: botPic
    });
    
    const currentTime = formatTime(Date.now(), timeZone);
    const currentDate = formatDate(Date.now(), timeZone);

    const { getLidMapping, getGroupMetadata } = require('./connection/groupCache');

    const resolveLidToJidAndDisplay = async (lid, pushName, groupJid) => {
        if (!lid) return { jid: null, display: pushName || 'Unknown', number: null };
        
        let resolvedJid = lid;
        
        if (lid.endsWith('@lid')) {
            let jid = getLidMapping(lid);
            
            if (!jid && Kiptenden.getJidFromLid) {
                try {
                    jid = await Kiptenden.getJidFromLid(lid);
                } catch (e) {}
            }
            
            if (!jid && groupJid && isJidGroup(groupJid)) {
                try {
                    const groupMeta = await getGroupMetadata(Kiptenden, groupJid);
                    if (groupMeta?.participants) {
                        const participant = groupMeta.participants.find(p => p.lid === lid || p.id === lid);
                        if (participant) {
                            jid = participant.pn || participant.jid || participant.id;
                        }
                    }
                } catch (e) {}
            }
            
            if (jid && jid.endsWith('@s.whatsapp.net')) {
                resolvedJid = jid;
            }
        }
        
        if (resolvedJid.endsWith('@s.whatsapp.net')) {
            const number = resolvedJid.split('@')[0];
            return { 
                jid: resolvedJid, 
                display: `@${number}`,
                number: number
            };
        }
        
        return { jid: null, display: pushName || lid, number: null };
    };

    const isGroupChat = isJidGroup(key.remoteJid);
    const senderInfo = await resolveLidToJidAndDisplay(sender, senderPushName, key.remoteJid);
    const deleterInfo = await resolveLidToJidAndDisplay(deleter, deleterPushName, key.remoteJid);
    
    const finalSenderDisplay = senderInfo.display;
    const finalDeleterDisplay = deleterInfo.display;
    const senderJid = senderInfo.jid;
    const deleterJid = deleterInfo.jid;
    
    const mentions = [senderJid, deleterJid].filter(j => j !== null);

    let chatInfo;
    let chatMention = null;
    if (isJidGroup(key.remoteJid)) {
        try {
            const groupMeta = await getGroupMetadata(Kiptenden, key.remoteJid);
            chatInfo = `💬 Group Chat: ${groupMeta?.subject || 'Unknown'}`;
        } catch (error) {
            logger.error('Failed to fetch group metadata:', error);
            chatInfo = `💬 Group Chat`;
        }
    } else {
        chatInfo = `💬 Dm Chat: ${finalDeleterDisplay}`;
        if (deleterJid) chatMention = deleterJid;
    }
    
    const allMentions = chatMention ? [...mentions, chatMention] : mentions;
    
    const getContextInfo = (mentionedJids = []) => ({
        mentionedJid: mentionedJids.filter(j => j !== null)
    });

    try {
        const promises = [];
        
        if (antiDelete === 'inchat') {
            promises.push((async () => {
                try {
                    const baseAlert = `*𝙰𝙽𝚃𝙸𝙳𝙴𝙻𝙴𝚃𝙴 𝙼𝙴𝚂𝚂𝙰𝙶𝙴 𝚂𝚈𝚂𝚃𝙴𝙼*\n\n` +
                                    `*👤 Sent By:* ${finalSenderDisplay}\n` +
                                    `*👤 Deleted By:* ${finalDeleterDisplay}\n` +
                                    `*🕑 Time:* ${currentTime}\n` + 
                                    `*📆 Date:* ${currentDate}\n` +
                                    `${chatInfo}\n\n> *${botFooter}*`;

                    if (deletedMsg.message?.conversation || deletedMsg.message?.extendedTextMessage?.text) {
                        const text = deletedMsg.message.conversation || 
                                    deletedMsg.message.extendedTextMessage.text;
                        
                        await Kiptenden.sendMessage(key.remoteJid, {
                            text: `${baseAlert}\n\n📝 *Content:* ${text}`,
                            mentions: allMentions,
                            contextInfo: getContextInfo(allMentions),
                            ...context
                        });
                    } else {
                        const media = await processMediaMessage(deletedMsg);
                        if (media) {
                            if (media.type === 'sticker' || media.type === 'audio') {
                                await Kiptenden.sendMessage(key.remoteJid, {
                                    [media.type]: { url: media.path },
                                    mentions: allMentions,
                                    contextInfo: getContextInfo(allMentions),
                                    ...context,
                                    ...(media.type === 'audio' ? {
                                        ptt: media.ptt,
                                        mimetype: media.mimetype
                                    } : {})
                                });
                                await Kiptenden.sendMessage(key.remoteJid, {
                                    text: media.caption ?
                                        `${baseAlert}\n\n📌 *Caption:* ${media.caption}` :
                                        baseAlert,
                                    mentions: allMentions,
                                    contextInfo: getContextInfo(allMentions),
                                    ...context
                                });
                            } else {
                                await Kiptenden.sendMessage(key.remoteJid, {
                                    [media.type]: { url: media.path },
                                    caption: media.caption ? 
                                        `${baseAlert}\n\n📌 *Caption:* ${media.caption}` : 
                                        baseAlert,
                                    mentions: allMentions,
                                    contextInfo: getContextInfo(allMentions),
                                    ...context,
                                    ...(media.type === 'document' ? {
                                        mimetype: media.mimetype,
                                        fileName: media.fileName
                                    } : {})
                                });
                            }

                            setTimeout(() => {
                                fs.unlink(media.path).catch(err => 
                                    logger.error('Media cleanup failed:', err)
                                );
                            }, 30000);
                        }
                    }
                } catch (error) {
                    logger.error('Failed to process in-chat ANTIDELETE:', error);
                }
            })());
        }

        if (antiDelete === 'indm') {
            promises.push((async () => {
                try {
                    const ownerContext = `*👤 Sent By:* ${finalSenderDisplay}\n*👤 Deleted By:* ${finalDeleterDisplay}\n${chatInfo}`;

                    if (deletedMsg.message?.conversation || deletedMsg.message?.extendedTextMessage?.text) {
                        const text = deletedMsg.message.conversation || 
                                    deletedMsg.message.extendedTextMessage.text;
                        
                        await Kiptenden.sendMessage(botOwnerJid, { 
                            text: `*𝙰𝙽𝚃𝙸𝙳𝙴𝙻𝙴𝚃𝙴 𝙼𝙴𝚂𝚂𝙰𝙶𝙴 𝚂𝚈𝚂𝚃𝙴𝙼*\n\n*🕑 Time:* ${currentTime}\n*📆 Date:* ${currentDate}\n\n${ownerContext}\n\n*Deleted Msg:*\n${text}\n\n> *${botFooter}*`,
                            mentions: allMentions,
                            contextInfo: getContextInfo(allMentions),
                            ...context
                        });
                    } else {
                        const media = await processMediaMessage(deletedMsg);
                        if (media) {
                            const dmAlert = media.caption ?
                                `*𝙰𝙽𝚃𝙸𝙳𝙴𝙻𝙴𝚃𝙴 𝙼𝙴𝚂𝚂𝙰𝙶𝙴 𝚂𝚈𝚂𝚃𝙴𝙼*\n\n*🕑 Time:* ${currentTime}\n*📆 Date:* ${currentDate}\n\n${ownerContext}\n\n*Caption:*\n${media.caption}\n\n> *${botFooter}*` :
                                `*𝙰𝙽𝚃𝙸𝙳𝙴𝙻𝙴𝚃𝙴 𝙼𝙴𝚂𝚂𝙰𝙶𝙴 𝚂𝚈𝚂𝚃𝙴𝙼*\n\n*🕑 Time:* ${currentTime}\n*📆 Date:* ${currentDate}\n\n${ownerContext}\n\n> *${botFooter}*`;

                            if (media.type === 'sticker' || media.type === 'audio') {
                                await Kiptenden.sendMessage(botOwnerJid, {
                                    [media.type]: { url: media.path },
                                    mentions: allMentions,
                                    contextInfo: getContextInfo(allMentions),
                                    ...context,
                                    ...(media.type === 'audio' ? {
                                        ptt: media.ptt,
                                        mimetype: media.mimetype
                                    } : {})
                                });
                                await Kiptenden.sendMessage(botOwnerJid, {
                                    text: dmAlert,
                                    mentions: allMentions,
                                    contextInfo: getContextInfo(allMentions),
                                    ...context
                                });
                            } else {
                                await Kiptenden.sendMessage(botOwnerJid, {
                                    [media.type]: { url: media.path },
                                    caption: dmAlert,
                                    mentions: allMentions,
                                    contextInfo: getContextInfo(allMentions),
                                    ...context,
                                    ...(media.type === 'document' ? {
                                        mimetype: media.mimetype,
                                        fileName: media.fileName
                                    } : {})
                                });
                            }

                            setTimeout(() => {
                                fs.unlink(media.path).catch(err => 
                                    logger.error('Media cleanup failed:', err)
                                );
                            }, 30000);
                        }
                    }
                } catch (error) {
                    logger.error('Failed to forward ANTIDELETE to owner:', error);
                    await Kiptenden.sendMessage(botOwnerJid, {
                        text: `⚠️ Failed to forward deleted message from ${finalDeleterDisplay}\n\nError: ${error.message}`,
                        mentions: allMentions,
                        contextInfo: getContextInfo(allMentions),
                        ...context
                    });
                }
            })());
        }

        await Promise.all(promises);
    } catch (error) {
        logger.error('Anti-delete handling failed:', error);
    }
};

const KiptendenAntiViewOnce = async (Kiptenden, message) => {
    try {
        if (!message?.message) return;
        if (message.key.fromMe) return;
        
        const msgContent = message.message;
        let viewOnceContent = null;
        let mediaType = null;
        
        if (msgContent.imageMessage?.viewOnce || msgContent.videoMessage?.viewOnce || msgContent.audioMessage?.viewOnce) {
            mediaType = Object.keys(msgContent).find(
                (key) => key.endsWith("Message") && ["image", "video", "audio"].some((t) => key.includes(t))
            );
            if (mediaType) {
                viewOnceContent = { [mediaType]: msgContent[mediaType] };
            }
        } else if (msgContent.viewOnceMessage) {
            viewOnceContent = msgContent.viewOnceMessage.message;
            mediaType = viewOnceContent ? Object.keys(viewOnceContent).find(
                (key) => key.endsWith("Message") && ["image", "video", "audio"].some((t) => key.includes(t))
            ) : null;
        } else if (msgContent.viewOnceMessageV2) {
            viewOnceContent = msgContent.viewOnceMessageV2.message;
            mediaType = viewOnceContent ? Object.keys(viewOnceContent).find(
                (key) => key.endsWith("Message") && ["image", "video", "audio"].some((t) => key.includes(t))
            ) : null;
        } else if (msgContent.viewOnceMessageV2Extension) {
            viewOnceContent = msgContent.viewOnceMessageV2Extension.message;
            mediaType = viewOnceContent ? Object.keys(viewOnceContent).find(
                (key) => key.endsWith("Message") && ["image", "video", "audio"].some((t) => key.includes(t))
            ) : null;
        }
        
        if (!viewOnceContent || !mediaType || !viewOnceContent[mediaType]) return;
        
        const settings = await getAllSettings();
        const antiViewOnce = settings.ANTIVIEWONCE || "indm";
        if (antiViewOnce === "off") return;
        
        // "indm" → always bot's own DM (the same chat where pairing/session ID is received)
        // "on"   → forward into the originating chat
        const botJid = Kiptenden.user?.id?.split(":")[0] + "@s.whatsapp.net";
        const targetJid = antiViewOnce === "on" ? message.key.remoteJid : botJid;
        const senderNum = (message.key.participant || message.key.remoteJid).split("@")[0].split(":")[0];
        const chatName = message.key.remoteJid.endsWith("@g.us") ? "a group" : "DM";
        const botName = settings.BOT_NAME || "KIPTENDEN YOUTHS";
        const botPic = settings.BOT_PIC || "https://res.cloudinary.com/dqxlb29uz/image/upload/v1780267810/bwm_uploads/media-1780267810008.jpg";
        
        const mediaMessage = {
            ...viewOnceContent[mediaType],
            viewOnce: false,
        };
        
        const path = require("path");
        const fs = require("fs").promises;
        const tempDir = path.join(__dirname, "temp");
        
        try {
            await fs.mkdir(tempDir, { recursive: true });
        } catch (e) {}
        
        const tempFileName = `vo_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        let tempFilePath = null;
        
        try {
            tempFilePath = await Kiptenden.downloadAndSaveMediaMessage(mediaMessage, path.join(tempDir, tempFileName));
            
            const originalCaption = mediaMessage.caption || "";
            const caption =
                `👁️ *𝘝𝘐𝘌𝘞 𝘖𝘕𝘊𝘌 𝘙𝘌𝘝𝘌𝘈𝘓𝘌𝘋*\n` +
                `${"─".repeat(28)}\n\n` +
                `📤 *𝘍𝘳𝘰𝘮:* @${senderNum}\n` +
                `💬 *𝘊𝘩𝘢𝘵:* ${chatName}\n` +
                `📅 *𝘛𝘪𝘮𝘦:* ${new Date().toLocaleString()}\n` +
                (originalCaption ? `📝 *𝘊𝘢𝘱𝘵𝘪𝘰𝘯:* ${originalCaption}\n` : "") +
                `\n> _𝘚𝘢𝘷𝘦𝘥 𝘣𝘺 ${botName} 🔐_`;
            const mime = mediaMessage.mimetype || "";
            
            let sendContent;
            if (mediaType.includes("image")) {
                sendContent = { image: { url: tempFilePath }, caption, mimetype: mime, mentions: [`${senderNum}@s.whatsapp.net`] };
            } else if (mediaType.includes("video")) {
                sendContent = { video: { url: tempFilePath }, caption, mimetype: mime, mentions: [`${senderNum}@s.whatsapp.net`] };
            } else if (mediaType.includes("audio")) {
                sendContent = { audio: { url: tempFilePath }, ptt: true, mimetype: mime || "audio/mp4" };
            }
            
            if (sendContent) {
                await Kiptenden.sendMessage(targetJid, sendContent);
                // Also send a header image so the DM is clearly identified in bot's inbox
                if (targetJid === botJid) {
                    try {
                        await Kiptenden.sendMessage(botJid, {
                            image: { url: botPic },
                            caption: `🔐 *${botName} — 𝘝𝘪𝘦𝘸 𝘖𝘯𝘤𝘦 𝘐𝘯𝘵𝘦𝘳𝘤𝘦𝘱𝘵𝘦𝘥*\n\n👆 𝘔𝘦𝘥𝘪𝘢 𝘢𝘣𝘰𝘷𝘦 𝘸𝘢𝘴 𝘴𝘦𝘯𝘵 𝘣𝘺 @${senderNum}\n\n> _𝘈𝘯𝘵𝘪-𝘝𝘪𝘦𝘸𝘖𝘯𝘤𝘦 𝘣𝘺 𝘜𝘓𝘛𝘙𝘈 𝘎𝘜𝘙𝘜_`,
                            mentions: [`${senderNum}@s.whatsapp.net`],
                        });
                    } catch (_) {}
                }
            }
        } catch (e) {
            console.error("Anti-ViewOnce download/send error:", e.message);
        } finally {
            if (tempFilePath) {
                try { await require("fs").promises.unlink(tempFilePath); } catch (e) {}
            }
        }
    } catch (error) {
        console.error("Anti-ViewOnce handler error:", error.message);
    }
};

const _extractEditContent = (msgObj) => {
    if (!msgObj || typeof msgObj !== 'object') return '';
    const type = Object.keys(msgObj)[0];
    if (!type) return '';
    const m = msgObj[type];
    if (type === 'conversation') return msgObj.conversation || '';
    if (type === 'extendedTextMessage') return m?.text || '';
    if (type === 'imageMessage') return `[Image]${m?.caption ? ' ' + m.caption : ''}`;
    if (type === 'videoMessage') return `[Video]${m?.caption ? ' ' + m.caption : ''}`;
    if (type === 'audioMessage') return '[Audio/Voice]';
    if (type === 'documentMessage') return `[Document] ${m?.fileName || m?.caption || ''}`.trim();
    if (type === 'stickerMessage') return '[Sticker]';
    if (type === 'editedMessage') {
        const inner = m?.message;
        return inner ? _extractEditContent(inner) : '';
    }
    return m?.text || m?.caption || `[${type}]`;
};

const _extractRawCaption = (msgObj) => {
    if (!msgObj || typeof msgObj !== 'object') return '';
    const type = Object.keys(msgObj)[0];
    if (!type) return '';
    const m = msgObj[type];
    if (type === 'conversation') return msgObj.conversation || '';
    if (type === 'extendedTextMessage') return m?.text || '';
    if (type === 'editedMessage') {
        const inner = m?.message;
        return inner ? _extractRawCaption(inner) : '';
    }
    return m?.caption || m?.text || '';
};

const _resolveLid = async (Kiptenden, lid) => {
    if (!lid?.endsWith('@lid')) return lid;
    const { getLidMapping } = require('./connection/groupCache');
    const cached = getLidMapping(lid);
    if (cached) return cached;
    try { const r = await Kiptenden.getJidFromLid(lid); if (r) return r; } catch (e) {}
    return lid;
};

const KiptendenAntiEdit = async (Kiptenden, updateData, findOriginal) => {
    try {
        const settings = await getAllSettings();
        const antiEdit = settings.ANTI_EDIT || 'indm';
        if (antiEdit === 'false' || antiEdit === 'off') return;

        const { key, update } = updateData;
        if (!key || !update?.message) return;
        if (key.fromMe) return;
        if (key.remoteJid === 'status@broadcast') return;

        const rawChatJid = key.remoteJid;
        const msgId = key.id;

        const { getGroupMetadata } = require('./connection/groupCache');

        const resolvedChatJid = await _resolveLid(Kiptenden, rawChatJid);
        const isGroup = resolvedChatJid?.endsWith('@g.us') || rawChatJid?.endsWith('@g.us');

        const editedMsg = update.message;
        const newContent = _extractEditContent(editedMsg);
        if (!newContent) return;

        const MEDIA_TYPES = ['imageMessage', 'videoMessage', 'documentMessage'];

        let originalContent = 'N/A';
        let originalPushName = null;
        let originalMediaObj = null;
        let origMsgType = null;
        let origMsgData = null;
        let cachedSender = null;

        if (findOriginal) {
            const orig = findOriginal(rawChatJid, msgId);
            if (orig?.message) {
                origMsgType = Object.keys(orig.message)[0];
                origMsgData = orig.message[origMsgType];
                originalContent = _extractEditContent(orig.message) || 'N/A';
                if (MEDIA_TYPES.includes(origMsgType)) originalMediaObj = orig;
            }
            if (orig?.originalPushName) originalPushName = orig.originalPushName;
            if (orig?.originalSender && !orig.originalSender.endsWith('@lid')) {
                cachedSender = orig.originalSender;
            }
        }

        let sender = cachedSender
            || (key.participantPn && !key.participantPn.endsWith('@lid') ? key.participantPn : null)
            || key.participant
            || (isGroup ? null : resolvedChatJid);
        sender = await _resolveLid(Kiptenden, sender);
        const senderNum = sender && !sender.endsWith('@lid')
            ? sender.split('@')[0]
            : resolvedChatJid?.split('@')[0] || 'Unknown';

        const botFooter = settings.FOOTER || '';
        const timeZone = settings.TIME_ZONE || 'Africa/Nairobi';

        let chatLabel = isGroup ? resolvedChatJid : 'DM';
        if (isGroup) {
            try { const meta = await getGroupMetadata(Kiptenden, resolvedChatJid); chatLabel = meta?.subject || resolvedChatJid; } catch (e) {}
        }

        const currentTime = formatTime(Date.now(), timeZone);
        const currentDate = formatDate(Date.now(), timeZone);
        const mentions = sender && !sender.endsWith('@lid') ? [sender] : [];

        const origCaption = originalMediaObj ? (_extractRawCaption(originalMediaObj.message) || '(no caption)') : originalContent;
        const newCaption = _extractRawCaption(update.message) || newContent;

        const alertText = `*✏️ ANTI-EDIT MESSAGE SYSTEM*\n\n` +
            `*👤 Edited By:* @${senderNum}\n` +
            `*🕑 Time:* ${currentTime}\n` +
            `*📆 Date:* ${currentDate}\n` +
            `*💬 Chat:* ${chatLabel}\n\n` +
            `*📄 Original ${originalMediaObj ? 'Caption' : 'Message'}:* ${origCaption}\n` +
            `*📝 Edited To:* ${newCaption}\n\n` +
            `> *${botFooter}*`;

        const sendAlert = async (targetJid) => {
            if (!targetJid) return;
            if (originalMediaObj) {
                try {
                    const { downloadMediaMessage } = require('@whiskeysockets/baileys');
                    const buffer = await downloadMediaMessage(originalMediaObj, 'buffer', {});
                    if (origMsgType === 'imageMessage') {
                        await Kiptenden.sendMessage(targetJid, { image: buffer, caption: alertText, mentions });
                    } else if (origMsgType === 'videoMessage') {
                        await Kiptenden.sendMessage(targetJid, { video: buffer, caption: alertText, mentions });
                    } else if (origMsgType === 'documentMessage') {
                        await Kiptenden.sendMessage(targetJid, {
                            document: buffer,
                            fileName: origMsgData?.fileName || 'document',
                            mimetype: origMsgData?.mimetype || 'application/octet-stream',
                            caption: alertText,
                            mentions,
                        });
                    } else {
                        await Kiptenden.sendMessage(targetJid, { text: alertText, mentions });
                    }
                    return;
                } catch (mediaErr) {
                    console.error('[ANTI-EDIT] media forward failed:', mediaErr.message);
                }
            }
            await Kiptenden.sendMessage(targetJid, { text: alertText, mentions });
        };

        const sendJid = resolvedChatJid && !resolvedChatJid.endsWith('@lid') ? resolvedChatJid : rawChatJid;
        const dmTarget = Kiptenden.user?.id ? `${Kiptenden.user.id.split(':')[0]}@s.whatsapp.net` : null;

        if (antiEdit === 'indm' || antiEdit === 'on') {
            if (dmTarget) { try { await sendAlert(dmTarget); } catch (e) {} }
        }
        if ((antiEdit === 'inchat' || antiEdit === 'on') && sendJid) {
            try { await sendAlert(sendJid); } catch (e) {}
        }
    } catch (err) {
        console.error('Anti-edit error:', err.message);
    }
};

const _isViewOnceMsg = (msgContent) => {
    if (!msgContent) return false;
    if (msgContent.imageMessage?.viewOnce) return true;
    if (msgContent.videoMessage?.viewOnce) return true;
    if (msgContent.audioMessage?.viewOnce) return true;
    if (msgContent.viewOnceMessage) return true;
    if (msgContent.viewOnceMessageV2) return true;
    if (msgContent.viewOnceMessageV2Extension) return true;
    return false;
};

const _extractViewOnceData = (msgContent) => {
    if (!msgContent) return { content: null, type: null };

    if (msgContent.imageMessage?.viewOnce || msgContent.videoMessage?.viewOnce || msgContent.audioMessage?.viewOnce) {
        const type = Object.keys(msgContent).find(
            k => k.endsWith("Message") && ["image", "video", "audio"].some(t => k.includes(t))
        );
        return { content: type ? { [type]: msgContent[type] } : null, type: type || null };
    }

    for (const wrapper of ["viewOnceMessage", "viewOnceMessageV2", "viewOnceMessageV2Extension"]) {
        if (msgContent[wrapper]) {
            const inner = msgContent[wrapper].message;
            if (!inner) continue;
            const type = Object.keys(inner).find(
                k => k.endsWith("Message") && ["image", "video", "audio"].some(t => k.includes(t))
            );
            if (type) return { content: inner, type };
        }
    }

    return { content: null, type: null };
};

const _sendVVAnonymous = async (Kiptenden, viewOnceContent, mediaType, ownerJid, botName, senderNum) => {
    if (!viewOnceContent || !mediaType || !viewOnceContent[mediaType]) return;

    const mediaMessage = { ...viewOnceContent[mediaType], viewOnce: false };
    const tempDir = path.join(__dirname, "temp");
    try { await require("fs").promises.mkdir(tempDir, { recursive: true }); } catch (_) {}

    const tempFileName = `vvt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let savedPath = null;

    try {
        // Use downloadMediaMessage (already imported) — works reliably with media keys
        const fakeMsg = { message: { [mediaType]: mediaMessage } };
        const buffer = await downloadMediaMessage(fakeMsg, "buffer", { logger });
        savedPath = path.join(tempDir, tempFileName);
        await require("fs").promises.writeFile(savedPath, buffer);

        const mime = mediaMessage.mimetype || "";
        const originalCaption = mediaMessage.caption || "";
        const fromLine = senderNum ? `📤 *𝘍𝘳𝘰𝘮:* @${senderNum}\n` : "";
        const captionLine = originalCaption ? `📝 *𝘊𝘢𝘱𝘵𝘪𝘰𝘯:* ${originalCaption}\n` : "";
        const timeStr = new Date().toLocaleString();
        const caption = `👁️ *VIEW ONCE CAPTURED*\n${"─".repeat(28)}\n\n${fromLine}🕐 *Time:* ${timeStr}\n${captionLine}\n> _𝘚𝘢𝘷𝘦𝘥 𝘣𝘺 ${botName} 🔐_`;
        const mentions = senderNum ? [`${senderNum}@s.whatsapp.net`] : [];

        let msg;
        if (mediaType.includes("image")) {
            msg = { image: { url: savedPath }, caption, mimetype: mime, mentions };
        } else if (mediaType.includes("video")) {
            msg = { video: { url: savedPath }, caption, mimetype: mime, mentions };
        } else if (mediaType.includes("audio")) {
            msg = { audio: { url: savedPath }, ptt: true, mimetype: mime || "audio/mp4" };
        }

        if (msg) await Kiptenden.sendMessage(ownerJid, msg);
    } catch (e) {
        console.error("[VVTracker] Send error:", e.message);
    } finally {
        if (savedPath) {
            try { await require("fs").promises.unlink(savedPath); } catch (_) {}
        }
    }
};

let _vvTrackerActive = false;

const setupVVTracker = (Kiptenden) => {
    if (_vvTrackerActive) return;
    _vvTrackerActive = true;

    const { loadMsg } = require("./database/messageStore");

    Kiptenden.ev.on("messages.upsert", async ({ messages }) => {
        for (const msg of messages) {
            try {
                if (!msg?.message) continue;
                if (msg.key.remoteJid === "status@broadcast") continue;

                const settings = await getAllSettings();
                const vvTracker = settings.VV_TRACKER || "true";
                if (vvTracker === "false" || vvTracker === "off") continue;

                // Send to owner DM; fall back to bot's own DM if OWNER_NUMBER not set
                const ownerNumber = settings.OWNER_NUMBER;
                const botJid = (Kiptenden.user?.id || "").split(":")[0] + "@s.whatsapp.net";
                const ownerJid = ownerNumber
                    ? ownerNumber.replace(/\D/g, "") + "@s.whatsapp.net"
                    : botJid;
                const botName = settings.BOT_NAME || "KIPTENDEN YOUTHS";

                const from = msg.key.remoteJid;
                const msgContent = msg.message;
                const senderNum = (msg.key.participant || msg.key.remoteJid || "").split("@")[0].split(":")[0];
                // Send to the person who triggered the save, not the hardcoded owner
                const senderDmJid = `${senderNum}@s.whatsapp.net`;

                // Case 1: Reaction to a message — look up the original in the store
                if (msgContent.reactionMessage) {
                    const reactedKey = msgContent.reactionMessage.key;
                    if (!reactedKey?.id) continue;
                    const original = loadMsg(from, reactedKey.id);
                    if (!original?.message) continue;
                    if (!_isViewOnceMsg(original.message)) continue;
                    const { content, type } = _extractViewOnceData(original.message);
                    if (!content || !type) continue;
                    await _sendVVAnonymous(Kiptenden, content, type, senderDmJid, botName, senderNum);
                    continue;
                }

                // Case 2: Reply to a view-once message
                // Extract contextInfo from every possible message type
                const contextInfo =
                    msgContent.extendedTextMessage?.contextInfo ||
                    msgContent.imageMessage?.contextInfo ||
                    msgContent.videoMessage?.contextInfo ||
                    msgContent.audioMessage?.contextInfo ||
                    msgContent.documentMessage?.contextInfo ||
                    msgContent.stickerMessage?.contextInfo ||
                    msgContent.buttonsResponseMessage?.contextInfo ||
                    msgContent.listResponseMessage?.contextInfo ||
                    msgContent?.contextInfo;

                if (!contextInfo?.stanzaId) continue;

                // Always prefer the stored message — WhatsApp strips viewOnce flag from quotedMessage
                const storedMsg = loadMsg(from, contextInfo.stanzaId);
                const quotedContent = contextInfo.quotedMessage;

                // Check stored message first; fall back to quoted content
                const sourceContent = storedMsg?.message || quotedContent;
                if (!sourceContent) continue;
                if (!_isViewOnceMsg(sourceContent)) continue;

                const { content, type } = _extractViewOnceData(sourceContent);
                if (!content || !type) continue;

                await _sendVVAnonymous(Kiptenden, content, type, senderDmJid, botName, senderNum);

            } catch (e) {
                console.error("[VVTracker] Error:", e.message);
            }
        }
    });
};


// ─── ANTI-STICKER — silent sticker deletion for groups ────────────────────────
const KiptendenAntiSticker = async (Kiptenden, message, getGroupMetadata) => {
    try {
        if (!message?.message || message.key.fromMe) return;
        const from = message.key.remoteJid;
        if (!from?.endsWith('@g.us')) return;

        const messageType = Object.keys(message.message)[0];
        if (messageType !== 'stickerMessage') return;

        const { getGroupSetting } = require('./database/groupSettings');
        const setting = await getGroupSetting(from, 'ANTISTICKER');
        if (!setting || setting === 'false' || setting === 'off') return;

        // Resolve sender
        let sender = message.key.participantPn || message.key.participant || message.participant;
        if (!sender || sender.endsWith('@g.us')) return;
        const { getLidMapping } = require('./connection/groupCache');
        if (sender.endsWith('@lid')) {
            const cached = getLidMapping(sender);
            if (cached) sender = cached;
            else {
                try { const r = await Kiptenden.getJidFromLid(sender); if (r) sender = r; } catch {}
            }
        }

        // Don't delete admins' stickers
        const { getSudoNumbers } = require('./database/sudo');
        const sudoNumbers = await getSudoNumbers() || [];
        const senderNum = sender.split('@')[0];
        if (sudoNumbers.includes(senderNum)) return;

        const groupMetadata = await getGroupMetadata(Kiptenden, from);
        if (!groupMetadata?.participants) return;

        const isAdmin = groupMetadata.participants.some(p => {
            const pNum = (p.pn || p.phoneNumber || p.id || '').split('@')[0];
            return pNum === senderNum && p.admin;
        });
        if (isAdmin) return;

        // Silent delete — no message, no reaction
        try { await Kiptenden.sendMessage(from, { delete: message.key }); } catch {}
    } catch (err) {
        // Silent — never log to avoid revealing the feature
    }
};

module.exports = { logger, emojis, KiptendenAutoReact, KiptendenTechApi, KiptendenApiKey, KiptendenAntiLink, KiptendenAntibad, KiptendenAntiBot, KiptendenAntiGroupMention, KiptendenAutoBio, KiptendenChatBot, resolveChatbotTarget, normalizeChatbotMode, shouldChatbotRespond, splitWhatsAppText, sendChatbotText, KiptendenAntiDelete, KiptendenAnticall, KiptendenPresence, KiptendenAntiViewOnce, KiptendenAntiEdit, setupVVTracker, KiptendenAntiSticker, sendVVAnonymous: _sendVVAnonymous, isViewOnceMsg: _isViewOnceMsg, extractViewOnceData: _extractViewOnceData };
