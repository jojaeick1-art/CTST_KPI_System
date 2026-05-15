# CTST KPI System — 로컬 빌드 → Git push → Supabase DB 마이그레이션
# 사용법 (PowerShell, 프로젝트 루트):
#   $env:SUPABASE_ACCESS_TOKEN = "sbp_..."   # 1회만 설정 (저장소에 넣지 마세요)
#   .\scripts\deploy.ps1 -CommitMessage "20260515_5 업데이트"
#
# DB 비밀번호를 묻는 경우:
#   $env:SUPABASE_DB_PASSWORD = "your_db_password"

param(
  [string]$CommitMessage = "",
  [string]$Branch = "main",
  [string]$ProjectRef = "kcwjtoespzeysycqkfzo",
  [switch]$SkipGit,
  [switch]$SkipSupabase
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-LastExit([string]$StepName) {
  if ($LASTEXITCODE -ne 0) {
    throw "$StepName 실패 (exit code $LASTEXITCODE)"
  }
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RepoRoot

Write-Step "프로젝트: $RepoRoot"

if (-not (Test-Path "package.json")) {
  throw "package.json 을 찾을 수 없습니다. 프로젝트 루트에서 실행하세요."
}

if (-not (Test-Path ".env.local")) {
  throw @"
.env.local 이 없습니다. 빌드에 필요합니다.
  1) Copy-Item .env.local.example .env.local
  2) Supabase API URL·anon key 를 채운 뒤 다시 실행하세요.
"@
}

Write-Step "npm ci"
npm ci
Assert-LastExit "npm ci"

Write-Step "npm run build"
npm run build
Assert-LastExit "npm run build"

if (-not $SkipGit) {
  if (-not (Test-Path ".git")) {
    throw "git 저장소가 아닙니다. git init 후 remote 를 연결하세요."
  }

  if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
    $CommitMessage = Read-Host "커밋 메시지를 입력하세요 (예: 20260515_5 업데이트)"
  }
  if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
    throw "커밋 메시지가 비어 있습니다."
  }

  Write-Step "git status"
  git status

  Write-Step "git add ."
  git add .
  Assert-LastExit "git add"

  $staged = git diff --cached --name-only
  if (-not $staged) {
    Write-Host "커밋할 변경 없음 — git commit / push 를 건너뜁니다." -ForegroundColor Yellow
  } else {
    Write-Step "git commit"
    git commit -m $CommitMessage
    Assert-LastExit "git commit"

    Write-Step "git push origin $Branch"
    git push origin $Branch
    Assert-LastExit "git push"
  }
}

if (-not $SkipSupabase) {
  $token = $env:SUPABASE_ACCESS_TOKEN
  if ([string]::IsNullOrWhiteSpace($token)) {
    throw @"
SUPABASE_ACCESS_TOKEN 환경 변수가 없습니다.
  PowerShell (현재 세션):
    `$env:SUPABASE_ACCESS_TOKEN = "sbp_..."
  영구 저장 (사용자 환경 변수, 권장):
    [System.Environment]::SetEnvironmentVariable("SUPABASE_ACCESS_TOKEN", "sbp_...", "User")
  토큰은 Git에 커밋하지 마세요.
"@
  }

  Write-Step "supabase login (token)"
  npx --yes supabase@latest login --token $token
  Assert-LastExit "supabase login"

  $linkedRefPath = Join-Path $RepoRoot "supabase\.temp\project-ref"
  $needsLink = $true
  if (Test-Path $linkedRefPath) {
    $linkedRef = (Get-Content $linkedRefPath -Raw).Trim()
    if ($linkedRef -eq $ProjectRef) {
      $needsLink = $false
      Write-Host "이미 link 됨: $ProjectRef" -ForegroundColor DarkGray
    }
  }

  if ($needsLink) {
    Write-Step "supabase link --project-ref $ProjectRef"
    npx --yes supabase@latest link --project-ref $ProjectRef
    Assert-LastExit "supabase link"
  }

  Write-Step "supabase db push"
  npx --yes supabase@latest db push
  Assert-LastExit "supabase db push"
}

Write-Host ""
Write-Host "완료." -ForegroundColor Green
