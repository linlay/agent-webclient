import { isAppMode } from "@/shared/utils/routing";

const AGENT_APP_CLIPBOARD_REQUEST_TYPE = "zenmind:agent-app-clipboard:request";
const AGENT_APP_CLIPBOARD_RESPONSE_TYPE = "zenmind:agent-app-clipboard:response";
const AGENT_APP_CLIPBOARD_TIMEOUT_MS = 5_000;

interface ClipboardRequestMessage {
  type: typeof AGENT_APP_CLIPBOARD_REQUEST_TYPE;
  requestId: string;
  text: string;
}

interface ClipboardResponseMessage {
  type: typeof AGENT_APP_CLIPBOARD_RESPONSE_TYPE;
  requestId: string;
  ok?: boolean;
  message?: string;
}

function createRequestId(): string {
  return `agent_app_clipboard_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function copyViaDesktopBridge(text: string): Promise<boolean> {
  if (
    typeof window === "undefined" ||
    !isAppMode() ||
    !window.parent ||
    window.parent === window
  ) {
    return false;
  }

  return new Promise<boolean>((resolve, reject) => {
    const requestId = createRequestId();
    const requestMessage: ClipboardRequestMessage = {
      type: AGENT_APP_CLIPBOARD_REQUEST_TYPE,
      requestId,
      text,
    };

    const cleanup = (timeoutId: number) => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage as EventListener);
    };

    const handleMessage = (event: MessageEvent) => {
      const payload = event.data as ClipboardResponseMessage | null;
      if (
        !payload ||
        payload.type !== AGENT_APP_CLIPBOARD_RESPONSE_TYPE ||
        payload.requestId !== requestId
      ) {
        return;
      }

      cleanup(timeoutId);
      if (payload.ok) {
        resolve(true);
        return;
      }
      reject(new Error(payload.message || "desktop clipboard copy failed"));
    };

    const timeoutId = window.setTimeout(() => {
      cleanup(timeoutId);
      resolve(false);
    }, AGENT_APP_CLIPBOARD_TIMEOUT_MS);

    window.addEventListener("message", handleMessage as EventListener);

    try {
      window.parent.postMessage(requestMessage, "*");
    } catch {
      cleanup(timeoutId);
      resolve(false);
    }
  });
}

export async function copyText(text: string): Promise<void> {
  const normalized = String(text ?? "");

  const bridgeCopied = await copyViaDesktopBridge(normalized);
  if (bridgeCopied) {
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(normalized);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = normalized;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("copy failed");
  }
}
