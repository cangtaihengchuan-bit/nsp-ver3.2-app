/* User-facing ad surfaces. Ads remain separate from personal and shared discount notes. */
(function () {
  const A = window.KaimonoAds;
  if (!A || !["app.html", "shopping.html"].some((name) => location.pathname.endsWith(name))) return;

  const PAGE = location.pathname.endsWith("shopping.html") ? "shopping" : "discount";
  const HIDE_KEY = "kaimono-clock-hidden-store-ads";
  const DEMO_CAMPAIGNS_KEY = "kaimono-clock-demo-campaigns-v1";
  const SAMPLE_STORE_ID = "sample-supermarket-1";
  let userId = A.session()?.user?.id || "guest";
  let hidden = loadHidden();

  const css = document.createElement("style");
  css.textContent = `
    .store-ad-module{display:grid;gap:10px;margin-top:16px;padding:14px;border:1px solid var(--line,#314356);border-radius:8px;background:color-mix(in srgb,var(--paper,#111b26) 88%,transparent);max-width:100%;min-width:0}
    .store-ad-header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
    .store-ad-header h2{margin:0;font-size:1.05rem}
    .store-ad-header p{margin:2px 0 0;color:var(--muted,#9fb0bd);font-size:.84rem;line-height:1.5}
    .store-ad-list{display:grid;gap:9px}
    .store-ad-card{display:grid;gap:9px;padding:12px;border:1px solid var(--line,#314356);border-radius:8px;background:color-mix(in srgb,var(--paper,#111b26) 75%,transparent);min-width:0}
    .store-ad-tag{display:inline-flex;width:max-content;max-width:100%;padding:3px 7px;border-radius:999px;color:#052a27;background:#73d7c9;font-size:.72rem;font-weight:900;overflow-wrap:anywhere}
    .store-ad-card h3,.store-ad-card p{margin:0;overflow-wrap:anywhere}
    .store-ad-meta{color:var(--muted,#9fb0bd);font-size:.84rem}
    .store-ad-price{color:var(--mint,#38d3c5);font-size:1.15rem;font-weight:950}
    .store-ad-actions{display:flex;flex-wrap:wrap;gap:7px}
    .store-ad-actions button{min-height:36px;border:1px solid var(--line,#314356);border-radius:7px;padding:0 9px;color:var(--ink,#e6eef3);background:transparent;font:inherit;font-weight:850;cursor:pointer}
    .store-ad-actions button.primary{border-color:transparent;color:#06201e;background:#73d7c9}
    .store-ad-detail{padding-top:8px;border-top:1px solid var(--line,#314356);color:var(--muted,#9fb0bd);font-size:.85rem}
    .store-ad-empty{padding:10px;color:var(--muted,#9fb0bd);font-size:.88rem}
    .store-ad-empty button{margin-top:8px;min-height:36px;border:1px solid var(--line,#314356);border-radius:7px;padding:0 10px;color:var(--ink,#e6eef3);background:transparent;font:inherit;font-weight:850;cursor:pointer}
    .store-ad-feedback{margin:0;color:var(--mint,#38d3c5);font-size:.86rem;font-weight:850}
    @media(max-width:480px){.store-ad-header{align-items:stretch;flex-direction:column}.store-ad-actions button{flex:1 1 140px}}
  `;
  document.head.append(css);

  function target() {
    return PAGE === "shopping"
      ? document.querySelector("#discountCandidates")?.parentElement
      : document.querySelector("#discountOverview") || document.querySelector("#notes")?.parentElement;
  }

  function loadHidden() {
    try {
      return new Set(JSON.parse(localStorage.getItem(`${HIDE_KEY}:${userId}`) || "[]"));
    } catch {
      return new Set();
    }
  }

  function refreshSessionState() {
    userId = A.session()?.user?.id || "guest";
    hidden = loadHidden();
  }

  function mapUrl(campaign) {
    return campaign.branch_map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(campaign.store_name || "店舗")}`;
  }

  function setFeedback(module, message) {
    module.querySelector(".store-ad-feedback").textContent = message;
  }

  function sampleCampaign() {
    const now = new Date();
    const end = new Date(now.getTime() + 14 * 86400000);
    return {
      id: "sample-store-ad",
      user_store_id: SAMPLE_STORE_ID,
      store_name: "駅前サンプルスーパー",
      product_name: "牛乳 1L",
      headline: "駅前サンプルスーパーの牛乳セール",
      regular_price: 248,
      sale_price: 198,
      discount_conditions: "お一人様2点まで",
      starts_at: new Date(now.getTime() - 60000).toISOString(),
      ends_at: end.toISOString(),
      category: "food",
      stock_note: "在庫状況は店舗でご確認ください",
      user_notice: "価格・在庫は変わる場合があります。サンプル確認用のお知らせです。",
      status: "active",
      sample_fallback: true
    };
  }

  function localDemoCampaigns() {
    try {
      return JSON.parse(localStorage.getItem(DEMO_CAMPAIGNS_KEY) || "[]")
        .filter((campaign) => campaign && campaign.user_store_id === SAMPLE_STORE_ID)
        .map((campaign) => ({
          ...campaign,
          id: campaign.id || `demo-${campaign.product_name || campaign.headline || Date.now()}`
        }));
    } catch {
      return [];
    }
  }

  async function hasSampleStoreRegistration() {
    if (!A.session()) return false;
    if (new URLSearchParams(location.search).get("sample") === "1") return true;
    if (document.body?.textContent?.includes("駅前サンプルスーパー")) return true;
    try {
      const rows = await A.request(`nsp_user_discounts?select=id&store_id=eq.${encodeURIComponent(SAMPLE_STORE_ID)}&limit=1`);
      return Boolean(rows?.length);
    } catch {
      return false;
    }
  }

  async function loadRegisteredCampaigns() {
    try {
      return await A.rpc("registered_store_ad_campaigns");
    } catch (error) {
      try {
        return await A.rpc("active_ad_campaigns");
      } catch {
        error.adSchemaMissing = /registered_store_ad_campaigns|active_ad_campaigns|user_store_id|Could not find/i.test(error.message || "");
        throw error;
      }
    }
  }

  async function loadCampaignsForUser() {
    let rows = [];
    try {
      rows = await loadRegisteredCampaigns();
    } catch (error) {
      if (!localDemoCampaigns().length) throw error;
    }
    const merged = [...(rows || [])];
    localDemoCampaigns().forEach((campaign) => {
      if (!merged.some((row) => row.id === campaign.id)) merged.unshift(campaign);
    });
    return merged;
  }

  function card(campaign) {
    const regular = campaign.regular_price ? `<s>${A.yen(campaign.regular_price)}</s>` : "";
    return `
      <article class="store-ad-card" data-campaign-id="${campaign.id}">
        <span class="store-ad-tag">登録店舗のお知らせ · 広告</span>
        <div>
          <h3>${A.escapeHtml(campaign.headline)}</h3>
          <p class="store-ad-meta">${A.escapeHtml(campaign.store_name || "店舗")}</p>
        </div>
        <p>${A.escapeHtml(campaign.product_name)}</p>
        <p class="store-ad-price">${campaign.sale_price ? A.yen(campaign.sale_price) : "価格は店舗で確認"} ${regular}</p>
        <p class="store-ad-meta">${A.escapeHtml(campaign.discount_conditions || "条件は詳細をご確認ください")}</p>
        <div class="store-ad-actions">
          <button class="primary" data-action="add" type="button">買い物メモへ追加</button>
          <button data-action="save" type="button">割引メモへ保存</button>
          <button data-action="map" type="button">地図で開く</button>
          <button data-action="detail" type="button">詳細を見る</button>
          <button data-action="hide" type="button">表示しない</button>
        </div>
        <div class="store-ad-detail" hidden>${A.escapeHtml(campaign.user_notice || "価格・在庫・条件は店舗でご確認ください。")}<br>${campaign.stock_note ? A.escapeHtml(campaign.stock_note) : ""}</div>
      </article>
    `;
  }

  async function load(module) {
    const list = module.querySelector(".store-ad-list");
    if (!A.session()) {
      list.innerHTML = `<p class="store-ad-empty">ログインすると、割引メモに登録済みの店舗からのお知らせを確認できます。</p>`;
      return;
    }
    list.innerHTML = `<p class="store-ad-empty">店舗からのお知らせを読み込んでいます。</p>`;
    try {
      const rows = await loadCampaignsForUser();
      const eligibleCampaigns = (rows || []).filter((campaign) => A.activeNow(campaign) && campaign.user_store_id);
      const campaigns = eligibleCampaigns.filter((campaign) => !hidden.has(campaign.id)).slice(0, 3);
      if (!campaigns.length) {
        if (!eligibleCampaigns.length && await hasSampleStoreRegistration()) {
          const fallback = sampleCampaign();
          if (hidden.has(fallback.id)) {
            list.innerHTML = `<div class="store-ad-empty"><p>非表示にしたサンプルスーパーのお知らせがあります。</p><button type="button" data-action="show-hidden-ads">非表示を解除</button></div>`;
            list.querySelector('[data-action="show-hidden-ads"]').onclick = () => {
              hidden.delete(fallback.id);
              localStorage.setItem(`${HIDE_KEY}:${userId}`, JSON.stringify([...hidden]));
              setFeedback(module, "サンプルスーパーのお知らせを再表示しました。");
              load(module);
            };
            return;
          }
          list.innerHTML = card(fallback);
          bindCard(module, list.querySelector(".store-ad-card"), fallback);
          setFeedback(module, "サンプルスーパーのお知らせを表示しています。");
          return;
        }
        if (eligibleCampaigns.some((campaign) => hidden.has(campaign.id))) {
          list.innerHTML = `<div class="store-ad-empty"><p>非表示にした店舗からのお知らせがあります。</p><button type="button" data-action="show-hidden-ads">非表示を解除</button></div>`;
          list.querySelector('[data-action="show-hidden-ads"]').onclick = () => {
            eligibleCampaigns.forEach((campaign) => hidden.delete(campaign.id));
            localStorage.setItem(`${HIDE_KEY}:${userId}`, JSON.stringify([...hidden]));
            setFeedback(module, "非表示にした店舗からのお知らせを再表示しました。");
            load(module);
          };
          return;
        }
        list.innerHTML = `<p class="store-ad-empty">割引メモに登録済みの店舗から、配信中のお知らせはありません。広告の店舗ID・店舗名・配信期間を確認してください。</p>`;
        return;
      }
      list.innerHTML = campaigns.map(card).join("");
      campaigns.forEach((campaign) => {
        if (A.localImpressionAllowed(campaign.id)) A.track(campaign.id, "impression");
      });
      list.querySelectorAll(".store-ad-card").forEach((node) => {
        bindCard(module, node, campaigns.find((campaign) => campaign.id === node.dataset.campaignId));
      });
    } catch (error) {
      if (await hasSampleStoreRegistration()) {
        const fallback = sampleCampaign();
        if (hidden.has(fallback.id)) {
          list.innerHTML = `<div class="store-ad-empty"><p>非表示にしたサンプルスーパーのお知らせがあります。</p><button type="button" data-action="show-hidden-ads">非表示を解除</button></div>`;
          list.querySelector('[data-action="show-hidden-ads"]').onclick = () => {
            hidden.delete(fallback.id);
            localStorage.setItem(`${HIDE_KEY}:${userId}`, JSON.stringify([...hidden]));
            setFeedback(module, "サンプルスーパーのお知らせを再表示しました。");
            load(module);
          };
          return;
        }
        list.innerHTML = card(fallback);
        bindCard(module, list.querySelector(".store-ad-card"), fallback);
        setFeedback(module, "サンプルスーパーのお知らせを表示しています。");
        A.logError(PAGE, "load_store_ads_fallback", error);
        return;
      }
      list.innerHTML = `<p class="store-ad-empty">${error.adSchemaMissing ? "広告表示用のDB設定が未反映です。管理者側で広告表示パッチSQLを実行してください。" : "店舗からのお知らせを読み込めませんでした。"}</p>`;
      A.logError(PAGE, "load_store_ads", error);
    }
  }

  function addToShopping(campaign, module) {
    if (PAGE === "shopping") {
      const title = document.querySelector("#shoppingTitle");
      const amount = document.querySelector("#shoppingAmount");
      const category = document.querySelector("#shoppingCategory");
      const form = document.querySelector("#shoppingForm");
      if (title && amount && form) {
        title.value = campaign.product_name;
        amount.value = campaign.sale_price || "";
        if (category) category.value = campaign.category || "other";
        form.requestSubmit();
      }
    } else {
      const sessionUserId = A.session()?.user?.id || "";
      const key = sessionUserId ? `monthMateShoppingItems:${sessionUserId}` : "monthMateShoppingItems:guest";
      let items = [];
      try {
        items = JSON.parse(localStorage.getItem(key) || "[]");
      } catch {
        items = [];
      }
      items.push({
        id: `ad-${campaign.id}-${Date.now()}`,
        title: campaign.product_name,
        amount: Number(campaign.sale_price || 0),
        category: campaign.category || "other",
        checked: false,
        storeName: campaign.store_name,
        storeLabel: campaign.store_name,
        createdAt: new Date().toISOString(),
        source: "store_ad"
      });
      localStorage.setItem(key, JSON.stringify(items));
    }
    A.track(campaign.id, "add_to_shopping");
    setFeedback(module, `${campaign.product_name}を買い物メモへ追加しました。`);
  }

  async function saveDiscount(campaign, module) {
    if (!A.session()) return;
    try {
      await A.request("nsp_user_discounts", {
        method: "POST",
        body: JSON.stringify({
          user_id: A.session().user.id,
          store_id: campaign.user_store_id,
          store_name: campaign.store_name || "店舗",
          store_label: campaign.store_name || "店舗",
          origin_label: "広告",
          store_type: "store_ad",
          item_name: campaign.product_name,
          price: Number(campaign.sale_price || campaign.regular_price || 0),
          sale_mode: "once",
          sale_date: new Date(campaign.ends_at).toISOString().slice(0, 10),
          note: `店舗からのお知らせ: ${campaign.headline}`,
          shared_enabled: false
        })
      });
      A.track(campaign.id, "save_discount");
      setFeedback(module, "割引メモへ保存しました。割引メモで確認できます。");
    } catch (error) {
      setFeedback(module, "割引メモへ保存できませんでした。");
      A.logError(PAGE, "save_store_ad", error);
    }
  }

  function bindCard(module, node, campaign) {
    if (!campaign) return;
    node.querySelector('[data-action="add"]').onclick = () => addToShopping(campaign, module);
    node.querySelector('[data-action="save"]').onclick = () => saveDiscount(campaign, module);
    node.querySelector('[data-action="map"]').onclick = () => {
      A.track(campaign.id, "map_open");
      window.open(mapUrl(campaign), "_blank", "noopener");
    };
    node.querySelector('[data-action="detail"]').onclick = () => {
      const detail = node.querySelector(".store-ad-detail");
      detail.hidden = !detail.hidden;
      A.track(campaign.id, "detail_view");
    };
    node.querySelector('[data-action="hide"]').onclick = () => {
      hidden.add(campaign.id);
      localStorage.setItem(`${HIDE_KEY}:${userId}`, JSON.stringify([...hidden]));
      A.track(campaign.id, "hide");
      node.remove();
      setFeedback(module, "この広告を表示しない設定にしました。");
    };
  }

  function init() {
    const parent = target();
    if (!parent) return;
    const module = document.createElement("section");
    module.className = "store-ad-module";
    module.setAttribute("aria-label", "登録店舗からのお知らせ");
    module.innerHTML = `
      <div class="store-ad-header">
        <div>
          <span class="store-ad-tag">登録店舗のお知らせ · 広告</span>
          <h2>登録した店舗からのお知らせ</h2>
          <p>割引メモに同じ店舗IDの登録がある場合だけ表示されます。</p>
        </div>
      </div>
      <p class="store-ad-feedback" aria-live="polite"></p>
      <div class="store-ad-list"></div>
    `;
    parent.append(module);
    load(module);

    window.addEventListener("kaimono-clock-auth-change", () => {
      refreshSessionState();
      setFeedback(module, "");
      load(module);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
