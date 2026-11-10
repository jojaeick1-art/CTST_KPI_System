# CTST KPI System — 원클릭 배포
#   빌드 → git commit/push (Vercel 자동 배포) → Supabase 마이그레이션 적용
#
# 보통은 프로젝트 루트의 "KPI배포실행.bat" 을 더블클릭해서 실행합니다.
# 직접 실행:
#   .\scripts\deploy.ps1                      # 전체 배포 (커밋 메시지 자동: YYYYMMDD_N 업데이트)
#   .\scripts\deploy.ps1 -CommitMessage "..."  # 커밋 메시지 지정
#   .\scripts\deploy.ps1 -DryRun               # 빌드 + 마이그레이션 미리보기만 (커밋/푸시/DB 반영 안 함)
#
# Supabase 토큰(sbp_...)은 최초 1회 입력하면 Windows 사용자 환경 변수에 저장됩니다.
# 토큰을 이 파일이나 저장소에 적지 마세요.

param(
  [string]$CommitMessage = "",
  [string]$Branch = "main",
  [string]$ProjectRef = "kcwjtoespzeysycqkfzo",
  [string]$SupabaseCli = "supabase@3.1.0",
  [switch]$SkipGit,
  [switch]$SkipSupabase,
  [switch]$DryRun
)

# npm/git 등이 stderr 로 쓰는 경고가 오류로 취급되지 않도록 Continue 사용.
# 성공 여부는 각 단계의 exit code(Assert-LastExit)와 throw 로 판단한다.
$ErrorActionPreference = "Continue"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-LastExit([string]$StepName) {
  if ($LASTEXITCODE -ne 0) {
    throw "$StepName 실패 (exit code $LASTEXITCODE)"
  }
}

function Get-SupabaseToken {
  if (-not [string]::IsNullOrWhiteSpace($env:SUPABASE_ACCESS_TOKEN)) {
    return $env:SUPABASE_ACCESS_TOKEN
  }
  $saved = [Environment]::GetEnvironmentVariable("SUPABASE_ACCESS_TOKEN", "User")
  if (-not [string]::IsNullOrWhiteSpace($saved)) {
    return $saved
  }

  Write-Host ""
  Write-Host "Supabase 액세스 토큰이 없습니다. (최초 1회만 입력)" -ForegroundColor Yellow
  Write-Host "  Supabase 대시보드 → Account → Access Tokens 에서 발급한 sbp_... 값을 붙여넣으세요."
  $secure = Read-Host "SUPABASE_ACCESS_TOKEN" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim()
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  if (-not $plain.StartsWith("sbp_")) {
    throw "토큰 형식이 올바르지 않습니다 (sbp_ 로 시작해야 함)."
  }
  [Environment]::SetEnvironmentVariable("SUPABASE_ACCESS_TOKEN", $plain, "User")
  Write-Host "토큰을 사용자 환경 변수에 저장했습니다. 다음부터는 묻지 않습니다." -ForegroundColor DarkGray
  return $plain
}

function Get-AutoCommitMessage {
  $today = Get-Date -Format "yyyyMMdd"
  $subjects = @(git log --since="3 months ago" --pretty=format:%s 2>$null)
  $max = 0
  foreach ($s in $subjects) {
    if ($s -match "^$today`_(\d+)") {
      $n = [int]$Matches[1]
      if ($n -gt $max) { $max = $n }
    }
  }
  return "${today}_$($max + 1) 업데이트"
}

function Stop-ProjectNodeProcesses([string]$Root) {
  # 이 프로젝트에서 띄운 next dev 등이 node_modules 파일을 잡고 있으면 npm ci 가 EPERM 으로 실패함
  $procs = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Root) }
  foreach ($p in $procs) {
    Write-Host "실행 중인 프로젝트 node 프로세스 종료: PID $($p.ProcessId)" -ForegroundColor DarkGray
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot
Write-Step "프로젝트: $RepoRoot"

if (-not (Test-Path "package.json")) {
  throw "package.json 을 찾을 수 없습니다."
}
if (-not (Test-Path ".env.local")) {
  throw ".env.local 이 없습니다. .env.local.example 을 복사해 Supabase URL/키를 채운 뒤 다시 실행하세요."
}

# 토큰은 빌드 전에 확보 (중간에 멈추지 않도록)
$token = $null
if (-not $SkipSupabase) {
  $token = Get-SupabaseToken
}

Stop-ProjectNodeProcesses $RepoRoot

Write-Step "npm ci"
npm ci
Assert-LastExit "npm ci"

Write-Step "npm run build"
npm run build
Assert-LastExit "npm run build"

if (-not $SkipGit) {
  Write-Step "git status"
  git status --short

  if ($DryRun) {
    Write-Host "(DryRun) 커밋/푸시는 건너뜁니다." -ForegroundColor Yellow
  } else {
    git add .
    Assert-LastExit "git add"

    $staged = git diff --cached --name-only
    if ($staged) {
      if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
        $CommitMessage = Get-AutoCommitMessage
      }
      Write-Step "git commit -m `"$CommitMessage`""
      git commit -m $CommitMessage
      Assert-LastExit "git commit"
    } else {
      Write-Host "새로 커밋할 변경 없음" -ForegroundColor DarkGray
    }

    # 아직 올라가지 않은 커밋이 있으면 함께 푸시됨 (없으면 Everything up-to-date)
    Write-Step "git push origin $Branch  (Vercel 자동 배포)"
    git push origin $Branch
    Assert-LastExit "git push"
  }
}

if (-not $SkipSupabase) {
  $env:SUPABASE_ACCESS_TOKEN = $token
  if ($DryRun) {
    Write-Step "supabase db push --dry-run (원격: $ProjectRef)"
    npx --yes $SupabaseCli db push --remote=$ProjectRef --dry-run
  } else {
    Write-Step "supabase db push (원격: $ProjectRef)"
    npx --yes $SupabaseCli db push --remote=$ProjectRef --yes
  }
  Assert-LastExit "supabase db push"
}

Write-Host ""
Write-Host "배포 완료." -ForegroundColor Green
