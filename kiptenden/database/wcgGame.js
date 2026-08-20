const { DATABASE } = require('./database');
const { DataTypes } = require('sequelize');
const { isValidEnglishWord } = require('../dictionary');

const WcgDB = DATABASE.define('WordChainGame', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    chatJid: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    players: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '[]',
    },
    currentTurn: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    lastWord: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    usedWords: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '[]',
    },
    scores: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: '{}',
    },
    status: {
        type: DataTypes.ENUM('waiting', 'active', 'finished'),
        defaultValue: 'waiting',
    },
    minPlayers: {
        type: DataTypes.INTEGER,
        defaultValue: 2,
    },
    turnTimeLimit: {
        type: DataTypes.INTEGER,
        defaultValue: 30,
    },
    isAiGame: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
}, {
    tableName: 'wcg_games',
    timestamps: true,
});

function parseJson(value, fallback) {
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return parsed ?? fallback;
    } catch {
        return fallback;
    }
}

function canonicalPlayerId(jid) {
    return String(jid || '')
        .trim()
        .toLowerCase()
        .split('@')[0]
        .split(':')[0];
}

function samePlayer(left, right) {
    const leftId = canonicalPlayerId(left);
    const rightId = canonicalPlayerId(right);
    return Boolean(leftId && rightId && leftId === rightId);
}

function findPlayerIndex(players, player) {
    return Array.isArray(players)
        ? players.findIndex((candidate) => samePlayer(candidate, player))
        : -1;
}

function getStoredPlayer(players, player) {
    const index = findPlayerIndex(players, player);
    return index >= 0 ? players[index] : null;
}

function normalizePlayers(value) {
    const players = parseJson(value, []);
    return Array.isArray(players) ? players.filter(Boolean) : [];
}

function normalizeUsedWords(value) {
    const words = parseJson(value, []);
    return Array.isArray(words)
        ? words.map((word) => String(word).trim().toLowerCase()).filter(Boolean)
        : [];
}

function normalizeScores(value) {
    const scores = parseJson(value, {});
    return scores && typeof scores === 'object' && !Array.isArray(scores) ? scores : {};
}

let wcgDbInitialized = false;

async function initWcgDB() {
    if (wcgDbInitialized) return;

    try {
        await WcgDB.sync();
        wcgDbInitialized = true;
    } catch (error) {
        console.error('WcgDB sync error:', error.stack || error);
        throw error;
    }
}

async function createWcgGame(chatJid, hostPlayer) {
    await initWcgDB();
    await WcgDB.destroy({ where: { chatJid } });

    const scores = { [hostPlayer]: 0 };

    return WcgDB.create({
        chatJid,
        players: JSON.stringify([hostPlayer]),
        currentTurn: null,
        lastWord: null,
        usedWords: '[]',
        scores: JSON.stringify(scores),
        status: 'waiting',
        isAiGame: false,
    });
}

async function joinWcgGame(chatJid, player) {
    await initWcgDB();

    const game = await WcgDB.findOne({
        where: { chatJid, status: 'waiting' },
    });

    if (!game) return { error: 'no_game' };

    const players = normalizePlayers(game.players);
    if (findPlayerIndex(players, player) === 0) {
        return { error: 'cant_join_own_game' };
    }
    if (findPlayerIndex(players, player) !== -1) {
        return { error: 'already_joined' };
    }

    const storedPlayer = String(player);
    players.push(storedPlayer);

    const scores = normalizeScores(game.scores);
    scores[storedPlayer] = 0;

    game.players = JSON.stringify(players);
    game.scores = JSON.stringify(scores);
    await game.save();

    return { players, game };
}

async function startWcgGame(chatJid) {
    await initWcgDB();

    const game = await WcgDB.findOne({
        where: { chatJid, status: 'waiting' },
    });

    if (!game) return { error: 'no_game' };

    const players = normalizePlayers(game.players);
    const minimum = Number(game.minPlayers) || 2;
    if (players.length < minimum) {
        return { error: 'not_enough_players' };
    }

    game.status = 'active';
    game.currentTurn = players[0];
    await game.save();

    return {
        players,
        currentTurn: game.currentTurn,
        game,
    };
}

async function getWcgGame(chatJid) {
    await initWcgDB();
    return WcgDB.findOne({ where: { chatJid } });
}

async function getActiveWcgGame(chatJid) {
    await initWcgDB();
    return WcgDB.findOne({ where: { chatJid, status: 'active' } });
}

async function getWaitingWcgGame(chatJid) {
    await initWcgDB();
    return WcgDB.findOne({ where: { chatJid, status: 'waiting' } });
}

async function submitWord(chatJid, player, word) {
    await initWcgDB();

    const game = await WcgDB.findOne({
        where: { chatJid, status: 'active' },
    });

    if (!game) return { error: 'no_game' };

    const players = normalizePlayers(game.players);
    const storedPlayer = getStoredPlayer(players, player);
    if (!storedPlayer) return { error: 'not_a_player' };
    if (!samePlayer(game.currentTurn, storedPlayer)) return { error: 'not_your_turn' };

    const cleanWord = String(word || '').trim().toLowerCase();
    if (!/^[a-z]+$/.test(cleanWord)) return { error: 'invalid_word' };
    if (cleanWord.length < 2) return { error: 'too_short' };

    const usedWords = normalizeUsedWords(game.usedWords);
    if (usedWords.includes(cleanWord)) return { error: 'word_used' };

    if (game.lastWord) {
        const lastChar = String(game.lastWord).slice(-1).toLowerCase();
        if (!cleanWord.startsWith(lastChar)) {
            return { error: 'wrong_letter', expected: lastChar };
        }
    }

    const isValid = await isValidEnglishWord(cleanWord);
    if (!isValid) return { error: 'invalid_word' };

    usedWords.push(cleanWord);

    const scores = normalizeScores(game.scores);
    scores[storedPlayer] = Number(scores[storedPlayer] || 0) + cleanWord.length;

    const currentIndex = findPlayerIndex(players, storedPlayer);
    if (currentIndex < 0 || players.length === 0) {
        return { error: 'player_not_found' };
    }

    const nextPlayer = players[(currentIndex + 1) % players.length];

    game.lastWord = cleanWord;
    game.usedWords = JSON.stringify(usedWords);
    game.scores = JSON.stringify(scores);
    game.currentTurn = nextPlayer;
    await game.save();

    return {
        word: cleanWord,
        scores,
        nextPlayer,
        wordCount: usedWords.length,
        game,
    };
}

async function eliminatePlayer(chatJid, player) {
    await initWcgDB();

    const game = await WcgDB.findOne({
        where: { chatJid, status: 'active' },
    });

    if (!game) return { error: 'no_game' };

    const players = normalizePlayers(game.players);
    const playerIndex = findPlayerIndex(players, player);
    if (playerIndex === -1) return { error: 'player_not_found' };

    const eliminatedPlayer = players[playerIndex];
    players.splice(playerIndex, 1);

    const scores = normalizeScores(game.scores);

    if (players.length === 0) {
        game.status = 'finished';
        game.players = '[]';
        await game.save();
        return {
            eliminated: eliminatedPlayer,
            winner: null,
            scores,
            finished: true,
            noWinner: true,
        };
    }

    if (players.length === 1) {
        game.status = 'finished';
        game.players = JSON.stringify(players);
        game.currentTurn = players[0];
        await game.save();
        return {
            eliminated: eliminatedPlayer,
            winner: players[0],
            scores,
            finished: true,
        };
    }

    const currentIndex = findPlayerIndex(players, game.currentTurn);
    const nextPlayer = currentIndex === -1 ? players[0] : players[currentIndex];

    game.players = JSON.stringify(players);
    game.currentTurn = nextPlayer;
    await game.save();

    return {
        eliminated: eliminatedPlayer,
        remainingPlayers: players,
        nextPlayer,
        scores,
    };
}

async function endWcgGame(chatJid) {
    await initWcgDB();

    const game = await WcgDB.findOne({ where: { chatJid } });
    if (!game) return null;

    const scores = normalizeScores(game.scores);
    await WcgDB.destroy({ where: { chatJid } });
    return scores;
}

module.exports = {
    initWcgDB,
    createWcgGame,
    joinWcgGame,
    startWcgGame,
    getWcgGame,
    getActiveWcgGame,
    getWaitingWcgGame,
    submitWord,
    eliminatePlayer,
    endWcgGame,
    WcgDB,
    canonicalPlayerId,
    samePlayer,
};
