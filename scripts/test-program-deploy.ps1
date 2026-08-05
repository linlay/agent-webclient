#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AssetsDir = Join-Path $ScriptDir 'release-assets\program\windows'

function Assert-ProgramAcl([string]$Path, [string[]]$RequiredSids, [bool]$RequireProtected = $true) {
  $acl = Get-Acl -LiteralPath $Path
  if ($RequireProtected -and -not $acl.AreAccessRulesProtected) { throw "expected protected ACL: $Path" }
  foreach ($requiredSid in $RequiredSids) {
    $rule = $acl.Access | Where-Object {
      $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -eq $requiredSid -and
        $_.AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and
        ($_.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq
          [System.Security.AccessControl.FileSystemRights]::FullControl
    } | Select-Object -First 1
    if ($null -eq $rule) { throw "expected FullControl for $requiredSid on $Path" }
  }
}

$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("agent-webclient deploy test {0}" -f [Guid]::NewGuid().ToString('N'))
$bundleRoot = Join-Path $testRoot 'program bundle'
$bundleScriptsDir = Join-Path $bundleRoot 'scripts'
$outputDir = Join-Path $testRoot 'CuteJ Data\.cutej\.desktop\config\services\agent-webclient'
$backupDir = Join-Path $testRoot 'backup root\agent-webclient-v0.3.22'
$oldEnvFile = Join-Path $outputDir '.env'
$oldNestedDir = Join-Path $outputDir 'nested'
$oldNestedFile = Join-Path $oldNestedDir 'old-config.yml'
$newEnvFile = Join-Path $outputDir '.env'
$futureFile = Join-Path $outputDir 'runtime-created.yml'
$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$requiredSids = @($currentSid, 'S-1-5-18')

try {
  New-Item -ItemType Directory -Force -Path $bundleScriptsDir, $oldNestedDir | Out-Null
  Copy-Item -LiteralPath (Join-Path $AssetsDir 'deploy.ps1') -Destination $bundleRoot
  Copy-Item -LiteralPath (Join-Path $AssetsDir 'program-common.ps1') -Destination $bundleScriptsDir
  [System.IO.File]::WriteAllText((Join-Path $bundleRoot '.env.example'), "WEBCLIENT_API_BASE_URL=http://127.0.0.1:17078`n")
  [System.IO.File]::WriteAllText($oldEnvFile, "OLD_CONFIG=true`n")
  [System.IO.File]::WriteAllText($oldNestedFile, "old: true`n")

  & (Join-Path $bundleRoot 'deploy.ps1') `
    '--output-dir' $outputDir `
    '--desktop-config-reset' `
    '--desktop-config-backup-dir' $backupDir `
    '--desktop-version-from' 'v0.3.22' `
    '--desktop-version-to' 'v0.3.23'

  $backupEnvFile = Join-Path $backupDir '.env'
  $backupNestedFile = Join-Path $backupDir 'nested\old-config.yml'
  if ([System.IO.File]::ReadAllText($backupEnvFile) -notmatch 'OLD_CONFIG=true') { throw 'backup did not preserve the previous .env' }
  [System.IO.File]::ReadAllText($backupNestedFile) | Out-Null
  if ([System.IO.File]::ReadAllText($newEnvFile) -notmatch 'WEBCLIENT_API_BASE_URL=') { throw 'deploy did not initialize the new .env' }

  foreach ($root in @($backupDir, $outputDir)) {
    foreach ($item in @((Get-Item -LiteralPath $root)) + @(Get-ChildItem -LiteralPath $root -Recurse -Force)) {
      Assert-ProgramAcl $item.FullName $requiredSids
    }
  }

  [System.IO.File]::WriteAllText($futureFile, "created: true`n")
  [System.IO.File]::ReadAllText($futureFile) | Out-Null
  Assert-ProgramAcl $futureFile $requiredSids $false
  Write-Host '[test] agent-webclient deploy preserves readable config ACLs'
} finally {
  if (Test-Path -LiteralPath $testRoot) {
    & icacls.exe $testRoot '/grant' ("*{0}:F" -f $currentSid) '/T' '/C' | Out-Null
    Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
