#!/bin/sh
# Builds the Option-hold helper and runs it at login (launchd agent dev.herdr.agent-key-modifier).
# Remove: launchctl bootout gui/"$(id -u)"/dev.herdr.agent-key-modifier && rm ~/Library/LaunchAgents/dev.herdr.agent-key-modifier.plist
set -e
cd "$(dirname "$0")"
dest="$HOME/.config/herdr-app/agent-key-modifier-optkeys"
swiftc -O optkeys.swift -o "$dest"
plist="$HOME/Library/LaunchAgents/dev.herdr.agent-key-modifier.plist"
cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>dev.herdr.agent-key-modifier</string>
  <key>ProgramArguments</key><array><string>$dest</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Interactive</string>
</dict></plist>
PLIST
launchctl bootout gui/"$(id -u)"/dev.herdr.agent-key-modifier 2>/dev/null || true
launchctl bootstrap gui/"$(id -u)" "$plist"
echo "Running: hold Option in Herdr to see agent numbers."
