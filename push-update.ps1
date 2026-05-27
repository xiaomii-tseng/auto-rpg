# push-update.ps1
# 讀取目前版本號 + CHANGELOG 最新區塊，推撥給所有訂閱的玩家

$ADMIN_SECRET = "Jj15984dfgd"   # <-- 若改了 Render 上的密碼，這裡同步改
$API_URL      = "https://minirpg-q1zq.onrender.com/push/notify-version"

# ── 讀取版本號（從 version.ts）─────────────────────────────────────────────
$versionLine = Get-Content "src/app/game/version.ts" | Select-String "VERSION"
if ($versionLine -match "'(v[^']+)'") {
    $version = $Matches[1]
} else {
    Write-Host "找不到版本號，請確認 src/app/game/version.ts 格式正確" -ForegroundColor Red
    exit 1
}

# ── 讀取 CHANGELOG 最新版本的區塊 ──────────────────────────────────────────
$lines      = Get-Content "CHANGELOG.md"
$collecting = $false
$noteLines  = @()

foreach ($line in $lines) {
    if ($line -match "^## $([regex]::Escape($version))") {
        $collecting = $true
        continue
    }
    if ($collecting) {
        if ($line -match "^## " -or $line -match "^---") { break }
        $noteLines += $line
    }
}

# 整理成一行簡短文字（移除 markdown 符號、空行）
$notes = ($noteLines |
    Where-Object { $_.Trim() -ne "" -and $_.Trim() -ne "---" } |
    ForEach-Object { $_ -replace "^#+\s*", "" -replace "^\*\*(.+?)\*\*：", "【$1】" -replace "^- ", "" } |
    Select-Object -First 5 |
    ForEach-Object { $_.Trim() }
) -join " / "

if (-not $notes) { $notes = "本次版本更新，請重新整理遊戲以取得最新內容" }

# ── 預覽 ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  版本：$version" -ForegroundColor Yellow
Write-Host "  說明：$notes" -ForegroundColor White
Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$confirm = Read-Host "確定要推撥給所有玩家嗎？(Y/N)"
if ($confirm -ne "Y" -and $confirm -ne "y") {
    Write-Host "已取消。" -ForegroundColor Gray
    exit 0
}

# ── 送出 ─────────────────────────────────────────────────────────────────────
$body = @{ version = $version; notes = $notes } | ConvertTo-Json -Compress

try {
    $resp = Invoke-RestMethod -Method POST -Uri $API_URL `
        -Headers @{ "Content-Type" = "application/json"; "x-admin-secret" = $ADMIN_SECRET } `
        -Body $body
    Write-Host ""
    Write-Host "推撥成功！共推送 $($resp.sent) / $($resp.total) 台裝置" -ForegroundColor Green
} catch {
    Write-Host "推撥失敗：$($_.Exception.Message)" -ForegroundColor Red
}
