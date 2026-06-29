const categories = ["黑板膜", "白板膜", "框料", "五金", "耗材", "設備"];

let state = {
  items: [],
  costs: [],
  history: [],
  currentPhoto: ""
};

const inventoryBody = document.querySelector("#inventoryBody");
const costBody = document.querySelector("#costBody");
const grandTotal = document.querySelector("#grandTotal");
const itemCount = document.querySelector("#itemCount");
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
    throw new Error(message || `API 錯誤：${response.status}`);
  }

  return response.json();
}

async function loadState() {
  state = await api("/api/state");
  renderAll();
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
    inventoryBody.innerHTML = `<tr><td colspan="7" class="empty-state">尚無盤點品項。可先拍照辨識或手動新增。</td></tr>`;
  }

  state.items.forEach((item) => {
    const row = document.querySelector("#inventoryRowTemplate").content.firstElementChild.cloneNode(true);
    row.querySelector(".category-input").innerHTML = makeCategoryOptions(item.category);
    row.querySelector(".name-input").value = item.name || "";
    row.querySelector(".qty-input").value = item.qty ?? 0;
    row.querySelector(".unit-input").value = item.unit || "";
    row.querySelector(".cost-input").value = item.cost ?? 0;
    row.querySelector(".subtotal-cell").textContent = money((item.qty || 0) * (item.cost || 0));

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
    qty: Number(row.querySelector(".qty-input").value) || 0,
    unit: row.querySelector(".unit-input").value.trim(),
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
      unit: match.unit,
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

  state.costs.forEach((cost) => {
    const row = document.querySelector("#costRowTemplate").content.firstElementChild.cloneNode(true);
    row.querySelector(".cost-category-input").innerHTML = makeCategoryOptions(cost.category);
    row.querySelector(".cost-name-input").value = cost.name || "";
    row.querySelector(".cost-unit-input").value = cost.unit || "";
    row.querySelector(".cost-value-input").value = cost.cost ?? 0;

    row.querySelectorAll("input, select").forEach((input) => {
      input.addEventListener("change", () => updateCost(cost.id, row));
    });

    row.querySelector(".delete-cost").addEventListener("click", () => deleteCost(cost.id));

    costBody.appendChild(row);
  });
}

async function updateCost(id, row) {
  state = await api(`/api/costs/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      category: row.querySelector(".cost-category-input").value,
      name: row.querySelector(".cost-name-input").value.trim(),
      unit: row.querySelector(".cost-unit-input").value.trim(),
      cost: Number(row.querySelector(".cost-value-input").value) || 0
    })
  });
  renderAll();
}

async function deleteCost(id) {
  state = await api(`/api/costs/${id}`, { method: "DELETE" });
  renderAll();
}

function updateTotals() {
  const total = state.items.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.cost) || 0), 0);
  grandTotal.textContent = money(total);
  itemCount.textContent = String(state.items.length);
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
      qty: item.qty ?? 1,
      unit: item.unit || "個",
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
      unit: "個",
      cost: 0
    })
  });
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
  renderAll();
}

function exportExcel() {
  window.location.href = "/api/export/excel";
}

function exportPdf() {
  const total = state.items.reduce((sum, item) => sum + item.qty * item.cost, 0);
  const rows = state.items
    .map(
      (item) => `
      <tr>
        <td>${item.category}</td>
        <td>${item.name}</td>
        <td>${item.qty}</td>
        <td>${item.unit}</td>
        <td>${money(item.cost)}</td>
        <td>${money(item.qty * item.cost)}</td>
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
          <thead><tr><th>分類</th><th>品項</th><th>數量</th><th>單位</th><th>單位成本</th><th>小計</th></tr></thead>
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

loadState().catch((error) => {
  aiStatus.textContent = `後端連線失敗：${error.message}`;
});
