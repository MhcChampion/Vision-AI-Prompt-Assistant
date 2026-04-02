[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$appName = "Vision AI Prompt Assistant"
$installRoot = Join-Path $env:LOCALAPPDATA "VisionAI-Prompt-Assistant"
$packageRoot = Join-Path $installRoot "Package"
$profileRoot = Join-Path $installRoot "ChromeProfile"
$launcherPath = Join-Path $installRoot "Launch-Vision-AI-Chrome.cmd"
$desktopShortcutPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "$appName.lnk"
$startMenuShortcutPath = Join-Path ([Environment]::GetFolderPath("Programs")) "$appName.lnk"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Step {
  param([string]$Message)
  Write-Host "[Vision AI] $Message" -ForegroundColor Cyan
}

function Get-ChromePath {
  $candidates = New-Object System.Collections.Generic.List[string]

  foreach ($registryRoot in @(
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"
  )) {
    try {
      $value = (Get-ItemProperty -Path $registryRoot -ErrorAction Stop)."(default)"
      if ($value) {
        [void]$candidates.Add($value)
      }
    } catch {
    }
  }

  foreach ($candidate in @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )) {
    if ($candidate) {
      [void]$candidates.Add($candidate)
    }
  }

  try {
    $whereResults = @(where.exe chrome 2>$null)
    foreach ($candidate in $whereResults) {
      if ($candidate) {
        [void]$candidates.Add($candidate)
      }
    }
  } catch {
  }

  foreach ($candidate in $candidates | Select-Object -Unique) {
    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  return $null
}

function Assert-SafeSubPath {
  param(
    [string]$BasePath,
    [string]$TargetPath
  )

  $resolvedBase = [System.IO.Path]::GetFullPath($BasePath)
  $resolvedTarget = [System.IO.Path]::GetFullPath($TargetPath)

  if (-not $resolvedTarget.StartsWith($resolvedBase, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe path: $resolvedTarget"
  }
}

function Copy-PackageFiles {
  param(
    [string]$SourcePath,
    [string]$DestinationPath
  )

  Get-ChildItem -LiteralPath $SourcePath -Force | Where-Object {
    $_.Name -notin @(".idea", ".vscode")
  } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $DestinationPath -Recurse -Force
  }
}

function New-Shortcut {
  param(
    [string]$ShortcutPath,
    [string]$TargetPath,
    [string]$WorkingDirectory,
    [string]$IconLocation
  )

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($ShortcutPath)
  $shortcut.TargetPath = $TargetPath
  $shortcut.WorkingDirectory = $WorkingDirectory
  $shortcut.IconLocation = $IconLocation
  $shortcut.Save()
}

$chromePath = Get-ChromePath
if (-not $chromePath) {
  throw "Google Chrome was not found. Please install Chrome first, then run this installer again."
}

Write-Step "Preparing install directory..."
New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
New-Item -ItemType Directory -Path $profileRoot -Force | Out-Null

if (Test-Path -LiteralPath $packageRoot) {
  Assert-SafeSubPath -BasePath $installRoot -TargetPath $packageRoot
  Remove-Item -LiteralPath $packageRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null

Write-Step "Copying script-edition extension files..."
Copy-PackageFiles -SourcePath $scriptRoot -DestinationPath $packageRoot

Write-Step "Writing launcher..."
$launcherContent = @"
@echo off
setlocal
set "CHROME_PATH=$chromePath"
set "VISION_AI_PACKAGE=$packageRoot"
set "VISION_AI_PROFILE=$profileRoot"

if not exist "%CHROME_PATH%" (
  echo Google Chrome was not found.
  pause
  exit /b 1
)

start "" "%CHROME_PATH%" --user-data-dir="%VISION_AI_PROFILE%" --disable-extensions-except="%VISION_AI_PACKAGE%" --load-extension="%VISION_AI_PACKAGE%" --no-first-run --new-window
endlocal
"@
Set-Content -LiteralPath $launcherPath -Value $launcherContent -Encoding ASCII

Write-Step "Creating Desktop and Start Menu shortcuts..."
New-Shortcut -ShortcutPath $desktopShortcutPath -TargetPath $launcherPath -WorkingDirectory $installRoot -IconLocation "$chromePath,0"
New-Shortcut -ShortcutPath $startMenuShortcutPath -TargetPath $launcherPath -WorkingDirectory $installRoot -IconLocation "$chromePath,0"

Write-Step "Install finished. Launching Chrome with the extension..."
Start-Process -FilePath $launcherPath

Write-Host ""
Write-Host "Install completed successfully." -ForegroundColor Green
Write-Host "Desktop shortcut: $desktopShortcutPath"
Write-Host "Start Menu shortcut: $startMenuShortcutPath"
Write-Host ""
Write-Host "From now on, users can launch the extension by double-clicking the '$appName' shortcut on the Desktop."
