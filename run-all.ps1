$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$outDir = Join-Path $root 'out'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$dashboardUrlFile = Join-Path $outDir 'dashboard-dev-url.txt'
$dashboardStdout = Join-Path $outDir 'dashboard.dev.stdout.log'
$dashboardStderr = Join-Path $outDir 'dashboard.dev.stderr.log'
$electronStdout = Join-Path $outDir 'electron.dev.stdout.log'
$electronStderr = Join-Path $outDir 'electron.dev.stderr.log'
$runnerPidsFile = Join-Path $outDir 'run-all.pids'

Remove-Item $dashboardUrlFile -Force -ErrorAction SilentlyContinue
Remove-Item $dashboardStdout -Force -ErrorAction SilentlyContinue
Remove-Item $dashboardStderr -Force -ErrorAction SilentlyContinue
Remove-Item $electronStdout -Force -ErrorAction SilentlyContinue
Remove-Item $electronStderr -Force -ErrorAction SilentlyContinue
Remove-Item $runnerPidsFile -Force -ErrorAction SilentlyContinue

function Say($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Ok($msg) { Write-Host "[OK]   $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }

function Stop-SagePortListeners {
  $ports = @(3000, 3001, 3002, 3003, 3004, 5173, 7777)
  foreach ($port in $ports) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        Stop-Process -Id ([int]$_.OwningProcess) -Force -ErrorAction Stop
        Warn "stopped listener on :$port (pid $($_.OwningProcess))"
      } catch {
        Warn "could not stop listener on :$port (pid $($_.OwningProcess))"
      }
    }
  }
}

function Stop-RunAllProcesses {
  if (Test-Path $runnerPidsFile) {
    Get-Content $runnerPidsFile | ForEach-Object {
      if ($_ -match '^\d+$') {
        try {
          Stop-Process -Id ([int]$_) -Force -ErrorAction Stop
          Write-Host "[INFO] stopped pid $_" -ForegroundColor DarkCyan
        } catch {
          Write-Host "[INFO] pid $_ already stopped" -ForegroundColor DarkCyan
        }
      }
    }
    Remove-Item $runnerPidsFile -Force -ErrorAction SilentlyContinue
  }

  try {
    & powershell -ExecutionPolicy Bypass -File (Join-Path $root 'backend\scripts\demo-down.ps1') | Out-Null
  } catch {
    Write-Host "[WARN] backend cleanup hit an error: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

try {
  Say 'cleaning up stale Sage ports'
  Stop-RunAllProcesses
  Stop-SagePortListeners

  Say 'starting backend + bridge'
  & powershell -ExecutionPolicy Bypass -File (Join-Path $root 'backend\scripts\demo-up.ps1')
  Ok 'backend + bridge ready'

  Say 'starting dashboard'
  $dashboard = Start-Process -FilePath 'node.exe' `
    -ArgumentList @('scripts/next-on-free-port.cjs', 'dev', '3000') `
    -WorkingDirectory (Join-Path $root 'frontend\dashboard') `
    -RedirectStandardOutput $dashboardStdout `
    -RedirectStandardError $dashboardStderr `
    -PassThru `
    -WindowStyle Hidden
  Add-Content -Path $runnerPidsFile -Value $dashboard.Id

  $dashboardUrl = $null
  for ($i = 0; $i -lt 60; $i++) {
    if ($dashboard.HasExited) {
      throw "dashboard process exited early; see $dashboardStdout and $dashboardStderr"
    }
    if (Test-Path $dashboardUrlFile) {
      $dashboardUrl = (Get-Content $dashboardUrlFile -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
      if ($dashboardUrl) { break }
    }
    Start-Sleep -Milliseconds 500
    $dashboard.Refresh()
  }
  if (-not $dashboardUrl) {
    throw "dashboard URL was not written; see $dashboardStdout"
  }
  Ok "dashboard ready at $dashboardUrl"

  Say 'starting electron'
  $electron = Start-Process -FilePath 'node.exe' `
    -ArgumentList @('scripts/dev-with-status.cjs') `
    -WorkingDirectory (Join-Path $root 'frontend\electron') `
    -RedirectStandardOutput $electronStdout `
    -RedirectStandardError $electronStderr `
    -PassThru `
    -WindowStyle Hidden
  Add-Content -Path $runnerPidsFile -Value $electron.Id
  Ok 'electron dev process started'

  Write-Host ''
  Write-Host 'Sage is up:' -ForegroundColor Green
  Write-Host "Dashboard: $dashboardUrl"
  Write-Host "Dashboard logs: $dashboardStdout"
  Write-Host "Electron logs:  $electronStdout"
  Write-Host ''
  Write-Host 'Press Ctrl+C in this window to stop everything.'

  while ($true) {
    Start-Sleep -Seconds 2
    $dashboard.Refresh()
    $electron.Refresh()
    if ($dashboard.HasExited) {
      throw "dashboard process exited; see $dashboardStdout"
    }
    if ($electron.HasExited) {
      throw "electron process exited; see $electronStdout and $electronStderr"
    }
  }
} finally {
  Stop-RunAllProcesses
}
