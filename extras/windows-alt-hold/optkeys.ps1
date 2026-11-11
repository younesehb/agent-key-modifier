# Shows the agent-key-modifier numbers while Alt is held (Herdr in front), hides them on release.
# Herdr mods only see modifier keys on the keyboard focus path, which a terminal owns
# (https://github.com/herdrdev/herdr-app/issues/890), so this polls the key state
# and tells the mod through `herdr-app do agent-key-modifier.hold|release`.
# ponytail: polls at 30 Hz; a low-level keyboard hook would be instant but needs a message loop.
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class AkmKeys {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vk);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
}
"@
$cli = Join-Path $env:LOCALAPPDATA "Programs\herdr-app\herdr-app.exe"
function Down($vk) { ([AkmKeys]::GetAsyncKeyState($vk) -band 0x8000) -ne 0 }
function HerdrInFront {
  $id = [uint32]0
  [void][AkmKeys]::GetWindowThreadProcessId([AkmKeys]::GetForegroundWindow(), [ref]$id)
  (Get-Process -Id $id -ErrorAction SilentlyContinue).ProcessName -eq "herdr-app"
}
$shown = $false
while ($true) {
  # Alt alone: Ctrl+Alt is AltGr (types characters), Win+Alt belongs to Windows.
  $alt = (Down 0x12) -and -not (Down 0x11) -and -not (Down 0x5B) -and -not (Down 0x5C)
  $want = $alt -and (HerdrInFront)
  if ($want -ne $shown) {
    $shown = $want
    $cmd = if ($shown) { "hold" } else { "release" }
    Start-Process -FilePath $cli -ArgumentList "do", "agent-key-modifier.$cmd" -WindowStyle Hidden
  }
  Start-Sleep -Milliseconds 33
}
