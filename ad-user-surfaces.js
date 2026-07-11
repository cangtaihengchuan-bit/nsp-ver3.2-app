/* User-facing ad surfaces. Ads remain separate from personal and shared discount notes. */
(function () {
  const A = window.KaimonoAds;
  if (!A || !["app.html", "shopping.html"].some((name) => location.pathname.endsWith(name))) return;
  const PAGE = location.pathname.endsWith("shopping.html") ? "shopping" : "discount";
  const HIDE_KEY = "kaimono-clock-hidden-store-ads";
  const USER_ID = A.session()?.user?.id || "guest";
  const hidden = new Set(JSON.parse(localStorage.getItem(`${HIDE_KEY}:${USER_ID}`) || "[]"));
  let currentPosition = null;

  const css = document.createElement("style");
  css.textContent = `
    .store-ad-module{display:grid;gap:10px;margin-top:16px;padding:14px;border:1px solid var(--line,#314356);border-radius:8px;background:color-mix(in srgb,var(--paper,#111b26) 88%,transparent);max-width:100%;min-width:0}
    .store-ad-header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.store-ad-header h2{margin:0;font-size:1.05rem}.store-ad-header p{margin:2px 0 0;color:var(--muted,#9fb0bd);font-size:.84rem;line-height:1.5}.store-ad-location{min-height:36px;border:1px solid var(--line,#314356);border-radius:7px;padding:0 10px;color:var(--ink,#e6eef3);background:transparent;font:inherit;font-weight:850;cursor:pointer;white-space:nowrap}.store-ad-list{display:grid;gap:9px}.store-ad-card{display:grid;gap:9px;padding:12px;border:1px solid var(--line,#314356);border-radius:8px;background:color-mix(in srgb,var(--paper,#111b26) 75%,transparent);min-width:0}.store-ad-tag{display:inline-flex;width:max-content;padding:3px 7px;border-radius:999px;color:#052a27;background:#73d7c9;font-size:.72rem;font-weight:900}.store-ad-card h3,.store-ad-card p{margin:0;overflow-wrap:anywhere}.store-ad-meta{color:var(--muted,#9fb0bd);font-size:.84rem}.store-ad-price{color:var(--mint,#38d3c5);font-size:1.15rem;font-weight:950}.store-ad-actions{display:flex;flex-wrap:wrap;gap:7px}.store-ad-actions button{min-height:36px;border:1px solid var(--line,#314356);border-radius:7px;padding:0 9px;color:var(--ink,#e6eef3);background:transparent;font:inherit;font-weight:850;cursor:pointer}.store-ad-actions button.primary{border-color:transparent;color:#06201e;background:#73d7c9}.store-ad-detail{padding-top:8px;border-top:1px solid var(--line,#314356);color:var(--muted,#9fb0bd);font-size:.85rem}.store-ad-empty{padding:10px;color:var(--muted,#9fb0bd);font-size:.88rem}.store-ad-feedback{margin:0;color:var(--mint,#38d3c5);font-size:.86rem;font-weight:850}@media(max-width:480px){.store-ad-header{align-items:stretch;flex-direction:column}.store-ad-location{width:100%}}`;
  document.head.append(css);

  function target() {
    return PAGE === "shopping" ? document.querySelector("#discountCandidates")?.parentElement : document.querySelector("#discountOverview") || document.querySelector("#notes")?.parentElement;
  }
  function distanceKm(a, b, c, d) {
    const rad = (value) => value * Math.PI / 180;
    const x = rad(c - a), y = rad(d - b);
    const q = Math.sin(x / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(y / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
  }
  function canShow(campaign) {
    if (!A.activeNow(campaign) || hidden.has(campaign.id)) return false;
    if (!currentPosition) return false;
    if (campaign.branch_latitude == null || campaign.branch_longitude == null) return false;
    return distanceKm(currentPosition.latitude, currentPosition.longitude, Number(campaign.branch_latitude), Number(campaign.branch_longitude)) <= Number(campaign.delivery_radius_km || 0);
  }
  function mapUrl(campaign) {
    return campaign.branch_map_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${campaign.store_name || "店舗"} ${campaign.branch_name || ""}`)}`;
  }
  function setFeedback(module, message) { module.querySelector(".store-ad-feedback").textContent = message; }
  function card(campaign) {
    const regular = campaign.regular_price ? `<s>${A.yen(campaign.regular_price)}</s>` : "";
    return `<article class="store-ad-card" data-campaign-id="${campaign.id}"><span class="store-ad-tag">店舗からのお知らせ · 広告</span><div><h3>${A.escapeHtml(campaign.headline)}</h3><p class="store-ad-meta">${A.escapeHtml(campaign.store_name || "店舗")} ${campaign.branch_name ? ` / ${A.escapeHtml(campaign.branch_name)}` : ""}</p></div><p>${A.escapeHtml(campaign.product_name)}</p><p class="store-ad-price">${campaign.sale_price ? A.yen(campaign.sale_price) : "価格は店舗で確認"} ${regular}</p><p class="store-ad-meta">${A.escapeHtml(campaign.discount_conditions || "条件は詳細をご確認ください")}</p><div class="store-ad-actions"><button class="primary" data-action="add" type="button">買い物メモへ追加</button><button data-action="save" type="button">割引メモへ保存</button><button data-action="map" type="button">地図で開く</button><button data-action="detail" type="button">詳細を見る</button><button data-action="hide" type="button">表示しない</button></div><div class="store-ad-detail" hidden>${A.escapeHtml(campaign.user_notice || "価格・在庫・条件は店舗でご確認ください。")}<br>${campaign.stock_note ? A.escapeHtml(campaign.stock_note) : ""}</div></article>`;
  }
  async function load(module) {
    const list = module.querySelector(".store-ad-list");
    if (!A.session()) { list.innerHTML = `<p class="store-ad-empty">ログインすると、近くの店舗からのお知らせを確認できます。</p>`; return; }
    if (!currentPosition) { list.innerHTML = `<p class="store-ad-empty">現在地を使うと、近くの店舗からのお知らせを確認できます。位置情報は距離の判定だけに使い、広告の計測には保存しません。</p>`; return; }
    list.innerHTML = `<p class="store-ad-empty">広告を読み込んでいます。</p>`;
    try {
      const now = new Date().toISOString();
      const rows = await A.request(`ad_campaigns?select=*&status=in.(approved,scheduled,active)&starts_at=lte.${encodeURIComponent(now)}&ends_at=gte.${encodeURIComponent(now)}&order=starts_at.desc&limit=12`);
      const campaigns = rows.filter(canShow).filter((item) => A.localImpressionAllowed(item.id)).slice(0, 3);
      if (!campaigns.length) { list.innerHTML = `<p class="store-ad-empty">現在地の範囲で配信中の広告はありません。</p>`; return; }
      list.innerHTML = campaigns.map(card).join("");
      campaigns.forEach((campaign) => A.track(campaign.id, "impression"));
      list.querySelectorAll(".store-ad-card").forEach((node) => bindCard(module, node, campaigns.find((campaign) => campaign.id === node.dataset.campaignId)));
    } catch (error) {
      list.innerHTML = `<p class="store-ad-empty">店舗からのお知らせを読み込めませんでした。</p>`;
      A.logError(PAGE, "load_store_ads", error);
    }
  }
  function addToShopping(campaign, module) {
    if (PAGE === "shopping") {
      const title = document.querySelector("#shoppingTitle"), amount = document.querySelector("#shoppingAmount"), category = document.querySelector("#shoppingCategory"), form = document.querySelector("#shoppingForm");
      if (title && amount && form) { title.value = campaign.product_name; amount.value = campaign.sale_price || ""; if (category) category.value = campaign.category || "other"; form.requestSubmit(); }
    } else {
      const key = "monthMateShoppingItems"; let items = [];
      try { items = JSON.parse(localStorage.getItem(key) || "[]"); } catch { items = []; }
      items.push({ id:`ad-${campaign.id}-${Date.now()}`, title:campaign.product_name, amount:Number(campaign.sale_price || 0), category:campaign.category || "other", checked:false, storeName:campaign.store_name, storeLabel:campaign.store_name, createdAt:new Date().toISOString(), source:"store_ad" });
      localStorage.setItem(key, JSON.stringify(items));
    }
    A.track(campaign.id, "add_to_shopping"); setFeedback(module, `${campaign.product_name}を買い物メモへ追加しました。`);
  }
  async function saveDiscount(campaign, module) {
    if (!A.session()) return;
    try {
      await A.request("nsp_user_discounts", { method:"POST", body:JSON.stringify({ user_id:A.session().user.id, store_id:`ad:${campaign.id}`, store_name:campaign.store_name || "店舗", store_label:campaign.store_name || "店舗", origin_label:"広告", store_type:"store_ad", item_name:campaign.product_name, price:Number(campaign.sale_price || campaign.regular_price || 0), sale_mode:"once", sale_date:new Date(campaign.ends_at).toISOString().slice(0,10), note:`店舗からのお知らせ: ${campaign.headline}`, shared_enabled:false }) });
      A.track(campaign.id,"save_discount"); setFeedback(module,"割引メモへ保存しました。割引メモで確認できます。");
    } catch (error) { setFeedback(module,"割引メモへ保存できませんでした。"); A.logError(PAGE,"save_store_ad",error); }
  }
  function bindCard(module, node, campaign) {
    node.querySelector('[data-action="add"]').onclick = () => addToShopping(campaign, module);
    node.querySelector('[data-action="save"]').onclick = () => saveDiscount(campaign, module);
    node.querySelector('[data-action="map"]').onclick = () => { A.track(campaign.id,"map_open"); window.open(mapUrl(campaign),"_blank","noopener"); };
    node.querySelector('[data-action="detail"]').onclick = () => { const detail=node.querySelector(".store-ad-detail"); detail.hidden=!detail.hidden; A.track(campaign.id,"detail_view"); };
    node.querySelector('[data-action="hide"]').onclick = () => { hidden.add(campaign.id); localStorage.setItem(`${HIDE_KEY}:${USER_ID}`,JSON.stringify([...hidden])); A.track(campaign.id,"hide"); node.remove(); setFeedback(module,"この広告を表示しない設定にしました。"); };
  }
  function init() {
    const parent = target(); if (!parent) return;
    const module = document.createElement("section"); module.className = "store-ad-module"; module.setAttribute("aria-label","店舗からのお知らせ");
    module.innerHTML = `<div class="store-ad-header"><div><span class="store-ad-tag">店舗からのお知らせ · 広告</span><h2>近くの店舗からのお知らせ</h2><p>共有された割引情報や自分の割引メモとは別に表示されます。</p></div><button class="store-ad-location" type="button">現在地を使う</button></div><p class="store-ad-feedback" aria-live="polite"></p><div class="store-ad-list"></div>`;
    parent.append(module); load(module);
    module.querySelector(".store-ad-location").onclick = () => {
      if (!navigator.geolocation) { setFeedback(module,"この端末では現在地を使えません。"); return; }
      setFeedback(module,"現在地から距離を確認しています。");
      navigator.geolocation.getCurrentPosition((position) => { currentPosition={latitude:position.coords.latitude,longitude:position.coords.longitude}; setFeedback(module,"近くの店舗からのお知らせを表示します。"); load(module); }, () => setFeedback(module,"現在地を使えないため、広告を表示できません。"), { enableHighAccuracy:false, timeout:8000, maximumAge:300000 });
    };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
