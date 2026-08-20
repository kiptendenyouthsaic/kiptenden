const { DATABASE } = require('./database');
const { DataTypes } = require('sequelize');

const BOT_JID = 'AI_BOT@s.whatsapp.net';

const GamesDB = DATABASE.define('TicTacToeGame', {
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
    player1: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    player2: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    board: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9]),
    },
    currentTurn: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    status: {
        type: DataTypes.ENUM('waiting', 'active', 'finished'),
        defaultValue: 'waiting',
    },
    messageKey: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    isAiGame: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
}, {
    tableName: 'tictactoe_games',
    timestamps: true,
});

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

function parseBoard(value) {
    try {
        const board = typeof value === 'string' ? JSON.parse(value) : value;
        return Array.isArray(board) && board.length === 9 ? board : null;
    } catch {
        return null;
    }
}

function emptyBoard() {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9];
}

function isMark(value) {
    return value === 'X' || value === 'O';
}

function checkWinner(board) {
    const winPatterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6],
    ];

    for (const [a, b, c] of winPatterns) {
        if (isMark(board[a]) && board[a] === board[b] && board[b] === board[c]) {
            return board[a];
        }
    }

    return null;
}

function checkDraw(board) {
    return board.every(isMark);
}

function serializeGame(game) {
    return {
        id: game.id,
        chatJid: game.chatJid,
        player1: game.player1,
        player2: game.player2,
        board: game.board,
        currentTurn: game.currentTurn,
        status: game.status,
        isAiGame: Boolean(game.isAiGame),
    };
}

let gamesDbInitialized = false;

async function initGamesDB() {
    if (gamesDbInitialized) return;

    try {
        await GamesDB.sync();
        gamesDbInitialized = true;
    } catch (error) {
        console.error('GamesDB sync error:', error.stack || error);
        throw error;
    }
}

async function createGame(chatJid, player1, messageKey = null, isAiGame = false) {
    await initGamesDB();
    await GamesDB.destroy({ where: { chatJid } });

    return GamesDB.create({
        chatJid,
        player1,
        player2: isAiGame ? BOT_JID : null,
        board: JSON.stringify(emptyBoard()),
        currentTurn: player1,
        status: isAiGame ? 'active' : 'waiting',
        messageKey: messageKey ? JSON.stringify(messageKey) : null,
        isAiGame: Boolean(isAiGame),
    });
}

async function joinGame(chatJid, player2) {
    await initGamesDB();

    const game = await GamesDB.findOne({
        where: { chatJid, status: 'waiting' },
    });

    if (!game) return null;
    if (samePlayer(game.player1, player2)) return { error: 'same_player' };

    game.player2 = player2;
    game.status = 'active';
    game.currentTurn = game.player1;
    await game.save();

    return {
        ...serializeGame(game),
        board: game.board,
    };
}

async function getActiveGame(chatJid) {
    await initGamesDB();
    return GamesDB.findOne({ where: { chatJid, status: 'active' } });
}

async function getWaitingGame(chatJid) {
    await initGamesDB();
    return GamesDB.findOne({ where: { chatJid, status: 'waiting' } });
}

async function makeMove(chatJid, player, position) {
    await initGamesDB();

    const game = await GamesDB.findOne({
        where: { chatJid, status: 'active' },
    });

    if (!game) return { error: 'no_game' };

    const playerIsPlayer1 = samePlayer(player, game.player1);
    const playerIsPlayer2 = samePlayer(player, game.player2);

    if (!playerIsPlayer1 && !playerIsPlayer2) {
        return { error: 'not_a_player' };
    }

    if (!samePlayer(game.currentTurn, player)) {
        return { error: 'not_your_turn' };
    }

    const numericPosition = Number(position);
    if (!Number.isInteger(numericPosition) || numericPosition < 1 || numericPosition > 9) {
        return { error: 'invalid_position' };
    }

    const board = parseBoard(game.board);
    if (!board) return { error: 'invalid_board' };

    const index = numericPosition - 1;
    if (isMark(board[index])) return { error: 'cell_taken' };

    const symbol = playerIsPlayer1 ? 'X' : 'O';
    board[index] = symbol;
    game.board = JSON.stringify(board);

    const winner = checkWinner(board);
    if (winner) {
        game.status = 'finished';
        await game.save();
        return {
            winner: player,
            symbol,
            game: serializeGame(game),
        };
    }

    if (checkDraw(board)) {
        game.status = 'finished';
        await game.save();
        return {
            draw: true,
            game: serializeGame(game),
        };
    }

    game.currentTurn = playerIsPlayer1 ? game.player2 : game.player1;
    await game.save();

    return {
        game: serializeGame(game),
    };
}

async function endGame(chatJid) {
    await initGamesDB();
    await GamesDB.destroy({ where: { chatJid } });
}

module.exports = {
    initGamesDB,
    createGame,
    joinGame,
    getActiveGame,
    getWaitingGame,
    makeMove,
    endGame,
    GamesDB,
    BOT_JID,
    canonicalPlayerId,
    samePlayer,
    checkWinner,
    checkDraw,
};
