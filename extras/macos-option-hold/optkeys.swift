// Shows the agent-key-modifier numbers while Option is held (Herdr frontmost), hides them on release.
// Herdr mods only see modifier keys on the keyboard focus path, which a terminal owns
// (https://github.com/herdrdev/herdr-app/issues/890), so this polls the modifier state
// and tells the mod through `herdr-app do agent-key-modifier.hold|release`.
// ponytail: polls at 30 Hz (no permission needed, ~0.7% CPU); a CGEventTap would be instant but needs Input Monitoring.
import AppKit

let cli = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "/Applications/Herdr.app/Contents/MacOS/Herdr"
var shown = false

func send(_ command: String) {
  let p = Process()
  p.executableURL = URL(fileURLWithPath: cli)
  p.arguments = ["do", "agent-key-modifier." + command]
  p.standardOutput = FileHandle.nullDevice
  p.standardError = FileHandle.nullDevice
  try? p.run()
}

Timer.scheduledTimer(withTimeInterval: 1.0 / 30, repeats: true) { _ in
  let f = CGEventSource.flagsState(.combinedSessionState)
  let option = f.contains(.maskAlternate) && !f.contains(.maskCommand) && !f.contains(.maskControl)
  let front = NSWorkspace.shared.frontmostApplication?.bundleIdentifier == "dev.herdr.app"
  if (option && front) != shown {
    shown.toggle()
    send(shown ? "hold" : "release")
  }
}
RunLoop.main.run()
