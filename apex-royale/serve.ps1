# APEX ROYALE - static server (zero-dependency, pure PowerShell)
# Usage: powershell -ExecutionPolicy Bypass -File serve.ps1   (default http://localhost:8092/)
param(
  [int]$Port = 8092
)
$root = $PSScriptRoot
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "APEX ROYALE running at http://localhost:$Port/  (Ctrl+C to stop)" -ForegroundColor Green
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
        '.wav'  { 'audio/wav' }
        '.ogg'  { 'audio/ogg' }
        '.mp3'  { 'audio/mpeg' }
        '.png'  { 'image/png' }
        '.jpg'  { 'image/jpeg' }
        '.webp' { 'image/webp' }
        '.svg'  { 'image/svg+xml' }
        default { 'application/octet-stream' }
      }
      $res.ContentType = $mime
      $res.ContentLength64 = $bytes.Length
      # no-cache: dev server must always serve fresh code
      $res.Headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
      $res.Headers['Pragma'] = 'no-cache'
      $res.Headers['Expires'] = '0'
      if ($req.HttpMethod -ne 'HEAD') {
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
