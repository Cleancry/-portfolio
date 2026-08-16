# PENITENT BLADE — static server (zero-dependency, pure PowerShell)
# Usage: powershell -ExecutionPolicy Bypass -File serve.ps1   (default http://localhost:8091/)
param(
  [int]$Port = 8091
)
$root = $PSScriptRoot
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "PENITENT BLADE running at http://localhost:$Port/  (Ctrl+C to stop)" -ForegroundColor Green
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }
    $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if (-not $path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
      $res.StatusCode = 403; $res.Close(); continue
    }
    if (Test-Path $path -PathType Container) { $path = Join-Path $path 'index.html' }
    if (Test-Path $path) {
      $bytes = [IO.File]::ReadAllBytes($path)
      $ext = [IO.Path]::GetExtension($path).ToLower()
      $mime = switch ($ext) {
        '.html' { 'text/html; charset=utf-8' }
        '.css'  { 'text/css; charset=utf-8' }
        '.js'   { 'application/javascript; charset=utf-8' }
        '.png'  { 'image/png' }
        '.jpg'  { 'image/jpeg' }
        '.gif'  { 'image/gif' }
        '.webp' { 'image/webp' }
        '.svg'  { 'image/svg+xml' }
        '.mp3'  { 'audio/mpeg' }
        '.mp4'  { 'video/mp4' }
        '.woff' { 'font/woff' }
        '.woff2'{ 'font/woff2' }
        '.otf'  { 'font/otf' }
        default { 'application/octet-stream' }
      }
      $res.ContentType = $mime
      $res.ContentLength64 = $bytes.Length
      # no-cache: dev server must always serve fresh code (browsers otherwise
      # cache stale JS/CSS and it looks like "nothing changed")
      $res.Headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
      $res.Headers['Pragma'] = 'no-cache'
      $res.Headers['Expires'] = '0'
      if ($req.HttpMethod -eq 'HEAD') {
        # HEAD: headers only, no body
      } else {
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      }
    } else {
      $res.StatusCode = 404
    }
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.Close()
  }
}
