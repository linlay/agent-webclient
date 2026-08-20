import {
  hasDesktopHostBridge,
  isDesktopHostMessageEvent,
  postDesktopHostMessage,
} from "@/shared/data/desktop/desktopHostBridge";

export const DESKTOP_NEW_CHAT_PREPARE_REQUEST_TYPE =
  "desktop:agent-webclient:new-chat:prepare";
export const DESKTOP_NEW_CHAT_PREPARE_RESPONSE_TYPE =
  "desktop:agent-webclient:new-chat:prepared";

const DESKTOP_NEW_CHAT_PREPARE_TIMEOUT_MS = 10_000;

export type DesktopNewChatPrepareRequest = {
  agentKey: string;
  sourceChatId: string;
  newChat: string;
};

type DesktopNewChatPrepareResponse = {
  type: typeof DESKTOP_NEW_CHAT_PREPARE_RESPONSE_TYPE;
  requestId?: string;
  ok?: boolean;
  message?: string;
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function createDesktopNewChatPrepareRequestId(): string {
  return `desktop_new_chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function canPrepareDesktopNewChat(): boolean {
  return typeof window !== "undefined" && hasDesktopHostBridge();
}

export function prepareDesktopNewChat(
  request: DesktopNewChatPrepareRequest,
): Promise<void> {
  const agentKey = normalizeText(request.agentKey);
  const sourceChatId = normalizeText(request.sourceChatId);
  const newChat = normalizeText(request.newChat);
  if (
    !canPrepareDesktopNewChat() ||
    !agentKey ||
    !sourceChatId ||
    !/^[1-9]\d{12}$/.test(newChat)
  ) {
    return Promise.reject(new Error("Desktop new Chat preparation is unavailable"));
  }

  return new Promise<void>((resolve, reject) => {
    const requestId = createDesktopNewChatPrepareRequestId();
    const cleanup = (timeoutId: number) => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage as EventListener);
    };
    const handleMessage = (event: MessageEvent) => {
      if (!isDesktopHostMessageEvent(event)) {
        return;
      }
      const payload = event.data as DesktopNewChatPrepareResponse | null;
      if (
        !payload ||
        payload.type !== DESKTOP_NEW_CHAT_PREPARE_RESPONSE_TYPE ||
        payload.requestId !== requestId
      ) {
        return;
      }
      cleanup(timeoutId);
      if (!payload.ok) {
        reject(
          new Error(
            normalizeText(payload.message) || "Desktop new Chat preparation failed",
          ),
        );
        return;
      }
      resolve();
    };
    const timeoutId = window.setTimeout(() => {
      cleanup(timeoutId);
      reject(new Error("Desktop new Chat preparation timed out"));
    }, DESKTOP_NEW_CHAT_PREPARE_TIMEOUT_MS);

    window.addEventListener("message", handleMessage as EventListener);
    if (!postDesktopHostMessage({
      type: DESKTOP_NEW_CHAT_PREPARE_REQUEST_TYPE,
      requestId,
      agentKey,
      sourceChatId,
      newChat,
    })) {
      cleanup(timeoutId);
      reject(new Error("Desktop new Chat preparation request failed"));
    }
  });
}
