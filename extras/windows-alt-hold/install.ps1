# Usage: install.ps1 [-Mod agents-grouped]   (default agent-key-modifier)
# Runs the Alt-hold helper now and at every login (a shortcut in your Startup folder).
# Remove: delete "Herdr agent-key-modifier.lnk" from shell:startup and %LOCALAPPDATA%\agent-key-modifier,
# then end the hidden powershell running optkeys.ps1 (or sign out).
param([string]$Mod = "agent-key-modifier")
$ErrorActionPreference = "Stop"
$dir = Join-Path $env:LOCALAPPDATA "agent-key-modifier"
New-Item -ItemType Directory -Force $dir | Out-Null
$script = Join-Path $dir "optkeys.ps1"
Copy-Item (Join-Path $PSScriptRoot "optkeys.ps1") $script -Force
$argline = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`" -Mod $Mod"
$link = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path ([Environment]::GetFolderPath("Startup")) "Herdr agent-key-modifier.lnk"))
$link.TargetPath = "powershell.exe"
$link.Arguments = $argline
$link.WindowStyle = 7
$link.Save()
Start-Process powershell.exe -ArgumentList $argline -WindowStyle Hidden
Write-Host "Running: hold Alt in Herdr to see agent numbers."
