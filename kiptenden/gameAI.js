const wordCache = new Map();

const FALLBACK_WORDS = [
    'apple', 'elephant', 'tiger', 'rabbit', 'table', 'eagle', 'earth', 'house',
    'snake', 'engine', 'error', 'river', 'rocket', 'train', 'night', 'tower',
    'radio', 'orange', 'energy', 'yellow', 'window', 'water', 'room', 'mother',
    'turtle', 'escape', 'tree', 'east', 'tennis', 'storm', 'music', 'castle',
];

const BOT_JID = 'AI_BOT@s.whatsapp.net';

const normalizeWord = (value) => String(value || '').trim().toLowerCase();

const normalizeUsedWords = (words) => new Set(
    Array.isArray(words) ? words.map(normalizeWord).filter(Boolean) : []
);

async function findWcgWord(lastWord, usedWords = []) {
    const previousWord = normalizeWord(lastWord);
    const startLetter = previousWord ? previousWord.slice(-1) : null;
    const used = normalizeUsedWords(usedWords);
    const cacheKey = startLetter || '__all__';

    try {
        let words = wordCache.get(cacheKey);

        if (!words) {
            const params = new URLSearchParams({ max: '200' });
            if (startLetter) params.set('sp', `${startLetter}*`);

            const response = await fetch(
                `https://api.datamuse.com/words?${params.toString()}`,
                { signal: AbortSignal.timeout(5000) }
            );

            if (!response.ok) {
                throw new Error(`Datamuse returned HTTP ${response.status}`);
            }

            const data = await response.json();
            if (!Array.isArray(data)) throw new Error('Invalid Datamuse response');

            words = data
                .map((item) => normalizeWord(item?.word))
                .filter((word) => word.length >= 2 && /^[a-z]+$/.test(word));

            wordCache.set(cacheKey, words);
        }

        const available = words.filter((word) => {
            return !used.has(word) && (!startLetter || word.startsWith(startLetter));
        });

        if (available.length > 0) {
            return available[Math.floor(Math.random() * available.length)];
        }

        return getFallbackWord(startLetter, used);
    } catch (error) {
        console.error('[GAME AI] Word fetch error:', error.message);
        return getFallbackWord(startLetter, used);
    }
}

function getFallbackWord(startLetter, usedWords = []) {
    const used = usedWords instanceof Set
        ? usedWords
        : normalizeUsedWords(usedWords);

    const available = FALLBACK_WORDS.filter((word) => {
        return !used.has(word) && (!startLetter || word.startsWith(startLetter));
    });

    return available.length > 0
        ? available[Math.floor(Math.random() * available.length)]
        : null;
}

function rollDice() {
    return Math.floor(Math.random() * 6) + 1;
}

function isEmptyTttCell(cell) {
    return (
        (typeof cell === 'number' && Number.isInteger(cell) && cell >= 1 && cell <= 9) ||
        (typeof cell === 'string' && /^[1-9]$/.test(cell)) ||
        cell === null ||
        cell === undefined ||
        cell === ''
    );
}

function findBestTttMove(board) {
    if (!Array.isArray(board) || board.length !== 9) return -1;

    const emptyCells = board
        .map((cell, index) => (isEmptyTttCell(cell) ? index : -1))
        .filter((index) => index !== -1);

    if (emptyCells.length === 0) return -1;

    const patterns = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6],
    ];

    const aiMark = board.includes('⭕') ? '⭕' : 'O';
    const humanMark = board.includes('❌') ? '❌' : 'X';

    const isWinningBoard = (candidate, mark) => patterns.some(([a, b, c]) => (
        candidate[a] === mark &&
        candidate[b] === mark &&
        candidate[c] === mark
    ));

    const findWinningMove = (mark) => {
        for (const index of emptyCells) {
            const candidate = [...board];
            candidate[index] = mark;
            if (isWinningBoard(candidate, mark)) return index;
        }
        return -1;
    };

    const winningMove = findWinningMove(aiMark);
    if (winningMove !== -1) return winningMove;

    const blockingMove = findWinningMove(humanMark);
    if (blockingMove !== -1) return blockingMove;

    if (emptyCells.includes(4)) return 4;

    const corners = [0, 2, 6, 8].filter((index) => emptyCells.includes(index));
    if (corners.length > 0) {
        return corners[Math.floor(Math.random() * corners.length)];
    }

    return emptyCells[Math.floor(Math.random() * emptyCells.length)];
}

function clearWordCache() {
    wordCache.clear();
}

module.exports = {
    findWcgWord,
    getFallbackWord,
    rollDice,
    findBestTttMove,
    clearWordCache,
    BOT_JID,
};

// findBestTttMove returns a zero-based board index (0-8).
// Convert it to 1-9 in the game handler if makeMove expects a position number.
// This file requires Node.js 18+ because it uses the built-in fetch API.
// No network request is made while this module is being loaded.

// Compatibility aliases for older handlers.
module.exports.findBestMove = findBestTttMove;
module.exports.getRandomWord = findWcgWord;

// Keep the primary constant explicit for handlers that import it directly.
module.exports.BOT_JID = BOT_JID;
