import type { WsConnectionStatus } from "@/app/state/types";
import { t } from "@/shared/i18n";

export function formatWsStatusText(
  status: WsConnectionStatus,
  errorMessage = "",
): string {
  const detail = String(errorMessage || "").trim();
  if (status === "connected") {
    return t("settings.transport.wsStatus.connected");
  }
  if (status === "connecting") {
    return t("settings.transport.wsStatus.connecting");
  }
  if (status === "error" || detail) {
    return detail
      ? t("settings.transport.wsStatus.errorWithDetail", { detail })
      : t("settings.transport.wsStatus.error");
  }
  return t("settings.transport.wsStatus.disconnected");
}
