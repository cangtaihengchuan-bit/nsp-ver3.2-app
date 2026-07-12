const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { transformAndroidHtml } = require("../scripts/android-html-transform.cjs");

const root = path.resolve(__dirname, "..");
const htmlFiles = ["index.html", "app.html", "shopping.html", "household.html", "store.html", "debug.html"];

for (const fileName of htmlFiles) {
  const source = fs.readFileSync(path.join(root, fileName), "utf8").replace(/\r\n/g, "\n");
  assert.equal(source.includes("android-local-mode.js"), false, `${fileName} must remain web-only source`);
  const transformed = transformAndroidHtml(fileName, source);
  assert.match(transformed, /<script src="android-local-mode\.js"><\/script>/);
  assert.match(transformed, /<script src="android-bridge\.js"><\/script>/);
  const inlineScripts = [...transformed.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  inlineScripts.forEach((script, index) => {
    assert.doesNotThrow(() => new vm.Script(script), `${fileName} inline script ${index + 1} must parse`);
  });
}

const transformedApp = transformAndroidHtml(
  "app.html",
  fs.readFileSync(path.join(root, "app.html"), "utf8").replace(/\r\n/g, "\n")
);
assert.match(transformedApp, /割引情報をこの端末に保存しました/);
assert.match(transformedApp, /state\.user = \{ id: window\.KaimonoAndroidStorage\.localUserId/);
assert.match(transformedApp, /if \(window\.KaimonoAndroidStorage\?\.isLocal\(\)\) \{ return true; \}/);

class StorageMock {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function loadRuntime(initialStorage, fetchImpl) {
  const localStorage = new StorageMock(initialStorage);
  const window = {
    Capacitor: { isNativePlatform: () => true },
    fetch: fetchImpl,
    localStorage
  };
  const context = vm.createContext({
    window,
    localStorage,
    document: { addEventListener() {} },
    Response,
    URL,
    Promise,
    JSON,
    Object,
    Array,
    Set,
    Map,
    Number,
    String,
    Boolean,
    Date,
    Math,
    console
  });
  const source = fs.readFileSync(path.join(root, "scripts", "android-local-mode.js"), "utf8");
  vm.runInContext(source, context);
  return { storage: window.KaimonoAndroidStorage, localStorage };
}

const oldSession = JSON.stringify({ access_token: "old", user: { id: "old-user" } });
const localRuntime = loadRuntime({
  "kaimono-clock-session-v2": oldSession,
  "monthMateShoppingItems:guest": JSON.stringify([{ id: "item-1" }])
}, async () => new Response(null, { status: 200 }));
assert.equal(localRuntime.storage.mode(), "local");
assert.equal(localRuntime.localStorage.getItem("kaimono-clock-session-v2"), null);
assert.equal(localRuntime.storage.countLocalItems(), 1);

const requests = [];
const cloudSession = JSON.stringify({ access_token: "token", user: { id: "user-1" } });
const cloudRuntime = loadRuntime({
  "kaimono-clock-android-storage-mode-v1": "cloud",
  "kaimono-clock-session-v2": cloudSession,
  "monthMateShoppingItems:guest": JSON.stringify([{ id: "shop-1", title: "牛乳", amount: 220, category: "food", checked: false }]),
  "monthMateExpenses:guest": JSON.stringify([{ id: "expense-1", date: "2026-07-12", category: "food", title: "昼食", amount: 500 }]),
  "kaimono-clock-discount-cache-v2:android-local-user": JSON.stringify({
    "sample-supermarket-1": [{ id: "discount-1", storeName: "駅前サンプルスーパー", storeLabel: "近所", storeType: "supermarket", name: "牛乳", price: 198, saleMode: "once", saleDate: "2026-07-12", shareEnabled: true }]
  })
}, async (url, options = {}) => {
  requests.push({ url, options });
  return new Response(null, { status: 204 });
});

(async () => {
  const uploaded = await cloudRuntime.storage.uploadLocalData();
  assert.equal(uploaded, 3);
  assert.equal(requests.length, 3);
  const allRows = requests.flatMap((request) => JSON.parse(request.options.body));
  assert.equal(allRows.every((row) => row.user_id === "user-1"), true);
  const discount = allRows.find((row) => row.id === "discount-1");
  assert.equal(discount.shared_enabled, false, "local discounts must never be uploaded as shared by default");
  console.log("android local-first tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
