# agents-grouped

Herdr's Agents list with your own groups: give any agent a name, a group, an icon and a group color from a right-click dialog, drag agents between groups, and sort the list "By group". It also carries [agent-key-modifier](../agent-key-modifier)'s keys: `alt+1`…`alt+9` jump to that row, `alt+0` (or holding Option/Alt with a helper) shows the row numbers.

## What you see

Herdr's `main` layout: sidebar on the left (brand, Spaces, Agents, footer), tabs and terminals on the right. The Agents block shows the `agents-grouped` mod instead of the shipped `agents` mod.

- **Rows** look like the shipped list. An agent with an icon shows it (14px, in the 16px program-icon slot) instead of its program icon. An agent with a name shows that name instead of the automatic one.
- **Grouped agents** in the Priority and "Grouped by space" views get a 2px left border in the group color and the group name at the right of the row (10px, medium, group color, at most 80px, truncated).
- **"By group" view** (third entry of the sort menu, `layers` icon): one header per group, sorted by name, with an 8px round dot in the group color, the group name in that color and the member count; ungrouped agents come last under "No group". Inside a group, most urgent first (Needs you, Done, Working, Idle), then most recently changed. Rows name their space, as in the Priority view. Pinned agents stay in "Pinned" at the top.
- **Group color**: the first member's `group_color` if it's a `#hex`, else one picked from the name (a hash into the theme's `ansi2, ansi4, ansi3, ansi5, ansi6, ansi1, ansi10, ansi12, ansi11, ansi13`), so a group keeps its color with no setup and follows the theme.
- **The dialog** (400×630, `popover` background): title "Edit agent · <name>", then four fields, each a 34px input with a label above: Name (placeholder: the automatic name), Group, Icon, Group color. Under Icon, a 128px-tall scrolling grid of 122 emojis in 28px chips; under Group color, nine 16px round swatches (`#e5534b #f69d50 #daaa3f #57ab5a #39c5cf #539bf5 #986ee2 #e275ad #8b949e`). The chosen chip has an `accent` border and `selected` background. "Leave a field empty to remove it.", then Cancel and Save (`solid`) buttons.
- **The row numbers** while shown: a 16×16 `accent` badge with the row's number before the icon on the first nine rows.

## How it behaves

- Right-click an agent row: opens the dialog. Enter in a field or Save writes the labels and closes it; Esc or Cancel closes without saving. A chip fills its field; clicking the chosen chip again clears it. An empty field removes that label; an empty Name goes back to the automatic name.
- Drag an agent (press, move, release) onto a row that has a group, or in "By group" view onto a group header: it joins that group. In "By group" view, dropping on the "No group" header or on an ungrouped row removes its group. While dragging, the dragged row is at 50% opacity and the target row gets the `hover` background and a 1px border in its group color (`dim` for none); a target header turns `foreground` on `hover`. Leaving the list, or releasing anywhere else, cancels.
- Labels are per terminal, so they survive restarts and show on every Herdr window, and they are written where the agent runs (`hc label t5 ...` on `studio` for `studio/t5`). A failed write shows an error toast.
- `alt+1`…`alt+9`, `alt+0` and Option/Alt-hold: as [agent-key-modifier](../agent-key-modifier/RECIPE.md), counting rows as drawn in the current view.
- Statuses, folding, pinning, peeking, clicks and hovers: as the shipped Agents list.

## Built from

- `layouts/agents-grouped.json`: a `layout.clone` of `main` (0.1.15) with the `agents` block's `content.mod` set to `agents-grouped`.
- `mods/agents-grouped/`: a `mod.clone` of the shipped `agents` mod (0.1.15) plus:
  - labels on each terminal (`terminals()[].labels`): `alias`, `group`, `icon`, `group_color`, written by `writeTags(address, values)`: `hc(["label", t, "k=v", ...])` here, or `exec("hc", ["label", "t5", ...], { on: "studio" })` for `studio/t5`; `k=` removes a label;
  - the dialog is the mod opened again with `openOverlay({ mod: "agents-grouped", kind: "dialog", width: 400, height: 630, props: { edit: address, name, auto, alias, group, icon, group_color } })`; `init` and `render` branch on `props().edit`. Save awaits the `hc` write before `closeOverlay`, since closing cancels the copy's tasks;
  - `{ id: "custom", label: "By group", icon: "layers" }` in `SORTS`, saved in `shared("agents.sort")` like the others; the sort popup is 172px tall for the third entry;
  - drag: rows `on_mouse_down("left")` set `this.drag`; rows and "By group" headers `on_mouse_move` set `this.over` and the target group; the list root's `on_mouse_up("left")` does the drop and its `on_hover(false)` cancels;
  - agent-key-modifier's `nextCommand()` loop, `this.order` and badge, under this mod's name.
- `keys.json`: `"alt-0": "agents-grouped.show"`, `"alt-1": "agents-grouped.n1"` … `"alt-9": "agents-grouped.n9"` in `global`.
- Optional helper: `../extras/macos-option-hold/install.sh agents-grouped` or `../extras/windows-alt-hold/install.ps1 -Mod agents-grouped`.

## Watch out

- Mouse-move events don't say which button is down, so the drop is decided once, at the list root's mouse-up, from the last target hovered; a drop handled per row would race the root's cancel.
- A remote agent's address is `machine/tN`, but `hc label` on that machine wants the bare `tN`.
- Keep the dialog's `hc` write awaited before closing it, or the write is cancelled with the copy.
- `mod.clone` rewrites `openOverlay({ mod })` names; this mod opens itself for the sort menu and the dialog (`SELF`).
- Agents run by the same terminal share labels: the labels belong to the terminal.
- Clones don't get Herdr updates. Don't install both packages' `keys.json`: the alt keys go to one mod.

## Done when

- `herdr-app check mods/agents-grouped` passes and `herdr-app status` shows no errors with the layout shown.
- Right-click → set Group `test` and an icon → Save: `hc get <id>` shows `group=test` and the icon, and the row shows both.
- Sort menu → "By group": a "test" header with its color dot and member count; dragging an agent onto it moves it there, and onto "No group" removes it.
- An empty Name brings back the automatic name; an empty Group removes the agent from the group.
- `herdr-app do agents-grouped.n2` focuses the second row; `herdr-app do agents-grouped.show` shows the badges for 3 seconds.
