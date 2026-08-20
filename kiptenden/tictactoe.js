const {
    joinGame,
    getActiveGame,
    getWaitingGame,
    makeMove,
    endGame,
    samePlayer,
} = require('./database/games');

let ai;
try {
    ai = require('./gameAI');
} catch (error) {
    ai = require('./gameAi');
}

const { findBestTttMove, BOT_JID } = ai;
const gameTimeouts = new Map();

function parseJson(value, fallback) {
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return parsed ?? fallback;
    } catch {
        return fallback;
    }
}

function getPlayerName(jid) {
    return String(jid || 'unknown').split('@')[0];
}

function renderBoard(board) {
    const safeBoard = Array.isArray(board) && board.length === 9
        ? board
        : [1, 2, 3, 4, 5, 6, 7, 8, 9];

    const cell = (value) => {
        if (value === 'X') return '❌';
        if (value === 'O') return '⭕';
        return `${value}️⃣`;
    };

    return `${cell(safeBoard[0])} | ${cell(safeBoard[1])} | ${cell(safeBoard[2])}
——+——+——
${cell(safeBoard[3])} | ${cell(safeBoard[4])} | ${cell(safeBoard[5])}
——+——+——
${cell(safeBoard[6])} | ${cell(safeBoard[7])} | ${cell(safeBoard[8])}`;
}

function clearGameTimeout(chatJid) {
    const timeout = gameTimeouts.get(chatJid);
    if (timeout) {
        clearTimeout(timeout);
        gameTimeouts.delete(chatJid);
    }
}

function setMoveTimeout(chatJid, Kiptenden, currentPlayer, otherPlayer) {
    clearGameTimeout(chatJid);

    const timeout = setTimeout(async () => {
        try {
            const active = await getActiveGame(chatJid);
            if (active && samePlayer(active.currentTurn, currentPlayer)) {
                await endGame(chatJid);
                const currentSymbol = samePlayer(currentPlayer, active.player1) ? '❌' : '⭕';
                await Kiptenden.sendMessage(chatJid, {
                    text: `⏰ *TIC TAC TOE - TIMEOUT*\n\n@${getPlayerName(currentPlayer)} (${currentSymbol}) took too long to move!\n\n🏆 *WINNER: @${getPlayerName(otherPlayer)}* by timeout!\n\nStart a new game with *.ttt*`,
                    mentions: [currentPlayer, otherPlayer].filter(Boolean),
                });
            }
        } catch (error) {
            console.error('[TTT] Timeout error:', error.stack || error);
        } finally {
            if (gameTimeouts.get(chatJid) === timeout) {
                gameTimeouts.delete(chatJid);
            }
        }
    }, 30000);

    gameTimeouts.set(chatJid, timeout);
}

function extractMessageBody(message) {
    const messageContent = message?.message;
    if (!messageContent) return '';

    const messageType = Object.keys(messageContent)[0];
    if (messageType === 'conversation') {
        return String(messageContent.conversation || '').trim();
    }

    const content = messageContent[messageType] || {};
    return String(content.text || content.caption || '').trim();
}

function getSender(message) {
    const key = message?.key || {};
    return key.participantPn ||
        key.senderPn ||
        key.participant ||
        key.participantAlt ||
        key.remoteJidAlt ||
        key.remoteJid;
}

async function sendMovePrompt(from, Kiptenden, game, title = 'TIC TAC TOE') {
    const board = parseJson(game.board, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const currentSymbol = samePlayer(game.currentTurn, game.player1) ? '❌' : '⭕';

    await Kiptenden.sendMessage(from, {
        text: `🎮 *${title}*\n\nPlayer 1: @${getPlayerName(game.player1)} (❌)\nPlayer 2: @${getPlayerName(game.player2)} (⭕)\n\n${renderBoard(board)}\n\n@${getPlayerName(game.currentTurn)}'s turn (${currentSymbol})\n\n*Reply with a number from 1-9 to move*\n⏰ _30 seconds_`,
        mentions: [game.player1, game.player2, game.currentTurn].filter(Boolean),
    });
}

async function handleAiTttMove(from, Kiptenden, gameSnapshot) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const game = await getActiveGame(from);
    if (!game || !game.isAiGame || !samePlayer(game.currentTurn, BOT_JID)) return;

    const board = parseJson(game.board, null);
    if (!Array.isArray(board) || board.length !== 9) {
        console.error('[TTT AI] Invalid board:', game.board);
        return;
    }

    const aiMove = findBestTttMove(board);
    if (!Number.isInteger(aiMove) || aiMove < 0 || aiMove > 8) {
        console.error('[TTT AI] Invalid AI move:', aiMove);
        return;
    }

    const result = await makeMove(from, BOT_JID, aiMove + 1);
    if (!result || result.error || !result.game) {
        console.error('[TTT AI] Move failed:', result?.error || 'empty result');
        await Kiptenden.sendMessage(from, {
            text: `❌ AI could not make a move: ${result?.error || 'unknown error'}`,
        });
        return;
    }

    const resultBoard = parseJson(result.game.board, board);

    if (result.winner) {
        clearGameTimeout(from);
        await Kiptenden.sendMessage(from, {
            text: `🎮 *TIC TAC TOE - AI WINS!*\n\n${renderBoard(resultBoard)}\n\n🤖 AI wins! Better luck next time!`,
        });
        return;
    }

    if (result.draw) {
        clearGameTimeout(from);
        await Kiptenden.sendMessage(from, {
            text: `🎮 *TIC TAC TOE - DRAW!*\n\n${renderBoard(resultBoard)}\n\n🤝 It is a tie! Good game!`,
        });
        return;
    }

    await Kiptenden.sendMessage(from, {
        text: `🤖 AI played position ${aiMove + 1}\n\n${renderBoard(resultBoard)}\n\n@${getPlayerName(result.game.currentTurn)}'s turn (❌)\n\n⏰ _30 seconds_`,
        mentions: [result.game.currentTurn].filter(Boolean),
    });

    const otherPlayer = samePlayer(result.game.currentTurn, result.game.player1)
        ? result.game.player2
        : result.game.player1;
    setMoveTimeout(from, Kiptenden, result.game.currentTurn, otherPlayer);
}

async function handleTicTacToeMessage(Kiptenden, message) {
    try {
        if (!message?.message || !message?.key || message.key.fromMe) return;

        const from = message.key.remoteJid;
        if (!from) return;

        const sender = getSender(message);
        if (!sender || String(sender).endsWith('@g.us')) return;

        const body = extractMessageBody(message);
        if (!body) return;

        const lowerBody = body.toLowerCase();

        if (lowerBody === 'join') {
            const waiting = await getWaitingGame(from);
            if (!waiting) return;

            const result = await joinGame(from, sender);
            if (!result || result.error) {
                await Kiptenden.sendMessage(from, {
                    text: `❌ Could not join the game: ${result?.error || 'no game available'}`,
                });
                return;
            }

            clearGameTimeout(from);
            await sendMovePrompt(from, Kiptenden, result);
            setMoveTimeout(from, Kiptenden, result.currentTurn, result.player2);
            return;
        }

        if (!/^[1-9]$/.test(body)) return;
        const position = Number(body);
        const game = await getActiveGame(from);
        if (!game) return;

        if (!samePlayer(game.player1, sender) && !samePlayer(game.player2, sender)) {
            await Kiptenden.sendMessage(from, { text: '❌ You are not a player in this game.' });
            return;
        }

        const result = await makeMove(from, sender, position);
        if (!result || result.error) {
            await Kiptenden.sendMessage(from, {
                text: `❌ ${result?.error || 'Unable to process that move.'}`,
            });
            return;
        }

        const board = parseJson(result.game.board, []);

        if (result.winner) {
            clearGameTimeout(from);
            await Kiptenden.sendMessage(from, {
                text: `🎮 *TIC TAC TOE - GAME OVER!*\n\n${renderBoard(board)}\n\n🏆 *WINNER: @${getPlayerName(result.winner)}* ${result.symbol === 'X' ? '❌' : '⭕'}\n\nCongratulations!`,
                mentions: [result.winner],
            });
            return;
        }

        if (result.draw) {
            clearGameTimeout(from);
            await Kiptenden.sendMessage(from, {
                text: `🎮 *TIC TAC TOE - GAME OVER!*\n\n${renderBoard(board)}\n\n🤝 *IT IS A DRAW!*\n\nGood game!`,
            });
            return;
        }

        if (game.isAiGame && samePlayer(result.game.currentTurn, BOT_JID)) {
            clearGameTimeout(from);
            await Kiptenden.sendMessage(from, {
                text: `🎮 *TIC TAC TOE vs AI*\n\n${renderBoard(board)}\n\n🤖 AI is thinking...`,
            });
            await handleAiTttMove(from, Kiptenden, result.game);
            return;
        }

        await sendMovePrompt(from, Kiptenden, result.game);
        const otherPlayer = samePlayer(result.game.currentTurn, result.game.player1)
            ? result.game.player2
            : result.game.player1;
        setMoveTimeout(from, Kiptenden, result.game.currentTurn, otherPlayer);
    } catch (error) {
        console.error('[TTT] Handler error:', error.stack || error);
        try {
            await Kiptenden.sendMessage(message?.key?.remoteJid, {
                text: '❌ Tic-Tac-Toe could not process that message. Please try again.',
            });
        } catch (sendError) {
            console.error('[TTT] Error response failed:', sendError);
        }
    }
}

module.exports = {
    handleTicTacToeMessage,
    handleAiTttMove,
    clearGameTimeout,
    setMoveTimeout,
    renderBoard,
    getPlayerName,
    gameTimeouts,
};
