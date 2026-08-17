"use strict";

global.config = { DATABASE_URL: "" };

const assert = require("assert");
const {
    createGame,
    getWaitingGame,
    getActiveGame,
    joinGame,
    makeMove,
    endGame,
    canonicalPlayerId,
    samePlayer,
} = require("./kiptenden/database/games");

async function main() {
    const chat = "120363000000000000@g.us";
    const player1 = "111111111111@lid";
    const player2 = "222222222222@s.whatsapp.net";

    await endGame(chat);
    assert.strictEqual(canonicalPlayerId("111111111111:3@lid"), "111111111111");
    assert.strictEqual(samePlayer("111111111111:3@lid", player1), true);
    assert.strictEqual(samePlayer(player1, player2), false);

    await createGame(chat, player1);
    assert.ok(await getWaitingGame(chat), "a newly created game should wait");

    const joined = await joinGame(chat, player2);
    assert.ok(joined && !joined.error, "a different participant should join");
    assert.strictEqual(joined.player1, player1);
    assert.strictEqual(joined.player2, player2);
    assert.ok(await getActiveGame(chat), "joined game should become active");

    const firstMove = await makeMove(chat, "111111111111@s.whatsapp.net", 1);
    assert.ok(firstMove.game && !firstMove.error, "player 1 should move across JID suffixes");
    assert.strictEqual(JSON.parse(firstMove.game.board)[0], "X");

    const secondMove = await makeMove(chat, "222222222222@lid", 2);
    assert.ok(secondMove.game && !secondMove.error, "player 2 should move across JID suffixes");
    assert.strictEqual(JSON.parse(secondMove.game.board)[1], "O");

    await endGame(chat);
    await createGame(chat, "333333333333:7@lid");
    const selfJoin = await joinGame(chat, "333333333333@lid");
    assert.deepStrictEqual(selfJoin, { error: "same_player" });

    await endGame(chat);
    console.log("TTT JOIN SMOKE PASS");
    process.exit(0);
}

main().catch(async (error) => {
    try {
        await endGame("120363000000000000@g.us");
    } catch (_) {}
    console.error(error.stack || error);
    process.exitCode = 1;
});
