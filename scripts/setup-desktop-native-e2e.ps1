param(
  [string]$DriverVersion = '2.1.0',
  [string]$WebViewVersion = '155.0.4283.62'
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$toolsRoot = Join-Path $repoRoot '.omx/artifacts/desktop-model-native/tools'
New-Item -ItemType Directory -Force -Path $toolsRoot | Out-Null
if ($DriverVersion -notmatch '^\d+\.\d+\.\d+$' -or $WebViewVersion -notmatch '^\d+\.\d+\.\d+\.\d+$') { throw 'Invalid pinned driver version' }
$tauriDriver = Join-Path $toolsRoot 'bin/tauri-driver.exe'
if (-not (Test-Path -LiteralPath $tauriDriver)) {
  & cargo install tauri-driver --version $DriverVersion --locked --root $toolsRoot
  if ($LASTEXITCODE -ne 0) { throw 'tauri-driver installation failed' }
}
$edgeRoot = Join-Path $toolsRoot "edge-$WebViewVersion"
$edgeDriver = Join-Path $edgeRoot 'msedgedriver.exe'
if (-not (Test-Path -LiteralPath $edgeDriver)) {
  $archive = Join-Path $toolsRoot "edge-$WebViewVersion.zip"
  Invoke-WebRequest -Uri "https://msedgedriver.microsoft.com/$WebViewVersion/edgedriver_win64.zip" -OutFile $archive
  Expand-Archive -LiteralPath $archive -DestinationPath $edgeRoot -Force
}
# Microsoft driver and its license notices remain in this ignored, local-only folder.
& cargo install --list --root $toolsRoot
& $edgeDriver --version
@{ tauriDriver = $tauriDriver; edgeDriver = $edgeDriver; webViewVersion = $WebViewVersion } |
  ConvertTo-Json | Set-Content -LiteralPath (Join-Path $toolsRoot 'drivers.json') -Encoding utf8
