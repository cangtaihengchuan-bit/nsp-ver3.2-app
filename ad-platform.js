/* Shared, browser-safe helpers for the ver3.2 ad platform. No service_role key is used here. */
(function () {
  const SUPABASE_URL = "https://wnxphjricowzxbkwnmjx.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndueHBoanJpY293enhia3dubWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MDk5ODMsImV4cCI6MjA5NzQ4NTk4M30.p6lu6gNpdkTg0Nvnxj05m2tHbYeihYP7jFPdIEWfSxo";
  const SESSION_KEY = "kaimono-clock-session-v2";
  const MODE_KEY = "kaimono-clock-special-mode";
  const VERSION = "3.2.0";

  function exitSpecialMode() {
    localStorage.removeItem(MODE_KEY);
    location.replace("./index.html");
  }

  function session() {
    try {
      const value = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      return value?.access_token && value?.user ? value : null;
    } catch { return null; }
  }

  async function request(path, options = {}) {
    const activeSession = session();
    const headers = {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      ...(activeSession ? { Authorization: `Bearer ${activeSession.access_token}` } : {}),
      ...(options.headers || {})
    };
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...options, headers });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `Supabase request failed: ${response.status}`);
    }
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async function rpc(name, args = {}) {
    const activeSession = session();
    if (!activeSession) throw new Error("ログインが必要です。");
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${activeSession.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args)
    });
    if (!response.ok) throw new Error((await response.text()) || `RPC failed: ${response.status}`);
    return response.status === 204 ? null : response.json();
  }

  async function role() {
    const demoRole = localStorage.getItem(MODE_KEY);
    if (demoRole === "developer" || demoRole === "store") return demoRole;
    if (!session()) return "user";
    const rows = await request(`app_roles?select=role&user_id=eq.${encodeURIComponent(session().user.id)}&limit=1`);
    return rows?.[0]?.role || "user";
  }

  async function databaseRole() {
    if (!session()) return "user";
    return await rpc("current_app_role");
  }

  async function importSavedDemoCampaigns() {
    const key = "kaimono-clock-demo-campaigns-v1";
    let campaigns;
    try { campaigns = JSON.parse(localStorage.getItem(key) || "[]"); } catch { campaigns = []; }
    if (!Array.isArray(campaigns) || !campaigns.length || await databaseRole() !== "developer") return 0;

    const stores = await request("stores?select=*&external_key=eq.sample-supermarket-1&limit=1");
    const store = stores?.[0];
    if (!store) throw new Error("駅前サンプルスーパーのDB店舗が見つかりません。");

    let imported = 0;
    for (const campaign of campaigns) {
      if (!campaign?.product_name || !campaign?.headline || !campaign?.starts_at || !campaign?.ends_at) continue;
      const sourceId = String(campaign.id || `${campaign.product_name}-${campaign.starts_at}`);
      const externalKey = `browser-demo-${sourceId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80)}`;
      const existing = await request(`ad_campaigns?select=id&external_key=eq.${encodeURIComponent(externalKey)}&limit=1`);
      if (existing?.length) continue;
      const allowedStatuses = ["draft", "submitted", "approved", "scheduled", "active", "paused", "ended", "rejected"];
      const status = allowedStatuses.includes(campaign.status) ? campaign.status : "draft";
      const payload = {
        external_key: externalKey,
        store_id: store.id,
        user_store_id: store.external_key,
        store_name: store.name,
        product_name: campaign.product_name,
        headline: campaign.headline,
        regular_price: campaign.regular_price ?? null,
        sale_price: campaign.sale_price ?? null,
        discount_conditions: campaign.discount_conditions || null,
        starts_at: campaign.starts_at,
        ends_at: campaign.ends_at,
        category: campaign.category || "other",
        stock_note: campaign.stock_note || null,
        user_notice: campaign.user_notice || null,
        weekday_mask: Array.isArray(campaign.weekday_mask) ? campaign.weekday_mask : [],
        delivery_categories: [],
        status,
        submitted_at: campaign.submitted_at || (status !== "draft" ? new Date().toISOString() : null),
        approved_at: ["approved", "scheduled", "active"].includes(status) ? (campaign.approved_at || new Date().toISOString()) : null,
        approved_by: ["approved", "scheduled", "active"].includes(status) ? session().user.id : null,
        rejection_reason: campaign.rejection_reason || null
      };
      await request("ad_campaigns", { method: "POST", body: JSON.stringify(payload) });
      imported += 1;
    }
    if (imported || campaigns.length) localStorage.removeItem(key);
    return imported;
  }

  async function requireRole(required) {
    const actual = await role().catch(() => "user");
    if (actual !== required) {
      document.documentElement.classList.add("mode-denied");
      document.body.innerHTML = `<main class="access-denied"><p class="eyebrow">Access restricted</p><h1>この画面は利用できません</h1><p>${required === "developer" ? "デバッグモードは開発者アカウント専用です。" : "店舗側モードは店舗アカウント専用です。"}</p><a href="./index.html">体験トップへ戻る</a></main>`;
      return false;
    }
    return true;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
  }

  function mask(value) {
    const text = String(value || "");
    if (text.length < 6) return "***";
    return `${text.slice(0, 2)}***${text.slice(-2)}`;
  }

  function yen(value) { return `${Number(value || 0).toLocaleString("ja-JP")}円`; }

  function localImpressionAllowed(id) {
    const key = `kaimono-clock-ad-impressions:${id}:${new Date().toISOString().slice(0, 10)}`;
    const next = Number(localStorage.getItem(key) || 0) + 1;
    if (next > 3) return false;
    localStorage.setItem(key, String(next));
    return true;
  }

  async function track(campaignId, eventType) {
    if (!session() || !campaignId) return;
    try { await request("campaign_events", { method: "POST", body: JSON.stringify({ campaign_id: campaignId, event_type: eventType }) }); } catch { /* Metrics must never interrupt the user flow. */ }
  }

  async function logError(page, operation, error, reproduction = "") {
    if (!session()) return;
    const clean = (value, limit) => String(value || "").replace(/(?:Bearer|password|token|data:image)[^\s]*/gi, "[redacted]").slice(0, limit);
    try {
      await request("app_error_logs", { method: "POST", body: JSON.stringify({ page: clean(page, 80), operation: clean(operation, 120), error_type: clean(error?.name || "Error", 120), reproduction: clean(reproduction || error?.message, 500), app_version: VERSION }) });
    } catch { /* Logging is best effort. */ }
  }

  async function uploadCampaignImage(storeId, campaignId, file) {
    if (!file) return "";
    if (!session()) throw new Error("ログインが必要です。");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5242880) {
      throw new Error("画像はJPEG・PNG・WebPの5MB以下にしてください。");
    }
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${storeId}/${campaignId}.${extension}`;
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/ad-campaign-images/${path}`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session().access_token}`, "Content-Type": file.type, "x-upsert": "true" },
      body: file
    });
    if (!response.ok) throw new Error((await response.text()) || "画像を保存できませんでした。");
    return path;
  }

  function campaignImageUrl(path) {
    return path ? `${SUPABASE_URL}/storage/v1/object/public/ad-campaign-images/${path}` : "";
  }

  function activeNow(campaign) {
    const now = Date.now();
    const start = new Date(campaign.starts_at).getTime();
    const end = new Date(campaign.ends_at).getTime();
    return ["approved", "scheduled", "active"].includes(campaign.status) && start <= now && end >= now;
  }

  window.KaimonoAds = { SUPABASE_URL, SUPABASE_ANON_KEY, VERSION, session, request, rpc, role, databaseRole, importSavedDemoCampaigns, requireRole, exitSpecialMode, escapeHtml, mask, yen, localImpressionAllowed, track, logError, uploadCampaignImage, campaignImageUrl, activeNow };
})();
