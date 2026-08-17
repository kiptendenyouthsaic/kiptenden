"use strict";

const assert = require("assert");
const pairing = require("./kiptenden/pairing");

async function main() {
    pairing.cancelPairing();
    assert.deepStrictEqual(pairing.getStatus(), {
        status: "idle",
        mode: null,
        code: null,
        qrDataUrl: null,
        sessionId: null,
        error: null,
    });

    await pairing.startPairing("12");
    const invalid = pairing.getStatus();
    assert.strictEqual(invalid.status, "error");
    assert.strictEqual(invalid.mode, "code");
    assert.strictEqual(invalid.qrDataUrl, null);
    assert.strictEqual(invalid.error, "Invalid phone number.");

    pairing.cancelPairing();
    assert.strictEqual(pairing.getStatus().status, "idle");
    assert.strictEqual(pairing.getStatus().mode, null);
    assert.strictEqual(pairing.getStatus().qrDataUrl, null);
    console.log("PAIRING LIFECYCLE SMOKE PASS");
    process.exit(0);
}

main().catch((error) => {
    console.error(error.stack || error);
    process.exit(1);
});
