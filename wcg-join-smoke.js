"use strict";

global.config = { DATABASE_URL: "" };

const assert = require("assert");
const {
    createWcgGame,
    getWaitingWcgGame,
    joinWcgGame,
    startWcgGame,
    endWcgGame,
} = require("./kiptenden/database/wcgGame");

async function main() {
    const chat = "120363000000000000@g.us";
    const host = "444444444444@lid";
    const player2 = "555555555555@s.whatsapp.net";

    await endWcgGame(chat);
    await createWcgGame(chat, host);
    assert.ok(await getWaitingWcgGame(chat), "a new Word Chain game should wait");

    const joined = await joinWcgGame(chat, player2);
    assert.ok(joined && !joined.error, "a different participant should join with .wcg");
    assert.deepStrictEqual(joined.players, [host, player2]);

    const started = await startWcgGame(chat);
    assert.ok(started && !started.error, "the host should be able to start after a join");
    assert.strictEqual(started.currentTurn, host);

    await endWcgGame(chat);
    console.log("WCG JOIN SMOKE PASS");
    process.exit(0);
}

main().catch(async (error) => {
    try {
        await endWcgGame("120363000000000000@g.us");
    } catch (_) {}
    console.error(error.stack || error);
    process.exitCode = 1;
});
