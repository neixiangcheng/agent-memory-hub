# Starts the read-only viewer in the foreground and appends to a log.
# Called by scripts/web-daemon.ps1 (or by hand) — not registered as a startup task on its own.
param([int]$Port = 7788)

$ErrorActionPreference = 'Stop'
$pkg = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $env:USERPROFILE '.agent-memory-hub'
$log = Join-Path $logDir 'web.log'

New-Item -ItemType Directory -Path $logDir -Force | Out-Null
Set-Location $pkg
"[$(Get-Date -Format o)] starting viewer on port $Port" | Out-File -FilePath $log -Append -Encoding utf8
& node (Join-Path $pkg 'bin\amh.mjs') web --port $Port *>> $log
