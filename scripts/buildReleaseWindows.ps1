<#
.SYNOPSIS
  Builds the Android release APK on a Windows workstation.

.DESCRIPTION
  This is the pinned Windows release route. Three constraints shape it:

  * CMake refuses object paths beyond 250 characters (`CMAKE_OBJECT_PATH_MAX`), and a pnpm
    store under a deep checkout exceeds that before any source file is added. The build
    therefore runs from a short mirror directory; `pnpm install` inside it links from the local
    store, and the APK is copied back to the checkout.
  * Visual Studio ships an `lld.exe` that defaults to the COFF flavour and rejects the NDK's
    ELF link flags (`-z`, `--no-rosegment`, `--no-undefined-version`). Its LLVM directory is
    dropped from PATH so clang resolves the NDK's own `ld.lld.exe`. Without this, the first
    CMake configure of any native module fails with "lld: error: unknown argument: -z".
  * JDK 21 is the tested toolchain. JDK 23 resolves the same CMake projects with a host
    linker and produces the same symptom.

  The mirror keeps its own `android/` project and Gradle state, so only the first build in a
  mirror has to configure the native modules. Later builds reuse that state.

.PARAMETER SkipSync
  Build from the mirror as it is, without mirroring the checkout again.

.PARAMETER Fast
  Skip `lintVital` and reuse Gradle's build cache. Use it while iterating on JavaScript; drop it
  for the package that gets distributed.

.EXAMPLE
  pwsh scripts/buildReleaseWindows.ps1

.EXAMPLE
  pwsh scripts/buildReleaseWindows.ps1 -SkipSync -Fast
#>
param(
  [string]$Mirror = 'D:\cherry-build',
  [string]$Sdk = 'D:\Code_Development\Android',
  [string]$Jdk = 'D:\Program Files\Java\jdk-21',
  [string[]]$Architectures = @('arm64-v8a'),
  [switch]$SkipSync,
  [switch]$Fast
)

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $repo 'android\gradlew.bat'))) {
  throw "No generated Android project. Run 'PROFILE=production pnpm exec expo prebuild -p android' first."
}
foreach ($tool in @((Join-Path $Jdk 'bin\java.exe'), (Join-Path $Sdk 'platform-tools\adb.exe'))) {
  if (-not (Test-Path $tool)) { throw "Missing build tool: $tool. Pass -Jdk / -Sdk to point at it." }
}

if (-not $SkipSync) {
  Write-Host "Mirroring the checkout to $Mirror..."
  robocopy $repo $Mirror /MIR /XD '.git' 'node_modules' '.cxx' 'build' '.gradle' /NFL /NDL /NJH /NJS /MT:16 /R:1 /W:1 | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE." }
  if (-not (Test-Path (Join-Path $Mirror '.git'))) {
    & git -C $Mirror init -q
  }

  # A junction would let Gradle canonicalize back to the deep checkout, which is exactly the
  # length CMake rejects, so the mirror keeps its own tree. Linking from the local pnpm store
  # costs about two minutes; copying node_modules costs far more.
  $lockHash = (Get-FileHash (Join-Path $repo 'pnpm-lock.yaml') -Algorithm SHA256).Hash
  $stamp = Join-Path $Mirror '.lock-hash'
  if (-not (Test-Path (Join-Path $Mirror 'node_modules\react\package.json')) -or (Get-Content $stamp -ErrorAction SilentlyContinue) -ne $lockHash) {
    Write-Host 'Installing dependencies in the mirror...'
    Push-Location $Mirror
    try {
      & pnpm install --frozen-lockfile
      if ($LASTEXITCODE -ne 0) { throw "pnpm install failed with exit code $LASTEXITCODE." }
    } finally {
      Pop-Location
    }
    Set-Content -Path $stamp -Value $lockHash -Encoding ascii
  }
} elseif (-not (Test-Path (Join-Path $Mirror 'node_modules\react\package.json'))) {
  throw "The mirror at $Mirror has no dependencies. Run without -SkipSync once."
}

$env:JAVA_HOME = $Jdk
$env:ANDROID_HOME = $Sdk
$env:ANDROID_SDK_ROOT = $Sdk
$env:SENTRY_DISABLE_AUTO_UPLOAD = 'true'
$env:PATH = (($env:PATH -split ';') | Where-Object { $_ -notmatch 'Tools\\Llvm' }) -join ';'
Set-Content -Path (Join-Path $Mirror 'android\local.properties') -Value ("sdk.dir=" + ($Sdk -replace '\\', '/')) -Encoding ascii

$gradleArgs = @(
  'assembleRelease'
  "-PreactNativeArchitectures=$($Architectures -join ',')"
  '--console=plain'
)
if ($Fast) {
  $gradleArgs += @('-x', 'lintVitalRelease', '-x', 'lintVitalAnalyzeRelease', '--build-cache')
}

Write-Host "Building the release APK from $Mirror..."
$started = Get-Date
Push-Location (Join-Path $Mirror 'android')
try {
  & .\gradlew.bat @gradleArgs
  if ($LASTEXITCODE -ne 0) { throw "Gradle failed with exit code $LASTEXITCODE." }
} finally {
  Pop-Location
}

$apk = Join-Path $Mirror 'android\app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path $apk)) { throw "Gradle finished without an APK at $apk." }
$target = Join-Path $repo 'android\app\build\outputs\apk\release\app-release.apk'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
Copy-Item -LiteralPath $apk -Destination $target -Force
$file = Get-Item $apk
$elapsed = [math]::Round(((Get-Date) - $started).TotalSeconds)
Write-Host ("APK copied to {0} ({1} MB, built in {2}s)." -f $target, [math]::Round($file.Length / 1MB, 1), $elapsed)
Write-Host ("SHA256 {0}" -f (Get-FileHash $apk -Algorithm SHA256).Hash)
