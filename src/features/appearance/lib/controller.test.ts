/** @jest-environment jsdom */
import { createAppearanceController } from "./controller";
import { appearanceAssetStore, emptyAssets } from "./assets";
import { THEME_STORAGE_KEY, APPEARANCE_STORAGE_KEY } from "@/shared/styles/appearance/bootstrap";
import type { DesktopAppearanceSnapshot } from "@/shared/contracts/desktopAppearance";

jest.mock("./documentAppearance", () => ({ createDocumentAppearanceTarget: () => ({ apply: jest.fn(), dispose: jest.fn() }) }));
jest.mock("./assets", () => ({ emptyAssets: () => ({ background: null, backgroundName: "", packages: [] }), appearanceAssetStore: jest.fn(), normalizeAppearanceAssets: (value: unknown) => value, validateBackground: jest.fn(), importSkinArchive: jest.fn() }));
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const windowWithBridge = window as Window & { __AGENT_WEBCLIENT_APPEARANCE__?: unknown };
describe("appearance controller", () => {
  let system: { matches: boolean; addEventListener: jest.Mock; removeEventListener: jest.Mock };
  beforeEach(() => {
    localStorage.clear(); window.history.replaceState({}, "", "/");
    globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { DESKTOP_APP: false };
    system = { matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() };
    window.matchMedia = jest.fn(() => system) as unknown as typeof window.matchMedia;
    (appearanceAssetStore as jest.Mock).mockReset().mockResolvedValue(emptyAssets());
    delete windowWithBridge.__AGENT_WEBCLIENT_APPEARANCE__;
  });
  it("never writes host appearance into local preferences and never changes navigation", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ skinId: "mist" }));
    window.history.replaceState({}, "", "/agent/demo?chatId=fixture&theme=light");
    globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { DESKTOP_APP: "true" };
    let push!: (value: DesktopAppearanceSnapshot | null) => void;
    const host: DesktopAppearanceSnapshot = { schemaVersion: 1, revision: 1, resolvedTheme: "dark", skinId: "mist", tokens: { "--accent": "#83c79a" }, background: { mode: "host" } };
    windowWithBridge.__AGENT_WEBCLIENT_APPEARANCE__ = { version: 1, subscribe: (callback: typeof push) => { push = callback; return () => {}; }, getSnapshot: async () => host };
    const initialUrl = location.href;
    const controller = createAppearanceController(); const stop = controller.start(); await flush();
    expect(controller.getSnapshot()).toMatchObject({ resolvedTheme: "dark", backgroundMode: "host", imageUrl: undefined });
    controller.setRouteSearch("?theme=light"); controller.setThemePreference("light"); controller.setSkinId("mist");
    push(null);
    expect(controller.getSnapshot()).toMatchObject({ resolvedTheme: "dark", backgroundMode: "host-fallback" });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('{"skinId":"mist"}');
    expect(appearanceAssetStore).not.toHaveBeenCalled();
    expect(location.href).toBe(initialUrl); stop();
  });
  it.each(["gold", "blue", "mist", "purple"])("restores %s and tracks system changes without persisting resolved colors", async (skinId) => {
    const controller = createAppearanceController(); const stop = controller.start(); await flush();
    controller.setThemePreference("system"); controller.setSkinId(skinId);
    system.matches = true; system.addEventListener.mock.calls[0][1]();
    expect(controller.getSnapshot()).toMatchObject({ preference: "system", resolvedTheme: "dark", selectedSkinId: skinId });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
    stop();
    const restored = createAppearanceController();
    expect(restored.getSnapshot()).toMatchObject({ preference: "system", selectedSkinId: skinId });
  });
  it("keeps URL appearance temporary and returns to the stored preference when it disappears", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    const controller = createAppearanceController(); const stop = controller.start(); await flush();
    controller.setRouteSearch("?hostTheme=light");
    expect(controller.getSnapshot().resolvedTheme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    controller.setRouteSearch(""); expect(controller.getSnapshot().resolvedTheme).toBe("dark"); stop();
  });
  it("preserves current image and reports a failed transaction without applying unsaved assets", async () => {
    const controller = createAppearanceController(); const stop = controller.start(); await flush();
    (appearanceAssetStore as jest.Mock).mockRejectedValueOnce(new Error("quota"));
    await controller.resetBackground();
    expect(controller.getSnapshot()).toMatchObject({ error: "storage", busy: false, backgroundName: "" });
    stop();
  });
});
