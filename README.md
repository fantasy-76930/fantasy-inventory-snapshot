# 奇幻庫存快拍系統

這是網頁版架構：

- 前端：PWA 網頁，可拍照上傳、修正盤點、匯出報表
- 後端：Node.js API
- 資料庫：`data/db.json`
- AI：`/api/ai-detect`，設定 `OPENAI_API_KEY` 後會呼叫 OpenAI Responses API 做圖片辨識

## 啟動

在這台電腦可直接執行：

```powershell
.\啟動網頁版.ps1
```

如果已安裝 Node.js，也可以用：

```powershell
npm start
```

開啟：

```text
http://127.0.0.1:3000/
```

## 啟用 AI 辨識

```powershell
$env:OPENAI_API_KEY="你的 OpenAI API Key"
$env:OPENAI_MODEL="gpt-5.4-mini"
npm start
```

未設定金鑰時，系統會使用示範辨識資料，方便先測盤點流程。

## 管理員登入

本機預設密碼是：

```text
admin1234
```

正式上雲端時請設定環境變數：

```text
ADMIN_PASSWORD=你的管理員密碼
SESSION_SECRET=一串很長的隨機字
OPENAI_API_KEY=你的 OpenAI API Key
DATA_DIR=/data
```

## 雲端部署

專案已附上 `Dockerfile` 和 `render.yaml`，可部署到 Render、Railway、Fly.io 或任何支援 Node.js/Docker 的平台。

若使用檔案資料庫，雲端需要永久磁碟，`render.yaml` 已設定 `/data` 作為資料保存位置。
