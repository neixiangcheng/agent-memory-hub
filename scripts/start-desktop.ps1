# Opens the viewer in its own app window (Edge/Chrome --app mode: no address bar, no tabs).
# Called by the desktop shortcut; safe to run twice — a second launch just opens another window on a
# different port, so prefer the shortcut's single instance behaviour by not pinning a port.
param([int]$Port = 0)

$ErrorActionPreference = 'Stop'
$pkg = Split-Path -Parent $PSScriptRoot
Set-Location $pkg

$nodeArgs = @((Join-Path $pkg 'bin\amh.mjs'), 'desktop')
if ($Port -gt 0) { $nodeArgs += @('--port', "$Port") }
& node @nodeArgs
