(() => {
  "use strict";

  const capacitor = window.Capacitor;
  if (!capacitor?.isNativePlatform?.()) return;

  const MODE_KEY = "kaimono-clock-android-storage-mode-v1";
  const SESSION_KEY = "kaimono-clock-session-v2";
  const LOCAL_USER_ID = "android-local-user";
  const SUPABASE_URL = "https://wnxphjricowzxbkwnmjx.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdWJhc2UiLCJyZWYiOiJ3bnhwaGpyaWNvd3p4Ymt3bm1qeCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzgxOTA5OTgzLCJleHAiOjIwOTc0ODU5ODN9.p6lu6gNpdkTg0Nvnxj05m2tHbYeihYP7jFPdIEWfSxo";
  const LOCAL_SCOPED_KEYS = [
    "monthMateShoppingItems",
    "monthMateRecurringItems",
    "monthMateExpenses",
    "monthMateIncomes",
    "monthMateFixedCosts",
    "monthMateMonthlyBudgets",
    "monthMateCategoryBudgets"
  ];

  const mode = () => localStorage.getItem(MODE_KEY) === "cloud" ? "cloud" : "local";
  const isLocal = () => mode() === "local";
  const isCloud = () => mode() === "cloud";

  if (isLocal()) localStorage.removeItem(SESSION_KEY);

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    if (isLocal() && url.startsWith(SUPABASE_URL)) {
      return Promise.resolve(new Response(JSON.stringify({ message: "Android local mode" }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      }));
    }
    return originalFetch(input, init);
  };

  function session() {
    try {
      const value = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      return value?.access_token && value?.user?.id ? value : null;
    } catch {
      return null;
    }
  }

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch {
      return fallback;
    }
  }

  function localKey(key) {
    return `${key}:guest`;
  }

  function localDiscounts() {
    return readJson(`kaimono-clock-discount-cache-v2:${LOCAL_USER_ID}`, {});
  }

  function localLocations() {
    return readJson(`kaimono-clock-locations-v2:${LOCAL_USER_ID}`, []);
  }

  function countLocalItems() {
    const scopedCount = LOCAL_SCOPED_KEYS.reduce((total, key) => {
      const value = readJson(localKey(key), Array.isArray(readJson(localKey(key), [])) ? [] : {});
      return total + (Array.isArray(value) ? value.length : Object.keys(value || {}).length);
    }, 0);
    const discountCount = Object.values(localDiscounts()).reduce((total, notes) => total + (Array.isArray(notes) ? notes.length : 0), 0);
    return scopedCount + discountCount + localLocations().length;
  }

  function setMode(nextMode) {
    if (nextMode === "cloud") {
      localStorage.setItem(MODE_KEY, "cloud");
    } else {
      localStorage.setItem(MODE_KEY, "local");
      localStorage.removeItem(SESSION_KEY);
    }
    location.reload();
  }

  function normalizeCsvNumbers(value, min, max) {
    return [...new Set(String(value || "").split(/[,、\s]+/)
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item >= min && item <= max))]
      .sort((a, b) => a - b);
  }

  async function request(path, options = {}) {
    const activeSession = session();
    if (!activeSession) throw new Error("先に同期モードでログインしてください。");
    const response = await originalFetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${activeSession.access_token}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || `アップロードに失敗しました (${response.status})`);
    }
  }

  function discountRows(userId) {
    return Object.entries(localDiscounts()).flatMap(([storeId, notes]) => (Array.isArray(notes) ? notes : [])
      .filter((note) => !note.isShared)
      .map((note) => ({
        id: note.id,
        user_id: userId,
        store_id: storeId,
        store_name: note.storeName,
        store_label: note.storeLabel || note.storeName,
        origin_label: note.originLabel || null,
        store_type: note.storeType,
        item_name: note.name,
        price: Number(note.price) || 0,
        sale_mode: note.saleMode || "once",
        sale_date: ["once", "range"].includes(note.saleMode) && note.saleDate ? note.saleDate : null,
        sale_end_date: note.saleMode === "range" && note.saleEndDate ? note.saleEndDate : null,
        sale_weekday: note.saleMode === "weekly" ? normalizeCsvNumbers(note.saleWeekdays || note.saleWeekday, 0, 6)[0] ?? null : null,
        sale_weekdays: note.saleMode === "weekly" ? normalizeCsvNumbers(note.saleWeekdays || note.saleWeekday, 0, 6).join(",") || null : null,
        sale_month_day: note.saleMode === "monthly" ? normalizeCsvNumbers(note.saleMonthDays || note.saleMonthDay, 1, 31)[0] ?? null : null,
        sale_month_days: note.saleMode === "monthly" ? normalizeCsvNumbers(note.saleMonthDays || note.saleMonthDay, 1, 31).join(",") || null : null,
        shared_enabled: false,
        note: note.note || null
      })));
  }

  function uploadGroups(userId) {
    const shopping = readJson(localKey("monthMateShoppingItems"), []);
    const recurring = readJson(localKey("monthMateRecurringItems"), []);
    const expenses = readJson(localKey("monthMateExpenses"), []);
    const incomes = readJson(localKey("monthMateIncomes"), []);
    const fixedCosts = readJson(localKey("monthMateFixedCosts"), []);
    const monthlyBudgets = readJson(localKey("monthMateMonthlyBudgets"), {});
    const categoryBudgets = readJson(localKey("monthMateCategoryBudgets"), {});
    const budgetKeys = new Set([...Object.keys(monthlyBudgets), ...Object.keys(categoryBudgets)]);
    return [
      ["nsp_household_shopping_items", shopping.map((item) => ({
        id: item.id, user_id: userId, title: item.title, amount: item.amount || null,
        category: item.category, store_name: item.storeName || null, store_label: item.storeLabel || null,
        source_discount_id: item.sourceDiscountId || null, checked: Boolean(item.checked)
      }))],
      ["nsp_household_recurring_items", recurring.map((item) => ({
        id: item.id, user_id: userId, title: item.title, frequency_days: item.frequencyDays,
        estimated_amount: item.estimatedAmount || null, last_purchased_date: item.lastPurchasedDate,
        active: item.active !== false
      }))],
      ["nsp_household_records", [
        ...expenses.map((item) => ({ id: item.id, user_id: userId, record_type: "expense", record_date: item.date, category: item.category, title: item.title, amount: item.amount })),
        ...incomes.map((item) => ({ id: item.id, user_id: userId, record_type: "income", record_date: item.date, category: item.category, title: item.title, amount: item.amount }))
      ]],
      ["nsp_household_fixed_costs", fixedCosts.map((item) => ({
        id: item.id, user_id: userId, title: item.title, amount: item.amount, category: item.category, active: item.active !== false
      }))],
      ["nsp_household_budgets?on_conflict=user_id,month_key", [...budgetKeys].map((key) => ({
        user_id: userId, month_key: key, monthly_budget: Number(monthlyBudgets[key]) || 0,
        category_budgets: categoryBudgets[key] || {}
      }))],
      ["nsp_user_discounts", discountRows(userId)],
      ["nsp_user_locations", localLocations().map((item) => ({
        id: item.id, user_id: userId, label: item.name, lat: Number(item.lat), lon: Number(item.lon)
      }))]
    ];
  }

  async function uploadLocalData(onProgress) {
    const activeSession = session();
    if (!activeSession) throw new Error("同期モードでログインしてから実行してください。");
    const groups = uploadGroups(activeSession.user.id);
    let uploaded = 0;
    for (const [path, rows] of groups) {
      if (!rows.length) continue;
      onProgress?.(`${uploaded}件送信済み / ${rows.length}件を処理中`);
      await request(path, {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows)
      });
      uploaded += rows.length;
    }
    return uploaded;
  }

  function updateNativeUi() {
    document.documentElement.classList.toggle("native-local-mode", isLocal());
    document.documentElement.classList.toggle("native-cloud-mode", isCloud());
    const pill = document.querySelector("#androidStorageModeButton");
    if (pill) {
      pill.textContent = isLocal() ? "端末内" : "同期";
      pill.setAttribute("aria-label", isLocal() ? "保存先: この端末" : "保存先: データベース同期");
    }
    if (isLocal()) {
      document.querySelectorAll("#sessionPill, #authUser").forEach((node) => {
        if (node.textContent !== "端末内保存（アカウント不要）") node.textContent = "端末内保存（アカウント不要）";
      });
      document.querySelectorAll("#acceptSharedDiscounts, #shareDiscount, [data-action=\"toggle-share\"]").forEach((control) => {
        const details = control.closest("details");
        if (details && !details.hidden) details.hidden = true;
      });
      const dataManagementCopy = document.querySelector(".data-management .muted");
      if (dataManagementCopy?.textContent !== "この端末に保存した割引メモをまとめて削除します。") {
        dataManagementCopy.textContent = "この端末に保存した割引メモをまとめて削除します。";
      }
    }
  }

  function createModeUi() {
    const style = document.createElement("style");
    style.textContent = `
      .native-local-mode .auth-box,
      .native-local-mode .nav-auth-form,
      .native-local-mode #authPanel,
      .native-local-mode #shoppingLogoutBtn,
      .native-local-mode #householdLogoutBtn,
      .native-local-mode #acceptSharedDiscounts,
      .native-local-mode [aria-label="共有設定"],
      .native-local-mode details:has(#acceptSharedDiscounts),
      .native-local-mode details:has(#shareDiscount),
      .native-local-mode details:has([data-action="toggle-share"]),
      .native-local-mode #storeAdMount,
      .native-local-mode .store-ad-surface { display:none!important; }
      .native-local-mode body,
      .native-cloud-mode body { padding-bottom:calc(env(safe-area-inset-bottom) + 72px)!important; }
      .android-storage-mode-button { position:fixed;right:12px;bottom:calc(env(safe-area-inset-bottom) + 12px);z-index:9998;min-width:72px;min-height:44px;border:1px solid #187a75;border-radius:8px;padding:8px 12px;color:#073936;background:#9ce5dc;font:800 14px/1 "Segoe UI","Yu Gothic UI",sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.18); }
      .native-cloud-mode .android-storage-mode-button { border-color:#286da8;color:#fff;background:#286da8; }
      .android-storage-dialog[hidden] { display:none; }
      .android-storage-dialog { position:fixed;inset:0;z-index:10000;display:grid;place-items:end center;padding:16px;background:rgba(7,20,29,.62); }
      .android-storage-sheet { width:min(560px,100%);max-height:min(720px,90vh);overflow:auto;border:1px solid #b8ccd5;border-radius:8px;padding:18px;color:#172b3a;background:#f8fbfc;box-shadow:0 16px 40px rgba(0,0,0,.3);font:15px/1.55 "Segoe UI","Yu Gothic UI",sans-serif; }
      .android-storage-sheet h2,.android-storage-sheet p { margin:0; }
      .android-storage-sheet h2 { font-size:1.15rem; }
      .android-storage-sheet p { margin-top:8px;color:#526b7d; }
      .android-storage-options { display:grid;gap:8px;margin-top:14px; }
      .android-storage-option { padding:12px;border:1px solid #cbd8df;border-radius:8px;background:#fff; }
      .android-storage-option strong { display:block;color:#17374a; }
      .android-storage-actions { display:flex;flex-wrap:wrap;gap:8px;margin-top:14px; }
      .android-storage-actions button { min-height:42px;border:1px solid #237f79;border-radius:8px;padding:8px 12px;font:800 14px/1.2 inherit; }
      .android-storage-primary { color:#073936;background:#9ce5dc; }
      .android-storage-secondary { color:#17374a;background:#fff; }
      .android-storage-upload { color:#fff;background:#286da8;border-color:#286da8!important; }
      .android-storage-status { min-height:1.5em;margin-top:10px!important;color:#17645f!important;font-weight:700; }
      .android-storage-warning { color:#9a4d24!important; }
      @media (min-width:700px) { .android-storage-dialog { place-items:center; } }
    `;
    document.head.appendChild(style);

    const button = document.createElement("button");
    button.id = "androidStorageModeButton";
    button.className = "android-storage-mode-button";
    button.type = "button";

    const dialog = document.createElement("div");
    dialog.className = "android-storage-dialog";
    dialog.hidden = true;
    dialog.innerHTML = `
      <section class="android-storage-sheet" role="dialog" aria-modal="true" aria-labelledby="androidStorageTitle">
        <h2 id="androidStorageTitle">保存先と同期</h2>
        <p>通常はアカウントなしで、この端末だけに保存します。共有や複数端末での同期が必要な場合だけ同期モードを使います。</p>
        <div class="android-storage-options">
          <div class="android-storage-option"><strong>端末内モード</strong>家計簿・買い物メモ・割引メモをこの端末に保存します。データベース認証・共有・店舗広告は使用しません。</div>
          <div class="android-storage-option"><strong>同期モード</strong>ログイン後、データベース同期・共有情報・登録店舗のお知らせを使用できます。</div>
        </div>
        <p class="android-storage-warning">端末内データは、アプリを削除したり端末のデータを消去した場合に失われます。</p>
        <div class="android-storage-actions">
          <button id="androidSwitchMode" class="android-storage-primary" type="button"></button>
          <button id="androidUploadLocal" class="android-storage-upload" type="button">端末データをアップロード</button>
          <button id="androidCloseMode" class="android-storage-secondary" type="button">閉じる</button>
        </div>
        <p id="androidStorageStatus" class="android-storage-status" aria-live="polite"></p>
      </section>`;
    document.body.append(button, dialog);

    const switchButton = dialog.querySelector("#androidSwitchMode");
    const uploadButton = dialog.querySelector("#androidUploadLocal");
    const closeButton = dialog.querySelector("#androidCloseMode");
    const status = dialog.querySelector("#androidStorageStatus");

    const refreshDialog = () => {
      const activeSession = session();
      switchButton.textContent = isLocal() ? "同期モードへ切り替え" : "端末内モードへ切り替え";
      uploadButton.hidden = isLocal() || !activeSession || countLocalItems() === 0;
      status.textContent = isCloud() && !activeSession
        ? "同期するには各ページのログイン欄からログインしてください。"
        : (isLocal() ? `端末内データ: ${countLocalItems()}件` : "ログイン中。必要な場合だけ端末データをアップロードしてください。");
    };
    const close = () => { dialog.hidden = true; button.focus(); };
    button.addEventListener("click", () => { refreshDialog(); dialog.hidden = false; closeButton.focus(); });
    closeButton.addEventListener("click", close);
    dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
    switchButton.addEventListener("click", () => {
      const next = isLocal() ? "cloud" : "local";
      const message = next === "cloud"
        ? "同期モードへ切り替えます。データベース通信はログイン後に始まります。端末内データは自動送信されません。"
        : "端末内モードへ切り替えます。このアプリのログイン状態は解除されますが、クラウド上のデータは削除されません。";
      if (confirm(message)) setMode(next);
    });
    uploadButton.addEventListener("click", async () => {
      if (!confirm("この端末のデータをログイン中のアカウントへ追記します。端末内データは削除されません。実行しますか？")) return;
      uploadButton.disabled = true;
      try {
        status.textContent = "アップロードを開始しています。";
        const count = await uploadLocalData((message) => { status.textContent = message; });
        status.textContent = `${count}件をアップロードしました。ページを再読み込みします。`;
        setTimeout(() => location.reload(), 900);
      } catch (error) {
        status.textContent = `アップロードできませんでした: ${error.message || "通信状態を確認してください"}`;
      } finally {
        uploadButton.disabled = false;
      }
    });
    window.addEventListener("kaimono-clock-auth-change", refreshDialog);
    const cloudControlObserver = new MutationObserver(updateNativeUi);
    cloudControlObserver.observe(document.body, { childList: true, subtree: true });
    updateNativeUi();
  }

  window.KaimonoAndroidStorage = Object.freeze({
    localUserId: LOCAL_USER_ID,
    mode,
    isLocal,
    isCloud,
    setMode,
    countLocalItems,
    uploadLocalData
  });

  document.addEventListener("DOMContentLoaded", () => {
    createModeUi();
    const observer = new MutationObserver(updateNativeUi);
    document.querySelectorAll("#sessionPill, #authUser").forEach((node) => observer.observe(node, { childList: true }));
  });
})();
