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

function addAndroidIndexShell(html) {
  let output = html;
  output = replaceOnce(
    output,
    `<summary>ログイン・テーマ変更</summary>`,
    `<summary>テーマ変更</summary>`,
    "Android home theme summary",
  );
  output = replaceOnce(
    output,
    `      <h1><span>生活費を見ながら、</span><span>買い物を決める。</span></h1>
      <p>
        一人暮らしの食費・日用品・交通費を、買う前と買った後に確認できます。
        ログインしなくても、まずは買い物メモと割引メモを試せます。
      </p>
      <div class="hero-actions">
        <a class="primary" href="./shopping.html">
          ログインせずに体験
          <span>買い物予定と予算の目安を確認</span>
        </a>
        <a class="secondary-link" href="./app.html?sample=1&amp;v=20260712-7">
          サンプルで試す
          <span>近くの割引メモを見る</span>
        </a>
      </div>
      <section class="flow-strip" aria-label="使い方の流れ">
        <div class="flow-step">
          <small>買う前</small>
          <strong>予定と価格を確認</strong>
          <span>買い物メモで必要なものを整理し、割引メモで価格やセール日を確認します。</span>
        </div>
        <div class="flow-step">
          <small>買った後</small>
          <strong>支出と残り予算を確認</strong>
          <span>家計簿へ支出を登録し、今月の生活費がどのくらい残っているか確認します。</span>
        </div>
      </section>
`,
    "",
    "Android home promotional content",
  );
  output = replaceOnce(
    output,
    `      <div class="actions">
        <a href="./shopping.html">
          買い物メモを開く
          <span>買い物予定が予算内か確認</span>
        </a>
        <a href="./app.html?v=20260712-7">
          割引メモを開く
          <span>価格やセール日を確認</span>
        </a>
        <a href="./household.html">
          家計簿を開く
          <span>生活費と残り予算を確認</span>
        </a>
      </div>`,
    `      <figure class="android-home-visual" aria-label="買い物と生活費を管理するイメージ">
        <img src="./android-home-illustration.svg" alt="" width="360" height="190" />
      </figure>
      <nav class="actions android-home-nav" aria-label="アプリのページ">
        <a href="./shopping.html"><img src="./android-icon-shopping.svg" alt="" width="24" height="24" /><span>買い物メモ</span></a>
        <a href="./app.html?v=20260712-7"><img src="./android-icon-discount.svg" alt="" width="24" height="24" /><span>割引メモ</span></a>
        <a href="./household.html"><img src="./android-icon-household.svg" alt="" width="24" height="24" /><span>家計簿</span></a>
      </nav>`,
    "Android home navigation",
  );
  output = replaceOnce(
    output,
    "</head>",
    `  <style id="android-home-style">
      main > h1,
      main > p,
      .hero-actions,
      .flow-strip,
      #authBox .auth-status,
      #authBox .auth-form,
      #authBox .auth-session { display:none!important; }
      html,body { min-height:100%; }
      body { min-height:100dvh;display:flex;align-items:stretch;padding-bottom:0!important; }
      .native-local-mode body,.native-cloud-mode body { padding-bottom:0!important; }
      main { min-height:100dvh;display:flex;flex:1 0 auto;flex-direction:column;justify-content:center;gap:18px;margin:0 auto; }
      .top-row { align-items:center; }
      #authBox { width:min(240px,100%); }
      #authBox .auth-tools { padding-top:12px; }
      .android-home-visual { width:min(100%,360px);min-height:150px;display:grid;place-items:center;align-self:center;margin:0; }
      .android-home-visual img { width:100%;height:auto;max-height:190px;display:block;object-fit:contain; }
      .android-home-nav { display:grid;grid-template-columns:1fr;gap:12px; }
      .android-home-nav a { min-height:64px;display:flex;align-items:center;justify-content:center;gap:12px;text-align:center;font-size:1.05rem;font-weight:800; }
      .android-home-nav a img { width:24px;height:24px;flex:0 0 24px;filter:none; }
      html[data-theme="cool"] .android-home-nav a img { filter:invert(94%) sepia(7%) saturate(407%) hue-rotate(164deg) brightness(98%) contrast(90%); }
      @media (max-height:700px) { main { justify-content:flex-start; } .android-home-visual { min-height:112px; } .android-home-visual img { max-height:132px; } }
      @media (min-width:700px) { .android-home-nav { grid-template-columns:repeat(3,minmax(0,1fr)); } }
    </style>
</head>`,
    "Android home styles",
  );
  return output;
}

function addAndroidDiscountShell(html) {
  let output = html;
  output = replaceOnce(
    output,
    `          <button id="sampleBtn" class="btn btn-primary" type="button">サンプルで試す</button>
          <p class="location-use-note">近くの店舗を探す場合だけ、現在地を使います。</p>
          <button id="locateBtn" class="btn btn-ghost" type="button">近くの割引を探す</button>
          <button id="savedLocationBtn" class="btn btn-ghost" type="button">登録地点から探す</button>
          <a class="btn btn-ghost" href="./shopping.html">買い物メモを開く</a>
          <a class="btn btn-ghost" href="./household.html">家計簿を開く</a>`,
    `          <p class="location-use-note">店舗を探す方法を選択してください。現在地は検索時だけ使用します。</p>
          <div class="android-location-switch" role="group" aria-label="店舗の検索方法">
            <button id="locateBtn" class="android-location-option is-active" type="button" aria-pressed="true">現在地から</button>
            <button id="savedLocationBtn" class="android-location-option" type="button" aria-pressed="false">登録地点から</button>
          </div>`,
    "Android discount location controls",
  );
  output = replaceOnce(
    output,
    `      elements.locateBtn.addEventListener("click", () => {`,
    `      const setLocationSearchMode = (mode) => {
        const useCurrent = mode === "current";
        elements.locateBtn.classList.toggle("is-active", useCurrent);
        elements.savedLocationBtn.classList.toggle("is-active", !useCurrent);
        elements.locateBtn.setAttribute("aria-pressed", String(useCurrent));
        elements.savedLocationBtn.setAttribute("aria-pressed", String(!useCurrent));
      };

      elements.locateBtn.addEventListener("click", () => {
        setLocationSearchMode("current");`,
    "Android current location selection",
  );
  output = replaceOnce(
    output,
    `      elements.savedLocationBtn.addEventListener("click", () => {
        elements.locationPanel.classList.remove("hidden-panel");`,
    `      elements.savedLocationBtn.addEventListener("click", () => {
        setLocationSearchMode("saved");
        elements.locationPanel.classList.remove("hidden-panel");`,
    "Android saved location selection",
  );
  output = replaceOnce(
    output,
    `      elements.sampleBtn.addEventListener("click", () => { void useSample(); });

`,
    "",
    "Android sample event removal",
  );
  output = replaceOnce(
    output,
    `        if (new URLSearchParams(location.search).get("sample") === "1") {
          void useSample();
        }`,
    `        if (new URLSearchParams(location.search).has("sample")) {
          const cleanUrl = new URL(location.href);
          cleanUrl.searchParams.delete("sample");
          history.replaceState(null, "", cleanUrl);
        }`,
    "Android sample removal",
  );
  output = replaceOnce(
    output,
    "</head>",
    `  <style id="android-discount-style">
      .android-location-switch { display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--surface); }
      .android-location-option { min-width:0;min-height:48px;border:0;border-radius:0;padding:10px 8px;color:var(--muted);background:transparent;font:800 0.92rem/1.2 inherit; }
      .android-location-option + .android-location-option { border-left:1px solid var(--line); }
      .android-location-option.is-active { color:#fff;background:var(--primary); }
      html[data-theme="white-blue"] .android-location-option.is-active { color:#fff;background:#238bc1; }
      .native-local-mode #authPanel { display:grid!important; }
    </style>
</head>`,
    "Android discount styles",
  );
  return output;
}

function addAndroidPageIcon(fileName, html) {
  let output = html;
  if (fileName === "shopping.html") {
    output = replaceOnce(
      output,
      `          <p class="eyebrow">Shopping</p>
          <h1>買い物メモ</h1>`,
      `          <p class="eyebrow">Shopping</p>
          <div class="android-page-title">
            <img class="android-page-icon" src="./android-icon-shopping.svg" alt="" width="40" height="40" />
            <h1>買い物メモ</h1>
          </div>`,
      "Android shopping page icon",
    );
  }
  if (fileName === "app.html") {
    output = replaceOnce(
      output,
      `          <h1>
            <span>近くの価格やセール日を保存して、買い物前に確認。</span>
          </h1>`,
      `          <div class="android-page-title">
            <img class="android-page-icon" src="./android-icon-discount.svg" alt="" width="40" height="40" />
            <h1><span>近くの価格やセール日を保存して、買い物前に確認。</span></h1>
          </div>`,
      "Android discount page icon",
    );
  }
  if (fileName === "household.html") {
    output = replaceOnce(
      output,
      `          <div class="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" role="img">
              <path d="M13 22c0-5 4-9 9-9h21c5 0 9 4 9 9v25c0 5-4 9-9 9H22c-5 0-9-4-9-9V22z" fill="#132238"/>
              <path d="M18 23c0-3 2-5 5-5h20c3 0 5 2 5 5v23c0 3-2 5-5 5H23c-3 0-5-2-5-5V23z" fill="#0f766e"/>
              <path d="M22 27h22v5H22v-5zm0 10h10v10H22V37zm14 0h8v3h-8v-3zm0 7h8v3h-8v-3z" fill="#e7eef6"/>
              <path d="M16 13c3 0 7 2 8 6-5 1-9-1-8-6z" fill="#38bdf8"/>
              <path d="M43 12c-4 1-6 4-5 8 5-1 7-4 5-8z" fill="#818cf8"/>
            </svg>
          </div>`,
      `          <img class="android-page-icon" src="./android-icon-household.svg" alt="" width="40" height="40" />`,
      "Android household page icon",
    );
  }
  output = replaceOnce(
    output,
    "</head>",
    `  <style id="android-page-icon-style">
      .android-page-title { display:flex;align-items:center;gap:12px;min-width:0; }
      .android-page-title h1 { margin:0;min-width:0; }
      .android-page-icon { width:40px;height:40px;display:block;flex:0 0 40px;border:1px solid var(--line);border-radius:8px;padding:8px;background:var(--surface,#fff);object-fit:contain; }
      .brand-block > .android-page-icon { width:48px;height:48px;flex-basis:48px; }
      html[data-theme="cool"] .android-page-icon { filter:invert(94%) sepia(7%) saturate(407%) hue-rotate(164deg) brightness(98%) contrast(90%);background:#f4f8fb; }
    </style>
</head>`,
    `${fileName} Android page icon styles`,
  );
  return output;
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
  if (fileName === "index.html") output = addAndroidIndexShell(output);
  if (fileName === "app.html") {
    output = addAppLocalStorage(output);
    output = addAndroidDiscountShell(output);
  }
  if (fileName === "shopping.html") output = addLocalDiscountAccess(output);
  if (fileName === "household.html") output = addHouseholdLocalDiscountAccess(output);
  if (["shopping.html", "app.html", "household.html"].includes(fileName)) {
    output = addAndroidPageIcon(fileName, output);
  }
  output = replaceOnce(output, "</head>", `${HEAD_TAG}</head>`, `${fileName} head injection`);
  output = replaceOnce(output, "</body>", `${BODY_TAG}</body>`, `${fileName} body injection`);
  return output;
}

module.exports = { transformAndroidHtml };
