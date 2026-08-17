const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const settings = fs.readFileSync(path.join(root, "kiptenden", "database", "settings.js"), "utf8");
const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");

assert.match(settings, /process\.env\.OWNER_NUMBER \|\| "254796271291"/);
assert.match(settings, /OWNER_NUMBER: DEFAULT_OWNER_NUMBER/);
assert.match(settings, /ownerRecord && !String\(ownerRecord\.value \|\| ""\)\.replace/);
assert.match(envExample, /^OWNER_NUMBER=254796271291$/m);

const normalized = (process.env.OWNER_NUMBER || "254796271291").replace(/\D/g, "");
assert.strictEqual(normalized, "254796271291");

console.log("OWNER DEFAULT SMOKE PASS");
process.exit(0);
