/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { listHostDirectories } from "@/shared/data";
import { canUseDesktopFileSystemBridge, selectWorkspaceDirectory } from "@/shared/data/desktop/desktopFileSystem";
import { useDirectoryPicker, type DirectoryPicker } from "./useDirectoryPicker";

jest.mock("@/shared/data", () => ({
  ...jest.requireActual("@/shared/data"),
  listHostDirectories: jest.fn(),
}));
jest.mock("@/shared/data/desktop/desktopFileSystem", () => ({
  canUseDesktopFileSystemBridge: jest.fn(),
  selectWorkspaceDirectory: jest.fn(),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Deferred = { path: string; resolve: (value: unknown) => void; reject: (error: Error) => void };

describe("useDirectoryPicker", () => {
  let root: Root;
  let picker: DirectoryPicker;
  let listings: Deferred[];

  function Probe() {
    picker = useDirectoryPicker();
    return null;
  }

  beforeEach(async () => {
    listings = [];
    jest.mocked(canUseDesktopFileSystemBridge).mockReturnValue(false);
    jest.mocked(listHostDirectories).mockImplementation((path = "") =>
      new Promise((resolve, reject) => {
        listings.push({ path, resolve, reject });
      }) as any);
    root = createRoot(document.createElement("div"));
    await act(async () => root.render(React.createElement(Probe)));
  });
  afterEach(() => {
    act(() => root.unmount());
    jest.resetAllMocks();
  });

  function listing(path: string, entries: Array<{ name: string; path: string }> = []) {
    return { data: { path, parent: "/", separator: "/", entries, truncated: false } };
  }

  it("browses the Platform host and resolves the chosen directory", async () => {
    let pending!: Promise<string | null>;
    await act(async () => { pending = picker.pick("/home"); });
    expect(picker.open).toBe(true);
    expect(picker.loading).toBe(true);
    expect(picker.canChoose).toBe(false);
    expect(listings[0].path).toBe("/home");

    await act(async () => {
      listings[0].resolve(listing("/home/a", [{ name: "b", path: "/home/a/b" }]));
    });
    expect(picker.loading).toBe(false);
    expect(picker.listing?.path).toBe("/home/a");
    expect(picker.canChoose).toBe(true);

    await act(async () => { picker.browseTo("/home/a/b"); });
    // Navigating keeps the previous listing on screen but it cannot be chosen.
    expect(picker.listing?.path).toBe("/home/a");
    expect(picker.canChoose).toBe(false);
    expect(picker.choose()).toBeNull();

    await act(async () => { listings[1].resolve(listing("/home/a/b")); });
    let chosen: string | null = null;
    await act(async () => { chosen = picker.choose(); });
    expect(chosen).toBe("/home/a/b");
    expect(picker.open).toBe(false);
    await expect(pending).resolves.toBe("/home/a/b");
  });

  it("resolves null when the browser is cancelled and drops a late listing", async () => {
    let pending!: Promise<string | null>;
    await act(async () => { pending = picker.pick(""); });
    await act(async () => picker.close());
    await expect(pending).resolves.toBeNull();
    expect(picker.open).toBe(false);
    expect(picker.loading).toBe(false);

    await act(async () => { listings[0].resolve(listing("/late")); });
    expect(picker.listing).toBeNull();
    expect(picker.canChoose).toBe(false);
  });

  it("keeps a failed listing visible but refuses to confirm it", async () => {
    let pending!: Promise<string | null>;
    await act(async () => { pending = picker.pick(""); });
    await act(async () => { listings[0].resolve(listing("/home/a")); });
    await act(async () => { picker.browseTo("/home/locked"); });
    await act(async () => { listings[1].reject(new Error("permission denied")); });

    expect(picker.error).toBe("permission denied");
    expect(picker.listing?.path).toBe("/home/a");
    expect(picker.choose()).toBeNull();
    await act(async () => picker.close());
    await expect(pending).resolves.toBeNull();
  });

  it("falls back to the host home directory when the first listing fails", async () => {
    let pending!: Promise<string | null>;
    await act(async () => { pending = picker.pick("/missing"); });
    await act(async () => { listings[0].reject(new Error("directory does not exist")); });

    expect(listings).toHaveLength(2);
    expect(listings[1].path).toBe("");
    expect(picker.error).toBe("");
    expect(picker.loading).toBe(true);

    await act(async () => { listings[1].resolve(listing("/home/demo")); });
    expect(picker.listing?.path).toBe("/home/demo");
    expect(picker.canChoose).toBe(true);
    await act(async () => picker.close());
    await expect(pending).resolves.toBeNull();
  });

  it("allows only one browser selection at a time", async () => {
    await act(async () => { void picker.pick(""); });
    let second: string | null = "unset";
    await act(async () => { second = await picker.pick("/other"); });
    expect(second).toBeNull();
    expect(listings).toHaveLength(1);
    expect(picker.open).toBe(true);
  });

  it("uses the Desktop picker without listing host directories", async () => {
    jest.mocked(canUseDesktopFileSystemBridge).mockReturnValue(true);
    jest.mocked(selectWorkspaceDirectory).mockResolvedValue("/Users/demo/docs");
    await act(async () => root.render(React.createElement(Probe)));

    let chosen: string | null = null;
    await act(async () => { chosen = await picker.pick("/ignored"); });
    expect(chosen).toBe("/Users/demo/docs");
    expect(listHostDirectories).not.toHaveBeenCalled();
    expect(picker.open).toBe(false);
    expect(picker.loading).toBe(false);

    jest.mocked(selectWorkspaceDirectory).mockResolvedValue(null);
    await act(async () => { chosen = await picker.pick(""); });
    expect(chosen).toBeNull();
  });

  it("surfaces a Desktop bridge failure and ignores overlapping dialogs", async () => {
    jest.mocked(canUseDesktopFileSystemBridge).mockReturnValue(true);
    let rejectDialog!: (error: Error) => void;
    jest.mocked(selectWorkspaceDirectory).mockImplementation(() => new Promise((_, reject) => { rejectDialog = reject; }));
    await act(async () => root.render(React.createElement(Probe)));

    let pending!: Promise<string | null>;
    await act(async () => { pending = picker.pick(""); });
    expect(picker.loading).toBe(true);
    await act(async () => { void picker.pick(""); });
    expect(selectWorkspaceDirectory).toHaveBeenCalledTimes(1);

    let failure: unknown;
    await act(async () => {
      rejectDialog(new Error("native dialog failed"));
      await pending.catch((error: unknown) => { failure = error; });
    });
    expect(String(failure)).toContain("native dialog failed");
    expect(picker.loading).toBe(false);
    expect(picker.error).toBe("");
  });

  it("answers a pending browser selection when the host unmounts", async () => {
    let pending!: Promise<string | null>;
    await act(async () => { pending = picker.pick(""); });
    await act(async () => root.unmount());
    await expect(pending).resolves.toBeNull();
  });
});
