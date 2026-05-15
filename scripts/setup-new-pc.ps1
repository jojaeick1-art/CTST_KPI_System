# 새 PC 1회 설정 (프로젝트 클론 직후)
#   .\scripts\setup-new-pc.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot

Write-Host "==> npm ci" -ForegroundColor Cyan
npm ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not (Test-Path ".env.local")) {
  if (Test-Path ".env.local.example") {
    Copy-Item ".env.local.example" ".env.local"
    Write-Host "`.env.local` 을 생성했습니다. Supabase URL·anon key 를 채워 주세요." -ForegroundColor Yellow
  } else {
    Write-Host ".env.local 을 직접 만들어 주세요." -ForegroundColor Yellow
  }
} else {
  Write-Host ".env.local 이 이미 있습니다." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Supabase CLI 토큰 (1회):" -ForegroundColor Cyan
Write-Host '  $env:SUPABASE_ACCESS_TOKEN = "sbp_..."' 
Write-Host '  [System.Environment]::SetEnvironmentVariable("SUPABASE_ACCESS_TOKEN", "sbp_...", "User")'
Write-Host ""
Write-Host "배포 시:" -ForegroundColor Cyan
Write-Host '  .\scripts\deploy.ps1 -CommitMessage "20260515_5 업데이트"'
