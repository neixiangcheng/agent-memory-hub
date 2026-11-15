# Put a double-clickable shortcut on the desktop: it opens the viewer in its own app window.
# No admin rights, nothing installed, nothing written to the registry.
#
#   powershell -File scripts\create-shortcut.ps1            # "agent-memory-hub" on the desktop
#   powershell -File scripts\create-shortcut.ps1 -Remove
param(
  [string]$Name = 'agent-memory-hub',
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$desktop = [Environment]::GetFolderPath('Desktop')
$linkPath = Join-Path $desktop "$Name.lnk"

if ($Remove) {
  if (Test-Path $linkPath) { Remove-Item $linkPath -Force; "removed $linkPath" } else { "no shortcut at $linkPath" }
  return
}

$start = Join-Path $PSScriptRoot 'start-desktop.ps1'
if (-not (Test-Path $start)) { throw "missing $start" }

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($linkPath)
$lnk.TargetPath = 'powershell.exe'
$lnk.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$start`""
$lnk.WorkingDirectory = Split-Path -Parent $PSScriptRoot
$lnk.Description = 'agent-memory-hub — shared memory viewer (read-only window)'
$lnk.IconLocation = "$env:SystemRoot\System32\shell32.dll,13"
$lnk.WindowStyle = 7
$lnk.Save()

"created: $linkPath"
"opens  : the viewer in its own app window (Edge/Chrome --app mode)"
