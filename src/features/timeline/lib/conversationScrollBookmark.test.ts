import {
  ConversationScrollBookmarkStore,
  createConversationDataSignature,
  createConversationLayoutSignature,
  resolveConversationRestoreIndex,
  type ConversationScrollBookmark,
} from "@/features/timeline/lib/conversationScrollBookmark";

function bookmark(overrides: Partial<ConversationScrollBookmark> = {}) {
  return {
    anchorItemKey: "item-1",
    anchorIndex: 1,
    previousItemKey: "item-0",
    nextItemKey: "item-2",
    anchorOffset: -12,
    atBottom: false,
    dataSignature: "data",
    layoutSignature: "layout",
    savedAt: 1,
    ...overrides,
  } satisfies ConversationScrollBookmark;
}

const baseAddress = {
  identityScope: "identity-a",
  surfaceMode: "main" as const,
  chatId: "chat-a",
};

describe("ConversationScrollBookmarkStore", () => {
  it("isolates bookmarks by chat, surface, and identity", () => {
    const store = new ConversationScrollBookmarkStore(10);
    store.set(baseAddress, bookmark({ anchorItemKey: "main" }));
    store.set(
      { ...baseAddress, surfaceMode: "copilot" },
      bookmark({ anchorItemKey: "copilot" }),
    );
    store.set(
      { ...baseAddress, identityScope: "identity-b" },
      bookmark({ anchorItemKey: "identity-b" }),
    );

    expect(store.get(baseAddress)?.anchorItemKey).toBe("main");
    expect(
      store.get({ ...baseAddress, surfaceMode: "copilot" })?.anchorItemKey,
    ).toBe("copilot");
    expect(
      store.get({ ...baseAddress, identityScope: "identity-b" })?.anchorItemKey,
    ).toBe("identity-b");
  });

  it("evicts the least recently used bookmark", () => {
    const store = new ConversationScrollBookmarkStore(2);
    store.set(baseAddress, bookmark());
    store.set({ ...baseAddress, chatId: "chat-b" }, bookmark());
    expect(store.get(baseAddress)).not.toBeNull();
    store.set({ ...baseAddress, chatId: "chat-c" }, bookmark());

    expect(store.get({ ...baseAddress, chatId: "chat-b" })).toBeNull();
    expect(store.get(baseAddress)).not.toBeNull();
    expect(store.get({ ...baseAddress, chatId: "chat-c" })).not.toBeNull();
  });

  it("deletes a chat across every surface and clones snapshots", () => {
    const store = new ConversationScrollBookmarkStore(10);
    const source = bookmark({
      snapshot: { scrollTop: 42, ranges: [{ startIndex: 0, endIndex: 1, size: 20 }] },
    });
    store.set(baseAddress, source);
    store.set({ ...baseAddress, surfaceMode: "agent" }, source);
    const restored = store.get(baseAddress);
    restored!.snapshot!.ranges[0].size = 999;
    expect(store.get(baseAddress)?.snapshot?.ranges[0].size).toBe(20);

    store.deleteChat("chat-a");
    expect(store.size).toBe(0);
  });
});

describe("conversation scroll signatures and fallback", () => {
  it("changes the data signature when height-affecting content changes", () => {
    expect(createConversationDataSignature([["run-1", "short"]])).not.toBe(
      createConversationDataSignature([["run-1", "longer content"]]),
    );
  });

  it("includes layout inputs in the layout signature", () => {
    const first = createConversationLayoutSignature({
      surfaceMode: "main",
      containerWidth: 800,
      themeMode: "light",
      rootFontSize: "16px",
    });
    const second = createConversationLayoutSignature({
      surfaceMode: "copilot",
      containerWidth: 800,
      themeMode: "light",
      rootFontSize: "16px",
    });
    expect(first).not.toBe(second);
  });

  it("falls back through anchor, next, previous, then a valid index", () => {
    const base = bookmark();
    expect(resolveConversationRestoreIndex(base, ["item-0", "item-1", "item-2"])).toBe(1);
    expect(resolveConversationRestoreIndex(base, ["item-0", "item-2"])).toBe(1);
    expect(resolveConversationRestoreIndex(base, ["item-0"])).toBe(0);
    expect(
      resolveConversationRestoreIndex(
        { ...base, previousItemKey: null, nextItemKey: null, anchorIndex: 8 },
        ["only", "last"],
      ),
    ).toBe(-1);
  });
});
