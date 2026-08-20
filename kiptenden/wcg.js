const wcgTimeouts = new Map();
const wcgJoinTimeouts = new Map();

function clearTimer(map, chatJid) {
    const timeout = map.get(chatJid);
    if (timeout) {
        clearTimeout(timeout);
        map.delete(chatJid);
    }
}

function clearWcgTimeout(chatJid) {
    clearTimer(wcgTimeouts, chatJid);
}

function clearWcgJoinTimeout(chatJid) {
    clearTimer(wcgJoinTimeouts, chatJid);
}

function setManagedTimeout(map, chatJid, callback, delay) {
    const oldTimeout = map.get(chatJid);
    if (oldTimeout) clearTimeout(oldTimeout);

    let timeout;
    timeout = setTimeout(() => {
        if (map.get(chatJid) === timeout) {
            map.delete(chatJid);
        }

        try {
            Promise.resolve(callback()).catch((error) => {
                console.error('[WCG] Timeout callback error:', error.stack || error);
            });
        } catch (error) {
            console.error('[WCG] Timeout callback error:', error.stack || error);
        }
    }, Math.max(0, Number(delay) || 0));

    map.set(chatJid, timeout);
    return timeout;
}

function setWcgJoinTimeout(chatJid, callback, delay = 30000) {
    if (typeof callback !== 'function') {
        throw new TypeError('setWcgJoinTimeout requires a callback function');
    }
    return setManagedTimeout(wcgJoinTimeouts, chatJid, callback, delay);
}

function getPlayerName(jid) {
    return String(jid || 'unknown').split('@')[0];
}

function normalizeScores(scores) {
    if (typeof scores === 'string') {
        try {
            scores = JSON.parse(scores);
        } catch {
            scores = {};
        }
    }

    return scores && typeof scores === 'object' && !Array.isArray(scores)
        ? scores
        : {};
}

function formatScores(scores) {
    return Object.entries(normalizeScores(scores))
        .map(([jid, score]) => [jid, Number(score) || 0])
        .sort((left, right) => right[1] - left[1])
        .map(([jid, score], index) => {
            return `${index + 1}. @${getPlayerName(jid)}: ${score} pts`;
        })
        .join('\n');
}

function getDiceEmoji(value) {
    const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= 6
        ? diceEmojis[number - 1]
        : '🎲';
}

module.exports = {
    wcgTimeouts,
    wcgJoinTimeouts,
    clearWcgTimeout,
    clearWcgJoinTimeout,
    setWcgJoinTimeout,
    getPlayerName,
    formatScores,
    getDiceEmoji,
};
