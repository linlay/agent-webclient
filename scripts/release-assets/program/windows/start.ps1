$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptDir 'scripts/program-common.ps1')

$Daemon = $false
foreach ($arg in $args) {
  switch ($arg) {
    '--daemon' { $Daemon = $true }
    '-Daemon' { $Daemon = $true }
    default { Fail-Program "unsupported argument: $arg" }
  }
}

Set-Location $ScriptDir
Test-ProgramBundle
Import-ProgramEnv
Initialize-ProgramRuntime
Start-ProgramBackend -Daemon:$Daemon
