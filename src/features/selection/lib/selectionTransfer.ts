import {
  SELECTED_TEXT_MAX_CHARACTERS,
  selectedTextByteLength,
  type SelectedTextFragment,
} from "@/features/selection/lib/selectedTextReference";

export const SELECTION_TRANSFER_TARGET_QUERY_PARAM = "selectionTransferTarget";
export const DESKTOP_SELECTION_BTW_TARGET = "selection-actions-v1";

const SELECTION_TRANSFER_VERSION = 1 as const;
const SELECTION_TRANSFER_CHANNEL = "agent-webclient:selected-text-transfer:v1";
const SELECTION_TRANSFER_TIMEOUT_MS = 10_000;
const SELECTION_TRANSFER_OFFER_INTERVAL_MS = 200;

type SelectionTransferAddress = {
  version: typeof SELECTION_TRANSFER_VERSION;
  transferId: string;
  targetId: string;
  chatId: string;
};

type SelectionTransferMessage =
  | (SelectionTransferAddress & { type: "offer" | "request" | "ack" })
  | (SelectionTransferAddress & {
      type: "deliver";
      fragment: SelectedTextFragment;
    });

type PendingSelectionTransfer = {
  targetId: string;
  chatId: string;
  fragment: SelectedTextFragment;
  resolve: (delivered: boolean) => void;
  offerTimer: ReturnType<typeof setInterval> | null;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
};

const pendingTransfers = new Map<string, PendingSelectionTransfer>();
let sourceChannel: BroadcastChannel | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function validChatId(value: unknown): string {
  const chatId = typeof value === "string" ? value.trim() : "";
  return chatId && chatId.length <= 128 ? chatId : "";
}

export function isSelectionTransferTarget(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9-]{0,63}$/u.test(value);
}

export function isSelectionTransferId(value: unknown): value is string {
  return typeof value === "string" &&
    /^selection-transfer-[a-z0-9-]{8,64}$/u.test(value);
}

export function parseTransferredSelectedTextFragment(
  value: unknown,
): SelectedTextFragment | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["targetId", "reference"])) {
    return null;
  }
  const targetId = typeof value.targetId === "string" ? value.targetId.trim() : "";
  const reference = value.reference;
  if (
    !targetId ||
    targetId.length > 128 ||
    !isRecord(reference) ||
    !hasOnlyKeys(reference, ["id", "type", "name", "mimeType", "sizeBytes", "meta"])
  ) {
    return null;
  }
  const id = typeof reference.id === "string" ? reference.id.trim() : "";
  const name = typeof reference.name === "string" ? reference.name.trim() : "";
  const meta = reference.meta;
  if (
    !id ||
    id.length > 128 ||
    reference.type !== "selection" ||
    !name ||
    name.length > 256 ||
    reference.mimeType !== "text/plain" ||
    typeof reference.sizeBytes !== "number" ||
    !Number.isSafeInteger(reference.sizeBytes) ||
    reference.sizeBytes < 0 ||
    !isRecord(meta) ||
    !hasOnlyKeys(meta, ["text", "sourceKind"])
  ) {
    return null;
  }
  const text = typeof meta.text === "string" ? meta.text : "";
  const sourceKind = meta.sourceKind;
  if (
    !text.trim() ||
    text.length > SELECTED_TEXT_MAX_CHARACTERS ||
    (sourceKind !== "message" && sourceKind !== "code") ||
    reference.sizeBytes !== selectedTextByteLength(text)
  ) {
    return null;
  }
  return {
    targetId,
    reference: {
      id,
      type: "selection",
      name,
      mimeType: "text/plain",
      sizeBytes: reference.sizeBytes,
      meta: { text, sourceKind },
    },
  };
}

function parseTransferMessage(value: unknown): SelectionTransferMessage | null {
  if (
    !isRecord(value) ||
    value.version !== SELECTION_TRANSFER_VERSION ||
    !isSelectionTransferId(value.transferId) ||
    !isSelectionTransferTarget(value.targetId) ||
    !validChatId(value.chatId)
  ) {
    return null;
  }
  const address = {
    version: SELECTION_TRANSFER_VERSION,
    transferId: value.transferId,
    targetId: value.targetId,
    chatId: validChatId(value.chatId),
  };
  if (value.type === "offer" || value.type === "request" || value.type === "ack") {
    if (!hasOnlyKeys(value, ["version", "type", "transferId", "targetId", "chatId"])) {
      return null;
    }
    return { ...address, type: value.type };
  }
  if (
    value.type !== "deliver" ||
    !hasOnlyKeys(
      value,
      ["version", "type", "transferId", "targetId", "chatId", "fragment"],
    )
  ) {
    return null;
  }
  const fragment = parseTransferredSelectedTextFragment(value.fragment);
  return fragment ? { ...address, type: "deliver", fragment } : null;
}

function settlePendingTransfer(transferId: string, delivered: boolean) {
  const pending = pendingTransfers.get(transferId);
  if (!pending) return;
  pendingTransfers.delete(transferId);
  if (pending.offerTimer) clearInterval(pending.offerTimer);
  if (pending.timeoutTimer) clearTimeout(pending.timeoutTimer);
  pending.resolve(delivered);
}

function postOffer(
  channel: BroadcastChannel,
  transferId: string,
  pending: PendingSelectionTransfer,
) {
  channel.postMessage({
    version: SELECTION_TRANSFER_VERSION,
    type: "offer",
    transferId,
    targetId: pending.targetId,
    chatId: pending.chatId,
  } satisfies SelectionTransferMessage);
}

function ensureSourceChannel(): BroadcastChannel | null {
  if (sourceChannel) return sourceChannel;
  if (typeof BroadcastChannel !== "function") return null;
  try {
    sourceChannel = new BroadcastChannel(SELECTION_TRANSFER_CHANNEL);
    sourceChannel.addEventListener("message", (event) => {
      const message = parseTransferMessage(event.data);
      if (!message || message.type === "offer" || message.type === "deliver") {
        return;
      }
      const pending = pendingTransfers.get(message.transferId);
      if (
        !pending ||
        pending.targetId !== message.targetId ||
        pending.chatId !== message.chatId
      ) {
        return;
      }
      if (message.type === "ack") {
        settlePendingTransfer(message.transferId, true);
        return;
      }
      sourceChannel?.postMessage({
        version: SELECTION_TRANSFER_VERSION,
        type: "deliver",
        transferId: message.transferId,
        targetId: message.targetId,
        chatId: message.chatId,
        fragment: pending.fragment,
      } satisfies SelectionTransferMessage);
    });
    return sourceChannel;
  } catch {
    sourceChannel = null;
    return null;
  }
}

function createTransferId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `selection-transfer-${crypto.randomUUID()}`;
  }
  return `selection-transfer-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function stageSelectedTextTransfer(input: {
  targetId: string;
  chatId: string;
  fragment: SelectedTextFragment;
}): { transferId: string; delivered: Promise<boolean> } | null {
  const targetId = isSelectionTransferTarget(input.targetId) ? input.targetId : "";
  const chatId = validChatId(input.chatId);
  const fragment = parseTransferredSelectedTextFragment(input.fragment);
  const channel = ensureSourceChannel();
  if (!targetId || !chatId || !fragment || !channel) return null;
  const transferId = createTransferId();
  let resolveDelivered: (delivered: boolean) => void = () => undefined;
  const delivered = new Promise<boolean>((resolve) => {
    resolveDelivered = resolve;
  });
  const pending: PendingSelectionTransfer = {
    targetId,
    chatId,
    fragment,
    resolve: resolveDelivered,
    offerTimer: null,
    timeoutTimer: null,
  };
  pending.offerTimer = setInterval(
    () => postOffer(channel, transferId, pending),
    SELECTION_TRANSFER_OFFER_INTERVAL_MS,
  );
  pending.timeoutTimer = setTimeout(
    () => settlePendingTransfer(transferId, false),
    SELECTION_TRANSFER_TIMEOUT_MS,
  );
  pendingTransfers.set(transferId, pending);
  postOffer(channel, transferId, pending);
  return { transferId, delivered };
}

export function cancelSelectedTextTransfer(transferId: string): void {
  if (isSelectionTransferId(transferId)) {
    settlePendingTransfer(transferId, false);
  }
}

export function receiveSelectedTextTransfers(input: {
  targetId: string;
  chatId: string;
  onFragment: (fragment: SelectedTextFragment) => boolean;
}): () => void {
  const targetId = isSelectionTransferTarget(input.targetId) ? input.targetId : "";
  const chatId = validChatId(input.chatId);
  if (!targetId || !chatId || typeof BroadcastChannel !== "function") {
    return () => undefined;
  }
  let channel: BroadcastChannel;
  try {
    channel = new BroadcastChannel(SELECTION_TRANSFER_CHANNEL);
  } catch {
    return () => undefined;
  }
  const acceptedTransferIds = new Set<string>();
  const handleMessage = (event: MessageEvent) => {
    const message = parseTransferMessage(event.data);
    if (
      !message ||
      message.targetId !== targetId ||
      message.chatId !== chatId
    ) {
      return;
    }
    if (message.type === "offer" && !acceptedTransferIds.has(message.transferId)) {
      channel.postMessage({
        version: SELECTION_TRANSFER_VERSION,
        type: "request",
        transferId: message.transferId,
        targetId,
        chatId,
      } satisfies SelectionTransferMessage);
      return;
    }
    if (
      message.type !== "deliver" ||
      acceptedTransferIds.has(message.transferId) ||
      !input.onFragment(message.fragment)
    ) {
      return;
    }
    acceptedTransferIds.add(message.transferId);
    channel.postMessage({
      version: SELECTION_TRANSFER_VERSION,
      type: "ack",
      transferId: message.transferId,
      targetId,
      chatId,
    } satisfies SelectionTransferMessage);
  };
  channel.addEventListener("message", handleMessage);
  return () => {
    channel.removeEventListener("message", handleMessage);
    channel.close();
  };
}
