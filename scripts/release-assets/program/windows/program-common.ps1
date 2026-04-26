$ErrorActionPreference = 'Stop'

$Script:ProgramCommonDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Script:BundleRoot = Split-Path -Parent $Script:ProgramCommonDir
$Script:AppName = 'agent-webclient'
$Script:ManifestFile = Join-Path $Script:BundleRoot 'manifest.json'
$Script:EnvExampleFile = Join-Path $Script:BundleRoot '.env.example'
$Script:EnvFile = Join-Path $Script:BundleRoot '.env'
$Script:BackendEntry = Join-Path (Join-Path $Script:BundleRoot 'backend') 'server.js'
$Script:BackendPackageFile = Join-Path (Join-Path $Script:BundleRoot 'backend') 'package.json'
$Script:BackendModulesDir = Join-Path (Join-Path $Script:BundleRoot 'backend') 'node_modules'
$Script:DistDir = Join-Path (Join-Path $Script:BundleRoot 'frontend') 'dist'
$Script:RunDir = Join-Path $Script:BundleRoot 'run'
$Script:PidFile = Join-Path $Script:RunDir 'agent-webclient.pid'
$Script:LogFile = Join-Path $Script:RunDir 'agent-webclient.log'
$Script:ErrorLogFile = Join-Path $Script:RunDir 'agent-webclient.stderr.log'

function Fail-Program([string]$Message) {
  throw "[program] $Message"
}

function Test-ProgramBundle {
  if (-not (Test-Path -LiteralPath $Script:ManifestFile -PathType Leaf)) {
    Fail-Program "required file not found: $Script:ManifestFile"
  }
  if (-not (Test-Path -LiteralPath $Script:EnvExampleFile -PathType Leaf)) {
    Fail-Program "required file not found: $Script:EnvExampleFile"
  }
  if (-not (Test-Path -LiteralPath $Script:BackendEntry -PathType Leaf)) {
    Fail-Program "required file not found: $Script:BackendEntry"
  }
  if (-not (Test-Path -LiteralPath $Script:BackendPackageFile -PathType Leaf)) {
    Fail-Program "required file not found: $Script:BackendPackageFile"
  }
  if (-not (Test-Path -LiteralPath $Script:BackendModulesDir -PathType Container)) {
    Fail-Program "required directory not found: $Script:BackendModulesDir"
  }
  if (-not (Test-Path -LiteralPath $Script:DistDir -PathType Container)) {
    Fail-Program "required directory not found: $Script:DistDir"
  }
  $indexPath = Join-Path $Script:DistDir 'index.html'
  if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
    Fail-Program "required file not found: $indexPath"
  }
}

function Import-ProgramEnv {
  if (-not (Test-Path -LiteralPath $Script:EnvFile -PathType Leaf)) {
    Fail-Program 'missing .env (copy from .env.example first)'
  }
  foreach ($rawLine in Get-Content -LiteralPath $Script:EnvFile) {
    $line = $rawLine.Trim()
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) {
      continue
    }
    $index = $line.IndexOf('=')
    if ($index -lt 1) {
      continue
    }
    $name = $line.Substring(0, $index).Trim()
    $value = $line.Substring($index + 1).Trim()
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
  }
  if (-not $env:PORT) {
    $env:PORT = '11948'
  }
  if (-not $env:BASE_URL) {
    $env:BASE_URL = 'http://127.0.0.1:11949'
  }
  if (-not $env:WS_BASE_URL) {
    $env:WS_BASE_URL = $env:BASE_URL
  }
  if (-not $env:VOICE_BASE_URL) {
    $env:VOICE_BASE_URL = $env:BASE_URL
  }
}

function Resolve-NodeBin {
  if ($env:NODE_BIN) {
    if (-not (Test-Path -LiteralPath $env:NODE_BIN -PathType Leaf)) {
      Fail-Program "NODE_BIN not found: $env:NODE_BIN"
    }
    $env:ELECTRON_RUN_AS_NODE = '1'
    return $env:NODE_BIN
  }

  try {
    $nodeCommand = Get-Command node -ErrorAction Stop
  } catch {
    Fail-Program 'node runtime not found; install Node.js 18+ or set NODE_BIN in .env'
  }

  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  return $nodeCommand.Source
}

function Initialize-ProgramRuntime {
  New-Item -ItemType Directory -Force -Path $Script:RunDir | Out-Null
}

function Clear-StaleProgramPid {
  if (-not (Test-Path -LiteralPath $Script:PidFile -PathType Leaf)) {
    return
  }

  $pidValue = (Get-Content -LiteralPath $Script:PidFile -Raw).Trim()
  if (-not [string]::IsNullOrWhiteSpace($pidValue)) {
    try {
      $null = Get-Process -Id ([int]$pidValue) -ErrorAction Stop
      Fail-Program "$Script:AppName is already running with pid $pidValue"
    } catch [Microsoft.PowerShell.Commands.ProcessCommandException] {
      Remove-Item -LiteralPath $Script:PidFile -Force -ErrorAction SilentlyContinue
      return
    }
  }

  Remove-Item -LiteralPath $Script:PidFile -Force -ErrorAction SilentlyContinue
}

function Start-ProgramBackend {
  param(
    [switch]$Daemon
  )

  $nodeBin = Resolve-NodeBin

  if ($Daemon) {
    Clear-StaleProgramPid
    if (Test-Path -LiteralPath $Script:LogFile) {
      Clear-Content -LiteralPath $Script:LogFile
    } else {
      New-Item -ItemType File -Path $Script:LogFile -Force | Out-Null
    }
    if (Test-Path -LiteralPath $Script:ErrorLogFile) {
      Clear-Content -LiteralPath $Script:ErrorLogFile
    } else {
      New-Item -ItemType File -Path $Script:ErrorLogFile -Force | Out-Null
    }

    $proc = Start-Process -FilePath $nodeBin -ArgumentList @("`"$($Script:BackendEntry)`"") -WorkingDirectory $Script:BundleRoot -WindowStyle Hidden -RedirectStandardOutput $Script:LogFile -RedirectStandardError $Script:ErrorLogFile -PassThru
    $proc.Id | Set-Content -LiteralPath $Script:PidFile
    Start-Sleep -Seconds 1
    if ($proc.HasExited) {
      Remove-Item -LiteralPath $Script:PidFile -Force -ErrorAction SilentlyContinue
      Fail-Program "backend failed to start; see $Script:LogFile and $Script:ErrorLogFile"
    }
    Write-Host "[program-start] started $Script:AppName in daemon mode (pid=$($proc.Id))"
    Write-Host "[program-start] log file: $Script:LogFile"
    Write-Host "[program-start] stderr file: $Script:ErrorLogFile"
    return
  }

  & $nodeBin $Script:BackendEntry
}

function Stop-ProgramBackend {
  if (-not (Test-Path -LiteralPath $Script:PidFile -PathType Leaf)) {
    Write-Host "[program-stop] pid file not found: $Script:PidFile"
    return
  }

  $pidValue = (Get-Content -LiteralPath $Script:PidFile -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($pidValue)) {
    Fail-Program "pid file is empty: $Script:PidFile"
  }

  try {
    $proc = Get-Process -Id ([int]$pidValue) -ErrorAction Stop
  } catch [Microsoft.PowerShell.Commands.ProcessCommandException] {
    Remove-Item -LiteralPath $Script:PidFile -Force -ErrorAction SilentlyContinue
    Write-Host "[program-stop] process $pidValue is not running; removed stale pid file"
    return
  }

  Stop-Process -Id $proc.Id -ErrorAction Stop
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if ($proc.HasExited) {
      Remove-Item -LiteralPath $Script:PidFile -Force -ErrorAction SilentlyContinue
      Write-Host "[program-stop] stopped $Script:AppName (pid=$($proc.Id))"
      return
    }
    $proc.Refresh()
  }

  Fail-Program "process $($proc.Id) did not stop within 30s"
}
