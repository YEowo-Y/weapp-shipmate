#Requires -Version 7.0
<#
.SYNOPSIS
Read-only inspection of an existing Windows EXE/MSI candidate. Never installs or runs it.
.DESCRIPTION
Exit 0 means inspection completed (the candidate may be unsigned), 1 means validation
failed, 2 means the expected SHA256 did not match, and 3 means Windows reported an
invalid/untrusted or indeterminate signature. No result establishes release
readiness. SourceCommit and SourceDirty are caller-supplied provenance notes, not proof
that this binary was built from that tree. OutputPath is optional and must be a new,
absolute JSON filename. No existing output or input file is overwritten.
.EXAMPLE
pwsh -NoProfile -File scripts/verify-windows-candidate.ps1 -FilePath C:/build/app.exe -SourceDirty true
#>
[CmdletBinding()]
param(
  [string]$FilePath,
  [string]$ExpectedSha256,
  [string]$SourceCommit,
  [string]$SourceDirty = 'unknown',
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$inputStream = $null
$outputStream = $null
$exitCode = 1
$errorCode = 'inspection_failed'
$failureMessage = '无法完成本地候选产物核验；未执行或安装该产物。'
$report = $null
try {
  if (-not $IsWindows) {
    $errorCode = 'unsupported_platform'; $failureMessage = 'Authenticode 核验需要 Windows。'; throw $failureMessage
  }
  if ([string]::IsNullOrWhiteSpace($FilePath) -or -not [IO.Path]::IsPathFullyQualified($FilePath) -or $FilePath.StartsWith('\\')) {
    $errorCode = 'invalid_path'; $failureMessage = 'FilePath 必须是本机磁盘上的绝对文件路径。'; throw $failureMessage
  }
  if ($ExpectedSha256 -and $ExpectedSha256 -notmatch '\A[0-9a-fA-F]{64}\z') {
    $errorCode = 'invalid_hash'; $failureMessage = 'ExpectedSha256 必须是 64 位十六进制 SHA256。'; throw $failureMessage
  }
  if ($SourceCommit -and $SourceCommit -notmatch '\A(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})\z') {
    $errorCode = 'invalid_commit'; $failureMessage = 'SourceCommit 必须是完整的 40 或 64 位十六进制提交 ID。'; throw $failureMessage
  }
  if ($SourceDirty -notin @('true', 'false', 'unknown')) {
    $errorCode = 'invalid_dirty'; $failureMessage = 'SourceDirty 只能为 true、false 或 unknown。'; throw $failureMessage
  }
  $resolvedPath = [IO.Path]::GetFullPath($FilePath)
  if (-not (Test-Path -LiteralPath $resolvedPath -PathType Leaf)) {
    $errorCode = 'not_file'; $failureMessage = '候选产物不存在或不是普通文件。'; throw $failureMessage
  }
  $item = Get-Item -LiteralPath $resolvedPath -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    $errorCode = 'invalid_path'; $failureMessage = '请提供实际候选文件，不能使用链接文件。'; throw $failureMessage
  }
  $extension = [IO.Path]::GetExtension($resolvedPath).ToLowerInvariant()
  if ($extension -notin @('.exe', '.msi')) {
    $errorCode = 'unsupported_format'; $failureMessage = '当前仅核验现有 EXE 或 MSI 产物。'; throw $failureMessage
  }
  $resolvedOutput = $null
  if ($OutputPath) {
    if (-not [IO.Path]::IsPathFullyQualified($OutputPath) -or $OutputPath.StartsWith('\\')) {
      $errorCode = 'invalid_output'; $failureMessage = 'OutputPath 必须是本机绝对 JSON 文件路径。'; throw $failureMessage
    }
    $resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
    if ([string]::Equals($resolvedPath, $resolvedOutput, [StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $resolvedOutput)) {
      $errorCode = 'output_overwrite'; $failureMessage = '拒绝覆盖输入产物或现有输出文件；请使用新的 JSON 文件名。'; throw $failureMessage
    }
    if ([IO.Path]::GetExtension($resolvedOutput) -ine '.json' -or -not (Test-Path -LiteralPath ([IO.Path]::GetDirectoryName($resolvedOutput)) -PathType Container)) {
      $errorCode = 'invalid_output'; $failureMessage = '输出必须是已有目录内的新 .json 文件。'; throw $failureMessage
    }
  }
  # Share reads only. Signature verification can read the same file while writes and
  # replacement remain blocked until both checks finish.
  $inputStream = [IO.File]::Open($resolvedPath, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  $size = $inputStream.Length
  $header = [byte[]]::new(64)
  $read = $inputStream.Read($header, 0, $header.Length)
  $format = $null
  if ($extension -eq '.exe' -and $read -eq 64 -and $header[0] -eq 0x4D -and $header[1] -eq 0x5A) {
    $peOffset = [BitConverter]::ToUInt32($header, 60)
    if ($peOffset -ge 64 -and ([long]$peOffset + 4) -le $size) {
      $null = $inputStream.Seek($peOffset, [IO.SeekOrigin]::Begin)
      $signatureBytes = [byte[]]::new(4)
      if ($inputStream.Read($signatureBytes, 0, 4) -eq 4 -and [BitConverter]::ToUInt32($signatureBytes, 0) -eq 0x00004550) { $format = 'PE' }
    }
  } elseif ($extension -eq '.msi' -and $size -ge 512 -and $read -eq 64 -and [BitConverter]::ToString($header, 0, 8) -eq 'D0-CF-11-E0-A1-B1-1A-E1') {
    $format = 'Compound File'
  }
  if (-not $format) {
    $errorCode = 'invalid_format'; $failureMessage = '文件头与 EXE/MSI 容器不符，不能仅通过更改后缀作为候选产物。'; throw $failureMessage
  }
  $inputStream.Position = 0
  $hash = (Get-FileHash -InputStream $inputStream -Algorithm SHA256).Hash.ToLowerInvariant()
  $signature = Get-AuthenticodeSignature -LiteralPath $resolvedPath
  $signatureStatus = $signature.Status.ToString()
  $signatureInspectionOk = $signatureStatus -in @('Valid', 'NotSigned')
  $signer = $null
  if ($signature.SignerCertificate) {
    $certificate = $signature.SignerCertificate
    $signer = [ordered]@{
      subject = $certificate.Subject
      thumbprint = $certificate.Thumbprint
      notBeforeUtc = $certificate.NotBefore.ToUniversalTime().ToString('o')
      notAfterUtc = $certificate.NotAfter.ToUniversalTime().ToString('o')
    }
  }
  $expected = if ($ExpectedSha256) { $ExpectedSha256.ToLowerInvariant() } else { $null }
  $hashMatches = if ($expected) { $hash -ceq $expected } else { $null }
  $sourceDirtyValue = switch ($SourceDirty.ToLowerInvariant()) { 'true' { $true } 'false' { $false } default { $null } }
  $report = [ordered]@{
    schemaVersion = 1
    ok = (($null -eq $hashMatches -or $hashMatches) -and $signatureInspectionOk)
    checkedAtUtc = [DateTime]::UtcNow.ToString('o')
    filePath = $resolvedPath
    sizeBytes = $size
    sha256 = $hash
    expectedSha256 = $expected
    hashMatches = $hashMatches
    fileFormat = [ordered]@{ extension = $extension; header = $format; validation = 'container-header-only' }
    authenticode = [ordered]@{ status = $signatureStatus; signatureType = $signature.SignatureType.ToString(); signer = $signer }
    source = [ordered]@{ commit = $(if ($SourceCommit) { $SourceCommit.ToLowerInvariant() } else { $null }); dirty = $sourceDirtyValue; reportedBy = 'caller'; verifiedAgainstArtifact = $false }
    distributionStatus = 'candidate-only'
    releaseReady = $false
    limitations = @(
      '仅检查现有文件及容器头，不执行、安装或修改候选产物。'
      'NotSigned 表示未签名；Valid 也不证明安装路径、SmartScreen 信誉或正式发布就绪。'
      '签名状态由 Windows 当前信任环境报告；没有单独证明在线吊销状态。'
      '源码提交与工作树状态由调用方提供，不能据此证明二进制构建来源。'
    )
    error = $(if ($hashMatches -eq $false) { [ordered]@{ code = 'hash_mismatch'; message = '实际 SHA256 与预期不一致，候选产物核验失败。' } } elseif (-not $signatureInspectionOk) { [ordered]@{ code = 'signature_failed'; message = 'Windows 返回无效、不受信任或无法确定的签名状态；请核对 Authenticode 证据。' } } else { $null })
  }
  $json = $report | ConvertTo-Json -Depth 8
  if ($resolvedOutput) {
    # CreateNew also prevents a time-of-check/time-of-use overwrite or hard-link alias.
    $outputStream = [IO.File]::Open($resolvedOutput, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes($json + [Environment]::NewLine)
    $outputStream.Write($bytes, 0, $bytes.Length)
    $outputStream.Flush($true)
  }
  $exitCode = if ($hashMatches -eq $false) { 2 } elseif (-not $signatureInspectionOk) { 3 } else { 0 }
} catch {
  $report = [ordered]@{
    schemaVersion = 1; ok = $false; checkedAtUtc = [DateTime]::UtcNow.ToString('o')
    distributionStatus = 'candidate-only'; releaseReady = $false
    error = [ordered]@{ code = $errorCode; message = $failureMessage }
  }
} finally {
  if ($outputStream) { $outputStream.Dispose() }
  if ($inputStream) { $inputStream.Dispose() }
}
$report | ConvertTo-Json -Depth 8
exit $exitCode
