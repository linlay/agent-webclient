$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $ScriptDir 'scripts/program-common.ps1')

Set-Location $ScriptDir
Test-ProgramBundle
Initialize-ProgramRuntime

Write-Host '[program-deploy] bundle validated'
Write-Host ("[program-deploy] backend entry: {0}" -f $Script:BackendEntry)
Write-Host ("[program-deploy] runtime directories prepared under {0}" -f $Script:RunDir)
