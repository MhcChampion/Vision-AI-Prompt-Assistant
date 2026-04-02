[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$appName = "Vision AI Prompt Assistant"
$installRoot = Join-Path $env:LOCALAPPDATA "VisionAI-Prompt-Assistant"
$profileRoot = Join-Path $installRoot "ChromeProfile"
$desktopShortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "$appName.lnk"
$startMenuShortcutPath = Join-Path ([Environment]::GetFolderPath("Programs")) "$appName.lnk"

function Write-Step {
  param([string]$Message)
  Write-Host "[Vision AI] $Message" -ForegroundColor Yellow
}

function Assert-SafeInstallRoot {
  param([string]$TargetPath)

  $resolvedTarget = [System.IO.Path]::GetFullPath($TargetPath)
  $resolvedBase = [System.IO.Path]::GetFullPath($env:LOCALAPPDATA)

  if (-not $resolvedTarget.StartsWith($resolvedBase, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe uninstall path: $resolvedTarget"
  }
}

Write-Step "Removing shortcuts..."
foreach ($shortcutPath in @($desktopShortcutPath, $startMenuShortcutPath)) {
  if (Test-Path -LiteralPath $shortcutPath) {
    Remove-Item -LiteralPath $shortcutPath -Force
  }
}

if (Test-Path -LiteralPath $installRoot) {
  Write-Step "Closing dedicated Chrome processes..."
  $chromeProcesses = Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" | Where-Object {
    $_.CommandLine -like "*$profileRoot*"
  }

  if ($chromeProcesses) {
    $chromeProcesses | Select-Object -ExpandProperty ProcessId | Stop-Process -Force
    Start-Sleep -Seconds 2
  }

  Write-Step "Removing install directory..."
  Assert-SafeInstallRoot -TargetPath $installRoot
  Remove-Item -LiteralPath $installRoot -Recurse -Force
}

Write-Host ""
Write-Host "Uninstall completed successfully." -ForegroundColor Green
Write-Host "If Chrome is still open, close it once and reopen it."
