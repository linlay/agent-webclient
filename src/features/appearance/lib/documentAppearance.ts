import type { DesktopSkinDefinition } from "@/shared/styles/appearance/skinDefinition";
import type { ThemeMode } from "@/shared/styles/appearance/bootstrap";

export type AppearancePresentation = {
  resolvedTheme: ThemeMode;
  skin: DesktopSkinDefinition;
  backgroundMode: "standalone" | "host" | "host-fallback";
  imageUrl?: string;
  imagePosition?: string;
};

function colorChannels(value: string): number[] | null {
  if (value === "transparent") return [0, 0, 0, 0];
  if (value.startsWith("#")) {
    let hex = value.slice(1);
    if (hex.length < 5) hex = [...hex].map((c) => c + c).join("");
    if (![6, 8].includes(hex.length)) return null;
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(hex.length === 8 ? parseInt(hex.slice(6), 16) / 255 : 1);
  }
  const match = /^rgba?\(([^)]+)\)$/.exec(value);
  if (!match) return null;
  const channels = match[1].split(",").map(Number);
  return channels.length === 3 ? [...channels, 1] : channels.length === 4 ? channels : null;
}
export function opaqueColor(value: string, backing: string): string {
  const bg = colorChannels(backing) || [255, 255, 255, 1];
  const fg = colorChannels(value) || bg;
  return `rgb(${fg.slice(0, 3).map((channel, i) => Math.round(channel * fg[3] + bg[i] * (1 - fg[3]))).join(", ")})`;
}

export function readableSurface(value: string, backing: string, minAlpha = 0.9): string {
  const channels = colorChannels(value) || colorChannels(backing)!;
  return `rgba(${channels.slice(0, 3).join(", ")}, ${Math.max(minAlpha, channels[3])})`;
}

export function createDocumentAppearanceTarget(root = document.documentElement) {
  const previous = new Map<string, { value: string; priority: string }>();
  const attributes = new Map(["data-theme", "data-skin", "data-page-background"].map((name) => [name, root.getAttribute(name)]));
  let owned = new Set<string>();
  function set(name: string, value: string) {
    if (!previous.has(name)) previous.set(name, { value: root.style.getPropertyValue(name), priority: root.style.getPropertyPriority(name) });
    root.style.setProperty(name, value);
    owned.add(name);
  }
  function restore(name: string) {
    const old = previous.get(name);
    if (old?.value) root.style.setProperty(name, old.value, old.priority);
    else root.style.removeProperty(name);
  }
  return {
    apply(snapshot: AppearancePresentation) {
      owned.forEach(restore);
      owned = new Set();
      root.dataset.theme = snapshot.resolvedTheme;
      root.dataset.skin = snapshot.skin.id;
      root.dataset.pageBackground = snapshot.backgroundMode;
      for (const [name, value] of Object.entries(snapshot.skin.tokens[snapshot.resolvedTheme])) set(name, value);
      // Base is always opaque, even if a portable skin requests a translucent
      // base. Reader/overlay colors composite against this safe backing color.
      const fallback = snapshot.resolvedTheme === "dark" ? "#181818" : "#ffffff";
      const read = (name: string) => getComputedStyle(root).getPropertyValue(name).trim();
      const base = read("--bg-base") || fallback;
      const solidBase = opaqueColor(base, fallback);
      const flatten = (value: string, backing = solidBase) => opaqueColor(value, backing);
      set("--bg-base", solidBase);
      // Pictures cannot erase control/portal/reading surfaces. Guest content
      // such as terminal palettes, iframes and exports is outside this target.
      for (const name of ["--surface-strong", "--control-input-bg", "--control-select-bg", "--control-popover-bg", "--desktop-overlay-panel-bg", "--sidebar-operation-menu-bg"]) {
        set(name, flatten(read(name), solidBase));
      }
      const decorated = snapshot.backgroundMode === "host" || Boolean(snapshot.imageUrl);
      // One continuous veil covers the main chat, including its gutters and
      // composer. Active conversations keep the host picture faint.
      set("--main-chat-surface", decorated ? readableSurface(read("--shell-content-bg"), solidBase, 0.94) : solidBase);
      // The new-chat landing surface reveals the picture even for opaque skins.
      const shellColor = colorChannels(read("--shell-content-bg")) || colorChannels(solidBase)!;
      set("--new-chat-surface", decorated ? `rgba(${shellColor.slice(0, 3).join(", ")}, 0.06)` : solidBase);
      // Only the new-chat composer/cards reveal a little wallpaper; ordinary
      // inputs and portals keep the already-flattened opaque control color.
      const inputColor = colorChannels(read("--control-input-bg")) || colorChannels(solidBase)!;
      set("--new-chat-input-surface", decorated ? `rgba(${inputColor.slice(0, 3).join(", ")}, 0.64)` : read("--control-input-bg"));
      // Management pages share one faint picture layer, including when a skin
      // supplies an opaque shell color. Never fade their text or controls.
      const managementColor = colorChannels(read("--shell-content-bg")) || colorChannels(solidBase)!;
      set("--management-page-surface", decorated ? `rgba(${managementColor.slice(0, 3).join(", ")}, 0.94)` : solidBase);
      set("--reading-surface", decorated ? readableSurface(read("--shell-content-bg"), solidBase) : solidBase);
      set("--shell-sidebar-bg", readableSurface(read("--shell-sidebar-bg"), solidBase));
      set("--panel-surface", read("--surface-strong"));
      if (snapshot.backgroundMode === "host") set("--page-bg", "transparent");
      if (snapshot.backgroundMode === "standalone" && snapshot.imageUrl) {
        set("--page-image", `url(${JSON.stringify(snapshot.imageUrl)})`);
        set("--page-image-position", snapshot.imagePosition || "center");
        set("--page-tint", read("--shell-background-tint") || "transparent");
      }
    },
    dispose() {
      owned.forEach(restore);
      for (const [name, value] of attributes) {
        if (value === null) root.removeAttribute(name); else root.setAttribute(name, value);
      }
    },
  };
}
