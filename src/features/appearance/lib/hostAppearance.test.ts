/** @jest-environment jsdom */
import { observeHostAppearance, HOST_APPEARANCE_TIMEOUT } from "./hostAppearance";
import { parseDesktopAppearance, type DesktopAppearanceBridge, type DesktopAppearanceSnapshot } from "@/shared/contracts/desktopAppearance";

const snapshot = (revision = 1, resolvedTheme: "light" | "dark" = "dark"): DesktopAppearanceSnapshot => ({ schemaVersion: 1, revision, resolvedTheme, skinId: "mist", tokens: { "--accent": "#83c79a" }, background: { mode: "host" } });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
describe("host appearance independent lifecycle", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  it("subscribes before reading, rejects stale responses, revokes transparency and resumes at the same revision", async () => {
    let push!: (value: DesktopAppearanceSnapshot | null) => void;
    let respond!: (value: DesktopAppearanceSnapshot) => void;
    const order: string[] = [];
    const bridge: DesktopAppearanceBridge = {
      version: 1,
      subscribe: (listener) => { order.push("subscribe"); push = listener; return jest.fn(); },
      getSnapshot: jest.fn(() => { order.push("read"); return new Promise((resolve) => { respond = resolve; }); }),
    };
    const changed = jest.fn();
    const stop = observeHostAppearance(changed, () => bridge);
    await flush();
    expect(order).toEqual(["subscribe", "read"]);
    push(snapshot(4)); respond(snapshot(2)); await flush();
    expect(changed).toHaveBeenLastCalledWith(snapshot(4));
    push(snapshot(3)); push(snapshot(4, "light"));
    expect(changed).toHaveBeenLastCalledWith(snapshot(4));
    push(null); expect(changed).toHaveBeenLastCalledWith(null);
    push(snapshot(4)); expect(changed).toHaveBeenLastCalledWith(snapshot(4));
    stop(); push(snapshot(5)); expect(changed).toHaveBeenLastCalledWith(snapshot(4));
    expect(jest.getTimerCount()).toBe(0);
  });
  it("discovers a late bridge, times out to solid and requests fresh state on visibility restore", async () => {
    let bridge: DesktopAppearanceBridge | null = null;
    const changed = jest.fn();
    const stop = observeHostAppearance(changed, () => bridge);
    bridge = { version: 1, subscribe: () => () => {}, getSnapshot: jest.fn(() => new Promise(() => {})) };
    jest.advanceTimersByTime(1000); await flush();
    jest.advanceTimersByTime(HOST_APPEARANCE_TIMEOUT);
    expect(changed).toHaveBeenLastCalledWith(null);
    (bridge.getSnapshot as jest.Mock).mockResolvedValue(snapshot(3));
    document.dispatchEvent(new Event("visibilitychange")); await flush();
    expect(changed).toHaveBeenLastCalledWith(snapshot(3));
    bridge = null; jest.advanceTimersByTime(1000);
    expect(changed).toHaveBeenLastCalledWith(null);
    stop();
  });
  it("rejects unknown versions, tokens, URLs, oversized values and malformed snapshots", () => {
    for (const value of [null, {}, { ...snapshot(), schemaVersion: 2 }, { ...snapshot(), revision: 0 },
      { ...snapshot(), skinId: ":bad" }, { ...snapshot(), wallpaper: "file:///private/image.png" },
      { ...snapshot(), tokens: { "--accent": "url(https://example.test/)" } },
      { ...snapshot(), tokens: { "--control-radius": "33px" } },
      { ...snapshot(), tokens: { "--page-bg": "transparent" } },
      { ...snapshot(), tokens: { "--accent": "rgba(0,0,0,2)" } },
      { ...snapshot(), background: { mode: "host", image: "a.png" } }]) {
      expect(parseDesktopAppearance(value)).toBeNull();
    }
    expect(parseDesktopAppearance(snapshot())).toEqual(snapshot());
  });
});
