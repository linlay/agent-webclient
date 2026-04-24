import React from "react";
import type {
  TransportMode,
  WsConnectionStatus,
} from "@/app/state/types";
import { formatWsStatusText } from "@/features/settings/lib/formatWsStatusText";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";

interface SettingsTransportProps {
  transportMode: TransportMode;
  wsStatus: WsConnectionStatus;
  wsErrorMessage: string;
  streaming: boolean;
  onTransportModeChange: (mode: TransportMode) => void;
}

export const SettingsTransport: React.FC<SettingsTransportProps> = ({
  transportMode,
  wsStatus,
  wsErrorMessage,
  streaming,
  onTransportModeChange,
}) => {
  const { t } = useI18n();
  const wsStatusText = formatWsStatusText(wsStatus, wsErrorMessage);
  const transportHint =
    transportMode === "ws"
      ? streaming
        ? t("settings.transport.hint.wsStreaming")
        : t("settings.transport.hint.ws", { wsStatusText })
      : t("settings.transport.hint.sse");

  return (
    <div className="field-group">
      <label>{t("settings.transport.label")}</label>
      <div
        className="settings-segmented"
        role="tablist"
        aria-label={t("settings.transport.ariaLabel")}
      >
        <UiButton
          variant="ghost"
          size="sm"
          className={`settings-segmented-btn ${transportMode === "sse" ? "is-active" : ""}`}
          role="tab"
          aria-selected={transportMode === "sse"}
          active={transportMode === "sse"}
          onClick={() => onTransportModeChange("sse")}
        >
          SSE
        </UiButton>
        <UiButton
          variant="ghost"
          size="sm"
          className={`settings-segmented-btn ${transportMode === "ws" ? "is-active" : ""}`}
          role="tab"
          aria-selected={transportMode === "ws"}
          active={transportMode === "ws"}
          onClick={() => onTransportModeChange("ws")}
        >
          WebSocket
        </UiButton>
      </div>
      <p className="settings-hint">{transportHint}</p>
    </div>
  );
};
