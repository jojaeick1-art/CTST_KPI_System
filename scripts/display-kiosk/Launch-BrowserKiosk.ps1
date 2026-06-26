# CTST KPI 전시 - Chrome (Node / Python 불필요)
# 브라우저에 저장된 계정/세션으로 로그인합니다. ID/PW 자동 입력은 하지 않습니다.
param(
    [ValidateSet("Chrome", "Edge")]
    [string]$Browser = "Chrome",
    [switch]$Setup
)

$ErrorActionPreference = "Stop"

$BaseUrl = "https://ctst-kpi-system.vercel.app"
$LoginUrl = "$BaseUrl/login?next=/display"
$DisplayUrl = "$BaseUrl/display"

$BrowserProfiles = @{
    Chrome = @{
        ProcessName    = "chrome"
        ProfileDir     = Join-Path $env:LOCALAPPDATA "CTST-KPI-Display\ChromeProfile"
        ExePaths       = @(
            "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
            "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
            "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
        )
        MissingMessage = "Google Chrome 을 찾을 수 없습니다. Chrome 을 설치한 뒤 다시 실행하세요."
    }
    Edge = @{
        ProcessName    = "msedge"
        ProfileDir     = Join-Path $env:LOCALAPPDATA "CTST-KPI-Display\EdgeProfile"
        ExePaths       = @(
            "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
            "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
        )
        MissingMessage = "Microsoft Edge 를 찾을 수 없습니다. Edge 를 설치한 뒤 다시 실행하세요."
    }
}

$Selected = $BrowserProfiles[$Browser]
$ProfileDir = $Selected.ProfileDir
$MarkerFile = Join-Path $ProfileDir ".session-ready"
$ProcessName = $Selected.ProcessName

if (-not ([System.Management.Automation.PSTypeName]"CtstBrowserWin32").Type) {
    $win32Type = @'
using System;
using System.Runtime.InteropServices;

public static class CtstBrowserWin32 {
    public const int SW_MAXIMIZE = 3;

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    public const byte VK_F11 = 0x7A;
    public const uint KEYEVENTF_KEYUP = 0x0002;
}
'@
    Add-Type -TypeDefinition $win32Type
}

function Find-BrowserExe {
    foreach ($path in $Selected.ExePaths) {
        if (Test-Path $path) { return $path }
    }
    throw $Selected.MissingMessage
}

function Get-PrimaryScreenSize {
    Add-Type -AssemblyName System.Windows.Forms
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    return @{
        Width  = [int]$bounds.Width
        Height = [int]$bounds.Height
    }
}

function Send-F11ToWindow {
    param([IntPtr]$WindowHandle)

    [void][CtstBrowserWin32]::ShowWindow($WindowHandle, [CtstBrowserWin32]::SW_MAXIMIZE)
    Start-Sleep -Milliseconds 350
    [void][CtstBrowserWin32]::SetForegroundWindow($WindowHandle)
    Start-Sleep -Milliseconds 350
    [CtstBrowserWin32]::keybd_event([CtstBrowserWin32]::VK_F11, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 80
    [CtstBrowserWin32]::keybd_event([CtstBrowserWin32]::VK_F11, 0, [CtstBrowserWin32]::KEYEVENTF_KEYUP, [UIntPtr]::Zero)
}

function Enter-BrowserFullscreen {
    param(
        [System.Diagnostics.Process]$BrowserProcess,
        [int]$RetryCount = 24,
        [int]$RetryDelayMs = 500
    )

    $launchTime = $BrowserProcess.StartTime.AddSeconds(-3)

    for ($i = 0; $i -lt $RetryCount; $i++) {
        Start-Sleep -Milliseconds $RetryDelayMs

        $window = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
            Where-Object {
                $_.MainWindowHandle -ne [IntPtr]::Zero -and
                $_.StartTime -ge $launchTime
            } |
            Sort-Object StartTime -Descending |
            Select-Object -First 1

        if ($null -ne $window) {
            Send-F11ToWindow -WindowHandle $window.MainWindowHandle
            return $true
        }
    }

    return $false
}

function Start-Browser {
    param([string]$Url)

    $exe = Find-BrowserExe
    if (-not (Test-Path $ProfileDir)) {
        New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null
    }

    $screen = Get-PrimaryScreenSize
    $browserArgs = @(
        "--user-data-dir=$ProfileDir",
        "--no-first-run",
        "--disable-sync",
        "--disable-session-crashed-bubble",
        "--autoplay-policy=no-user-gesture-required",
        "--window-position=0,0",
        "--window-size=$($screen.Width),$($screen.Height)",
        "--start-maximized",
        "--new-window",
        $Url
    )

    return Start-Process -FilePath $exe -ArgumentList $browserArgs -PassThru
}

function Mark-SessionReady {
    if (-not (Test-Path $ProfileDir)) {
        New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null
    }
    New-Item -ItemType File -Path $MarkerFile -Force | Out-Null
}

function Show-SetupGuide {
    Write-Host ""
    Write-Host "=== 최초 1회 설정 ===" -ForegroundColor Cyan
    Write-Host "1. Chrome 로그인 창에서 ID / 비밀번호를 직접 입력하세요."
    Write-Host "2. 'ID 저장' 을 체크하세요."
    Write-Host "3. Chrome 이 '비밀번호 저장' 을 물으면 [저장] 을 누르세요."
    Write-Host "4. 로그인 후 전시 화면(/display)이 보이면 이 검은 창으로 돌아와 Enter 를 누르세요."
    Write-Host ""
}

if ($Browser -eq "Chrome") {
    $browserLabel = "Chrome"
} else {
    $browserLabel = "Edge"
}

Write-Host "브라우저: $browserLabel" -ForegroundColor DarkGray

if ($Setup) {
    if (Test-Path $MarkerFile) { Remove-Item $MarkerFile -Force }
}

# 설정 완료 후: 저장된 Chrome 세션으로 /display 바로 열기
if ((Test-Path $MarkerFile) -and (-not $Setup)) {
    Write-Host "저장된 로그인 세션으로 전시 화면을 엽니다..." -ForegroundColor Green
    $proc = Start-Browser -Url $DisplayUrl
    Start-Sleep -Seconds 3
    if (-not (Enter-BrowserFullscreen -BrowserProcess $proc)) {
        Write-Host "전체화면 적용에 실패했습니다. $browserLabel 창을 클릭한 뒤 F11 을 눌러 주세요." -ForegroundColor Yellow
    }
    exit 0
}

# 최초 설정: 로그인 페이지 열고 사용자가 직접 로그인 + 계정 저장
Show-SetupGuide
$proc = Start-Browser -Url $LoginUrl
$null = Read-Host "전시 화면이 보이면 Enter"

Write-Host "창 최대화 후 전체화면(F11) 적용 중..." -ForegroundColor Cyan
$fullscreenOk = Enter-BrowserFullscreen -BrowserProcess $proc
if (-not $fullscreenOk) {
    Write-Host "자동 전체화면에 실패했습니다. $browserLabel 창을 클릭한 뒤 F11 을 한 번 눌러 주세요." -ForegroundColor Yellow
}

Mark-SessionReady
Write-Host ""
Write-Host "설정 완료. 다음부터는 KPI전시실행.bat 만 실행하세요." -ForegroundColor Green
