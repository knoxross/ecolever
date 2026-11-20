# ECOLEVER - upload the latest site (GitHub main) to Gabia hosting from a Windows PC.
# Run in PowerShell (one line):
#   powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/knoxross/ecolever/main/deploy.ps1 | iex"
# The FTP ID/password are asked once and saved only on this PC (~/.ecolever/ftp.netrc), never sent to GitHub.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$hostUrl = 'ftp://ecolever.co.kr'
$dir = Join-Path $env:USERPROFILE '.ecolever'
$netrc = Join-Path $dir 'ftp.netrc'
New-Item -ItemType Directory -Force $dir | Out-Null

Write-Host ''
Write-Host '=== ECOLEVER upload ===' -ForegroundColor Green

if (-not (Test-Path $netrc)) {
  Write-Host 'First time only: enter the Gabia FTP account for www.ecolever.co.kr'
  $id = Read-Host 'FTP ID'
  $secure = Read-Host 'FTP password (hidden)' -AsSecureString
  $pw = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  [IO.File]::WriteAllText($netrc, "machine ecolever.co.kr`nlogin $id`npassword $pw`n", (New-Object Text.UTF8Encoding($false)))
  $pw = $null
}

$rootList = & curl.exe -s -S --netrc-file $netrc --list-only -m 30 "$hostUrl/"
if ($LASTEXITCODE -ne 0) {
  Remove-Item $netrc -Force
  Write-Host "FTP login failed (curl $LASTEXITCODE). Check the FTP ID/password in My Gabia and run again." -ForegroundColor Red
  return
}
# Gabia web hosting usually serves the site from the 'www' folder (some products: html, public_html). Upload there if it exists.
$names = @($rootList -split "`r?`n" | ForEach-Object { ($_.Trim() -split '/')[-1] } | Where-Object { $_ })
$webroot = ''
foreach ($cand in 'www', 'public_html', 'html', 'htdocs') { if ($names -contains $cand) { $webroot = $cand; break } }
if ($webroot) { $hostUrl = "$hostUrl/$webroot"; Write-Host "Web folder: /$webroot" } else { Write-Host 'Web folder: / (FTP top)' }
Write-Host ('FTP top has: ' + (($names | Select-Object -First 12) -join ', '))

$work = Join-Path $env:TEMP ('ecolever-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $work | Out-Null
Write-Host 'Downloading the latest site from GitHub...'
Invoke-WebRequest 'https://github.com/knoxross/ecolever/archive/refs/heads/main.zip' -OutFile (Join-Path $work 'site.zip') -UseBasicParsing
Expand-Archive (Join-Path $work 'site.zip') -DestinationPath $work -Force
$src = Join-Path $work 'ecolever-main'

$items = @('index.html', '.htaccess', 'robots.txt', 'sitemap.xml', 'llms.txt')
foreach ($d in 'css', 'js', 'imgs', 'guide') {
  $p = Join-Path $src $d
  if (Test-Path $p) { Get-ChildItem $p -File -Recurse | ForEach-Object { $items += $_.FullName.Substring($src.Length + 1).Replace('\', '/') } }
}

$ok = 0; $fail = 0
foreach ($f in $items) {
  $local = Join-Path $src $f
  if (-not (Test-Path $local)) { continue }
  & curl.exe -s -S --netrc-file $netrc --ftp-create-dirs -m 60 -T $local "$hostUrl/$f"
  if ($LASTEXITCODE -eq 0) { $ok++; Write-Host "uploaded $f" } else { $fail++; Write-Host "FAILED $f" -ForegroundColor Red }
}
Remove-Item $work -Recurse -Force
if ($fail -eq 0) {
  Write-Host "DONE: $ok files uploaded. Open https://www.ecolever.co.kr (Ctrl+F5 to refresh)." -ForegroundColor Green
} else {
  Write-Host "$ok uploaded, $fail failed. Run again or tell Claude." -ForegroundColor Yellow
}
