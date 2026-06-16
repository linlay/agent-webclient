import {
  hasDesktopHostBridge,
  isDesktopHostMessageEvent,
  postDesktopHostMessage,
} from "@/shared/api/desktopHostBridge";
import { t } from "@/shared/i18n";
import { isDesktopAppMode } from "@/shared/utils/routing";

const DESKTOP_SCREENSHOT_CAPTURE_REQUEST_TYPE =
  "zenmind:desktop-screenshot:capture";
const DESKTOP_SCREENSHOT_CAPTURE_RESPONSE_TYPE =
  "zenmind:desktop-screenshot:capture:response";
const DESKTOP_SCREENSHOT_TIMEOUT_MS = 120_000;

export class DesktopScreenshotError extends Error {
  code: "unsupported" | "failed" | "timeout";

  constructor(code: "unsupported" | "failed" | "timeout", message: string) {
    super(message);
    this.name = "DesktopScreenshotError";
    this.code = code;
  }
}

export interface DesktopScreenshotResult {
  dataUrl: string;
  filename: string;
  mimeType: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
}

interface DesktopScreenshotRequestMessage {
  type: typeof DESKTOP_SCREENSHOT_CAPTURE_REQUEST_TYPE;
  requestId: string;
}

interface DesktopScreenshotResponseMessage {
  type: typeof DESKTOP_SCREENSHOT_CAPTURE_RESPONSE_TYPE;
  requestId: string;
  ok?: boolean;
  cancelled?: boolean;
  message?: string;
  dataBase64?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
}

function createDesktopScreenshotRequestId(): string {
  return `desktop_screenshot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumber(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0
    ? numberValue
    : undefined;
}

function createDesktopScreenshotFilename(): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/u, "")
    .replace(/[-:T]/gu, "");
  return `screenshot-${timestamp.slice(0, 8)}-${timestamp.slice(8)}.png`;
}

export function canUseDesktopScreenshotBridge(): boolean {
  return (
    typeof window !== "undefined" &&
    isDesktopAppMode() &&
    hasDesktopHostBridge()
  );
}

export function desktopScreenshotToFile(result: DesktopScreenshotResult): File {
  const [header, dataBase64 = ""] = result.dataUrl.split(",", 2);
  const mimeMatch = /^data:([^;,]+);base64$/u.exec(header);
  const mimeType = mimeMatch?.[1] || result.mimeType || "image/png";
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], result.filename, { type: mimeType });
}

export function captureDesktopScreenshot(): Promise<DesktopScreenshotResult | null> {
  if (!canUseDesktopScreenshotBridge()) {
    return Promise.reject(
      new DesktopScreenshotError(
        "unsupported",
        t("composer.actions.screenshotUnavailable"),
      ),
    );
  }

  return new Promise<DesktopScreenshotResult | null>((resolve, reject) => {
    const requestId = createDesktopScreenshotRequestId();
    const requestMessage: DesktopScreenshotRequestMessage = {
      type: DESKTOP_SCREENSHOT_CAPTURE_REQUEST_TYPE,
      requestId,
    };

    const cleanup = (timeoutId: number) => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage as EventListener);
    };

    const handleMessage = (event: MessageEvent) => {
      if (!isDesktopHostMessageEvent(event)) {
        return;
      }
      const payload = event.data as DesktopScreenshotResponseMessage | null;
      if (
        !payload ||
        payload.type !== DESKTOP_SCREENSHOT_CAPTURE_RESPONSE_TYPE ||
        payload.requestId !== requestId
      ) {
        return;
      }

      cleanup(timeoutId);
      if (!payload.ok) {
        if (payload.cancelled) {
          resolve(null);
          return;
        }
        reject(
          new DesktopScreenshotError(
            "failed",
            normalizeText(payload.message) || t("composer.actions.screenshotFailed"),
          ),
        );
        return;
      }

      const dataBase64 = normalizeText(payload.dataBase64);
      const mimeType = normalizeText(payload.mimeType) || "image/png";
      if (!dataBase64) {
        reject(
          new DesktopScreenshotError(
            "failed",
            normalizeText(payload.message) || t("composer.actions.screenshotFailed"),
          ),
        );
        return;
      }

      resolve({
        dataUrl: `data:${mimeType};base64,${dataBase64}`,
        filename: createDesktopScreenshotFilename(),
        mimeType,
        width: normalizeNumber(payload.width),
        height: normalizeNumber(payload.height),
        sizeBytes: normalizeNumber(payload.sizeBytes),
      });
    };

    const timeoutId = window.setTimeout(() => {
      cleanup(timeoutId);
      reject(
        new DesktopScreenshotError(
          "timeout",
          t("composer.actions.screenshotTimeout"),
        ),
      );
    }, DESKTOP_SCREENSHOT_TIMEOUT_MS);

    window.addEventListener("message", handleMessage as EventListener);

    if (!postDesktopHostMessage(requestMessage)) {
      cleanup(timeoutId);
      reject(
        new DesktopScreenshotError("failed", t("composer.actions.screenshotFailed")),
      );
    }
  });
}
