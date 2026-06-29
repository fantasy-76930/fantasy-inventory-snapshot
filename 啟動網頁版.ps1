$ErrorActionPreference = "Stop"

$bundledNode = "C:\Users\09895\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$node = if (Test-Path $bundledNode) { $bundledNode } else { "node" }
$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Set-Location $appDir
Write-Host "正在啟動奇幻庫存快拍系統..."
Write-Host "開啟網址：http://127.0.0.1:3000/"
& $node server.js
