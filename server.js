const http = require("http");
const fs = require("fs");
const path = require("path");

const rootDir = __dirname;
const dataDir = process.env.DATA_DIR || path.join(rootDir, "data");
const dbPath = path.join(dataDir, "db.json");
const seedCostsPath = path.join(rootDir, "seed-costs.json");
const port = Number(process.env.PORT || 3000);
const adminPassword = process.env.ADMIN_PASSWORD || "admin1234";
const sessionSecret = process.env.SESSION_SECRET || "local-dev-secret";
const sessionCookieName = "fantasy_inventory_session";

const categories = ["黑板膜", "白板膜", "框料", "五金", "耗材", "設備"];
const defaultCosts = [
  { id: makeId(), category: "黑板膜", name: "黑板膜卷材", unit: "卷", conversionQty: 1, costUnit: "卷", cost: 2800 },
  { id: makeId(), category: "白板膜", name: "白板膜卷材", unit: "卷", conversionQty: 1, costUnit: "卷", cost: 3200 },
  { id: makeId(), category: "框料", name: "鋁框料", unit: "支", conversionQty: 1, costUnit: "支", cost: 180 },
  { id: makeId(), category: "五金", name: "角碼", unit: "包", conversionQty: 1, costUnit: "包", cost: 95 },
  { id: makeId(), category: "耗材", name: "雙面膠", unit: "卷", conversionQty: 1, costUnit: "卷", cost: 120 },
  { id: makeId(), category: "耗材", name: "粉筆", unit: "箱", conversionQty: 120, costUnit: "盒", cost: 60 },
  { id: makeId(), category: "設備", name: "裁切機", unit: "台", conversionQty: 1, costUnit: "台", cost: 16800 }
];
const demoDetectedItems = [
  { category: "黑板膜", name: "黑板膜卷材", qty: 3, unit: "卷", cost: 2800 },
  { category: "白板膜", name: "白板膜卷材", qty: 2, unit: "卷", cost: 3200 },
  { category: "框料", name: "鋁框料", qty: 18, unit: "支", cost: 180 },
  { category: "五金", name: "角碼", qty: 6, unit: "包", cost: 95 },
  { category: "黑板膜", name: "背膠式水擦黑板膜(寬122cm)/才", calcMode: "area", widthCm: 120, lengthCm: 5000, unit: "才", costUnit: "才", cost: 50 },
  { category: "耗材", name: "粉筆", qty: 1, unit: "箱", cost: 60, conversionQty: 120, costUnit: "盒" }
];

ensureDb();

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }
    if (url.pathname === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }
    if (url.pathname === "/login") {
      serveStatic(response, "/login.html");
      return;
    }
    serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`奇幻庫存快拍系統 running at http://127.0.0.1:${port}/`);
});

async function handleApi(request, response, url) {
  const db = readDb();
  const method = request.method;
  const body = method === "GET" ? {} : await readJson(request);

  if (method === "GET" && url.pathname === "/api/session") {
    sendJson(response, 200, { authenticated: isAuthenticated(request) });
    return;
  }

  if (method === "POST" && url.pathname === "/api/login") {
    if (String(body.password || "") !== adminPassword) {
      sendJson(response, 401, { error: "管理員密碼錯誤" });
      return;
    }
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": `${sessionCookieName}=${makeSessionValue()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
    });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (method === "POST" && url.pathname === "/api/logout") {
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": `${sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
    });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (!isAuthenticated(request)) {
    sendJson(response, 401, { error: "請先以管理員登入" });
    return;
  }

  if (method === "GET" && url.pathname === "/api/state") {
    migrateDb(db);
    writeDb(db);
    sendJson(response, 200, db);
    return;
  }

  if (method === "POST" && url.pathname === "/api/photo") {
    db.currentPhoto = String(body.image || "");
    writeDb(db);
    sendJson(response, 200, db);
    return;
  }

  if (method === "POST" && url.pathname === "/api/items") {
    db.items.push(normalizeItem(body));
    writeDb(db);
    sendJson(response, 200, db);
    return;
  }

  if (method === "PUT" && url.pathname.startsWith("/api/items/")) {
    const id = decodeURIComponent(url.pathname.replace("/api/items/", ""));
    db.items = db.items.map((item) => (item.id === id ? normalizeItem({ ...item, ...body, id }) : item));
    writeDb(db);
    sendJson(response, 200, db);
    return;
  }

  if (method === "DELETE" && url.pathname.startsWith("/api/items/")) {
    const id = decodeURIComponent(url.pathname.replace("/api/items/", ""));
    db.items = db.items.filter((item) => item.id !== id);
    writeDb(db);
    sendJson(response, 200, db);
    return;
  }

  if (method === "POST" && url.pathname === "/api/costs") {
    db.costs.push(normalizeCost(body));
    writeDb(db);
    sendJson(response, 200, db);
    return;
  }

  if (method === "PUT" && url.pathname.startsWith("/api/costs/")) {
    const id = decodeURIComponent(url.pathname.replace("/api/costs/", ""));
    db.costs = db.costs.map((cost) => (cost.id === id ? normalizeCost({ ...cost, ...body, id }) : cost));
    writeDb(db);
    sendJson(response, 200, db);
    return;
  }

  if (method === "DELETE" && url.pathname.startsWith("/api/costs/")) {
    const id = decodeURIComponent(url.pathname.replace("/api/costs/", ""));
    db.costs = db.costs.filter((cost) => cost.id !== id);
    writeDb(db);
    sendJson(response, 200, db);
    return;
  }

  if (method === "POST" && url.pathname === "/api/snapshots") {
    const month = body.month || currentMonth();
    const total = inventoryTotal(db.items);
    const record = {
      id: makeId(),
      month,
      total,
      items: db.items,
      photo: db.currentPhoto,
      savedAt: new Date().toISOString()
    };
    const existing = db.history.findIndex((entry) => entry.month === month);
    if (existing >= 0) db.history[existing] = record;
    else db.history.push(record);
    writeDb(db);
    sendJson(response, 200, db);
    return;
  }

  if (method === "POST" && url.pathname === "/api/ai-detect") {
    const detectedItems = await detectInventory(body.image || db.currentPhoto, db.costs);
    db.items = detectedItems.map((item) => normalizeItem(item));
    db.aiMode = process.env.OPENAI_API_KEY ? "openai" : "demo";
    writeDb(db);
    sendJson(response, 200, db);
    return;
  }

  if (method === "GET" && url.pathname === "/api/export/excel") {
    sendExcel(response, db);
    return;
  }

  sendJson(response, 404, { error: "找不到 API" });
}

async function detectInventory(image, costs) {
  if (!process.env.OPENAI_API_KEY || !image) {
    return applyKnownCosts(demoDetectedItems, costs);
  }

  const prompt = [
    "你是庫存盤點助理。請從照片辨識庫存品項，輸出 JSON 陣列。",
    "欄位只能包含 category, name, qty, unit, calcMode, widthCm, lengthCm。",
    `category 必須是以下之一：${categories.join("、")}。`,
    "qty 請用數字，unit 使用照片上最自然的盤點單位，例如箱、盒、卷、支、包、台。",
    "若照片看起來是一整箱粉筆，請輸出 qty: 1, unit: \"箱\"。",
    "若照片是膜料、白板膜、黑板膜，且能判斷長度或使用者提供長度，calcMode 用 \"area\"，widthCm 和 lengthCm 用公分；才數公式是 widthCm × lengthCm ÷ 900。",
    "請盡量把品項名稱對應到成本表已存在的名稱。",
    `目前成本表品項：${costs.map((cost) => `${cost.name}(${cost.unit})`).join("、")}。`,
    "不要輸出 JSON 以外的文字。"
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: image }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI 辨識失敗：${detail}`);
  }

  const result = await response.json();
  const outputText = collectOutputText(result);
  const parsed = JSON.parse(outputText);
  return applyKnownCosts(Array.isArray(parsed) ? parsed : [], costs);
}

function collectOutputText(result) {
  if (result.output_text) return result.output_text;
  return (result.output || [])
    .flatMap((entry) => entry.content || [])
    .map((content) => content.text || "")
    .join("")
    .trim();
}

function applyKnownCosts(items, costs) {
  return items.map((item) => {
    const match = costs.find((cost) => cost.name === item.name);
    return match
      ? {
          ...item,
          category: match.category,
          unit: item.unit || match.unit,
          cost: match.cost,
          conversionQty: match.conversionQty,
          costUnit: match.costUnit,
          calcMode: item.calcMode || match.calcMode,
          widthCm: item.widthCm || match.widthCm,
          lengthCm: item.lengthCm || match.lengthCm
        }
      : item;
  });
}

function normalizeItem(item) {
  return {
    id: item.id || makeId(),
    category: categories.includes(item.category) ? item.category : categories[0],
    name: String(item.name || ""),
    qty: Number(item.qty) || 0,
    unit: String(item.unit || "個"),
    conversionQty: Number(item.conversionQty) || 1,
    costUnit: String(item.costUnit || item.unit || "個"),
    calcMode: item.calcMode === "area" ? "area" : "count",
    widthCm: Number(item.widthCm) || 0,
    lengthCm: Number(item.lengthCm) || 0,
    cost: Number(item.cost) || 0
  };
}

function normalizeCost(cost) {
  return {
    id: cost.id || makeId(),
    category: categories.includes(cost.category) ? cost.category : categories[0],
    name: String(cost.name || ""),
    unit: String(cost.unit || "個"),
    conversionQty: Number(cost.conversionQty) || 1,
    costUnit: String(cost.costUnit || cost.unit || "個"),
    calcMode: cost.calcMode === "area" ? "area" : "count",
    widthCm: Number(cost.widthCm) || 0,
    lengthCm: Number(cost.lengthCm) || 0,
    cost: Number(cost.cost) || 0
  };
}

function ensureDb() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
  if (!fs.existsSync(dbPath)) {
    writeDb({
      items: [],
      costs: defaultCosts,
      history: [],
      currentPhoto: "",
      aiMode: "demo"
    });
  } else {
    const db = readDb();
    migrateDb(db);
    writeDb(db);
  }
}

function migrateDb(db) {
  db.items = (db.items || []).map(normalizeItem);
  db.costs = (db.costs || []).map(normalizeCost);
  mergeCostSeeds(db, defaultCosts);
  mergeCostSeeds(db, loadSeedCosts());
  db.history = db.history || [];
  db.currentPhoto = db.currentPhoto || "";
  db.aiMode = db.aiMode || "demo";
}

function mergeCostSeeds(db, costs) {
  costs.forEach((seedCost) => {
    const normalized = normalizeCost(seedCost);
    const exists = db.costs.some((cost) => cost.name === normalized.name && cost.costUnit === normalized.costUnit);
    if (!exists) db.costs.push(normalized);
  });
}

function loadSeedCosts() {
  if (!fs.existsSync(seedCostsPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(seedCostsPath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readDb() {
  return JSON.parse(fs.readFileSync(dbPath, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), "utf8");
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 12 * 1024 * 1024) {
        reject(new Error("上傳資料太大"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("JSON 格式錯誤"));
      }
    });
  });
}

function serveStatic(response, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(rootDir, safePath));
  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  response.writeHead(200, { "Content-Type": mimeType(filePath) });
  fs.createReadStream(filePath).pipe(response);
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function isAuthenticated(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  return cookies[sessionCookieName] === makeSessionValue();
}

function makeSessionValue() {
  return Buffer.from(`admin:${sessionSecret}`).toString("base64url");
}

function parseCookies(cookieHeader) {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index < 0) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function sendExcel(response, db) {
  const rows = [
    ["分類", "品項", "計算", "數量/才數", "盤點單位", "高度cm", "長度cm", "換算數量", "成本單位", "單位成本", "小計"],
    ...db.items.map((item) => [
      item.category,
      item.name,
      item.calcMode === "area" ? "才數" : "一般",
      measuredQty(item),
      item.unit,
      item.widthCm || "",
      item.lengthCm || "",
      item.conversionQty,
      item.costUnit,
      item.cost,
      itemSubtotal(item)
    ])
  ];
  const html = `
    <html>
      <head><meta charset="utf-8" /></head>
      <body>
        <h1>奇幻庫存快拍系統</h1>
        <table>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</table>
      </body>
    </html>
  `;
  const filename = encodeURIComponent(`奇幻庫存盤點-${currentMonth()}.xls`);
  response.writeHead(200, {
    "Content-Type": "application/vnd.ms-excel; charset=utf-8",
    "Content-Disposition": `attachment; filename*=UTF-8''${filename}`
  });
  response.end(html);
}

function inventoryTotal(items) {
  return items.reduce((sum, item) => sum + itemSubtotal(item), 0);
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

function currentMonth() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml"
  }[ext] || "application/octet-stream";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
