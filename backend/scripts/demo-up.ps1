# Bring both Sage backend processes up on Windows.
# Mirrors demo-up.sh - logs tailed into out/demo.log; PIDs tracked in out/demo.pids.

$ErrorActionPreference = 'Stop'
$root = Resolve-Path "$PSScriptRoot/../.."
Set-Location $root

$out  = Join-Path $root 'out'
New-Item -ItemType Directory -Path $out -Force | Out-Null
$pyOut = Join-Path $out 'demo-python.out.log'
$pyErr = Join-Path $out 'demo-python.err.log'
$bridgeOut = Join-Path $out 'demo-bridge.out.log'
$bridgeErr = Join-Path $out 'demo-bridge.err.log'
$pids = Join-Path $out 'demo.pids'
Set-Content -Path $pyOut -Value '' -Encoding utf8
Set-Content -Path $pyErr -Value '' -Encoding utf8
Set-Content -Path $bridgeOut -Value '' -Encoding utf8
Set-Content -Path $bridgeErr -Value '' -Encoding utf8
Set-Content -Path $pids -Value '' -Encoding utf8

# Load .env into process environment when present.
$envFile = Join-Path $root '.env'
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $idx = $line.IndexOf('=')
    if ($idx -le 0) { return }
    $key = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
    if ([string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($key, 'Process'))) {
      [Environment]::SetEnvironmentVariable($key, $val, 'Process')
    }
  }
}

function Say($msg)  { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "[OK] $msg" -ForegroundColor Green }
function Bad($msg)  { Write-Host "[ERR] $msg" -ForegroundColor Red }
function Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }

function Stop-PortListeners($ports) {
  foreach ($port in $ports) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction Stop
        Warn "stopped stale listener on :$port (pid $($_.OwningProcess))"
      } catch {
        Warn "could not stop stale listener on :$port (pid $($_.OwningProcess))"
      }
    }
  }
}

Stop-PortListeners @(3001, 7777)

# start python orchestrator
Say 'starting python orchestrator on :7777'
$pythonExe = Join-Path $root '.venv\Scripts\python.exe'
if (-not (Test-Path $pythonExe)) { $pythonExe = 'python' }
$py = Start-Process -FilePath $pythonExe `
  -ArgumentList @('-m', 'uvicorn', 'sage.app:app', '--app-dir', 'backend/py/src', '--port', '7777') `
  -RedirectStandardOutput $pyOut `
  -RedirectStandardError $pyErr `
  -PassThru -NoNewWindow
Add-Content -Path $pids -Value $py.Id

# start node bridge
$stagehandEnv = if ($env:STAGEHAND_ENV) {
  $env:STAGEHAND_ENV
} elseif ($env:BROWSERBASE_API_KEY) {
  'BROWSERBASE'
} else {
  'LOCAL'
}
Say "starting node bridge on :3001 (STAGEHAND_ENV=$stagehandEnv)"
$env:STAGEHAND_ENV = $stagehandEnv
$node = Start-Process -FilePath 'node' `
  -ArgumentList @('backend/node/src/bridge.js') `
  -RedirectStandardOutput $bridgeOut `
  -RedirectStandardError $bridgeErr `
  -PassThru -NoNewWindow
Add-Content -Path $pids -Value $node.Id

# wait for health
function WaitHealthy($url, $name) {
  for ($i = 0; $i -lt 60; $i++) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -eq 200) { Ok "$name healthy"; return $true }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  Bad "$name never came healthy at $url - see $pyOut / $pyErr / $bridgeOut / $bridgeErr"
  return $false
}

if (-not (WaitHealthy 'http://127.0.0.1:7777/health' 'python')) { exit 1 }
if (-not (WaitHealthy 'http://127.0.0.1:3001/health' 'bridge')) { exit 1 }

Write-Host ''
Write-Host "python logs: Get-Content $pyOut -Wait"
Write-Host "bridge logs: Get-Content $bridgeOut -Wait"
Write-Host "to stop:        powershell -File backend/scripts/demo-down.ps1"
