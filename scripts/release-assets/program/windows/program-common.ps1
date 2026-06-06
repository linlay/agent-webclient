$ErrorActionPreference = 'Stop'

$Script:ProgramCommonDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Script:BundleRoot = Split-Path -Parent $Script:ProgramCommonDir
$Script:AppName = 'agent-webclient'
$Script:ManifestFile = Join-Path $Script:BundleRoot 'manifest.json'
$Script:EnvExampleFile = Join-Path $Script:BundleRoot '.env.example'
$Script:EnvFile = Join-Path $(if ($env:SERVICE_CONFIG_DIR) { $env:SERVICE_CONFIG_DIR } else { $Script:BundleRoot }) '.env'
$Script:DistDir = Join-Path (Join-Path $Script:BundleRoot 'frontend') 'dist'
$Script:RunDir = if ($env:SERVICE_STATE_DIR) { $env:SERVICE_STATE_DIR } else { Join-Path $Script:BundleRoot 'run' }
$Script:LogDir = if ($env:SERVICE_LOG_DIR) { $env:SERVICE_LOG_DIR } else { $Script:RunDir }

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
  if (-not (Test-Path -LiteralPath $Script:DistDir -PathType Container)) {
    Fail-Program "required directory not found: $Script:DistDir"
  }
  $indexPath = Join-Path $Script:DistDir 'index.html'
  if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
    Fail-Program "required file not found: $indexPath"
  }
}

function Initialize-ProgramConfig {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Script:EnvFile) | Out-Null
  if (-not (Test-Path -LiteralPath $Script:EnvFile -PathType Leaf)) {
    Copy-Item -LiteralPath $Script:EnvExampleFile -Destination $Script:EnvFile
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
}

function Initialize-ProgramRuntime {
  New-Item -ItemType Directory -Force -Path $Script:RunDir, $Script:LogDir | Out-Null
}

function Start-ProgramHostManaged {
  Write-Host "[program-start] $Script:AppName is hosted by ZenMind Desktop"
  Write-Host ("[program-start] endpoint: http://127.0.0.1:{0}/" -f $env:PORT)
}

function Stop-ProgramHostManaged {
  Write-Host "[program-stop] $Script:AppName is hosted by ZenMind Desktop; no child process to stop"
}
