import type { StateSnapshot } from "react-virtuoso";
import type { ConversationSurfaceMode } from "@/features/conversation/lib/conversationState";
import { getGatewaySession } from "@/shared/data/auth/gatewaySession";
import { getClientSurfaceId } from "@/shared/data/clientSurfaceId";

export interface ConversationScrollBookmark {
  anchorItemKey: string | null;
  anchorIndex: number;
  previousItemKey: string | null;
  nextItemKey: string | null;
  anchorOffset: number;
  atBottom: boolean;
  dataSignature: string;
  layoutSignature: string;
  snapshot?: StateSnapshot;
  savedAt: number;
}

export interface ConversationScrollBookmarkAddress {
  identityScope?: string;
  surfaceMode: ConversationSurfaceMode;
  chatId: string;
}

interface StoredConversationScrollBookmark {
  address: Required<ConversationScrollBookmarkAddress>;
  bookmark: ConversationScrollBookmark;
}

export const CONVERSATION_SCROLL_BOOKMARK_CAPACITY = 150;

function normalizeKeyPart(value: unknown): string {
  return String(value || "").trim();
}

function cloneSnapshot(snapshot: StateSnapshot | undefined): StateSnapshot | undefined {
  if (!snapshot) return undefined;
  return {
    scrollTop: snapshot.scrollTop,
    ranges: snapshot.ranges.map((range) => ({ ...range })),
  };
}

function cloneBookmark(bookmark: ConversationScrollBookmark): ConversationScrollBookmark {
  return {
    ...bookmark,
    snapshot: cloneSnapshot(bookmark.snapshot),
  };
}

export function resolveConversationBookmarkIdentityScope(): string {
  const subject = normalizeKeyPart(getGatewaySession()?.user?.subject);
  return subject ? `gateway:${subject}` : `surface:${getClientSurfaceId()}`;
}

function normalizeAddress(
  address: ConversationScrollBookmarkAddress,
): Required<ConversationScrollBookmarkAddress> | null {
  const identityScope =
    normalizeKeyPart(address.identityScope) || resolveConversationBookmarkIdentityScope();
  const surfaceMode = address.surfaceMode;
  const chatId = normalizeKeyPart(address.chatId);
  if (!identityScope || !surfaceMode || !chatId) return null;
  return { identityScope, surfaceMode, chatId };
}

function buildAddressKey(address: Required<ConversationScrollBookmarkAddress>): string {
  return `${address.identityScope}\u0000${address.surfaceMode}\u0000${address.chatId}`;
}

export class ConversationScrollBookmarkStore {
  private readonly records = new Map<string, StoredConversationScrollBookmark>();

  constructor(private readonly capacity = CONVERSATION_SCROLL_BOOKMARK_CAPACITY) {}

  get size(): number {
    return this.records.size;
  }

  get(address: ConversationScrollBookmarkAddress): ConversationScrollBookmark | null {
    const normalized = normalizeAddress(address);
    if (!normalized) return null;
    const key = buildAddressKey(normalized);
    const stored = this.records.get(key);
    if (!stored) return null;
    this.records.delete(key);
    this.records.set(key, stored);
    return cloneBookmark(stored.bookmark);
  }

  set(
    address: ConversationScrollBookmarkAddress,
    bookmark: ConversationScrollBookmark,
  ): void {
    const normalized = normalizeAddress(address);
    if (!normalized) return;
    const key = buildAddressKey(normalized);
    this.records.delete(key);
    this.records.set(key, {
      address: normalized,
      bookmark: cloneBookmark(bookmark),
    });
    const limit = Math.max(1, Math.floor(this.capacity));
    while (this.records.size > limit) {
      const oldestKey = this.records.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.records.delete(oldestKey);
    }
  }

  deleteChat(chatId: string): void {
    const normalizedChatId = normalizeKeyPart(chatId);
    if (!normalizedChatId) return;
    for (const [key, stored] of this.records) {
      if (stored.address.chatId === normalizedChatId) {
        this.records.delete(key);
      }
    }
  }

  clear(): void {
    this.records.clear();
  }
}

const conversationScrollBookmarkStore = new ConversationScrollBookmarkStore();

export function getConversationScrollBookmark(
  address: ConversationScrollBookmarkAddress,
): ConversationScrollBookmark | null {
  return conversationScrollBookmarkStore.get(address);
}

export function setConversationScrollBookmark(
  address: ConversationScrollBookmarkAddress,
  bookmark: ConversationScrollBookmark,
): void {
  conversationScrollBookmarkStore.set(address, bookmark);
}

export function deleteConversationScrollBookmarks(chatId: string): void {
  conversationScrollBookmarkStore.deleteChat(chatId);
}

export function clearConversationScrollBookmarks(): void {
  conversationScrollBookmarkStore.clear();
}

export function createConversationDataSignature(parts: readonly unknown[]): string {
  const serialized = JSON.stringify(parts);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${parts.length}:${(hash >>> 0).toString(36)}`;
}

export function createConversationLayoutSignature(input: {
  surfaceMode: ConversationSurfaceMode;
  containerWidth: number;
  themeMode: string;
  rootFontSize: string;
}): string {
  return [
    input.surfaceMode,
    Math.max(0, Math.round(input.containerWidth)),
    normalizeKeyPart(input.themeMode) || "default",
    normalizeKeyPart(input.rootFontSize) || "default",
  ].join(":");
}

export function resolveConversationRestoreIndex(
  bookmark: Pick<
    ConversationScrollBookmark,
    "anchorItemKey" | "anchorIndex" | "previousItemKey" | "nextItemKey"
  >,
  itemKeys: readonly string[],
): number {
  if (itemKeys.length === 0) return -1;
  const candidates = [
    bookmark.anchorItemKey,
    bookmark.nextItemKey,
    bookmark.previousItemKey,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const index = itemKeys.indexOf(candidate);
    if (index >= 0) return index;
  }
  const fallback = Number.isFinite(bookmark.anchorIndex)
    ? Math.floor(bookmark.anchorIndex)
    : -1;
  return fallback >= 0 && fallback < itemKeys.length ? fallback : -1;
}
