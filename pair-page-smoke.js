"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const page = fs.readFileSync(path.join(root, "kiptenden", "pair.html"), "utf8");
const server = fs.readFileSync(path.join(root, "index.js"), "utf8");
const pairing = require(path.join(root, "kiptenden", "pairing.js"));

assert.match(page, /Kiptenden Youths Pair \| Pair Code \+ QR Login/);
assert.match(page, /KIPTENDEN YOUTHS/);
assert.match(page, /\/api\/pair/);
assert.match(page, /\/api\/pair\/status/);
assert.match(page, /\/api\/pair\/cancel/);
assert.match(page, /\/api\/pair\/qr/);
assert.match(page, /\/pair\/qr/);
assert.match(page, /Get Pair Code/);
assert.match(page, /Generate QR Code/);
assert.match(page, /qrImage/);
assert.match(page, /window\.location\.pathname === '\/pair\/qr'/);
assert.match(page, /Link with phone number instead/);
assert.match(page, /SESSION_ID/);
assert.match(server, /express\.static\(path\.join\(__dirname, "kiptenden"\)\)/);
assert.match(server, /app\.get\("\/pair"/);
assert.match(server, /app\.get\("\/pair\/qr"/);
assert.match(server, /app\.post\("\/api\/pair\/qr"/);
assert.match(server, /path\.join\(__dirname, "kiptenden", "pair\.html"\)/);
assert.strictEqual(typeof pairing.startPairing, "function");
assert.strictEqual(typeof pairing.startQrPairing, "function");
assert.strictEqual(typeof pairing.getStatus, "function");
assert.strictEqual(typeof pairing.cancelPairing, "function");

console.log("PAIR PAGE SMOKE PASS");
process.exit(0);
