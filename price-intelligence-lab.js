(() => {
  "use strict";

  const STORAGE_KEY = "kaimono-clock-synthetic-price-lab-v1";
  const SOURCE_TYPES = ["receipt", "flyer", "store_manual", "store_social", "user_manual"];
  const FIXTURES = [
    {
      id: "receipt-clean",
      label: "レシート / 読み取り成功",
      sourceType: "receipt",
      store: "星空マート 中央店",
      observedAt: "2026-07-10T18:42",
      rawText: "星空マート 中央店\n2026/07/10 18:42\nあおぞら牛乳 1000ml 238\nこむぎ食パン 6枚 168\nしろたまご 10個 248\n合計 654",
      expected: [
        { name: "あおぞら牛乳", quantity: 1000, unit: "ml", price: 238 },
        { name: "こむぎ食パン", quantity: 6, unit: "piece", price: 168 },
        { name: "しろたまご", quantity: 10, unit: "piece", price: 248 }
      ]
    },
    {
      id: "receipt-ocr-error",
      label: "レシート / OCR誤認識",
      sourceType: "receipt",
      store: "星空マート 西口店",
      observedAt: "2026-07-11T12:05",
      rawText: "星空マ一ト 西口店\n2026/07/11 12:05\nあおぞら牛乳 1OOOml 23B\n冷凍うどん 5食 29B\n合計 536",
      expected: [
        { name: "あおぞら牛乳", quantity: 1000, unit: "ml", price: 238 },
        { name: "冷凍うどん", quantity: 5, unit: "piece", price: 298 }
      ]
    },
    {
      id: "receipt-duplicate",
      label: "レシート / 重複候補",
      sourceType: "receipt",
      store: "星空マート 中央店",
      observedAt: "2026-07-10T18:42",
      duplicateOf: "receipt-clean",
      rawText: "星空マート 中央店\n2026/07/10 18:42\nあおぞら牛乳 1000ml 238\nこむぎ食パン 6枚 168\nしろたまご 10個 248\n合計 654",
      expected: []
    },
    {
      id: "flyer-expired",
      label: "チラシ / 掲載期限切れ",
      sourceType: "flyer",
      store: "月見ストア 南店",
      observedAt: "2026-05-01T09:00",
      expiresAt: "2026-05-03T20:00",
      rawText: "月見ストア 南店\n5月1日から5月3日\n若葉洗剤 900ml 198円\nお一人様2点まで",
      expected: [{ name: "若葉洗剤", quantity: 900, unit: "ml", price: 198 }]
    },
    {
      id: "capacity-variants",
      label: "店舗手入力 / 容量違い",
      sourceType: "store_manual",
      store: "月見ストア 南店",
      observedAt: "2026-07-12T10:00",
      rawText: "若葉洗剤 450ml 148円\n若葉洗剤 900ml 248円",
      expected: [
        { name: "若葉洗剤", quantity: 450, unit: "ml", price: 148 },
        { name: "若葉洗剤", quantity: 900, unit: "ml", price: 248 }
      ]
    },
    {
      id: "social-authorized",
      label: "店舗公式SNS / 許可済み想定",
      sourceType: "store_social",
      store: "架空商店 北店",
      observedAt: "2026-07-12T09:30",
      expiresAt: "2026-07-12T19:00",
      rawText: "本日限定\nひかりトマト 4個 298円\n公式投稿URLは合成データのため保存しません",
      expected: [{ name: "ひかりトマト", quantity: 4, unit: "piece", price: 298 }]
    },
    {
      id: "user-manual",
      label: "ユーザー手入力 / JANなし",
      sourceType: "user_manual",
      store: "架空商店 北店",
      observedAt: "2026-07-12T11:15",
      rawText: "メーカー不明 麦茶ティーバッグ 30袋 328円",
      expected: [{ name: "麦茶ティーバッグ", quantity: 30, unit: "pack", price: 328 }]
    }
  ];

  let root;
  let currentFixture;
  let candidates = [];
  let startedAt = 0;

  const $ = (selector) => root.querySelector(selector);
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);

  function normalizeDigits(value) {
    return String(value)
      .replace(/[０-９]/g, (digit) => String(digit.charCodeAt(0) - 0xff10))
      .replace(/[ＯO]/g, "0")
      .replace(/[ＢB]/g, "8");
  }

  function normalizeProductName(value) {
    const japanese = "\\u3040-\\u30ff\\u3400-\\u9fff";
    return String(value)
      .trim()
      .replace(new RegExp(`([${japanese}])\\s+(?=[${japanese}])`, "g"), "$1");
  }

  function parseText(text, fixture) {
    const rows = [];
    const lines = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const dateMatch = text.match(/(20\d{2})[\/.-](\d{1,2})[\/.-](\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
    const observedAt = dateMatch
      ? `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}T${(dateMatch[4] || "00").padStart(2, "0")}:${dateMatch[5] || "00"}`
      : fixture.observedAt;

    for (const line of lines) {
      if (/合計|小計|本日限定|お一人様|公式投稿|20\d{2}[\/.-]/.test(line)) continue;
      const priceMatch = line.match(/(?:\s|^)([0-9０-９ＯOBＢ]{2,6})\s*円?$/i);
      if (!priceMatch) continue;
      const beforePrice = line.slice(0, priceMatch.index).trim();
      const quantityMatch = beforePrice.match(/([0-9０-９ＯO]+(?:\.[0-9０-９]+)?)\s*(ml|mL|g|kg|L|個|枚|食|袋|本|パック)\s*$/i);
      const quantity = quantityMatch ? Number(normalizeDigits(quantityMatch[1])) : 1;
      const unitRaw = quantityMatch?.[2]?.toLowerCase() || "piece";
      const unit = ({ l: "l", ml: "ml", g: "g", kg: "kg", "袋": "pack", "パック": "pack" })[unitRaw] || "piece";
      const name = normalizeProductName(quantityMatch ? beforePrice.slice(0, quantityMatch.index) : beforePrice);
      if (!name) continue;
      rows.push({ id: crypto.randomUUID?.() || `${Date.now()}-${rows.length}`, name, quantity, unit, price: Number(normalizeDigits(priceMatch[1])) });
    }

    return { store: fixture.store, observedAt, rows };
  }

  function drawSyntheticReceipt(fixture) {
    const canvas = $("#priceLabCanvas");
    const lines = fixture.rawText.split("\n");
    canvas.width = 720;
    canvas.height = Math.max(520, 90 + lines.length * 58);
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#17202a";
    context.font = "32px sans-serif";
    lines.forEach((line, index) => context.fillText(line, 45, 70 + index * 58));
  }

  function renderCandidates() {
    const list = $("#priceLabCandidates");
    if (!candidates.length) {
      list.innerHTML = '<p class="muted">候補はまだありません。</p>';
      $("#priceLabConfirm").disabled = true;
      return;
    }
    list.innerHTML = candidates.map((row, index) => `
      <div class="price-lab-row" data-row="${index}">
        <label>商品名<input data-field="name" value="${escapeHtml(row.name)}" maxlength="80"></label>
        <label>数量<input data-field="quantity" type="number" min="0.01" step="0.01" value="${row.quantity}"></label>
        <label>単位<select data-field="unit">${["piece", "pack", "g", "kg", "ml", "l"].map((unit) => `<option value="${unit}" ${row.unit === unit ? "selected" : ""}>${unit}</option>`).join("")}</select></label>
        <label>価格<input data-field="price" type="number" min="0" step="1" value="${row.price}"></label>
        <button class="button danger" data-remove="${index}" type="button" aria-label="${escapeHtml(row.name)}を候補から削除">削除</button>
      </div>`).join("");
    list.querySelectorAll("input,select").forEach((input) => input.addEventListener("input", syncRowsFromForm));
    list.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => {
      candidates.splice(Number(button.dataset.remove), 1);
      renderCandidates();
    }));
    $("#priceLabConfirm").disabled = Boolean(currentFixture?.duplicateOf);
  }

  function syncRowsFromForm() {
    candidates = [...root.querySelectorAll("[data-row]")].map((row) => ({
      id: candidates[Number(row.dataset.row)]?.id,
      name: row.querySelector('[data-field="name"]').value.trim(),
      quantity: Number(row.querySelector('[data-field="quantity"]').value),
      unit: row.querySelector('[data-field="unit"]').value,
      price: Number(row.querySelector('[data-field="price"]').value)
    }));
  }

  function status(message, error = false) {
    const element = $("#priceLabStatus");
    element.textContent = message;
    element.classList.toggle("error", error);
  }

  function loadFixture() {
    currentFixture = FIXTURES.find((fixture) => fixture.id === $("#priceLabFixture").value) || FIXTURES[0];
    candidates = [];
    $("#priceLabSource").textContent = currentFixture.sourceType;
    $("#priceLabRawText").value = currentFixture.rawText;
    $("#priceLabStore").value = currentFixture.store;
    $("#priceLabObservedAt").value = currentFixture.observedAt;
    $("#priceLabDuplicate").textContent = currentFixture.duplicateOf ? `重複候補: ${currentFixture.duplicateOf}` : "重複候補なし";
    $("#priceLabExpiry").textContent = currentFixture.expiresAt && new Date(currentFixture.expiresAt) < new Date() ? "期限切れデータ" : "期限内または期限なし";
    drawSyntheticReceipt(currentFixture);
    renderCandidates();
    status("合成データを読み込みました。まだ構造化データには確定していません。");
  }

  function runSimulatedOcr() {
    startedAt = performance.now();
    const parsed = parseText($("#priceLabRawText").value, currentFixture);
    candidates = parsed.rows;
    $("#priceLabStore").value = parsed.store;
    $("#priceLabObservedAt").value = parsed.observedAt;
    renderCandidates();
    const elapsed = Math.round(performance.now() - startedAt);
    renderMetric("合成OCR結果", elapsed, candidates.length, `API費 0円（模擬） / ${fixtureAccuracy()}`);
    status(`${candidates.length}件を候補化しました。内容を修正してから確定してください。`);
  }

  async function runTesseract() {
    const button = $("#priceLabTesseract");
    button.disabled = true;
    status("Tesseract.jsを読み込み、合成画像を解析しています。");
    try {
      if (!window.Tesseract?.recognize) await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js");
      startedAt = performance.now();
      const result = await window.Tesseract.recognize($("#priceLabCanvas"), "jpn+eng");
      const elapsed = Math.round(performance.now() - startedAt);
      $("#priceLabRawText").value = result?.data?.text || "";
      const parsed = parseText($("#priceLabRawText").value, currentFixture);
      candidates = parsed.rows;
      renderCandidates();
      renderMetric("Tesseract.js 5", elapsed, candidates.length, `API従量課金なし / ${fixtureAccuracy()}`);
      status(`${candidates.length}件を抽出しました。OCR結果は確定前に必ず修正してください。`);
    } catch (error) {
      status(`OCRに失敗しました: ${error.message || "通信状態を確認してください"}`, true);
    } finally {
      button.disabled = false;
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error("OCRライブラリを読み込めませんでした"));
      document.head.appendChild(script);
    });
  }

  function renderMetric(engine, durationMs, rowCount, cost) {
    const target = $("#priceLabMetrics");
    const metric = document.createElement("div");
    metric.className = "check";
    metric.innerHTML = `<div><strong>${escapeHtml(engine)}</strong><p class="muted">${durationMs.toLocaleString()} ms / ${rowCount}候補 / ${escapeHtml(cost)}</p></div><span class="indicator ok">計測済み</span>`;
    target.prepend(metric);
  }

  function fixtureAccuracy() {
    const expected = currentFixture.expected || [];
    if (!expected.length) return "正解比較対象外";
    let matched = 0;
    const fields = expected.length * 4;
    expected.forEach((answer, index) => {
      const actual = candidates[index] || {};
      if (actual.name === answer.name) matched += 1;
      if (Number(actual.quantity) === Number(answer.quantity)) matched += 1;
      if (actual.unit === answer.unit) matched += 1;
      if (Number(actual.price) === Number(answer.price)) matched += 1;
    });
    return `項目一致 ${matched}/${fields}`;
  }

  function confirmSyntheticData() {
    syncRowsFromForm();
    if (currentFixture.duplicateOf) {
      status(`既存証跡 ${currentFixture.duplicateOf} と同一のため、重複候補は確定できません。`, true);
      return;
    }
    const store = $("#priceLabStore").value.trim();
    const observedAt = $("#priceLabObservedAt").value;
    if (!store || !observedAt || !candidates.length || candidates.some((row) => !row.name || row.quantity <= 0 || row.price < 0)) {
      status("店舗、確認日時、商品名、数量、価格を確認してください。", true);
      return;
    }
    const record = {
      id: crypto.randomUUID?.() || String(Date.now()),
      synthetic: true,
      fixtureId: currentFixture.id,
      sourceType: currentFixture.sourceType,
      store,
      observedAt,
      expiresAt: currentFixture.expiresAt || null,
      duplicateOf: currentFixture.duplicateOf || null,
      rows: candidates,
      confirmedAt: new Date().toISOString()
    };
    const saved = readSaved();
    saved.unshift(record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved.slice(0, 30)));
    renderSaved();
    status("合成データ専用領域へ確定しました。本番DB・家計簿・割引メモには保存していません。");
  }

  function readSaved() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(value) ? value.filter((record) => record.synthetic === true) : [];
    } catch {
      return [];
    }
  }

  function renderSaved() {
    const records = readSaved();
    $("#priceLabSaved").innerHTML = records.length ? records.map((record) => `
      <div class="check"><div><strong>${escapeHtml(record.store)}</strong><p class="muted">${escapeHtml(record.sourceType)} / ${record.rows.length}件 / ${new Date(record.confirmedAt).toLocaleString("ja-JP")}</p></div><span class="badge">合成</span></div>`).join("") : '<p class="muted">確定済み合成データはありません。</p>';
  }

  function clearSaved() {
    if (!confirm("確定済みの合成テストデータだけを削除しますか？")) return;
    localStorage.removeItem(STORAGE_KEY);
    renderSaved();
    status("合成テストデータを削除しました。");
  }

  function init() {
    root = document.querySelector("#priceLab");
    if (!root || root.dataset.initialized === "true") return;
    root.dataset.initialized = "true";
    if (!SOURCE_TYPES.every((type) => FIXTURES.some((fixture) => fixture.sourceType === type))) {
      status("出典種別の合成ケースが不足しています。", true);
      return;
    }
    $("#priceLabFixture").innerHTML = FIXTURES.map((fixture) => `<option value="${fixture.id}">${escapeHtml(fixture.label)}</option>`).join("");
    $("#priceLabFixture").addEventListener("change", loadFixture);
    $("#priceLabSimulate").addEventListener("click", runSimulatedOcr);
    $("#priceLabTesseract").addEventListener("click", runTesseract);
    $("#priceLabConfirm").addEventListener("click", confirmSyntheticData);
    $("#priceLabClear").addEventListener("click", clearSaved);
    loadFixture();
    renderSaved();
  }

  window.KaimonoPriceLab = Object.freeze({ init, parseText, fixtures: FIXTURES.map(({ rawText, expected, ...fixture }) => fixture) });
})();
