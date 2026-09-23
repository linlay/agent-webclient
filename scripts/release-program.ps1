#Requires -Version 5.1
param(
    [string]$Version,
    [string]$Arch,
    [string]$ProgramTargets = $env:PROGRAM_TARGETS,
    [string]$ProgramTargetMatrix = $env:PROGRAM_TARGET_MATRIX
)

$ErrorActionPreference = "Stop"
$AppName = "agent-webclient"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$AssetsDir = Join-Path $ScriptDir "release-assets/program/windows"
$TemplatePath = Join-Path $ScriptDir "release-assets/program/manifest.template.json"
$Renderer = Join-Path $ScriptDir "render-program-manifest.mjs"
$DeployTestPath = Join-Path $ScriptDir "test-program-deploy.ps1"
$DesktopContractChecker = Join-Path $ScriptDir "check-agent-webclient-contract.js"
$FeatureBoundaryChecker = Join-Path $ScriptDir "check-feature-boundaries.js"
$BuildWorkspacePreparer = Join-Path $ScriptDir "prepare-release-build-cache.js"
$ReleaseDir = Join-Path $RepoRoot "dist/release"
$Utf8NoBom = New-Object Text.UTF8Encoding($false)

function Get-HostArch {
    if ($env:PROCESSOR_ARCHITECTURE -in @("AMD64", "x86")) { return "amd64" }
    throw "This release entry supports Windows AMD64 only"
}

function Get-Targets {
    $resolved = @()
    if ($ProgramTargetMatrix) {
        foreach ($entry in $ProgramTargetMatrix.Split(',')) {
            $parts = $entry.Trim().Split('/')
            if ($parts.Count -ne 2) { throw "PROGRAM_TARGET_MATRIX entries must be os/arch (got: $entry)" }
            $resolved += [PSCustomObject]@{ OS = $parts[0]; Arch = $parts[1] }
        }
    } elseif ($ProgramTargets) {
        foreach ($targetOS in $ProgramTargets.Split(',')) {
            $resolved += [PSCustomObject]@{ OS = $targetOS.Trim(); Arch = $Arch }
        }
    } else {
        $resolved += [PSCustomObject]@{ OS = "windows"; Arch = $Arch }
    }
    foreach ($pair in $resolved) {
        if ($pair.OS -ne "windows" -or $pair.Arch -ne "amd64") {
            throw "Native PowerShell Program Bundle supports windows/amd64 only (got: $($pair.OS)/$($pair.Arch))"
        }
    }
    return $resolved
}

function Test-Bundle {
    param([string]$BundleRoot, [string]$Archive)
    $manifest = Get-Content -LiteralPath (Join-Path $BundleRoot "manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($relative in @($manifest.runtime.requiredPaths)) {
        $path = $BundleRoot
        foreach ($segment in ([string]$relative).Split('/')) { $path = Join-Path $path $segment }
        if (-not (Test-Path -LiteralPath $path)) { throw "Bundle required path is missing: $relative" }
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
    try {
        foreach ($entry in $zip.Entries) {
            $entryPath = $entry.FullName.Replace("\", "/")
            if (-not $entryPath.StartsWith("$AppName/")) { throw "ZIP contains an entry outside $AppName/: $($entry.FullName)" }
        }
    } finally { $zip.Dispose() }
}

if (-not $Version) { $Version = if ($env:VERSION) { $env:VERSION } else { (Get-Content -LiteralPath (Join-Path $RepoRoot "VERSION") -Raw).Trim() } }
if ($Version -notmatch '^v[0-9]+\.[0-9]+\.[0-9]+$') { throw "VERSION must match vX.Y.Z (got: $Version)" }
if (-not $Arch) { $Arch = if ($env:ARCH) { $env:ARCH } else { Get-HostArch } }
foreach ($command in @("node", "npm")) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "$command is required" }
}
if (-not (Test-Path -LiteralPath $FeatureBoundaryChecker -PathType Leaf)) {
    throw "Required release input is missing: $FeatureBoundaryChecker"
}
foreach ($path in @($TemplatePath, $Renderer, $DeployTestPath, $DesktopContractChecker, $BuildWorkspacePreparer, (Join-Path $RepoRoot "package.json"), (Join-Path $RepoRoot ".env.example"), (Join-Path $RepoRoot "public"), (Join-Path $RepoRoot "src"))) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Required release input is missing: $path" }
}
foreach ($name in @("webpack.config.js", "tsconfig.json", "postcss.config.js")) {
    $path = Join-Path $RepoRoot $name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required release input is missing: $path" }
}
foreach ($name in @("deploy.ps1", "start.ps1", "stop.ps1", "program-common.ps1")) {
    $path = Join-Path $AssetsDir $name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required release input is missing: $path" }
}

foreach ($pair in @(Get-Targets)) {
    $archive = Join-Path $ReleaseDir "$AppName-$Version-$($pair.OS)-$($pair.Arch).zip"
    if (Test-Path -LiteralPath $archive) { throw "Release already exists: $archive; choose a new VERSION" }
}

& $DeployTestPath

$Temporary = Join-Path ([IO.Path]::GetTempPath()) "$AppName-build.$([Guid]::NewGuid().ToString('N'))"
$ConfiguredBuildCacheRoot = [string]$env:AGENT_WEBCLIENT_BUILD_CACHE_DIR
if ($ConfiguredBuildCacheRoot.Trim()) {
    $BuildCacheRoot = [IO.Path]::GetFullPath($ConfiguredBuildCacheRoot.Trim())
} else {
    $LocalCacheRoot = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
    if (-not $LocalCacheRoot) { $LocalCacheRoot = [IO.Path]::GetTempPath() }
    $BuildCacheRoot = Join-Path $LocalCacheRoot "ZenMind/build-cache/$AppName"
}
$BuildRoot = Join-Path $BuildCacheRoot "build"
try {
    New-Item -ItemType Directory -Path $Temporary -Force | Out-Null
    Write-Host "[release] preparing cached frontend workspace: $BuildRoot"
    & node $BuildWorkspacePreparer --source $RepoRoot --build $BuildRoot
    if ($LASTEXITCODE -ne 0) { throw "frontend build cache preparation failed" }
    Push-Location $BuildRoot
    try {
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm build failed" }
    } finally { Pop-Location }
    if (-not (Test-Path -LiteralPath (Join-Path $BuildRoot "dist/index.html") -PathType Leaf)) {
        throw "Frontend build did not produce dist/index.html"
    }

    foreach ($pair in @(Get-Targets)) {
        $archiveName = "$AppName-$Version-$($pair.OS)-$($pair.Arch).zip"
        $archive = Join-Path $ReleaseDir $archiveName
        $stageRoot = Join-Path $Temporary "stage-$($pair.OS)-$($pair.Arch)"
        $bundleRoot = Join-Path $stageRoot $AppName
        New-Item -ItemType Directory -Path (Join-Path $bundleRoot "frontend/dist") -Force | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $bundleRoot "scripts") -Force | Out-Null
        New-Item -ItemType Directory -Path $ReleaseDir -Force | Out-Null
        Copy-Item (Join-Path $BuildRoot "dist/*") (Join-Path $bundleRoot "frontend/dist") -Recurse -Force
        Copy-Item (Join-Path $RepoRoot ".env.example") (Join-Path $bundleRoot ".env.example")
        Copy-Item (Join-Path $AssetsDir "deploy.ps1") $bundleRoot
        Copy-Item (Join-Path $AssetsDir "start.ps1") $bundleRoot
        Copy-Item (Join-Path $AssetsDir "stop.ps1") $bundleRoot
        Copy-Item (Join-Path $AssetsDir "program-common.ps1") (Join-Path $bundleRoot "scripts")
        & node $Renderer --template $TemplatePath --output (Join-Path $bundleRoot "manifest.json") --version $Version --os $pair.OS --arch $pair.Arch --asset $archiveName
        if ($LASTEXITCODE -ne 0) { throw "Manifest rendering failed" }

        Add-Type -AssemblyName System.IO.Compression.FileSystem
        if (Test-Path -LiteralPath $archive) { throw "Release already exists: $archive; choose a new VERSION" }
        [IO.Compression.ZipFile]::CreateFromDirectory($stageRoot, $archive, [IO.Compression.CompressionLevel]::Optimal, $false)
        Test-Bundle -BundleRoot $bundleRoot -Archive $archive
        $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
        [IO.File]::WriteAllText("$archive.sha256", "$hash  $archiveName`n", $Utf8NoBom)
        Write-Host "[release] done: $archive"
    }
} finally {
    Remove-Item -LiteralPath $Temporary -Recurse -Force -ErrorAction SilentlyContinue
}
