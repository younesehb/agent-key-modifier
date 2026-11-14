// Agents in grouped or priority views; parents take their most urgent sub-agent's place.
// agents-grouped: clone of the shipped `agents` mod (Herdr 0.1.15) adding a name, group, icon
// and group color per agent, stored as hc labels on its terminal: alias, group, icon, group_color.
// Right-click an agent to edit them; drag an agent onto a group to move it; "By group" in the
// sort menu clusters agents by group, in an order you drag the headers into; right-click a header
// to rename, recolor or ungroup it. Folder rules put new agents in a group by themselves.
// ctrl-a e (keys.json "agents-grouped.edit") edits the focused agent. Also agent-key-modifier's
// alt+1..9 / alt+0 keys.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { nextCommand, agents, terminals, panes, focused, spaces, run, theme, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props, window, layout, hc, exec, notify } from "herdr";

const SELF = "agents-grouped";
const TAGS = [
  { key: "alias", label: "Name (empty: automatic)" },
  { key: "group", label: "Group" },
  { key: "icon", label: "Icon (an emoji or a character)" },
  { key: "group_color", label: "Group color (#hex, optional: else picked from the name)" },
];

const EMOJIS = ["🧪", "🚀", "🐛", "📱", "🎨", "💰", "📝", "🔧", "🌐", "🤖", "⭐", "🔥", "📦", "🧠", "📊", "🔒", "🎯", "🧹", "💬", "🏗️", "⚡", "🍎", "💻", "🖥️", "⌨️", "🗄️", "🧰", "🔨", "⚙️", "🔌", "🔋", "📡", "🛰️", "🧬", "🔬", "🧮", "📈", "📉", "🗂️", "📁", "📚", "📖", "✏️", "🖊️", "📌", "📎", "🔍", "🔑", "🛡️", "🚨", "✅", "❌", "⚠️", "❓", "💡", "🎉", "🏆", "🎁", "💎", "🪙", "💳", "🛒", "🏷️", "📣", "📧", "📅", "⏰", "⏳", "🔔", "🧭", "🗺️", "🏠", "🏢", "🏭", "🏦", "🚗", "✈️", "🚢", "🛸", "🌍", "🌙", "☀️", "🌈", "❄️", "🌊", "🌱", "🌳", "🌸", "🍀", "🍕", "☕", "🍔", "🎮", "🎵", "🎬", "📷", "🐶", "🐱", "🦊", "🐻", "🐼", "🐸", "🐙", "🦄", "🐝", "🦋", "🐢", "🐳", "👾", "👻", "💀", "🧙", "🥷", "👑", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍"];
const SWATCHES = ["#e5534b", "#f69d50", "#daaa3f", "#57ab5a", "#39c5cf", "#539bf5", "#986ee2", "#e275ad", "#8b949e"];

// A stable theme color per group name, so a group keeps its color without any config.
function hue(name, t) {
  const pal = [t.ansi2, t.ansi4, t.ansi3, t.ansi5, t.ansi6, t.ansi1, t.ansi10, t.ansi12, t.ansi11, t.ansi13];
  let h = 0;
  for (const c of name) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return pal[h % pal.length] ?? t.accent;
}

// Labels are written on the terminal's own machine with its local id (`studio/t5` -> t5 there).
function writeTags(address, values) {
  const args = Object.entries(values).map(([k, v]) => `${k}=${v.trim()}`);
  const slash = address.indexOf("/");
  if (slash < 0) return hc(["label", address, ...args]);
  return exec("hc", ["label", address.slice(slash + 1), ...args], { on: address.slice(0, slash) });
}

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const groupName = (x) => (x?.labels?.group ?? "").trim();
// The machine an address lives on (`studio/t5` -> studio), null for this computer.
const machineOf = (address) => (address.includes("/") ? address.split("/")[0] : null);

// Every group in use with its color: a member's group_color, else one picked from the name.
function groupsIn(all, t) {
  const set = new Map();
  for (const x of all) {
    const g = groupName(x);
    if (!g || x.state !== "live") continue;
    const c = x.labels?.group_color ?? "";
    if (!set.get(g) && HEX.test(c)) set.set(g, c);
    else if (!set.has(g)) set.set(g, null);
  }
  return new Map([...set].map(([g, c]) => [g, c ?? hue(g, t)]));
}

// "By group" order: the order the headers were dragged into, then by name; no group last.
const groupOrder = () => { const o = shared("agents.groupOrder"); return Array.isArray(o) ? o : []; };
function byGroup(x, y) {
  if (!x || !y) return (x ? 0 : 1) - (y ? 0 : 1);
  const o = groupOrder();
  const i = o.indexOf(x), j = o.indexOf(y);
  return (i < 0 ? Infinity : i) - (j < 0 ? Infinity : j) || x.localeCompare(y);
}

// Folder rules: an agent in `folder` (or below it) on `machine` joins `group` by itself.
const rules = () => { const r = shared("agents.rules"); return Array.isArray(r) ? r : []; };
function ruleFor(machine, cwd) {
  if (!cwd) return null;
  return rules().filter((r) => (r.machine ?? null) === machine && (cwd === r.folder || cwd.startsWith(r.folder.replace(/\/$/, "") + "/")))
    .sort((a, b) => b.folder.length - a.folder.length)[0] ?? null;
}

// The same labels on several terminals; resolves with what went wrong, if anything.
async function writeMany(addresses, values) {
  const errors = [];
  await Promise.all(addresses.map(async (a) => {
    try {
      const r = await writeTags(a, values);
      if (r.code) errors.push(`${a}: ${r.stderr || r.stdout}`);
    } catch (e) {
      errors.push(`${a}: ${e}`);
    }
  }));
  return errors;
}

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

// Drops what an agent puts before its title: a status glyph or spinner and the separator
// after it ("✦  Working", "⠋ - Thinking"), and Codex's blinking "[ ! ] " / "[ . ] " mark.
// Stops at an opening bracket or quote, so a title that starts with one ("[web] login") keeps it.
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^\[ [!.] \] /, "").trim();

function leadPanes(all) {
  const leads = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const current = leads.get(p.tab);
    // First agent, else first focused terminal, else first terminal in the tab.
    if (!current || (!current.program?.agent && (p.program?.agent || (!current.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}

function title(tab, l) {
  const prog = l?.program?.name;
  const live = clean(l?.title);
  // clean() would strip a path's leading ~ or /: test the title with only its status glyph gone.
  const path = /^[~/]|^[A-Za-z]:\\/.test((l?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== (l?.terminal ?? l?.address) && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== l?.program?.key;
  return (tab.name === prog || !tab.named) && telling ? live : tab.name;
}
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
// A sub-agent without a pane isn't in agents(): its raw word, error counting as
// blocked. It's never done: it reports to its parent, and the parent's done is the news.
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};
const SORTS = [
  { id: "priority", label: "Priority", icon: "clock" },
  { id: "grouped", label: "Grouped by space", icon: "layers" },
  { id: "custom", label: "By group", icon: "layers" },
];
const sortOf = () => SORTS.find((s) => s.id === shared("agents.sort")) ?? SORTS[0];
const SECTION = { 4: "Needs you", 3: "Done", 2: "Working", 1: "Idle" };
const SECTION_STATUS = { 4: "blocked", 3: "done", 2: "working" };

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// The agent's icon from the app's program table: a one-color glyph or a picture.
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

export default class Agents extends View {
  init(_props, cx) {
    if (props()?.sortMenu) return;
    if (props()?.edit) return this.initEdit(cx);
    if (props()?.groupEdit) return this.initGroupEdit(cx);
    this.folded = new Set();
    this.rows = new Map();
    this.autoTried = new Set();
    // Each agent's last state and when it changed (ms), kept across restarts.
    try { this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}"); } catch { this.changed = {}; }
    if (!this.changed || typeof this.changed !== "object" || Array.isArray(this.changed)) this.changed = {};
    try { this.pendingPins = JSON.parse(localStorage.getItem("pins") ?? "[]"); } catch { this.pendingPins = []; }
    if (!Array.isArray(this.pendingPins)) this.pendingPins = [];
    if (!this.pendingPins.length) localStorage.removeItem("pins");
    this.migratingPins = new Set();
    cx.timer.every(30000, (cx) => cx.notify());
    // alt+1..9 (keys.json "agents-grouped.n<N>"): focus the Nth agent row, as herdr TUI's focus_agent.
    this.order = [];
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c.endsWith("edit")) this.editFocused();
        else if (c.endsWith("hold") || c.endsWith("release")) {
          // extras/macos-option-hold helper: numbers while Option is held.
          this.unflash?.cancel();
          this.flash = c.endsWith("hold");
        } else if (c.endsWith("show")) {
          // alt+0: badge the first nine rows with their alt+N number for 3 s.
          this.flash = true;
          this.unflash?.cancel();
          this.unflash = cx.timer.after(3000, (cx) => { this.flash = false; cx.notify(); });
        } else {
          const n = Number(/(\d)$/.exec(c)?.[1]);
          const address = this.order[n - 1];
          if (address) run("agent.focus", { terminal: address });
        }
        cx.notify();
      }
    });
  }

  // Stamps agents whose state changed. Done and idle count as one: looking at a
  // finished agent turns done into idle, and looking isn't the agent doing anything.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    // Gone and old: the list alone is empty right after a start.
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  // Keep offline pins until their terminal returns, and keep each pending until
  // core echoes the label so a failed write doesn't erase the old pin.
  migratePins(all) {
    const listed = new Map(all.filter((t) => t.state === "live").map((t) => [t.address, t]));
    const pending = this.pendingPins.filter((address) => {
      const terminal = listed.get(address);
      if (!terminal) return true;
      if (terminal.labels?.["herdr.pinned"]) return false;
      if (!this.migratingPins.has(address)) {
        this.migratingPins.add(address);
        run("terminal.pin", { terminal: address, pinned: true });
      }
      return true;
    });
    if (pending.length === this.pendingPins.length) return;
    this.pendingPins = pending;
    if (pending.length) localStorage.setItem("pins", JSON.stringify(pending));
    else localStorage.removeItem("pins");
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  rank(a) {
    return RANK[a.status] ?? 0;
  }

  sortMenu(t) {
    const on = sortOf().id;
    return v_flex()
      .w_full()
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child("Sort agents"))
      .children(SORTS.map((s) => h_flex()
        .id(`sort-${s.id}`)
        .h(31)
        .px(8)
        .gap(9)
        .rounded(7)
        .items_center()
        .text_color(t.foreground)
        .hover((el) => el.bg(t.hover))
        .on_click(() => {
          setShared("agents.sort", s.id);
          closeOverlay(props().overlay);
        })
        .child(svg(`mods/workspace-chrome/${s.icon}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().child(s.label))
        .when(s.id === on, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(14).flex_none().text_color(t.foreground)))));
  }

  // The tag editor: this mod opened again as a dialog with props { edit: address, name, group, icon, group_color }.
  initEdit(cx) {
    const p = props();
    this.fields = TAGS.map((f) => {
      const s = InputState.new({ value: p[f.key] ?? "", placeholder: f.key === "alias" ? p.auto ?? "" : "" });
      s.on("submit", (_e, cx) => this.save(cx));
      s.on("change", (_e, cx) => cx.notify());
      return { ...f, state: s };
    });
    this.ruleOn = Boolean(p.cwd) && ruleFor(machineOf(p.edit), p.cwd)?.folder === p.cwd;
    this.fields[0].state.focus();
    cx.timer.after(600, () => this.fields[0].state.focus());
    this.handle = cx.focus_handle();
  }

  save(cx) {
    if (this.saving) return;
    this.saving = true;
    const p = props();
    const values = Object.fromEntries(this.fields.map((f) => [f.key, f.state.value()]));
    // The folder rule: on with a group adds (or moves) it, off or without a group removes it.
    if (p.cwd) {
      const machine = machineOf(p.edit);
      const group = values.group.trim();
      const others = rules().filter((r) => !((r.machine ?? null) === machine && r.folder === p.cwd));
      const next = this.ruleOn && group ? [...others, { machine, folder: p.cwd, group }] : others;
      if (JSON.stringify(next) !== JSON.stringify(rules())) setShared("agents.rules", next);
    }
    // group_auto: someone chose this agent's group, so a folder rule leaves it alone from now on.
    values.group_auto = "done";
    // Wait for hc before closing: closing the copy cancels its pending calls.
    cx.spawn(async () => {
      try {
        const r = await writeTags(p.edit, values);
        if (r.code) notify({ title: "Couldn't save the agent's group", body: r.stderr || r.stdout, level: "error" });
      } catch (e) {
        notify({ title: "Couldn't save the agent's group", body: String(e), level: "error" });
      }
      closeOverlay(p.overlay);
    });
  }

  button(t, id, text, primary, action) {
    return h_flex().id(id).h(32).px(14).items_center().rounded(8)
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium().cursor_pointer()
      .hover((s) => s.opacity(0.88)).on_click(action).child(text);
  }

  // A dialog: title, a scrolling body, then the buttons; Esc closes it.
  dialog(t, id, title, body, buttons) {
    const p = props();
    return v_flex().id(id).track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(p.overlay); cx.stop_propagation(); } })
      .size_full().p(18).bg(t.popover).text_color(t.foreground)
      .child(h_flex().flex_none().items_center().child(div().flex_1().truncate().text_size(15).font_semibold().child(title))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(v_flex().id(`${id}-body`).flex_1().min_h(0).overflow_y_scrollbar().children(body))
      .child(h_flex().flex_none().pt(16).gap(8).items_center().children(buttons));
  }

  fieldLabel(t, text) {
    return div().pt(14).pb(6).text_size(11.5).text_color(t.dim).child(text);
  }

  input(t, state) {
    return Input.new(state).h(34).px(10).rounded(9).border_1().border_color(t.input).bg(t.background).text_size(12.8).text_color(t.foreground);
  }

  editor(t) {
    const p = props();
    const body = this.fields.flatMap((f) => [
      this.fieldLabel(t, f.label),
      this.input(t, f.state),
      ...(f.key === "group" ? [this.groupChips(t, f)] : []),
      ...(f.key === "icon" ? [this.picker(t, f, EMOJIS, (e) => div().text_size(15).child(e), 96)] : []),
      ...(f.key === "group_color" ? [this.picker(t, f, SWATCHES, (c) => div().size(16).rounded(8).bg(c))] : []),
    ]);
    if (p.cwd) body.push(h_flex().id("tag-rule").pt(14).gap(8).items_center().cursor_pointer()
      .on_click((_e, cx) => { this.ruleOn = !this.ruleOn; cx.notify(); })
      .child(div().size(16).flex_none().rounded(4).border_1().border_color(this.ruleOn ? t.accent : t.input)
        .bg(this.ruleOn ? t.accent : t.background).flex().items_center().justify_center()
        .when(this.ruleOn, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(12).text_color(t.accent_foreground))))
      .child(div().flex_1().min_w(0).text_size(11.5).text_color(t.muted).child(`Also put the other agents in ${p.cwd.replace(/^\/(Users|home)\/[^/]+/, "~")} in this group`)));
    body.push(div().pt(10).text_size(11.5).text_color(t.dim).child("Leave a field empty to remove it."));
    return this.dialog(t, "tag-editor", `Edit agent · ${p.name ?? p.edit}`, body, [
      div().flex_1(),
      this.button(t, "tag-cancel", "Cancel", false, () => closeOverlay(p.overlay)),
      this.button(t, "tag-save", "Save", true, (_e, cx) => this.save(cx)),
    ]);
  }

  // The groups in use, as chips that fill the Group field (with the group's color dot).
  groupChips(t, f) {
    const now = f.state.value().trim();
    const groups = [...groupsIn(terminals(), t)].sort(([x], [y]) => byGroup(x, y));
    return h_flex().flex_wrap().gap(4).pt(8).children(groups.map(([g, c], i) => {
      const on = now === g;
      return h_flex().id(`pick-grp-${i}`).h(24).px(9).gap(6).items_center().rounded(12).cursor_pointer()
        .border_1().border_color(on ? t.accent : t.input).when(on, (el) => el.bg(t.selected))
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => { f.state.set_value(on ? "" : g); cx.notify(); })
        .child(div().size(8).flex_none().rounded(4).bg(c))
        .child(div().text_size(11.5).child(g));
    }));
  }

  // The group editor: this mod opened again as a dialog with props { groupEdit: name, color }.
  initGroupEdit(cx) {
    const p = props();
    this.nameState = InputState.new({ value: p.groupEdit });
    this.colorField = { key: "group_color", state: InputState.new({ value: p.color ?? "", placeholder: "picked from the name" }) };
    for (const s of [this.nameState, this.colorField.state]) {
      s.on("submit", (_e, cx) => this.saveGroup(cx));
      s.on("change", (_e, cx) => cx.notify());
    }
    this.nameState.focus();
    cx.timer.after(600, () => this.nameState.focus());
    this.handle = cx.focus_handle();
  }

  // Renames and recolors every member (or ungroups them all); folder rules and the header order follow.
  saveGroup(cx, ungroup = false) {
    if (this.saving) return;
    this.saving = true;
    const p = props();
    const old = p.groupEdit;
    const name = ungroup ? "" : this.nameState.value().trim();
    const color = ungroup ? "" : this.colorField.state.value().trim();
    const members = terminals().filter((x) => x.state === "live" && groupName(x) === old).map((x) => x.address);
    setShared("agents.rules", rules().flatMap((r) => (r.group !== old ? [r] : name ? [{ ...r, group: name }] : [])));
    setShared("agents.groupOrder", [...new Set(groupOrder().flatMap((g) => (g !== old ? [g] : name ? [name] : [])))]);
    cx.spawn(async () => {
      const errors = await writeMany(members, { group: name, group_color: color, group_auto: "done" });
      if (errors.length) notify({ title: "Couldn't update the group", body: errors.join("\n"), level: "error" });
      closeOverlay(p.overlay);
    });
  }

  groupEditor(t) {
    const p = props();
    const folders = rules().filter((r) => r.group === p.groupEdit);
    const body = [
      this.fieldLabel(t, "Name"),
      this.input(t, this.nameState),
      this.fieldLabel(t, "Color (#hex, optional: else picked from the name)"),
      this.input(t, this.colorField.state),
      this.picker(t, this.colorField, SWATCHES, (c) => div().size(16).rounded(8).bg(c)),
    ];
    if (folders.length) {
      body.push(this.fieldLabel(t, "Agents in these folders join by themselves"));
      for (const [i, r] of folders.entries()) body.push(h_flex().h(28).gap(8).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(12).child(`${r.machine ? `${r.machine}: ` : ""}${r.folder.replace(/^\/(Users|home)\/[^/]+/, "~")}`))
        .child(div().id(`rule-rm-${i}`).px(6).rounded(5).text_size(11.5).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => setShared("agents.rules", rules().filter((x) => x !== r && !(x.folder === r.folder && (x.machine ?? null) === (r.machine ?? null)))))
          .child("Remove")));
    }
    return this.dialog(t, "group-editor", `Edit group · ${p.groupEdit}`, body, [
      this.button(t, "group-ungroup", "Ungroup all", false, (_e, cx) => this.saveGroup(cx, true)),
      div().flex_1(),
      this.button(t, "group-cancel", "Cancel", false, () => closeOverlay(p.overlay)),
      this.button(t, "group-save", "Save", true, (_e, cx) => this.saveGroup(cx)),
    ]);
  }

  editGroup(name) {
    const color = terminals().find((x) => groupName(x) === name && HEX.test(x.labels?.group_color ?? ""))?.labels.group_color ?? "";
    const n = rules().filter((r) => r.group === name).length;
    openOverlay({ mod: SELF, kind: "dialog", width: 400, height: Math.min(640, 330 + (n ? 40 + 28 * n : 0)), props: { groupEdit: name, color } });
  }

  // ctrl-a e: the focused terminal's agent, as its row shows it.
  editFocused() {
    const r = this.rows.get(focused()?.terminal ?? "");
    if (r) this.editTags(r.a, r.tag, r.name, r.auto);
    else notify({ title: "No agent to edit", body: "Focus an agent's terminal first.", level: "info" });
  }

  // A row of chips that fill field `f`; clicking the chosen one again clears it.
  picker(t, f, values, face, height) {
    const now = f.state.value().trim();
    const chips = h_flex().flex_wrap().gap(4).children(values.map((v, i) => {
      const on = now.toLowerCase() === v.toLowerCase();
      return div().id(`pick-${f.key}-${i}`).size(28).flex().items_center().justify_center().rounded(7).cursor_pointer()
        .border_1().border_color(on ? t.accent : t.popover).when(on, (el) => el.bg(t.selected))
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => { f.state.set_value(on ? "" : v); cx.notify(); })
        .child(face(v, on));
    }));
    return height ? div().id(`pick-${f.key}`).mt(8).h(height).overflow_y_scrollbar().child(chips) : div().pt(8).child(chips);
  }

  // Drag-and-drop: a released drag moves the dragged agent into `group` ("" = no group).
  dropInto(group, cx) {
    const from = this.drag;
    this.drag = this.over = null;
    cx.notify();
    const a = agents().find((x) => x.address === from);
    const now = (terminals().find((x) => x.address === from)?.labels?.group ?? "").trim();
    if (!a || now === group) return;
    cx.spawn(async () => {
      try {
        const r = await writeTags(from, { group, group_auto: "done" });
        if (r.code) notify({ title: "Couldn't move the agent", body: r.stderr || r.stdout, level: "error" });
      } catch (e) {
        notify({ title: "Couldn't move the agent", body: String(e), level: "error" });
      }
    });
  }

  // A header dragged in "By group": goes where the target header is; the order is remembered.
  dropGroup(cx, shown) {
    const from = this.dragG;
    const to = this.overG;
    this.dragG = this.overG = null;
    cx.notify();
    if (!to || to === from) return;
    const names = shown.filter((g) => g !== from);
    names.splice(names.indexOf(to) + (shown.indexOf(from) < shown.indexOf(to) ? 1 : 0), 0, from);
    setShared("agents.groupOrder", [...names, ...groupOrder().filter((g) => !names.includes(g))]);
  }

  // The drop target under the pointer: a row or header id and the group it stands for (null: none).
  dragOver(id, group, cx) {
    if (this.drag && this.over !== id) { this.over = id; this.overGroup = group; cx.notify(); }
  }

  editTags(a, tag, name, auto) {
    const cwd = terminals().find((x) => x.address === a.address)?.cwd ?? null;
    openOverlay({ mod: SELF, kind: "dialog", width: 400, height: cwd ? 690 : 650, props: { edit: a.address, cwd, name, auto, alias: tag.alias ?? "", group: tag.group ?? "", icon: tag.icon ?? "", group_color: tag.group_color ?? "" } });
  }

  peek(addr) {
    run("terminal.peek", { terminal: addr });
  }

  // Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
  tree(all, addr, lead = []) {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [
        { t: k, lines: [...lead, last ? "└" : "├"] },
        ...this.tree(all, k.address, [...lead, last ? "" : "│"]),
      ];
    });
  }

  subRow(t, s, shown, compact) {
    const k = s.t;
    const st = kidStatus(k, this.listed);
    const pic = icon(k.program, 14, t.foreground);
    const on = k.address === shown;
    return h_flex()
      .id(`sub-${k.address}`)
      .pl(39)
      .pr(8)
      .rounded(8)
      .h(26)
      .flex_none()
      .gap(0)
      .items_center()
      .text_size(12.5)
      .when(on, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => (this.listed.has(k.address) ? run("pane.focus", { terminal: k.address }) : this.peek(k.address)))
      .children(s.lines.map(l => div().self_start().mt(-4).w(9).h(17).mr(4).flex_none()
        .when(Boolean(l), el => el.border_l(1.5).border_color(t.input))
        .when(l === "└" || l === "├", el => el.border_b(1.5).rounded_bl(6))))
      .when(Boolean(pic), el => el.child(div().mr(8).child(pic)))
      .child(div().flex_1().truncate().text_color(on ? t.foreground : t.muted).child(k.name || k.template || k.program?.name || k.address))
      .child(this.status(t, { status: st }, compact));
  }

  // compact: a ! for blocked where a header already says "Needs you".
  status(t, a, compact = false) {
    const color = t[a.status] ?? t.dim;
    if (a.status === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.working).spin(900);
    if (a.status === "blocked" && compact) return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    if (a.status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
    // Idle: a ring; done: a dot.
    if (a.status === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
    return div().size(7).mx(3).flex_none().rounded(4).bg(a.status === "done" ? color : t.dim + "00");
  }

  render(cx) {
    const t = theme();
    if (props()?.sortMenu) return this.sortMenu(t);
    if (props()?.edit) return this.editor(t);
    if (props()?.groupEdit) return this.groupEditor(t);
    const collapsed = narrow();
    this.rows.clear();
    const sort = sortOf();
    let list = agents();
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    const all = terminals();
    this.migratePins(all);
    const shown = focused()?.agent;
    const now = Date.now();
    this.track(list, now);
    // A kept sub-agent (one with a pane) is in agents() too: where a tree shows
    // it, it gets no row of its own, unless it's pinned.
    const nested = new Set(collapsed ? [] : list.flatMap((a) => this.tree(all, a.address).map((s) => s.t.address)));
    list = list.filter((a) => a.pinned || !nested.has(a.address));
    const tabCounts = new Map();
    for (const a of list) tabCounts.set(a.tab, (tabCounts.get(a.tab) ?? 0) + 1);
    const byPriority = sort.id === "priority";
    const custom = sort.id === "custom";
    const tagMap = new Map(all.map((x) => [x.address, x.labels ?? {}]));
    const tagOf = (a) => tagMap.get(a.address) ?? {};
    const groupOf = (a) => (tagOf(a).group ?? "").trim();
    const known = groupsIn(all, t);
    const colorOf = (g) => known.get(g) ?? hue(g, t);
    // Folder rules: an ungrouped agent in a rule's folder joins its group, once; an agent whose
    // group someone chose (group_auto) is left alone, so ungrouping it sticks.
    if (rules().length) {
      const cwds = new Map(all.map((x) => [x.address, x.cwd]));
      for (const a of list) {
        if (groupOf(a) || tagOf(a).group_auto || this.autoTried.has(a.address)) continue;
        const r = ruleFor(machineOf(a.address), cwds.get(a.address));
        if (!r) continue;
        this.autoTried.add(a.address);
        cx.spawn(async () => { await writeMany([a.address], { group: r.group, group_auto: "rule" }); });
      }
    }
    const urgency = new Map(list.map((a) => [a.address, Math.max(this.rank(a), ...this.tree(all, a.address).map((s) => RANK[kidStatus(s.t, this.listed)] ?? 0))]));
    const rankOf = (a) => urgency.get(a.address);
    const byUrgency = (x, y) => rankOf(y) - rankOf(x) || this.since(y) - this.since(x) || y.seq - x.seq;
    if (byPriority) list = [...list].sort(byUrgency);
    // By group: groups in their dragged order, then by name, ungrouped last; most urgent first inside each.
    if (custom) list = [...list].sort((x, y) => byGroup(groupOf(x), groupOf(y)) || byUrgency(x, y));
    const pinned = list.filter((a) => a.pinned);
    const rest = list.filter((a) => !a.pinned);
    list = [...pinned, ...rest];
    setAgentOrder(list.map((a) => a.address));
    this.order = list.map((a) => a.address);

    const withKids = (a, i) => {
      const subs = collapsed ? [] : this.tree(all, a.address);
      const r = row(a, i, subs);
      if (this.folded.has(a.address)) return [r];
      return [r, ...subs.map((s) => this.subRow(t, s, shown, byPriority))];
    };

    // The fold chevron; folded, the count too, colored by the most urgent one.
    const fold = (a, subs) => {
      const sts = subs.map((s) => kidStatus(s.t, this.listed));
      const top = sts.reduce((m, s) => ((RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m), null);
      const open = !this.folded.has(a.address);
      return div()
        .id(`fold-${a.address}`)
        .h(18)
        .px(3)
        .gap(3)
        .flex()
        .items_center()
        .rounded(4)
        .text_size(11)
        .text_color(open ? t.dim : (t[top] ?? t.dim))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          open ? this.folded.add(a.address) : this.folded.delete(a.address);
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none())
        .when(!open, (el) => el.child(String(subs.length)));
    };

    // A row reads "space \u00b7 detail": the detail is a tab someone named or the
    // agent's own title, never an automatic tab number unless two rows would
    // otherwise read the same.
    // Read the pane snapshot once: every host read copies the whole list into JS.
    const leads = leadPanes(panes());
    const tabs = new Map(spaces().flatMap(s => s.tabs).map(tab => [tab.id, tab]));
    const labels = new Map(list.map(a => {
      const tab = tabs.get(a.tab);
      const many = tabCounts.get(a.tab) > 1;
      return [a.address, tab ? title(many ? { ...tab, named: false } : tab, many ? a : leads.get(a.tab)) : (a.title || a.program?.name || "")];
    }));
    const label = (a) => labels.get(a.address);
    const detail = new Map(list.map(a => [a.address, /^\d+$/.test(label(a)) ? null : label(a)]));
    const seen = {};
    for (const a of list) { const k = `${a.space_name}\u0000${detail.get(a.address) ?? ""}`; seen[k] = (seen[k] ?? 0) + 1; }
    for (const a of list) {
      if (detail.get(a.address) == null && seen[`${a.space_name}\u0000`] > 1) detail.set(a.address, label(a));
    }

    const row = (a, i, subs = []) => {
      const tag = tagOf(a);
      const group = groupOf(a);
      const pic = tag.icon
        ? div().w(16).flex_none().flex().items_center().justify_center().text_size(14).child(tag.icon)
        : icon(a.program, 16, t.foreground);
      const more = detail.get(a.address);
      // An agent on another machine (`vps/t7`) says which.
      const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
      if (collapsed) {
        const plain = a.space_name || label(a);
        this.rows.set(a.address, { a, tag, name: (tag.alias ?? "").trim() || plain, auto: plain });
        return h_flex()
          .id(`ag-${a.address}`)
          .h(26)
          .px(8)
          .flex_none()
          .items_center()
          .gap(4)
          .hover((s) => s.bg(t.hover))
          .on_click(() => run("pane.focus", { pane: a.pane }))
          .child(div().flex_1().min_w(0).whitespace_nowrap().text_right().text_color(t.muted).child(String(i + 1)))
          .child(h_flex().w(14).flex_none().items_center().justify_center().child(this.status(t, a, true)));
      }
      const when = this.since(a);
      const idle = a.status === "idle" && !a.focused;
      const isPinned = a.pinned;
      const pin = div()
        .id(`pin-${a.address}`)
        .flex_none()
        .p(2)
        .rounded(4)
        .text_color(t.dim)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(isPinned ? "Unpin" : "Pin to the top")
        .on_click((_e, cx) => {
          cx.stop_propagation();
          run("terminal.pin", { terminal: a.address, pinned: !isPinned });
          // The row moves away from under the pointer, and no hover-out comes.
          this.hovered = null;
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${isPinned ? "pin-off" : "pin"}.svg`).size(13));
      // Under a space header the space goes without saying; an automatic tab number says nothing.
      // Without a space header above (priority, pinned) the row names its space.
      const full = byPriority || custom || isPinned;
      const auto = full ? a.space_name || label(a) : more ?? (/^\d+$/.test(label(a)) ? a.program?.name || label(a) : label(a));
      // A name given in the right-click dialog (label `alias`) wins over the automatic one.
      const name = (tag.alias ?? "").trim() || auto;
      this.rows.set(a.address, { a, tag, name, auto });
      return h_flex()
        .id(`ag-${a.address}`)
        .px(8)
        .h(30)
        .flex_none()
        .rounded(8)
        .items_center()
        .gap(9)
        .when(a.focused, (el) => el.bg(t.selected))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_hover((on, cx) => {
          if (on) this.hovered = a.address;
          else if (this.hovered === a.address) this.hovered = null;
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .on_mouse_down("left", () => { this.drag = a.address; this.over = null; })
        .on_mouse_move((_e, cx) => ((group || custom) && this.drag !== a.address ? this.dragOver(a.address, group, cx) : this.dragOver(null, null, cx)))
        .when(Boolean(this.over) && this.drag === a.address, (el) => el.opacity(0.5))
        .when(this.over === a.address, (el) => el.bg(t.hover).border_1().border_color(group ? colorOf(group) : t.dim))
        .on_mouse_down("right", (_e, cx) => {
          cx.stop_propagation();
          this.editTags(a, tag, name, auto);
        })
        .when(Boolean(group) && !custom, (el) => el.border_l(2).border_color(colorOf(group)))
        .when(this.flash && this.order.indexOf(a.address) >= 0 && this.order.indexOf(a.address) < 9, (el) => el.child(
          div().w(16).h(16).flex_none().flex().items_center().justify_center().rounded(4)
            .bg(t.accent).text_color(t.accent_foreground).text_size(11).font_semibold()
            .child(String(this.order.indexOf(a.address) + 1))))
        .when(Boolean(pic), el => el.child(div().id(`agent-fold-${a.address}`)
          .when(subs.length > 0, el => el.on_click((_e, cx) => {
            cx.stop_propagation();
            this.folded.has(a.address) ? this.folded.delete(a.address) : this.folded.add(a.address);
            cx.notify();
          })).child(pic)))
        .child(h_flex().flex_1().min_w(0).gap(5).items_center()
          .child(div().min_w(0).max_w(full && more ? 120 : 200).truncate().text_color(idle ? t.muted : t.foreground).child(name))
          .when(full && Boolean(more), el => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`\u00b7 ${more}`))))
        .when(Boolean(group) && !custom, el => el.child(div().flex_none().max_w(80).truncate().text_size(10).font_medium().text_color(colorOf(group)).child(group)))
        .when(Boolean(machine), el => el.child(div().text_size(10).text_color(t.dim).child(machine)))
        .when(subs.length > 0, el => el.child(fold(a, subs)))
        .when(this.hovered === a.address, el => el.child(pin))
        .when(this.hovered !== a.address && Boolean(when), el => el.child(div().flex_none().text_size(11).text_color(t.dim).child(duration(now - when))))
        .child(this.status(t, a, byPriority && !isPinned));
    };

    // Groups in list order: spaces (grouped) or priority sections. Agents of a
    // space are next to each other in agents(), so neighbours make a group.
    const groups = pinned.length ? [{ id: "pinned", label: "Pinned", status: null, members: pinned }] : [];
    for (const a of rest) {
      const r = rankOf(a) || RANK.idle;
      const g = groupOf(a);
      const id = custom ? `grp-${g}` : byPriority ? `sec-${r}` : `sp-${a.space}`;
      if (groups.at(-1)?.id === id) groups.at(-1).members.push(a);
      else if (custom) groups.push({ id, label: g || "No group", status: null, color: g ? colorOf(g) : null, members: [a] });
      else groups.push({ id, label: byPriority ? SECTION[r] : a.space_name || "", status: byPriority ? SECTION_STATUS[r] : null, members: [a] });
    }

    // A group's header; it folds the group. Folded, it says how many and the most urgent state.
    const header = (g) => {
      const open = !this.folded.has(g.id);
      const top = g.members.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
      const isGroup = custom && g.id.startsWith("grp-");
      const name = isGroup ? g.id.slice(4) : "";
      return h_flex()
        .id(g.id)
        .px(8)
        .pt(8)
        .h(30)
        .flex_none()
        .gap(6)
        .items_center()
        .text_size(11)
        .font_medium()
        .cursor_pointer()
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => {
          open ? this.folded.add(g.id) : this.folded.delete(g.id);
          cx.notify();
        })
        .on_mouse_move((_e, cx) => {
          if (this.dragG) {
            if (this.overG !== (name || null)) { this.overG = name || null; cx.notify(); }
          } else if (isGroup) this.dragOver(g.id, name, cx);
          else this.dragOver(null, null, cx);
        })
        .when(isGroup, (el) => el.when(this.over === g.id, (el) => el.text_color(t.foreground).bg(t.hover).rounded(6)))
        .when(Boolean(name), (el) => el
          .on_mouse_down("left", () => { this.dragG = name; this.overG = null; })
          .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); this.editGroup(name); })
          .when(Boolean(this.overG) && this.dragG === name, (el) => el.opacity(0.5))
          .when(Boolean(this.dragG) && this.overG === name && this.dragG !== name, (el) => el.border_t(2).border_color(t.accent)))
        .when(Boolean(g.color), (el) => el.child(div().size(8).flex_none().rounded(4).bg(g.color)))
        .child(div().truncate().text_color(g.color ?? t[g.status] ?? t.dim).child(g.label))
        .when(byPriority || custom || !open, (el) => el.child(div().text_color(t.dim).child(String(g.members.length))))
        .child(div().flex_1())
        .when(!open, (el) => el
          .when(!byPriority && top && top !== "idle", (el) => el.child(this.status(t, { status: top }, true)))
          .child(svg("mods/workspace-chrome/chevron-right.svg").size(11).flex_none().text_color(t.dim)));
    };
    const rows = collapsed
      ? list.flatMap(withKids)
      : groups.flatMap((g) => [header(g), ...(this.folded.has(g.id) ? [] : g.members.flatMap(withKids))]);

    const endDrag = (cx) => { if (this.drag || this.dragG) { this.drag = this.over = this.dragG = this.overG = null; cx.notify(); } };
    const shownGroups = groups.filter((g) => g.id.startsWith("grp-") && g.id !== "grp-").map((g) => g.id.slice(4));
    return v_flex()
      .id("agents-list")
      // Move events don't say which button is down: a release anywhere, or leaving the list, ends a drag.
      .on_mouse_up("left", (_e, cx) => (this.dragG ? this.dropGroup(cx, shownGroups) : this.drag && this.over ? this.dropInto(this.overGroup, cx) : endDrag(cx)))
      .on_hover((on, cx) => { if (!on) endDrag(cx); })
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .border_t(1)
      .border_color(t.border)
      .text_size(13)
      .when(!collapsed, (el) =>
        el.child(
          h_flex()
            .px(16)
            .h(41)
            .pt(14)
            .pb(5)
            .flex_none()
            .items_center()
            .justify_between()
            .child(div().text_size(11.5).font_medium().text_color(t.dim).child("Agents"))
            .child(
              div()
                .id("ag-sort")
                .text_size(11)
                .text_color(t.dim)
                .hover((s) => s.text_color(t.foreground))
                .on_click(() => openOverlay({ mod: SELF, kind: "popup", width: 200, height: 172, props: { sortMenu: true } }))
                .tooltip(`Sort agents: ${sort.label}`)
                .child(svg(`mods/workspace-chrome/${sort.icon}.svg`).size(14)),
            ),
        ),
      )
      .when(list.length === 0 && !collapsed, (el) =>
        el.child(div().px(12).text_size(12).text_color(t.dim).child("No agent status yet. Agents show up here when they report their status. Older versions and agents inside tmux may not.")),
      )
      .child(v_flex().id("ag-list").flex_1().min_h(0).px(collapsed ? 0 : 8).overflow_y_scrollbar().mode("always").children(rows))
      .when(collapsed, (el) =>
        el.child(
          h_flex()
            .h(28)
            .items_center()
            .justify_center()
            .child(
              div()
                .id("collapse")
                .text_size(13)
                .text_color(t.dim)
                .hover((s) => s.text_color(t.foreground))
                .on_click(toggleSidebar)
                .child("»"),
            ),
        ),
      );
  }
}
