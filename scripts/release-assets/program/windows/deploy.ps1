$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$OutputDir = ''
$BaseUrl = ''
$Port = ''

function Fail-Program([string]$Message) {
  throw "[program] $Message"
}

function Assert-DeployArgValue([string]$Name, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    Fail-Program "missing required deploy argument: $Name"
  }
}

for ($i = 0; $i -lt $args.Count; $i++) {
  $arg = $args[$i]
  switch ($arg) {
    '--output-dir' {
      if ($i + 1 -ge $args.Count) { Fail-Program 'missing value for --output-dir' }
      $i++
      $OutputDir = $args[$i]
      continue
    }
    '--base-url' {
      if ($i + 1 -ge $args.Count) { Fail-Program 'missing value for --base-url' }
      $i++
      $BaseUrl = $args[$i]
      continue
    }
    '--port' {
      if ($i + 1 -ge $args.Count) { Fail-Program 'missing value for --port' }
      $i++
      $Port = $args[$i]
      continue
    }
    { $_ -in @('--config-dir', '--data-dir', '--state-dir', '--log-dir', '--daemon') } {
      Fail-Program "$arg is a start/runtime argument; pass it to start.ps1 instead of deploy.ps1"
    }
    default {
      Fail-Program "unsupported deploy argument: $arg"
    }
  }
}

Assert-DeployArgValue '--output-dir' $OutputDir
Assert-DeployArgValue '--base-url' $BaseUrl
Assert-DeployArgValue '--port' $Port

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$EnvPath = Join-Path $OutputDir '.env'
if (-not (Test-Path -LiteralPath $EnvPath -PathType Leaf)) {
  $EnvExampleFile = Join-Path $ScriptDir '.env.example'
  if (Test-Path -LiteralPath $EnvExampleFile -PathType Leaf) {
    Copy-Item -LiteralPath $EnvExampleFile -Destination $EnvPath
  } else {
    New-Item -ItemType File -Force -Path $EnvPath | Out-Null
  }
}

$lines = @(Get-Content -LiteralPath $EnvPath | Where-Object {
  $_ -notmatch '^\s*#?\s*(PORT|DESKTOP_APP|BASE_URL)='
})
$lines += @("PORT=$Port", 'DESKTOP_APP=true', "BASE_URL=$BaseUrl")
Set-Content -LiteralPath $EnvPath -Value $lines

Write-Host ("[program-deploy] config initialized: {0}" -f $EnvPath)
