const HEAD_TAG = '  <script src="android-local-mode.js"></script>\n';
const BODY_TAG = '  <script src="android-bridge.js"></script>\n';

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Android transform target not found: ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Android transform target is ambiguous: ${label}`);
  }
  return source.replace(search, replacement);
}

function addLocalDiscountAccess(html) {
  const search = `function loadDiscountCache() {
        const userId = currentUserId();`;
  const replacement = `function loadDiscountCache() {
        const userId = window.KaimonoAndroidStorage?.isLocal()
          ? window.KaimonoAndroidStorage.localUserId
          : currentUserId();`;
  return replaceOnce(html, search, replacement, "shopping local discount cache");
}

function addHouseholdLocalDiscountAccess(html) {
  const search = `function loadDiscountCache() {
  const userId = currentUserId();`;
  const replacement = `function loadDiscountCache() {
  const userId = window.KaimonoAndroidStorage?.isLocal()
    ? window.KaimonoAndroidStorage.localUserId
    : currentUserId();`;
  return replaceOnce(html, search, replacement, "household local discount cache");
}

function addAppLocalStorage(html) {
  let output = html;
  output = replaceOnce(
    output,
    `function hasSession() {
        return Boolean(state.session?.access_token && state.user?.id);
      }`,
    `function hasSession() {
        return window.KaimonoAndroidStorage?.isLocal()
          || Boolean(state.session?.access_token && state.user?.id);
      }`,
    "discount local session",
  );
  output = replaceOnce(
    output,
    `function restoreSession() {
        try {`,
    `function restoreSession() {
        if (window.KaimonoAndroidStorage?.isLocal()) {
          state.session = null;
          state.user = { id: window.KaimonoAndroidStorage.localUserId, email: "" };
          loadAcceptSharedPreference();
          renderAuth();
          return;
        }
        try {`,
    "discount local identity",
  );
  output = replaceOnce(
    output,
    `function renderAuth() {
        elements.authPanel.classList.toggle("signed-in", hasSession());
        elements.authUser.textContent = hasSession() ? \`ログイン中: \${maskEmail(state.user.email)}\` : "未ログイン";`,
    `function renderAuth() {
        const isLocal = window.KaimonoAndroidStorage?.isLocal();
        elements.authPanel.classList.toggle("signed-in", hasSession());
        elements.authUser.textContent = isLocal
          ? "端末内保存（アカウント不要）"
          : (hasSession() ? \`ログイン中: \${maskEmail(state.user.email)}\` : "未ログイン");`,
    "discount local auth label",
  );
  output = replaceOnce(
    output,
    `async function loadNotesFromSupabase() {
        if (!hasSession()) {`,
    `async function loadNotesFromSupabase() {
        if (window.KaimonoAndroidStorage?.isLocal()) {
          try {
            state.notes = JSON.parse(localStorage.getItem(discountCacheKey()) || "{}");
          } catch {
            state.notes = {};
          }
          state.hiddenSharedDiscountIds = new Set();
          state.acceptSharedDiscounts = false;
          setStatus("ready", "この端末に保存した割引情報を表示しています。");
          return;
        }
        if (!hasSession()) {`,
    "discount local load",
  );
  output = replaceOnce(
    output,
    `async function loadLocationsFromSupabase() {
        if (!hasSession()) {`,
    `async function loadLocationsFromSupabase() {
        if (window.KaimonoAndroidStorage?.isLocal()) {
          state.savedLocations = loadSavedLocations();
          return;
        }
        if (!hasSession()) {`,
    "location local load",
  );

  const localNoopFunctions = [
    ["insertNoteToSupabase(storeId, note)", "return true;"],
    ["deleteNoteFromSupabase(noteId)", "return;"],
    ["loadHiddenSharedDiscounts()", "state.hiddenSharedDiscountIds = new Set(); return;"],
    ["hideSharedDiscount(noteId)", "return;"],
    ["updateStoreLabelInSupabase(storeId, storeLabel)", "return;"],
    ["updateNoteShareInSupabase(noteId, shareEnabled)", "return;"],
    ["clearNotesFromSupabase()", "return;"],
    ["insertLocationToSupabase(location)", "return;"],
    ["deleteLocationFromSupabase(locationId)", "return;"]
  ];
  for (const [signature, action] of localNoopFunctions) {
    output = replaceOnce(
      output,
      `async function ${signature} {`,
      `async function ${signature} {
        if (window.KaimonoAndroidStorage?.isLocal()) { ${action} }`,
      `local guard ${signature}`,
    );
  }

  output = replaceOnce(
    output,
    `async function initializeApp() {
        setupSmartAuthPanel();
        restoreSession();
        if (hasSession()) {`,
    `async function initializeApp() {
        setupSmartAuthPanel();
        restoreSession();
        if (window.KaimonoAndroidStorage?.isLocal()) {
          await loadNotesFromSupabase();
          await loadLocationsFromSupabase();
        } else if (hasSession()) {`,
    "discount local initialization",
  );

  output = output.replace(
    `await loadNotesFromSupabase();
        await migrateLocalBackupIfEmpty();`,
    `await loadNotesFromSupabase();
        await migrateLocalBackupIfEmpty();`,
  );
  output = output.replace(
    `const labelsPersisted = await insertNoteToSupabase(store.id, newNote);`,
    `const labelsPersisted = await insertNoteToSupabase(store.id, newNote);`,
  );
  output = replaceOnce(
    output,
    `labelsPersisted
              ? "Supabaseへ割引情報を保存しました。"`,
    `labelsPersisted
              ? (window.KaimonoAndroidStorage?.isLocal()
                ? "割引情報をこの端末に保存しました。"
                : "Supabaseへ割引情報を保存しました。")`,
    "discount local save message",
  );
  output = replaceOnce(
    output,
    `setStatus("ready", \`\${name}を登録しました。別端末でも同じアカウントで表示されます。\`);`,
    `setStatus("ready", window.KaimonoAndroidStorage?.isLocal()
            ? \`\${name}をこの端末に登録しました。\`
            : \`\${name}を登録しました。別端末でも同じアカウントで表示されます。\`);`,
    "location local save message",
  );
  output = replaceOnce(
    output,
    `setStatus("ready", "Supabase上の保存済み割引を全削除しました。");`,
    `setStatus("ready", window.KaimonoAndroidStorage?.isLocal()
            ? "この端末の保存済み割引を全削除しました。"
            : "Supabase上の保存済み割引を全削除しました。");`,
    "discount local clear message",
  );
  return output;
}

function transformAndroidHtml(fileName, html) {
  let output = html;
  if (fileName === "app.html") output = addAppLocalStorage(output);
  if (fileName === "shopping.html") output = addLocalDiscountAccess(output);
  if (fileName === "household.html") output = addHouseholdLocalDiscountAccess(output);
  output = replaceOnce(output, "</head>", `${HEAD_TAG}</head>`, `${fileName} head injection`);
  output = replaceOnce(output, "</body>", `${BODY_TAG}</body>`, `${fileName} body injection`);
  return output;
}

module.exports = { transformAndroidHtml };
