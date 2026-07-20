$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $projectDir ".data"
$logFile = Join-Path $logDir "daily-git-sync.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Set-Location -LiteralPath $projectDir

function Write-SyncLog {
  param([string]$Message)
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
}

try {
  $changes = git status --porcelain
  if (-not $changes) {
    Write-SyncLog "没有待同步改动，跳过。"
    exit 0
  }

  Write-SyncLog "检测到改动，开始运行 npm run check。"
  & npm.cmd run check 2>&1 | Add-Content -LiteralPath $logFile -Encoding UTF8
  if ($LASTEXITCODE -ne 0) {
    throw "测试未通过，已取消本次提交和推送。"
  }

  git add -A
  git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) {
    Write-SyncLog "测试产生的状态无需提交，跳过。"
    exit 0
  }

  $commitMessage = "chore: daily sync $(Get-Date -Format 'yyyy-MM-dd')"
  git commit -m $commitMessage 2>&1 | Add-Content -LiteralPath $logFile -Encoding UTF8
  if ($LASTEXITCODE -ne 0) {
    throw "Git 提交失败。"
  }

  git push origin master 2>&1 | Add-Content -LiteralPath $logFile -Encoding UTF8
  if ($LASTEXITCODE -ne 0) {
    throw "GitHub 推送失败，本地提交已保留。"
  }

  Write-SyncLog "每日同步成功。"
} catch {
  Write-SyncLog "同步失败：$($_.Exception.Message)"
  exit 1
}
