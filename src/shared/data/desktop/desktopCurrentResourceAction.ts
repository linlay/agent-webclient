import {
  hasDesktopHostBridge,
  isDesktopHostMessageEvent,
  postDesktopHostMessage,
} from "@/shared/data/desktop/desktopHostBridge";

export const DESKTOP_CURRENT_RESOURCE_ACTION_REQUEST_TYPE =
  "desktop:agent-webclient:current-resource:action";
export const DESKTOP_CURRENT_RESOURCE_ACTION_RESPONSE_TYPE =
  "desktop:agent-webclient:current-resource:action:response";

const DESKTOP_CURRENT_RESOURCE_ACTION_TIMEOUT_MS = 10_000;

export type DesktopCurrentResourceAction = "reveal" | "open-default";

export type DesktopCurrentResourceIdentity = {
  chatId: string;
  profile: "artifact" | "reference";
  relativePath: string;
};

export type DesktopCurrentResourceActionResult = {
  ok: boolean;
  code?: string;
  message?: string;
  available?: boolean;
};

type DesktopCurrentResourceActionResponse =
  DesktopCurrentResourceActionResult & {
    type: typeof DESKTOP_CURRENT_RESOURCE_ACTION_RESPONSE_TYPE;
    requestId?: string;
  };

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function createRequestId(): string {
  return `desktop_current_resource_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function canUseDesktopCurrentResourceActions(): boolean {
  return typeof window !== "undefined" && hasDesktopHostBridge();
}

export function detectDesktopFileManager(
  platform = typeof navigator === "undefined"
    ? ""
    : `${navigator.platform || ""} ${navigator.userAgent || ""}`,
): "finder" | "explorer" | "file-manager" {
  const normalized = platform.trim().toLowerCase();
  if (normalized.includes("mac") || normalized.includes("darwin")) {
    return "finder";
  }
  if (normalized.includes("win")) {
    return "explorer";
  }
  return "file-manager";
}

export function resolveDesktopCurrentResourceIdentity(
  chatIdValue: unknown,
  resourceUrlValue: unknown,
): DesktopCurrentResourceIdentity | null {
  const chatId = normalizeText(chatIdValue);
  const resourceUrl = normalizeText(resourceUrlValue);
  if (
    !chatId ||
    chatId.length > 512 ||
    /[/\\\u0000-\u001f\u007f]/u.test(chatId) ||
    !resourceUrl ||
    resourceUrl.length > 2_048 ||
    resourceUrl.startsWith("/") ||
    resourceUrl.includes("\\") ||
    resourceUrl.includes("?") ||
    resourceUrl.includes("#") ||
    /^[a-z][a-z\d+.-]*:/iu.test(resourceUrl) ||
    /[\u0000-\u001f\u007f]/u.test(resourceUrl)
  ) {
    return null;
  }

  const rawSegments = resourceUrl.split("/");
  const segments: string[] = [];
  for (const rawSegment of rawSegments) {
    if (!rawSegment) return null;
    let segment = "";
    try {
      segment = decodeURIComponent(rawSegment);
    } catch {
      return null;
    }
    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      segment.includes("/") ||
      segment.includes("\\") ||
      /[\u0000-\u001f\u007f]/u.test(segment)
    ) {
      return null;
    }
    let probe = segment;
    for (let depth = 0; depth < 4; depth += 1) {
      let next = "";
      try {
        next = decodeURIComponent(probe);
      } catch {
        return null;
      }
      if (
        next === "." ||
        next === ".." ||
        next.includes("/") ||
        next.includes("\\")
      ) {
        return null;
      }
      if (next === probe) break;
      probe = next;
    }
    segments.push(segment);
  }

  const profile = segments[0] === "artifacts"
    ? "artifact"
    : segments[0] === "references" || segments.length === 1
      ? "reference"
      : null;
  if (!profile || (profile === "artifact" && segments.length < 2)) return null;
  return {
    chatId,
    profile,
    relativePath: segments.join("/"),
  };
}

function requestDesktopCurrentResourceCommand(
  action: DesktopCurrentResourceAction | "capabilities",
  resource: DesktopCurrentResourceIdentity,
): Promise<DesktopCurrentResourceActionResult> {
  if (!canUseDesktopCurrentResourceActions()) {
    return Promise.reject(new Error("Desktop current resource actions are unavailable"));
  }

  return new Promise<DesktopCurrentResourceActionResult>((resolve, reject) => {
    const requestId = createRequestId();
    const cleanup = (timeoutId: number) => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage as EventListener);
    };
    const handleMessage = (event: MessageEvent) => {
      if (!isDesktopHostMessageEvent(event)) {
        return;
      }
      const payload = event.data as DesktopCurrentResourceActionResponse | null;
      if (
        !payload ||
        payload.type !== DESKTOP_CURRENT_RESOURCE_ACTION_RESPONSE_TYPE ||
        payload.requestId !== requestId
      ) {
        return;
      }
      cleanup(timeoutId);
      resolve({
        ok: payload.ok === true,
        ...(typeof payload.available === "boolean"
          ? { available: payload.available }
          : {}),
        ...(normalizeText(payload.code) ? { code: normalizeText(payload.code) } : {}),
        ...(normalizeText(payload.message) ? { message: normalizeText(payload.message) } : {}),
      });
    };
    const timeoutId = window.setTimeout(() => {
      cleanup(timeoutId);
      reject(new Error("Desktop current resource action timed out"));
    }, DESKTOP_CURRENT_RESOURCE_ACTION_TIMEOUT_MS);

    window.addEventListener("message", handleMessage as EventListener);
    if (!postDesktopHostMessage({
      type: DESKTOP_CURRENT_RESOURCE_ACTION_REQUEST_TYPE,
      requestId,
      action,
      ...resource,
    })) {
      cleanup(timeoutId);
      reject(new Error("Desktop current resource action request failed"));
    }
  });
}

export async function checkDesktopCurrentResourceActionsAvailable(
  resource: DesktopCurrentResourceIdentity,
): Promise<boolean> {
  const result = await requestDesktopCurrentResourceCommand("capabilities", resource);
  return result.ok && result.available === true;
}

export function requestDesktopCurrentResourceAction(
  action: DesktopCurrentResourceAction,
  resource: DesktopCurrentResourceIdentity,
): Promise<DesktopCurrentResourceActionResult> {
  return requestDesktopCurrentResourceCommand(action, resource);
}
