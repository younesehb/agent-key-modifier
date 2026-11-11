# agent-key-modifier

`alt+1..9` jumps to agents in the [Herdr](https://github.com/herdrdev/herdr-app) app, like herdr TUI's `focus_agent`, and the Agents list shows each row's number while you hold Option/Alt.

![agent-key-modifier](preview.gif)

## Install

Ask your agent in Herdr:

> Add the layout at https://github.com/younesehb/agent-key-modifier

Or by hand: copy `layouts/` and `mods/` into `~/.config/herdr-app/`, merge `keys.json` into yours, then run `herdr-app do layout.switch --name agent-key-modifier`.

| Key | Does |
|---|---|
| `alt+1` … `alt+9` | focus that row of the Agents list |
| `alt+0` | show the row numbers for 3 seconds |
| hold Option / Alt | show the row numbers until released (needs a helper below) |

### Optional: numbers while Option/Alt is held

A mod can't see modifier keys while a terminal has focus ([#890](https://github.com/herdrdev/herdr-app/issues/890)), so a tiny helper watches the key and tells the mod. No special permissions needed.

- macOS: `sh extras/macos-option-hold/install.sh` (needs Xcode command line tools).
- Windows: `powershell -ExecutionPolicy Bypass -File extras\windows-alt-hold\install.ps1` (untested so far; reports welcome).

Removal steps are at the top of each install script.

## Notes

The layout and mod are clones of Herdr 0.1.15's `main` layout and `agents` mod, so they don't get Herdr's updates. Once [#891](https://github.com/herdrdev/herdr-app/issues/891) (`agent.select {index}`) and [#890](https://github.com/herdrdev/herdr-app/issues/890) land, this shrinks to a few lines. See [RECIPE.md](RECIPE.md) for how it's built.

Based on Herdr's shipped `main` layout and `agents` mod, © the Herdr authors, Apache-2.0 ([LICENSE](LICENSE)); changes: agent numbering and keys as described in RECIPE.md.
