$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptDir 'scripts/program-common.ps1')
$OutputDir = ''
$DesktopConfigReset = $false
$DesktopConfigBackupDir = ''
$DesktopVersionFrom = ''
$DesktopVersionTo = ''

function Fail-Program([string]$Message) {
  throw "[program] $Message"
}

function Assert-DeployArgValue([string]$Name, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    Fail-Program "missing required deploy argument: $Name"
  }
}

function Reset-DesktopProgramConfig([string]$BackupDir) {
  if (-not [System.IO.Path]::IsPathRooted($BackupDir)) { Fail-Program '--desktop-config-backup-dir must be absolute' }
  $configPath = [System.IO.Path]::GetFullPath($OutputDir).TrimEnd('\', '/')
  $backupPath = [System.IO.Path]::GetFullPath($BackupDir).TrimEnd('\', '/')
  if ($backupPath -eq $configPath -or $backupPath.StartsWith($configPath + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    Fail-Program 'Desktop config backup directory must be outside the service config directory'
  }
  $backupParent = Split-Path -Parent $BackupDir
  $failedDir = $BackupDir + '.failed'
  New-Item -ItemType Directory -Force -Path $backupParent | Out-Null
  if (Test-Path -LiteralPath $BackupDir) {
    Remove-Item -LiteralPath $failedDir -Recurse -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $OutputDir) {
      Move-Item -LiteralPath $OutputDir -Destination $failedDir
      Protect-ProgramConfigTree $failedDir
    }
  } elseif (Test-Path -LiteralPath $OutputDir) {
    Move-Item -LiteralPath $OutputDir -Destination $BackupDir
    Protect-ProgramConfigTree $BackupDir
  }
  New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
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
    '--desktop-config-reset' {
      $DesktopConfigReset = $true
      continue
    }
    '--desktop-config-backup-dir' {
      if ($i + 1 -ge $args.Count) { Fail-Program 'missing value for --desktop-config-backup-dir' }
      $i++
      $DesktopConfigBackupDir = $args[$i]
      continue
    }
    '--desktop-version-from' {
      if ($i + 1 -ge $args.Count) { Fail-Program 'missing value for --desktop-version-from' }
      $i++
      $DesktopVersionFrom = $args[$i]
      continue
    }
    '--desktop-version-to' {
      if ($i + 1 -ge $args.Count) { Fail-Program 'missing value for --desktop-version-to' }
      $i++
      $DesktopVersionTo = $args[$i]
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
if ($DesktopConfigReset) {
  Assert-DeployArgValue '--desktop-config-backup-dir' $DesktopConfigBackupDir
  Assert-DeployArgValue '--desktop-version-from' $DesktopVersionFrom
  Assert-DeployArgValue '--desktop-version-to' $DesktopVersionTo
  Reset-DesktopProgramConfig $DesktopConfigBackupDir
}

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
if ($DesktopConfigReset) {
  Protect-ProgramConfigTree $OutputDir
}

Write-Host ("[program-deploy] config initialized: {0}" -f $EnvPath)
if ($DesktopConfigReset) {
  Write-Host "[program-deploy] Desktop config rebuilt: $DesktopVersionFrom -> $DesktopVersionTo"
}
