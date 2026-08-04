$ErrorActionPreference = 'Stop'

# Desktop hosts agent-webclient directly; this file also owns shared deploy helpers.
function Protect-ProgramConfigTree([string]$Target) {
  if (-not (Test-Path -LiteralPath $Target)) { return }
  $identity = '*' + [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $items = @((Get-Item -LiteralPath $Target -Force)) + @(Get-ChildItem -LiteralPath $Target -Recurse -Force)
  foreach ($item in $items) {
    $permissions = if ($item.PSIsContainer) { '(OI)(CI)F' } else { 'F' }
    & icacls.exe $item.FullName '/inheritance:r' '/grant:r' ("{0}:{1}" -f $identity, $permissions) ("*S-1-5-18:{0}" -f $permissions) | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail-Program "failed to restrict permissions for $($item.FullName)" }
  }
}
