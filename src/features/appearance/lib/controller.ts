import { APPEARANCE_STORAGE_KEY, THEME_STORAGE_KEY, readBootAppearance, readThemeModeFromUrl, type ThemeMode, type ThemePreference } from "@/shared/styles/appearance/bootstrap";
import type { DesktopAppearanceSnapshot } from "@/shared/contracts/desktopAppearance";
import type { DesktopSkinDefinition } from "@/shared/styles/appearance/skinDefinition";
import { DESKTOP_SKINS, findDesktopSkin } from "./skins";
import { observeHostAppearance } from "./hostAppearance";
import { createDocumentAppearanceTarget, type AppearancePresentation } from "./documentAppearance";
import { appearanceAssetStore, emptyAssets, normalizeAppearanceAssets, importSkinArchive, validateBackground, type AppearanceAssets } from "./assets";

export type AppearanceSnapshot = AppearancePresentation & {
  preference: ThemePreference;
  selectedSkinId: string;
  desktop: boolean;
  hostReady: boolean;
  assetsLoading: boolean;
  busy: boolean;
  error: string;
  backgroundName: string;
  installedSkins: { id: string; name: string }[];
};

function readSkinPreference(): string {
  try {
    const value = JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) || "null");
    return typeof value?.skinId === "string" && /^(default|mist|pack:[a-z][a-z0-9.-]{0,63})$/.test(value.skinId) ? value.skinId : "default";
  } catch { return "default"; }
}

export function createAppearanceController() {
  const boot = readBootAppearance();
  let snapshot: AppearanceSnapshot = {
    ...boot, preference: boot.preference, selectedSkinId: boot.desktop ? "default" : readSkinPreference(),
    skin: DESKTOP_SKINS[0], backgroundMode: boot.desktop ? "host-fallback" : "standalone",
    hostReady: false, assetsLoading: !boot.desktop, busy: false, error: "", backgroundName: "", installedSkins: [],
  };
  let host: DesktopAppearanceSnapshot | null = null;
  let lastHost: DesktopAppearanceSnapshot | null = null;
  let routeTheme = readThemeModeFromUrl(window.location.search);
  let assets = emptyAssets();
  let systemDark = boot.resolvedTheme === "dark";
  let target: ReturnType<typeof createDocumentAppearanceTarget> | undefined;
  let refs = 0;
  let generation = 0;
  let release: (() => void) | undefined;
  let assetLoad: Promise<void> = Promise.resolve();
  let pending = Promise.resolve();
  let imageGeneration = 0;
  let imageIdentity: Blob | string | undefined;
  let ownedImageUrl: string | undefined;
  let readyImageUrl: string | undefined;
  let failedImages = new Set<Blob | string>();
  const listeners = new Set<() => void>();

  const emit = () => { target?.apply(snapshot); listeners.forEach((listener) => listener()); };
  function resolveSkin(): DesktopSkinDefinition {
    if (snapshot.desktop) {
      const value = host || lastHost;
      return value ? { id: value.skinId, tokens: { light: value.resolvedTheme === "light" ? value.tokens : {}, dark: value.resolvedTheme === "dark" ? value.tokens : {} } } : DESKTOP_SKINS[0];
    }
    const builtin = findDesktopSkin(snapshot.selectedSkinId);
    if (builtin) return builtin;
    const installed = assets.packages.find((skin) => `pack:${skin.manifest.id}` === snapshot.selectedSkinId);
    return installed ? { id: snapshot.selectedSkinId, tokens: { light: installed.manifest.variants.light.tokens, dark: installed.manifest.variants.dark.tokens } } : DESKTOP_SKINS[0];
  }
  function resolveImage(skin: DesktopSkinDefinition, theme: ThemeMode): { image?: Blob | string; position?: string } {
    if (snapshot.desktop) return {};
    if (assets.background && !failedImages.has(assets.background)) return { image: assets.background, position: "center" };
    const installed = assets.packages.find((entry) => `pack:${entry.manifest.id}` === skin.id);
    const background = installed?.manifest.variants[theme].background;
    const image = background ? installed?.images[background.path] : skin.backgrounds?.[theme]?.imageUrl;
    return { image: image && !failedImages.has(image) ? image : undefined, position: background?.position || skin.backgrounds?.[theme]?.position };
  }
  function publish() {
    const resolvedTheme = (snapshot.desktop ? (host || lastHost)?.resolvedTheme : undefined) || routeTheme ||
      (!snapshot.desktop && snapshot.preference !== "system" ? snapshot.preference : systemDark ? "dark" : "light");
    const skin = resolveSkin();
    const image = resolveImage(skin, resolvedTheme);
    if (image.image !== imageIdentity) {
      imageIdentity = image.image;
      const seq = ++imageGeneration;
      if (ownedImageUrl) URL.revokeObjectURL(ownedImageUrl);
      ownedImageUrl = undefined;
      readyImageUrl = undefined;
      if (image.image && refs) {
        const identity = image.image;
        const url = typeof identity === "string" ? identity : URL.createObjectURL(identity);
        if (typeof identity !== "string") ownedImageUrl = url;
        const img = new Image();
        img.onload = () => {
          if (seq !== imageGeneration || !refs) return;
          readyImageUrl = url;
          publish();
        };
        img.onerror = () => {
          if (seq !== imageGeneration || !refs) return;
          failedImages.add(identity);
          snapshot = { ...snapshot, error: "backgroundMissing" };
          publish();
        };
        img.src = url;
      }
    }
    snapshot = { ...snapshot, resolvedTheme, skin, hostReady: Boolean(host),
      backgroundMode: snapshot.desktop ? host?.background.mode === "host" ? "host" : "host-fallback" : "standalone",
      imageUrl: readyImageUrl, imagePosition: image.position,
      backgroundName: assets.backgroundName,
      installedSkins: assets.packages.map((entry) => ({ id: `pack:${entry.manifest.id}`, name: entry.manifest.name })),
    };
    emit();
  }
  function storePreference(theme: ThemePreference, skinId: string) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ skinId }));
    } catch { snapshot = { ...snapshot, error: "storage" }; }
  }
  async function changeAssets(change: (value: AppearanceAssets) => Promise<AppearanceAssets> | AppearanceAssets) {
    if (snapshot.desktop) return;
    const operation = async () => {
      snapshot = { ...snapshot, busy: true, error: "" }; publish();
      try {
        await assetLoad;
        const next = await change(assets);
        await appearanceAssetStore(next);
        assets = next;
        failedImages = new Set();
      } catch (error) {
        snapshot = { ...snapshot, error: error instanceof Error && ["image", "package", "duplicate", "limit"].includes(error.message) ? error.message : "storage" };
      } finally { snapshot = { ...snapshot, busy: false }; publish(); }
    };
    pending = pending.then(operation, operation);
    return pending;
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start() {
      refs++;
      if (refs === 1) {
        const current = ++generation;
        target = createDocumentAppearanceTarget();
        const media = window.matchMedia?.("(prefers-color-scheme: dark)");
        systemDark = media?.matches === true;
        const mediaChange = () => { systemDark = media?.matches === true; publish(); };
        media?.addEventListener("change", mediaChange);
        const storageChange = (event: StorageEvent) => {
          if (snapshot.desktop || (event.key && ![THEME_STORAGE_KEY, APPEARANCE_STORAGE_KEY].includes(event.key))) return;
          snapshot = { ...snapshot, preference: readBootAppearance().preference, selectedSkinId: readSkinPreference() };
          publish();
        };
        window.addEventListener("storage", storageChange);
        const stopHost = snapshot.desktop ? observeHostAppearance((value) => {
          host = value;
          if (value) lastHost = value;
          publish();
        }) : undefined;
        if (!snapshot.desktop) {
          assetLoad = appearanceAssetStore().then((loaded) => {
            if (current !== generation) return;
            // Treat corrupt/missing local assets as recoverable, never a boot failure.
            assets = normalizeAppearanceAssets(loaded);
            snapshot = { ...snapshot, assetsLoading: false };
            if (snapshot.selectedSkinId.startsWith("pack:") && !assets.packages.some((p) => `pack:${p.manifest.id}` === snapshot.selectedSkinId)) snapshot = { ...snapshot, error: "packageMissing" };
            publish();
          }).catch(() => {
            if (current !== generation) return;
            snapshot = { ...snapshot, assetsLoading: false, error: "storage" }; publish();
          });
        }
        release = () => {
          generation++; imageGeneration++; imageIdentity = undefined; readyImageUrl = undefined;
          if (ownedImageUrl) URL.revokeObjectURL(ownedImageUrl);
          ownedImageUrl = undefined;
          media?.removeEventListener("change", mediaChange);
          window.removeEventListener("storage", storageChange);
          stopHost?.(); target?.dispose(); target = undefined;
        };
        publish();
      }
      return () => { refs--; if (!refs) release?.(); };
    },
    setRouteSearch(search: string) {
      const next = readThemeModeFromUrl(search);
      if (next === routeTheme) return;
      routeTheme = next; publish();
    },
    setThemePreference(preference: ThemePreference) {
      if (snapshot.desktop) return;
      routeTheme = null;
      snapshot = { ...snapshot, preference, error: "" };
      storePreference(preference, snapshot.selectedSkinId); publish();
    },
    setSkinId(skinId: string) {
      if (snapshot.desktop || (!findDesktopSkin(skinId) && !assets.packages.some((p) => `pack:${p.manifest.id}` === skinId))) return;
      snapshot = { ...snapshot, selectedSkinId: skinId, error: "" };
      storePreference(snapshot.preference, skinId); publish();
    },
    importBackground: (file: File) => changeAssets(async (value) => ({ ...value, background: await validateBackground(file), backgroundName: file.name.slice(0, 180) })),
    resetBackground: () => changeAssets((value) => ({ ...value, background: null, backgroundName: "" })),
    importPackage: (file: File) => changeAssets(async (value) => {
      let skin;
      try { skin = await importSkinArchive(file); } catch { throw new Error("package"); }
      if (value.packages.some((entry) => entry.manifest.id === skin.manifest.id)) throw new Error("duplicate");
      if (value.packages.length >= 20) throw new Error("limit");
      return { ...value, packages: [...value.packages, skin] };
    }),
    async removePackage(id: string) {
      await changeAssets((value) => ({ ...value, packages: value.packages.filter((entry) => `pack:${entry.manifest.id}` !== id) }));
      if (!snapshot.error && snapshot.selectedSkinId === id) {
        snapshot = { ...snapshot, selectedSkinId: "default" };
        storePreference(snapshot.preference, "default"); publish();
      }
    },
  };
}
export type AppearanceController = ReturnType<typeof createAppearanceController>;
