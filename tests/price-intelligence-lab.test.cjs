const assert = require("node:assert/strict");

global.window = {};
require("../feature-flags.js");
require("../price-intelligence-lab.js");

const flags = window.KaimonoFeatureFlags;
const lab = window.KaimonoPriceLab;

for (const value of Object.values(flags.defaults)) assert.equal(value, false);
assert.equal(flags.isEnabled("price_intelligence_enabled", { price_intelligence_enabled: true }, "production"), false);
assert.equal(flags.isEnabled("price_intelligence_enabled", { price_intelligence_enabled: true }, "staging"), true);
assert.equal(flags.isEnabled("unknown_flag", { unknown_flag: true }, "staging"), false);

const clean = lab.parseText(
  "星空マート 中央店\n2026/07/10 18:42\nあおぞら牛乳 1000ml 238\nこむぎ食パン 6枚 168\nしろたまご 10個 248\n合計 654",
  { store: "星空マート 中央店", observedAt: "2026-07-10T18:42" }
);
assert.equal(clean.observedAt, "2026-07-10T18:42");
assert.deepEqual(clean.rows.map(({ name, quantity, unit, price }) => ({ name, quantity, unit, price })), [
  { name: "あおぞら牛乳", quantity: 1000, unit: "ml", price: 238 },
  { name: "こむぎ食パン", quantity: 6, unit: "piece", price: 168 },
  { name: "しろたまご", quantity: 10, unit: "piece", price: 248 }
]);

const corrected = lab.parseText(
  "あお ぞ ら 牛乳 1OOOml 23B\nこむ ぎ 食 パン 6枚 168\nし ろ た ま ご 10個 248",
  { store: "星空マート 中央店", observedAt: "2026-07-10T18:42" }
);
assert.deepEqual(corrected.rows.map(({ name, quantity, price }) => ({ name, quantity, price })), [
  { name: "あおぞら牛乳", quantity: 1000, price: 238 },
  { name: "こむぎ食パン", quantity: 6, price: 168 },
  { name: "しろたまご", quantity: 10, price: 248 }
]);

const latinName = lab.parseText("OAT BAR 2本 198", { store: "架空商店", observedAt: "2026-07-12T10:00" });
assert.equal(latinName.rows[0].name, "OAT BAR");

const sourceTypes = new Set(lab.fixtures.map((fixture) => fixture.sourceType));
assert.deepEqual([...sourceTypes].sort(), ["flyer", "receipt", "store_manual", "store_social", "user_manual"]);
assert.equal(lab.fixtures.some((fixture) => fixture.id === "receipt-duplicate"), true);
assert.equal(lab.fixtures.some((fixture) => fixture.id === "flyer-expired"), true);
assert.equal(lab.fixtures.some((fixture) => fixture.id === "capacity-variants"), true);

console.log("price intelligence lab tests passed");
