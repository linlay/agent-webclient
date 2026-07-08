$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$OutputDir = ''

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
    { $_ -in @('--config-dir', '--data-dir', '--state-dir', '--log-dir', '--port', '--base-url', '--daemon') } {
      Fail-Program "$arg is a start/runtime argument; pass it to start.ps1 instead of deploy.ps1"
    }
    default {
      Fail-Program "unsupported deploy argument: $arg"
    }
  }
}

Assert-DeployArgValue '--output-dir' $OutputDir

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

Write-Host ("[program-deploy] config initialized: {0}" -f $EnvPath)
