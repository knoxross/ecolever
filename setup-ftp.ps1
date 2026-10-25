# Gabia FTP login setup for deploy.sh
# Saves the FTP ID/password to ~/.ecolever/ftp.netrc (outside the repo, never pushed to GitHub)
# and checks that the login works.
$dir = Join-Path $env:USERPROFILE '.ecolever'
$file = Join-Path $dir 'ftp.netrc'
New-Item -ItemType Directory -Force $dir | Out-Null

Write-Host ''
Write-Host '=== ECOLEVER Gabia FTP setup ===' -ForegroundColor Green
$id = Read-Host 'FTP ID'
$secure = Read-Host 'FTP password (hidden)' -AsSecureString
$pw = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

$text = "machine ecolever.co.kr`nlogin $id`npassword $pw`n"
[IO.File]::WriteAllText($file, $text, (New-Object Text.UTF8Encoding($false)))
$pw = $null

Write-Host 'Saved. Testing FTP login...'
& curl.exe -s -S --netrc-file $file --list-only -m 30 'ftp://ecolever.co.kr/' | Out-Null
if ($LASTEXITCODE -eq 0) {
  Write-Host 'OK: FTP login works. Tell Claude to upload.' -ForegroundColor Green
} else {
  Write-Host "FAILED: FTP login did not work (curl exit $LASTEXITCODE). Check the FTP ID/password in My Gabia and run this again." -ForegroundColor Red
}
