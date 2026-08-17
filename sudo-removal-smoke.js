"use strict";

global.config = { DATABASE_URL: "" };
process.env.OWNER_NUMBER = "254700000000";

const assert = require("assert");
const {
    SudoDB,
    getSudoNumbers,
    setSudo,
    delSudo,
    isSuperUser,
} = require("./kiptenden/database/sudo");

async function main() {
    const legacyNumber = "254799999999";
    const ownerNumber = "254700000000";
    const kiptenden = { user: { id: "254700000001:1@s.whatsapp.net" } };

    await getSudoNumbers();
    await SudoDB.destroy({ where: { number: legacyNumber } });
    assert.strictEqual(await isSuperUser(`${legacyNumber}@s.whatsapp.net`, kiptenden), false);

    const added = await setSudo(legacyNumber, ownerNumber);
    assert.strictEqual(added, true);
    assert.strictEqual(await isSuperUser(`${legacyNumber}@s.whatsapp.net`, kiptenden), true);

    const removed = await delSudo(legacyNumber, ownerNumber);
    assert.strictEqual(removed, true);
    assert.strictEqual((await getSudoNumbers()).includes(legacyNumber), false);
    assert.strictEqual(await isSuperUser(`${legacyNumber}@s.whatsapp.net`, kiptenden), false);

    console.log("SUDO REMOVAL SMOKE PASS");
    process.exit(0);
}

main().catch(async (error) => {
    try {
        await getSudoNumbers();
        await SudoDB.destroy({ where: { number: "254799999999" } });
    } catch (_) {}
    console.error(error.stack || error);
    process.exitCode = 1;
});
