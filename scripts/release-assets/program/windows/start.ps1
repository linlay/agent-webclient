$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptDir 'scripts/program-common.ps1')

foreach ($arg in $args) {
  switch ($arg) {
    '--daemon' { continue }
    '-Daemon' { continue }
    default { Fail-Program "unsupported argument: $arg" }
  }
}

Set-Location $ScriptDir
Test-ProgramBundle
Initialize-ProgramConfig
Import-ProgramEnv
Initialize-ProgramRuntime
Start-ProgramHostManaged
