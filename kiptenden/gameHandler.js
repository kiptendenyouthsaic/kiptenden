
const {
    joinGame,
    getActiveGame,
    getWaitingGame,
    makeMove,
    endGame,
    samePlayer,
} = require("./database/games");

const {
    getActiveWcgGame,
    getWaitingWcgGame,
    joinWcgGame,
    submitWord,
    eliminatePlayer,
    endWcgGame,
} = require("./database/wcgGame");

const {
    getActiveDiceGame,
    getWaitingDiceGame,
    joinDiceGame,
    playerRoll,
    endDiceGame,
} = require("./database/diceGame");

let ai;
try {
    ai = require("./gameAI");
} catch (error) {
    // Linux paths are case-sensitive; support the common gameAi.js spelling.
    ai = require("./gameAi");
}

const { findBestTttMove, findWcgWord, BOT_JID } = ai;
const { wcgTimeouts, clearWcgTimeout, formatScores, getDiceEmoji } = require("./wcg");

const gameTimeouts = new Map();
const diceTimeouts = new Map();

const getPlayerName = (jid) => String(jid || "unknown").split("@")[0];

const sameJid = (left, right) => {
    if (typeof samePlayer === "function") return samePlayer(left, right);
    return String(left || "") === String(right || "");
};

const isAiGame = (game) => {
    return game?.isAiGame === true ||
        game?.isAiGame === 1 ||
        game?.isAiGame === "1" ||
        game?.isAiGame === "true";
};

const parseJson = (value, fallback) => {
    try {
        return typeof value === "string" ? JSON.parse(value) : (value ?? fallback);
    } catch {
        return fallback;
    }
};

const renderBoard = (board) => {
    const cell = (val) => {
        if (val === "X") return "❌";
        if (val === "O") return "⭕";
        return `${val}️⃣`;
    };
    return `${cell(board[0])} | ${cell(board[1])} | ${cell(board[2])}
——+——+——
${cell(board[3])} | ${cell(board[4])} | ${cell(board[5])}
——+——+——
${cell(board[6])} | ${cell(board[7])} | ${cell(board[8])}`;
};

const clearGameTimeout = (chatJid) => {
    const timeout = gameTimeouts.get(chatJid);
    if (timeout) {
        clearTimeout(timeout);
        gameTimeouts.delete(chatJid);
    }
};

const clearDiceTimeout = (chatJid) => {
    if (diceTimeouts.has(chatJid)) {
        clearTimeout(diceTimeouts.get(chatJid));
        diceTimeouts.delete(chatJid);
    }
};

const setMoveTimeout = (chatJid, Kiptenden, currentPlayer, otherPlayer, player1) => {
    clearGameTimeout(chatJid);
    const timeout = setTimeout(async () => {
        const active = await getActiveGame(chatJid);
        if (active && sameJid(active.currentTurn, currentPlayer)) {
            await endGame(chatJid);
            const currentSymbol = sameJid(currentPlayer, active.player1) ? "❌" : "⭕";
            await Kiptenden.sendMessage(chatJid, {
                text: `⏰ *TIC TAC TOE - TIMEOUT*\n\n@${getPlayerName(currentPlayer)} (${currentSymbol}) took too long to move!\n\n🏆 *WINNER: @${getPlayerName(otherPlayer)}* by timeout!\n\nStart a new game with *.ttt*`,
                mentions: [currentPlayer, otherPlayer],
            });
        }
        gameTimeouts.delete(chatJid);
    }, 30000);
    gameTimeouts.set(chatJid, timeout);
};

const setWcgTurnTimeout = (chatJid, Kiptenden, currentPlayer, game) => {
    clearWcgTimeout(chatJid);
    const timeout = setTimeout(async () => {
        const activeGame = await getActiveWcgGame(chatJid);
        if (activeGame && sameJid(activeGame.currentTurn, currentPlayer)) {
            const result = await eliminatePlayer(chatJid, currentPlayer);
            if (result.finished) {
                await endWcgGame(chatJid);
                if (result.noWinner || !result.winner) {
                    await Kiptenden.sendMessage(chatJid, {
                        text: `⏰ *WORD CHAIN - GAME OVER*\n\n@${getPlayerName(currentPlayer)} ran out of time!\n\n📊 *Final Scores:*\n${formatScores(result.scores)}`,
                        mentions: [currentPlayer],
                    });
                } else {
                    await Kiptenden.sendMessage(chatJid, {
                        text: `⏰ *WORD CHAIN - TIMEOUT*\n\n@${getPlayerName(currentPlayer)} ran out of time!\n\n🏆 *WINNER:* @${getPlayerName(result.winner)}\n\n📊 *Final Scores:*\n${formatScores(result.scores)}`,
                        mentions: [currentPlayer, result.winner],
                    });
                }
            } else {
                await Kiptenden.sendMessage(chatJid, {
                    text: `⏰ @${getPlayerName(currentPlayer)} ran out of time and is eliminated!\n\n🔄 @${getPlayerName(result.nextPlayer)}'s turn\nLast word: *${activeGame.lastWord || 'None'}*\n${activeGame.lastWord ? `Start with: *${activeGame.lastWord.slice(-1).toUpperCase()}*` : 'Any word to start!'}\n\n⏰ _30 seconds to respond_`,
                    mentions: [currentPlayer, result.nextPlayer],
                });
                setWcgTurnTimeout(chatJid, Kiptenden, result.nextPlayer, activeGame);
            }
        }
        if (wcgTimeouts.get(chatJid) === timeout) {
            wcgTimeouts.delete(chatJid);
        }
    }, 30000);
    wcgTimeouts.set(chatJid, timeout);
};

const setDiceTurnTimeout = (chatJid, Kiptenden, currentPlayer, game) => {
    clearDiceTimeout(chatJid);
    const timeout = setTimeout(async () => {
        const activeGame = await getActiveDiceGame(chatJid);
        if (activeGame && sameJid(activeGame.currentTurn, currentPlayer)) {
            await endDiceGame(chatJid);
            const otherPlayer = sameJid(currentPlayer, activeGame.player1) ? activeGame.player2 : activeGame.player1;
            await Kiptenden.sendMessage(chatJid, {
                text: `⏰ *DICE GAME - TIMEOUT*\n\n@${getPlayerName(currentPlayer)} took too long!\n🏆 @${getPlayerName(otherPlayer)} wins by default!`,
                mentions: [currentPlayer, otherPlayer],
            });
        }
        diceTimeouts.delete(chatJid);
    }, 30000);
    diceTimeouts.set(chatJid, timeout);
};

async function handleAiTttMove(from, Kiptenden, game) {
    const board = parseJson(game?.board, []);
    if (!Array.isArray(board) || board.length !== 9) return;

    const aiMove = findBestTttMove(board);
    if (aiMove === -1) return;
    
    await new Promise(resolve => setTimeout(resolve, 1000));
const result = await makeMove(from, BOT_JID, aiMove + 1);
    if (!result || result.error || !result.game) {
        console.error('[GAME AI] Tic-Tac-Toe move failed:', result?.error || 'empty result');
        return;
    }
    
    if (result.winner) {
        clearGameTimeout(from);
        await Kiptenden.sendMessage(from, {
            text: `🎮 *TIC TAC TOE - AI WINS!*\n\n${renderBoard(parseJson(result.game.board, []))}\n\n🤖 AI wins! Better luck next time!`,
        });
        return;
    }
    
    if (result.draw) {
        clearGameTimeout(from);
        await Kiptenden.sendMessage(from, {
            text: `🎮 *TIC TAC TOE - DRAW!*\n\n${renderBoard(parseJson(result.game.board, []))}\n\n🤝 It's a tie! Good game!`,
        });
        return;
    }
    
    const newBoard = parseJson(result.game.board, []);
    await Kiptenden.sendMessage(from, {
        text: `🤖 AI played position ${aiMove + 1}\n\n${renderBoard(newBoard)}\n\n@${getPlayerName(result.game.currentTurn)}'s turn (❌)\n\n⏰ _30 seconds_`,
        mentions: [result.game.currentTurn],
    });
    
    setMoveTimeout(from, Kiptenden, result.game.currentTurn, BOT_JID, result.game.player1);
}

async function handleAiWcgMove(from, Kiptenden, gameRef) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const freshGame = await getActiveWcgGame(from);
    if (!freshGame) return;
    
    const usedWords = parseJson(freshGame.usedWords, []);
    const aiWord = await findWcgWord(freshGame.lastWord, usedWords);
    
    const lastLetter = freshGame.lastWord ? freshGame.lastWord.slice(-1).toUpperCase() : 'any letter';
    
    if (!aiWord) {
        const humanPlayer = sameJid(freshGame.player1, BOT_JID) ? freshGame.player2 : freshGame.player1;
        const scores = parseJson(freshGame.scores, {});
        await Kiptenden.sendMessage(from, {
            text: `🤖 AI couldn't find a word starting with *${lastLetter}*!\n\n🏆 *WINNER:* @${getPlayerName(humanPlayer)}\n\n📊 *Final Scores:*\n${formatScores(scores)}`,
            mentions: [humanPlayer],
        });
        await endWcgGame(from);
        return;
    }
    
const result = await submitWord(from, BOT_JID, aiWord);
    if (!result || result.error) {
        console.error('[GAME AI] Word Chain move failed:', result?.error || 'empty result');
        return;
    }
    
    clearWcgTimeout(from);
    const nextLetter = result.word.slice(-1).toUpperCase();
    
    await Kiptenden.sendMessage(from, {
        text: `🤖 AI: *${result.word}* (+${result.word.length} pts)\n\n🔄 @${getPlayerName(result.nextPlayer)}'s turn\nNext word starts with: *${nextLetter}*\n\n📊 Words: ${result.wordCount} | ⏰ 30s`,
        mentions: [result.nextPlayer],
    });
    
    setWcgTurnTimeout(from, Kiptenden, result.nextPlayer, result.game);
}

async function handleAiDiceRoll(from, Kiptenden, gameRef) {
    clearDiceTimeout(from);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const result = await playerRoll(from, BOT_JID);
    
    if (!result || result.error) {
        console.error('[GAME AI] Dice move failed:', result?.error || 'empty result');
        await Kiptenden.sendMessage(from, {
            text: `❌ AI roll error: ${result?.error || 'unknown error'}`,
        });
        await endDiceGame(from);
        return;
    }
    
    let text = `🎲 *Round ${result.currentRound} Results*\n\n`;
    text += `${getDiceEmoji(result.player1Roll)} @${getPlayerName(result.player1)}: ${result.player1Roll}\n`;
    text += `${getDiceEmoji(result.player2Roll)} 🤖 AI: ${result.player2Roll}\n\n`;
    
    if (result.roundWinner) {
        const winnerName = result.roundWinner === BOT_JID ? '🤖 AI' : `@${getPlayerName(result.roundWinner)}`;
        text += `🏆 ${winnerName} wins this round!\n`;
    } else {
        text += `🤝 It's a tie!\n`;
    }
    
    text += `\n📊 *Score:* ${result.player1Score} - ${result.player2Score}`;
    
    if (result.gameFinished) {
        text += `\n\n🎮 *GAME OVER!*\n`;
        if (result.gameWinner) {
            const winnerName = result.gameWinner === BOT_JID ? '🤖 AI wins!' : `🏆 @${getPlayerName(result.gameWinner)} wins!`;
            text += winnerName;
        } else {
            text += `🤝 *It's a tie!*`;
        }
        await endDiceGame(from);
    } else {
        text += `\n\n*Round ${result.nextRound}*\n@${getPlayerName(result.player1)}, type *roll*!`;
        const freshGame = await getActiveDiceGame(from);
        setDiceTurnTimeout(from, Kiptenden, result.player1, freshGame);
    }
    
    await Kiptenden.sendMessage(from, {
        text,
        mentions: [result.player1],
    });
}

const handleGameMessage = async (Kiptenden, message) => {
    try {
        if (!message?.message) return;
        
const from = message.key?.remoteJid;
        if (!from) return;
        const isPrivateChat = !from.endsWith('@g.us');
        
        if (message.key.fromMe && !isPrivateChat) return;
        
        const sender = message.key.participantPn || message.key.senderPn || message.key.participant || message.key.participantAlt || message.key.remoteJidAlt || message.key.remoteJid;
        
        if (!sender || sender.endsWith('@g.us')) return;
        
        const messageType = Object.keys(message.message)[0];
        const body = (messageType === 'conversation'
            ? message.message.conversation
            : message.message[messageType]?.text || message.message[messageType]?.caption || '').trim();
        
        if (!body) return;
        
        const lowerBody = body.toLowerCase();
        
        if (lowerBody === 'join') {
            const tttWaiting = await getWaitingGame(from);
            if (tttWaiting) {
                const result = await joinGame(from, sender);
                if (result && !result.error) {
                    clearGameTimeout(from);
                    const board = parseJson(result.board, []);
                    await Kiptenden.sendMessage(from, {
                        text: `🎮 *TIC TAC TOE - GAME STARTED!*\n\nPlayer 1: @${getPlayerName(result.player1)} (❌)\nPlayer 2: @${getPlayerName(result.player2)} (⭕)\n\n${renderBoard(board)}\n\n@${getPlayerName(result.currentTurn)}'s turn (❌)\n\n*Reply with a number (1-9) to move!*\n⏰ _30 seconds per move_`,
                        mentions: [result.player1, result.player2, result.currentTurn],
                    });
                    setMoveTimeout(from, Kiptenden, result.currentTurn, result.player2, result.player1);
                    return;
                }
            }
            
            const wcgWaiting = await getWaitingWcgGame(from);
            if (wcgWaiting) {
                const result = await joinWcgGame(from, sender);
                if (result && !result.error) {
                    await Kiptenden.sendMessage(from, {
                        text: `✅ @${getPlayerName(sender)} joined the Word Chain game!\n\n👥 Players: ${result.players?.length || 0}\nHost can type *.wcgbegin* to start!`,
                        mentions: [sender],
                    });
                    return;
                }
            }
            
            const diceWaiting = await getWaitingDiceGame(from);
            if (diceWaiting) {
                const result = await joinDiceGame(from, sender);
                if (result && !result.error) {
                    clearDiceTimeout(from);
                    await Kiptenden.sendMessage(from, {
                        text: `🎲 *DICE GAME STARTED!*\n\n@${getPlayerName(result.player1)} vs @${getPlayerName(result.player2)}\nRounds: ${result.totalRounds}\n\n@${getPlayerName(result.player1)}, type *roll* to start!`,
                        mentions: [result.player1, result.player2],
                    });
                    setDiceTurnTimeout(from, Kiptenden, result.player1, result.game);
                    return;
                }
            }
            return;
        }
        
const num = /^([1-9])$/.test(body) ? Number(body) : null;
        if (num !== null) {
            const game = await getActiveGame(from);
            if (!game) return;
            if (!samePlayer(game.player1, sender) && !samePlayer(game.player2, sender)) return;
            
            const result = await makeMove(from, sender, num);
            if (!result || result.error) {
                await Kiptenden.sendMessage(from, {
                    text: `❌ ${result?.error || 'Unable to process that move.'}`,
                });
                return;
            }
            
            const board = parseJson(result.game.board, []);
            
            if (result.winner) {
                clearGameTimeout(from);
                const winnerSymbol = result.symbol === "X" ? "❌" : "⭕";
                await Kiptenden.sendMessage(from, {
                    text: `🎮 *TIC TAC TOE - GAME OVER!*\n\n${renderBoard(board)}\n\n🏆 *WINNER: @${getPlayerName(result.winner)}* ${winnerSymbol}\n\nCongratulations! 🎉`,
                    mentions: [result.winner],
                });
                return;
            }
            
            if (result.draw) {
                clearGameTimeout(from);
                await Kiptenden.sendMessage(from, {
                    text: `🎮 *TIC TAC TOE - GAME OVER!*\n\n${renderBoard(board)}\n\n🤝 *IT'S A DRAW!*\n\nGood game! Start a new one with *.ttt*`,
                });
                return;
            }
            
            const currentSymbol = sameJid(result.game.currentTurn, result.game.player1) ? "❌" : "⭕";
            const otherPlayer = sameJid(result.game.currentTurn, result.game.player1) ? result.game.player2 : result.game.player1;
            
            if (isAiGame(game) && sameJid(result.game.currentTurn, BOT_JID)) {
                await Kiptenden.sendMessage(from, {
                    text: `🎮 *TIC TAC TOE vs AI*\n\n${renderBoard(board)}\n\n🤖 AI is thinking...`,
                });
                await handleAiTttMove(from, Kiptenden, result.game);
                return;
            }
            
            await Kiptenden.sendMessage(from, {
                text: `🎮 *TIC TAC TOE*\n\nPlayer 1: @${getPlayerName(result.game.player1)} (❌)\nPlayer 2: @${getPlayerName(result.game.player2)} (⭕)\n\n${renderBoard(board)}\n\n@${getPlayerName(result.game.currentTurn)}'s turn (${currentSymbol})\n\n*Reply 1-9 to move*\n⏰ _30 seconds_`,
                mentions: [result.game.player1, result.game.player2, result.game.currentTurn],
            });
            
            setMoveTimeout(from, Kiptenden, result.game.currentTurn, otherPlayer, result.game.player1);
            return;
        }
        
        if (lowerBody === 'roll') {
            const game = await getActiveDiceGame(from);
            if (!game) return;
            if (!samePlayer(game.player1, sender) && !samePlayer(game.player2, sender)) return;
            
            clearDiceTimeout(from);
            const result = await playerRoll(from, sender);
            
            if (!result || result.error === 'not_your_turn') {
                await Kiptenden.sendMessage(from, {
                    text: result?.error === 'not_your_turn' ? '❌ It is not your turn.' : '❌ Unable to process the roll.',
                });
                return;
            }
            if (result.error) {
                await Kiptenden.sendMessage(from, { text: `❌ ${result.error}` });
                return;
            }
            
            if (result.roundComplete || result.gameFinished) {
                let text = `🎲 *Round ${result.currentRound} Results*\n\n`;
                text += `${getDiceEmoji(result.player1Roll)} @${getPlayerName(result.player1)}: ${result.player1Roll}\n`;
                text += `${getDiceEmoji(result.player2Roll)} @${getPlayerName(result.player2)}: ${result.player2Roll}\n\n`;
                
                if (result.roundWinner) {
                    text += `🏆 @${getPlayerName(result.roundWinner)} wins this round!\n`;
                } else {
                    text += `🤝 It's a tie!\n`;
                }
                
                text += `\n📊 *Score:* ${result.player1Score} - ${result.player2Score}`;
                
                if (result.gameFinished) {
                    text += `\n\n🎮 *GAME OVER!*\n`;
                    if (result.gameWinner) {
                        text += `🏆 *WINNER:* @${getPlayerName(result.gameWinner)}!`;
                    } else {
                        text += `🤝 *It's a tie!*`;
                    }
                    await endDiceGame(from);
                } else {
                    text += `\n\n*Round ${result.nextRound}*\n@${getPlayerName(result.player1)}, type *roll*!`;
                    setDiceTurnTimeout(from, Kiptenden, result.player1, game);
                }
                
                await Kiptenden.sendMessage(from, {
                    text,
                    mentions: [result.player1, result.player2, result.roundWinner, result.gameWinner].filter(Boolean),
                });
            } else {
                if (isAiGame(game) && sameJid(result.waitingFor, BOT_JID)) {
                    await Kiptenden.sendMessage(from, {
                        text: `🎲 @${getPlayerName(sender)} rolled: ${getDiceEmoji(result.roll)} *${result.roll}*\n\n🤖 AI is rolling...`,
                        mentions: [sender],
                    });
                    await handleAiDiceRoll(from, Kiptenden, game);
                    return;
                }
                
                await Kiptenden.sendMessage(from, {
                    text: `🎲 @${getPlayerName(sender)} rolled: ${getDiceEmoji(result.roll)} *${result.roll}*\n\n@${getPlayerName(result.waitingFor)}, type *roll*!`,
                    mentions: [sender, result.waitingFor],
                });
                setDiceTurnTimeout(from, Kiptenden, result.waitingFor, game);
            }
            return;
        }
        
        const wcgGame = await getActiveWcgGame(from);
        if (wcgGame) {
const players = parseJson(wcgGame.players, []);
            if (!Array.isArray(players) || !players.some((player) => sameJid(player, sender))) return;
            
            const word = body.split(/\s+/)[0].toLowerCase();
            if (!word || word.length < 2 || !/^[a-z]+$/.test(word)) return;
            
            const result = await submitWord(from, sender, word);
            if (!result) {
                await Kiptenden.sendMessage(from, { text: '❌ Unable to process that word.' });
                return;
            }
            
            if (result.error === 'not_your_turn') return;
            if (result.error === 'word_used') {
                await Kiptenden.sendMessage(from, {
                    text: `❌ "${word}" has already been used!`,
                });
                return;
            }
            if (result.error === 'wrong_letter') {
                await Kiptenden.sendMessage(from, {
                    text: `❌ Word must start with *${result.expected.toUpperCase()}*!`,
                });
                return;
            }
            if (result.error === 'too_short') {
                await Kiptenden.sendMessage(from, {
                    text: "❌ Word must be at least 2 letters!",
                });
                return;
            }
            if (result.error === 'invalid_word') {
                await Kiptenden.sendMessage(from, {
                    text: `❌ "${word}" is not a valid English word!`,
                });
                return;
            }
            if (result.error) {
                await Kiptenden.sendMessage(from, {
                    text: `❌ ${result.error}`,
                });
                return;
            }
            
            clearWcgTimeout(from);
            const nextLetter = result.word.slice(-1).toUpperCase();
            
            const updatedGame = await getActiveWcgGame(from);
            if (updatedGame && isAiGame(updatedGame) && sameJid(result.nextPlayer, BOT_JID)) {
                await Kiptenden.sendMessage(from, {
                    text: `✅ *${result.word}* (+${result.word.length} pts)\n\n🤖 AI is thinking...`,
                });
                await handleAiWcgMove(from, Kiptenden, updatedGame);
                return;
            }
            
            await Kiptenden.sendMessage(from, {
                text: `✅ *${result.word}* (+${result.word.length} pts)\n\n🔄 @${getPlayerName(result.nextPlayer)}'s turn\nNext word starts with: *${nextLetter}*\n\n📊 Words: ${result.wordCount} | ⏰ 30s`,
                mentions: [result.nextPlayer],
            });
            
            setWcgTurnTimeout(from, Kiptenden, result.nextPlayer, result.game);
            return;
        }
    } catch (err) {
        console.error('Game handler error:', err);
        try {
            await Kiptenden.sendMessage(message?.key?.remoteJid, {
                text: '❌ The game could not process that message. Please try again or start a new game.',
            });
        } catch (sendError) {
            console.error('Game handler error response failed:', sendError);
        }
    }
};

module.exports = { 
    handleGameMessage,
    clearGameTimeout,
    clearDiceTimeout,
    setMoveTimeout,
    setWcgTurnTimeout,
    setDiceTurnTimeout,
    renderBoard,
    getPlayerName,
    handleAiTttMove,
    handleAiWcgMove,
    handleAiDiceRoll,
    gameTimeouts,
    diceTimeouts,
};
