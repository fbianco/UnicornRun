# ---------------------------------------------------------------------------
# Unicorn Run - tiny local web server (Windows PowerShell, nothing to install).
# Browsers only allow the webcam and JavaScript modules on a real web address,
# so the game is served at http://localhost:8080 instead of opened as a file.
# Close this window to stop the server.
# ---------------------------------------------------------------------------
param([int]$Port = 8080)

$root = [System.IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.mjs' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.wasm' = 'application/wasm'; '.json' = 'application/json'; '.map' = 'application/json'
  '.png' = 'image/png'; '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'
  '.task' = 'application/octet-stream'; '.txt' = 'text/plain; charset=utf-8'; '.md' = 'text/plain; charset=utf-8'
}

# find a free port
$listener = $null
for ($p = $Port; $p -lt $Port + 20; $p++) {
  try {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("http://localhost:$p/")
    $l.Start()
    $listener = $l
    $Port = $p
    break
  } catch { }
}
if (-not $listener) { Write-Host "Could not open a local port." -ForegroundColor Red; Read-Host "Press Enter to close"; exit 1 }

$url = "http://localhost:$Port/"
Write-Host ""
Write-Host "  UNICORN RUN is running at $url" -ForegroundColor Yellow
Write-Host "  Opening your browser... (keep this window open while you play)"
Write-Host "  Close this window to stop the game server."
Write-Host ""
Start-Process $url

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $path = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($path -eq '/') { $path = '/index.html' }
    $file = [System.IO.Path]::GetFullPath((Join-Path $root ($path.TrimStart('/') -replace '/', '\')))
    $res = $ctx.Response
    $res.Headers.Add('Cache-Control', 'no-cache')
    if ($file.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $file -PathType Leaf)) {
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] } else { $res.ContentType = 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $res.ContentLength64 = $bytes.Length
      if ($ctx.Request.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
    } else {
      $res.StatusCode = 404
    }
    $res.OutputStream.Close()
  } catch {
    # a browser tab closing mid-download is not a problem
  }
}
