# Keep the viewer running on Windows without a service host: a per-user Run entry, no admin rights.
#
#   powershell -File scripts\web-daemon.ps1 status     # is it running, on which port, where is the log
#   powershell -File scripts\web-daemon.ps1 install    # start it now and again at every sign-in
#   powershell -File scripts\web-daemon.ps1 uninstall
#
# install writes HKCU\Software\Microsoft\Windows\CurrentVersion\Run only. Nothing is written for other users,
# and nothing starts before you run `install`.
param(
  [ValidateSet('status', 'install', 'uninstall', 'start', 'stop')]
  [string]$Action = 'status',
  [int]$Port = 7788
)

$ErrorActionPreference = 'Stop'
$name = 'agent-memory-hub-web'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$start = Join-Path $PSScriptRoot 'start-web.ps1'
$log = Join-Path $env:USERPROFILE '.agent-memory-hub\web.log'

function Get-Viewer {
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

switch ($Action) {
  'status' {
    $entry = (Get-ItemProperty -Path $runKey -Name $name -ErrorAction SilentlyContinue).$name
    $conn = Get-Viewer
    if ($conn) {
      $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
      "running on port $Port (pid $($conn.OwningProcess)$(if ($proc) { ", " + $proc.ProcessName }))"
      "url:  http://127.0.0.1:$Port/"
    } else {
      "not running on port $Port"
    }
    if ($entry) { "autostart: enabled" } else { "autostart: disabled" }
    if (Test-Path $log) { "log:  $log" }
  }
  'install' {
    $value = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$start`" -Port $Port"
    New-Item -Path $runKey -Force | Out-Null
    Set-ItemProperty -Path $runKey -Name $name -Value $value
    "autostart enabled for the current user: $name -> port $Port"
    if (-not (Get-Viewer)) {
      Start-Process -WindowStyle Hidden powershell -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $start, '-Port', $Port
      Start-Sleep -Seconds 2
    }
    & $PSCommandPath -Action status -Port $Port
  }
  'uninstall' {
    Remove-ItemProperty -Path $runKey -Name $name -ErrorAction SilentlyContinue
    "autostart removed"
  }
  'start' {
    if (Get-Viewer) { "already running on port $Port"; break }
    Start-Process -WindowStyle Hidden powershell -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $start, '-Port', $Port
    Start-Sleep -Seconds 2
    & $PSCommandPath -Action status -Port $Port
  }
  'stop' {
    $conn = Get-Viewer
    if (-not $conn) { "nothing listening on port $Port"; break }
    Stop-Process -Id $conn.OwningProcess -Force
    "stopped pid $($conn.OwningProcess)"
  }
}
