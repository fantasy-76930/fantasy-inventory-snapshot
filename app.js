const categories = ["膜材", "筆/粉筆/墨水", "板擦/保養", "設備/配件", "其他"];

let state = {
  items: [],
  costs: [],
  history: [],
  currentPhoto: ""
};
let activeCostId = "";

const inventoryBody = document.querySelector("#inventoryBody");
const costBody = document.querySelector("#costBody");
const grandTotal = document.querySelector("#grandTotal");
const itemCount = document.querySelector("#itemCount");
const costCount = document.querySelector("#costCount");
const historyGrid = document.querySelector("#historyGrid");
const photoInput = document.querySelector("#photoInput");
const photoPreview = document.querySelector("#photoPreview");
const aiStatus = document.querySelector("#aiStatus");

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });

  if (response.status === 401) {
    location.href = "/login";
    throw new Error("請先以管理員登入");
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(readableError(message, response.status));
  }

  return response.json();
}

function readableError(message, status) {
  if (message.includes("insufficient_quota")) {
    return "OpenAI 額度不足，請到 OpenAI Platform 檢查 Billing 或加值後再試。";
  }
  if (message.includes("invalid_api_key")) {
    return "OpenAI API Key 無效，請到 Render 確認 OPENAI_API_KEY。";
  }
  try {
    const parsed = JSON.parse(message);
    if (parsed.error) return parsed.error;
  } catch {
  }
  return message || `API 錯誤：${status}`;
}

async function loadState() {
  state = await api("/api/state");
  renderAll();
}

async function resetCurrentOnFreshOpen() {
  const sessionKey = "fantasyInventorySessionStarted";
  if (sessionStorage.getItem(sessionKey)) return;
  sessionStorage.setItem(sessionKey, "1");
  await api("/api/current/reset", { method: "POST" });
}

function money(value) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function monthLabel(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function makeCategoryOptions(selected) {
  return categories
    .map((category) => `<option value="${category}" ${category === selected ? "selected" : ""}>${category}</option>`)
    .join("");
}

function renderPhoto() {
  if (!state.currentPhoto) {
    photoPreview.innerHTML = "<span>尚未上傳照片</span>";
    return;
  }

  photoPreview.innerHTML = `<img src="${state.currentPhoto}" alt="庫存照片預覽" />`;
}

function renderInventory() {
  inventoryBody.innerHTML = "";

  if (!state.items.length) {
    inventoryBody.innerHTML = `<tr><td colspan="11" class="empty-state">尚無盤點品項。可先拍照辨識或手動新增。</td></tr>`;
  }

  state.items.forEach((item) => {
    const row = document.querySelector("#inventoryRowTemplate").content.firstElementChild.cloneNode(true);
    labelCells(row, ["分類", "品項", "計算", "數量", "盤點單位", "高度cm", "長度cm", "換算", "成本單位", "單位成本", "小計", ""]);
    row.querySelector(".category-input").innerHTML = makeCategoryOptions(item.category);
    row.querySelector(".name-input").value = item.name || "";
    row.querySelector(".calc-mode-input").value = item.calcMode || "count";
    row.querySelector(".qty-input").value = item.calcMode === "area" ? measuredQty(item) : item.qty ?? 0;
    row.querySelector(".unit-input").value = item.unit || "";
    row.querySelector(".width-input").value = item.widthCm || "";
    row.querySelector(".length-input").value = item.lengthCm || "";
    row.querySelector(".conversion-input").value = item.conversionQty ?? 1;
    row.querySelector(".cost-unit-input").value = item.costUnit || item.unit || "";
    row.querySelector(".cost-input").value = item.cost ?? 0;
    row.querySelector(".subtotal-cell").textContent = money(itemSubtotal(item));

    row.querySelectorAll("input, select").forEach((input) => {
      input.addEventListener("change", () => updateInventoryItem(item.id, row));
    });

    row.querySelector(".name-input").addEventListener("change", () => fillCostFromTable(item.id, row));
    row.querySelector(".delete-row").addEventListener("click", () => deleteInventoryItem(item.id));

    inventoryBody.appendChild(row);
  });

  updateTotals();
}

async function updateInventoryItem(id, row) {
  const updated = {
    category: row.querySelector(".category-input").value,
    name: row.querySelector(".name-input").value.trim(),
    calcMode: row.querySelector(".calc-mode-input").value,
    qty: Number(row.querySelector(".qty-input").value) || 0,
    unit: row.querySelector(".unit-input").value.trim(),
    widthCm: Number(row.querySelector(".width-input").value) || 0,
    lengthCm: Number(row.querySelector(".length-input").value) || 0,
    conversionQty: Number(row.querySelector(".conversion-input").value) || 1,
    costUnit: row.querySelector(".cost-unit-input").value.trim(),
    cost: Number(row.querySelector(".cost-input").value) || 0
  };
  state = await api(`/api/items/${id}`, {
    method: "PUT",
    body: JSON.stringify(updated)
  });
  renderAll();
}

async function fillCostFromTable(id, row) {
  const name = row.querySelector(".name-input").value.trim();
  const match = state.costs.find((cost) => cost.name === name);
  if (!match) return;

  state = await api(`/api/items/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      name,
      category: match.category,
      unit: row.querySelector(".unit-input").value.trim() || match.unit,
      conversionQty: match.conversionQty,
      costUnit: match.costUnit,
      calcMode: match.calcMode,
      widthCm: match.widthCm,
      lengthCm: match.lengthCm,
      cost: match.cost,
      qty: Number(row.querySelector(".qty-input").value) || 0
    })
  });
  renderAll();
}

async function deleteInventoryItem(id) {
  state = await api(`/api/items/${id}`, { method: "DELETE" });
  renderAll();
}

function renderCosts() {
  costBody.innerHTML = "";
  if (costCount) costCount.textContent = `共 ${state.costs.length} 筆成本資料`;

  const activeCost = state.costs.find((cost) => cost.id === activeCostId);
  if (!activeCost) {
    activeCostId = "";
    const emptyRow = document.createElement("tr");
    emptyRow.className = "cost-helper-row";
    emptyRow.innerHTML = `<td colspan="7" class="empty-state">成本資料已在後台載入。按「新增成本」時，這裡只會顯示正在新增的那一筆。</td>`;
    costBody.appendChild(emptyRow);
    return;
  }

  [activeCost].forEach((cost) => {
    const row = document.querySelector("#costRowTemplate").content.firstElementChild.cloneNode(true);
    labelCells(row, ["分類", "品項", "盤點單位", "換算", "成本單位", "單位成本", ""]);
    row.querySelector(".cost-category-input").innerHTML = makeCategoryOptions(cost.category);
    row.querySelector(".cost-name-input").value = cost.name || "";
    row.querySelector(".cost-unit-input").value = cost.unit || "";
    row.querySelector(".cost-conversion-input").value = cost.conversionQty ?? 1;
    row.querySelector(".cost-base-unit-input").value = cost.costUnit || cost.unit || "";
    row.querySelector(".cost-value-input").value = cost.cost ?? 0;

    row.querySelectorAll("input, select").forEach((input) => {
      input.addEventListener("change", () => updateCost(cost.id, row));
    });

    row.querySelector(".delete-cost").addEventListener("click", () => deleteCost(cost.id));

    costBody.appendChild(row);
  });
}

function labelCells(row, labels) {
  [...row.children].forEach((cell, index) => {
    if (labels[index]) cell.dataset.label = labels[index];
  });
}

async function updateCost(id, row) {
  state = await api(`/api/costs/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      category: row.querySelector(".cost-category-input").value,
      name: row.querySelector(".cost-name-input").value.trim(),
      unit: row.querySelector(".cost-unit-input").value.trim(),
      conversionQty: Number(row.querySelector(".cost-conversion-input").value) || 1,
      costUnit: row.querySelector(".cost-base-unit-input").value.trim(),
      cost: Number(row.querySelector(".cost-value-input").value) || 0
    })
  });
  renderAll();
}

async function deleteCost(id) {
  state = await api(`/api/costs/${id}`, { method: "DELETE" });
  if (activeCostId === id) activeCostId = "";
  renderAll();
}

function updateTotals() {
  const total = state.items.reduce((sum, item) => sum + itemSubtotal(item), 0);
  grandTotal.textContent = money(total);
  itemCount.textContent = String(state.items.length);
}

function itemSubtotal(item) {
  return measuredQty(item) * (Number(item.conversionQty) || 1) * (Number(item.cost) || 0);
}

function measuredQty(item) {
  if (item.calcMode === "area") {
    const area = ((Number(item.widthCm) || 0) * (Number(item.lengthCm) || 0)) / 900;
    return Math.round(area * 100) / 100;
  }
  return Number(item.qty) || 0;
}

function renderHistory() {
  if (!state.history.length) {
    historyGrid.innerHTML = `<div class="empty-state">尚無歷史紀錄。按「新增盤點紀錄」即可保存本月盤點。</div>`;
    return;
  }

  const records = state.history.slice().sort((a, b) => a.month.localeCompare(b.month));
  historyGrid.innerHTML = records
    .slice()
    .reverse()
    .map((record, reversedIndex) => {
      const originalIndex = records.length - 1 - reversedIndex;
      const previous = records[originalIndex - 1];
      const diff = previous ? record.total - previous.total : 0;
      const diffText = previous ? `較前次 ${diff >= 0 ? "+" : ""}${money(diff)}` : "第一筆紀錄";
      return `
        <article class="history-card">
          <strong>${record.month}</strong>
          <span>${money(record.total)}</span>
          <span>${record.items.length} 個品項</span>
          <span>${diffText}</span>
        </article>
      `;
    })
    .join("");
}

function renderAll() {
  renderPhoto();
  renderInventory();
  renderCosts();
  renderHistory();
}

async function addInventoryItem(item = {}) {
  state = await api("/api/items", {
    method: "POST",
    body: JSON.stringify({
      category: item.category || categories[0],
      name: item.name || "",
      calcMode: item.calcMode || "count",
      qty: item.qty ?? 1,
      unit: item.unit || "個",
      widthCm: item.widthCm || 0,
      lengthCm: item.lengthCm || 0,
      conversionQty: item.conversionQty ?? 1,
      costUnit: item.costUnit || item.unit || "個",
      cost: item.cost ?? 0
    })
  });
  renderAll();
}

async function addCostItem() {
  state = await api("/api/costs", {
    method: "POST",
    body: JSON.stringify({
      category: categories[0],
      name: "",
      unit: "箱",
      conversionQty: 1,
      costUnit: "個",
      cost: 0
    })
  });
  activeCostId = state.costs[state.costs.length - 1]?.id || "";
  renderAll();
}

async function detectInventory() {
  aiStatus.textContent = "AI 辨識中，請稍候...";
  try {
    state = await api("/api/ai-detect", {
      method: "POST",
      body: JSON.stringify({ image: state.currentPhoto })
    });
    aiStatus.textContent = state.aiMode === "openai"
      ? "AI 已辨識完成。請依照片內容最後確認數量與成本。"
      : "目前未設定 AI 金鑰，已產生示範辨識結果。";
    renderAll();
  } catch (error) {
    aiStatus.textContent = `辨識失敗：${error.message}`;
  }
}

async function saveSnapshot() {
  state = await api("/api/snapshots", {
    method: "POST",
    body: JSON.stringify({ month: monthLabel() })
  });
  aiStatus.textContent = "盤點紀錄已儲存，本次照片與 AI 結果已清空。";
  if (photoInput) photoInput.value = "";
  renderAll();
}

async function resetCurrentInventory() {
  state = await api("/api/current/reset", { method: "POST" });
  aiStatus.textContent = "已清空本次照片、AI 結果與盤點清單。";
  if (photoInput) photoInput.value = "";
  renderAll();
}

function exportExcel() {
  window.location.href = "/api/export/excel";
}

function exportPdf() {
  const total = state.items.reduce((sum, item) => sum + itemSubtotal(item), 0);
  const rows = state.items
    .map(
      (item) => `
      <tr>
        <td>${item.category}</td>
        <td>${item.name}</td>
        <td>${item.calcMode === "area" ? "才數" : "一般"}</td>
        <td>${measuredQty(item)}</td>
        <td>${item.unit}</td>
        <td>${item.widthCm || ""}</td>
        <td>${item.lengthCm || ""}</td>
        <td>${item.conversionQty}</td>
        <td>${item.costUnit}</td>
        <td>${money(item.cost)}</td>
        <td>${money(itemSubtotal(item))}</td>
      </tr>`
    )
    .join("");
  const report = window.open("", "_blank");
  report.document.write(`
    <!doctype html>
    <html lang="zh-Hant">
      <head>
        <meta charset="utf-8" />
        <title>奇幻庫存盤點 PDF</title>
        <style>
          body { font-family: "Microsoft JhengHei", sans-serif; padding: 28px; color: #17201f; }
          h1 { margin: 0 0 8px; }
          .total { font-size: 24px; font-weight: 800; margin: 18px 0; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border-bottom: 1px solid #d9e1de; padding: 9px; text-align: left; }
          th { color: #64716f; }
        </style>
      </head>
      <body>
        <h1>奇幻庫存快拍系統</h1>
        <div>盤點月份：${monthLabel()}</div>
        <div class="total">總庫存金額：${money(total)}</div>
        <table>
          <thead><tr><th>分類</th><th>品項</th><th>計算</th><th>數量/才數</th><th>盤點單位</th><th>高度cm</th><th>長度cm</th><th>換算</th><th>成本單位</th><th>單位成本</th><th>小計</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <script>window.onload = () => window.print();<\/script>
      </body>
    </html>
  `);
  report.document.close();
}

photoInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async () => {
    state = await api("/api/photo", {
      method: "POST",
      body: JSON.stringify({ image: String(reader.result) })
    });
    aiStatus.textContent = "照片已上傳到後端，可以開始 AI 辨識或直接手動新增品項。";
    renderAll();
  };
  reader.readAsDataURL(file);
});

document.querySelector("#aiDetectBtn").addEventListener("click", detectInventory);
document.querySelector("#addBlankBtn").addEventListener("click", () => addInventoryItem());
document.querySelector("#resetCurrentBtn").addEventListener("click", resetCurrentInventory);
document.querySelector("#addCostBtn").addEventListener("click", addCostItem);
document.querySelector("#newSnapshotBtn").addEventListener("click", saveSnapshot);
document.querySelector("#exportExcelBtn").addEventListener("click", exportExcel);
document.querySelector("#exportPdfBtn").addEventListener("click", exportPdf);
document.querySelector("#logoutBtn").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  location.href = "/login";
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js");
  });
}

resetCurrentOnFreshOpen().then(loadState).catch((error) => {
  aiStatus.textContent = `後端連線失敗：${error.message}`;
});
