$port = 8091
$root = "C:\Users\Admin\AppData\Roaming\reasonix\global-workspace\dark-arena"
$deadline = (Get-Date).AddMinutes(25)
while ((Get-Date) -lt $deadline) {
  try { $r = Invoke-WebRequest -Uri "http://localhost:$port/" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop; if ($r.StatusCode -eq 200) { Start-Sleep -Seconds 90; continue } } catch {}
  $proc = Get-Process powershell -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'serve\.ps1' }
  if (-not $proc) { Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$root\serve.ps1`" -Port $port" } | Out-Null }
  Start-Sleep -Seconds 10
}
