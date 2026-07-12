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
assert.doesNotMatch(transformedApp, /サンプルで試す/);
assert.match(transformedApp, /class="android-location-switch"/);
assert.match(transformedApp, /aria-label="店舗の検索方法"/);
assert.match(transformedApp, /id="currentLocationSearchBtn"/);
assert.match(transformedApp, /currentLocationSearchBtn\.addEventListener\("click"/);
assert.match(transformedApp, /elements\.locateBtn\.addEventListener\("click", \(\) => \{\s+setLocationSearchMode\("current"\);\s+\}\);/);
assert.match(transformedApp, /\.native-local-mode #authPanel \{ display:grid!important; \}/);
assert.match(transformedApp, /class="android-page-icon" src="\.\/android-icon-discount\.svg"/);

const transformedIndex = transformAndroidHtml(
  "index.html",
  fs.readFileSync(path.join(root, "index.html"), "utf8").replace(/\r\n/g, "\n")
);
assert.doesNotMatch(transformedIndex, /ログインせずに体験|サンプルで試す|<small>買う前<\/small>|<small>買った後<\/small>/);
assert.match(transformedIndex, /<summary>テーマ変更<\/summary>/);
assert.match(transformedIndex, /class="android-home-visual"/);
assert.match(transformedIndex, /android-home-illustration\.svg/);
assert.match(transformedIndex, /<nav class="actions android-home-nav"/);
assert.match(transformedIndex, /android-icon-shopping\.svg/);
assert.match(transformedIndex, /android-icon-discount\.svg/);
assert.match(transformedIndex, /android-icon-household\.svg/);
assert.match(transformedIndex, /body \{ min-height:100dvh;[^}]*padding-bottom:0!important;/);
assert.match(transformedIndex, /html\.native-local-mode body,html\.native-cloud-mode body \{ padding-bottom:0!important; \}/);
assert.equal((transformedIndex.match(/class="actions android-home-nav"/g) || []).length, 1);

const transformedShopping = transformAndroidHtml(
  "shopping.html",
  fs.readFileSync(path.join(root, "shopping.html"), "utf8").replace(/\r\n/g, "\n")
);
assert.match(transformedShopping, /class="android-page-icon" src="\.\/android-icon-shopping\.svg"/);

const transformedHousehold = transformAndroidHtml(
  "household.html",
  fs.readFileSync(path.join(root, "household.html"), "utf8").replace(/\r\n/g, "\n")
);
assert.match(transformedHousehold, /class="android-page-icon" src="\.\/android-icon-household\.svg"/);
assert.match(transformedHousehold, /#menuToggle \{ position:fixed!important;top:8px;left:12px;margin:0; \}/);
assert.match(transformedHousehold, /\.app-shell \{ padding-top:64px; \}/);

const androidRuntimeSource = fs.readFileSync(path.join(root, "scripts", "android-local-mode.js"), "utf8");
assert.equal(androidRuntimeSource.includes(":has("), false, "Android runtime must avoid expensive :has() selectors");
assert.match(androidRuntimeSource, /localStorage\.setItem\(THEME_KEY, "white-blue"\)/);
assert.doesNotMatch(androidRuntimeSource, /\.native-local-mode #authPanel,/);
assert.match(androidRuntimeSource, /hasNewShareControl/);
assert.doesNotMatch(androidRuntimeSource, /new MutationObserver\(updateNativeUi\).*observe\(document\.body/s);

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
  vm.runInContext(androidRuntimeSource, context);
  return { storage: window.KaimonoAndroidStorage, localStorage, window };
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
  const blockedResponse = await localRuntime.window.fetch("https://wnxphjricowzxbkwnmjx.supabase.co/rest/v1/nsp_household_records");
  assert.equal(blockedResponse.status, 503, "Supabase requests must be blocked in local mode");
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
