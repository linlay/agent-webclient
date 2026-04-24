import React, { useCallback, useEffect, useRef, useState } from "react";
import type { AppAction } from "@/app/state/actions";
import type {
  VoiceCapabilities,
  VoiceChatState,
  VoiceClientGateConfig,
} from "@/app/state/types";
import { AsrDebugSession } from "@/features/voice/lib/asrDebugSession";
import {
  DEFAULT_VOICE_WS_PATH,
  resolveDefaultVoiceAsrDefaults,
  resolveVoiceAsrRuntimeConfig,
} from "@/features/voice/lib/voiceAsrProtocol";
import {
  ensureAccessToken,
  getVoiceCapabilitiesFlexible,
} from "@/shared/api/apiClient";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";

interface SettingsAsrDebugProps {
  appMode: boolean;
  accessToken: string;
  chatId: string;
  speechRate: number;
  capabilities: VoiceCapabilities | null;
  clientGate: VoiceClientGateConfig;
  clientGateCustomized: boolean;
  onAccessTokenResolved: (token: string) => void;
  onPatchVoiceChat: (patch: Partial<VoiceChatState>) => void;
  onDispatch: React.Dispatch<AppAction>;
}

export const SettingsAsrDebug: React.FC<SettingsAsrDebugProps> = ({
  appMode,
  accessToken,
  chatId,
  speechRate,
  capabilities,
  clientGate,
  clientGateCustomized,
  onAccessTokenResolved,
  onPatchVoiceChat,
  onDispatch,
}) => {
  const { t } = useI18n();
  const [asrDebugStatus, setAsrDebugStatus] = useState("idle");
  const [asrDebugRecording, setAsrDebugRecording] = useState(false);
  const [asrDebugInterimText, setAsrDebugInterimText] = useState("");
  const [asrDebugFinalText, setAsrDebugFinalText] = useState("");
  const [asrFallbackNotice, setAsrFallbackNotice] = useState("");
  const sessionRef = useRef<AsrDebugSession | null>(null);
  const accessTokenRef = useRef(accessToken);
  const capabilitiesRef = useRef<VoiceCapabilities | null>(capabilities);
  const chatIdRef = useRef(chatId);

  accessTokenRef.current = accessToken;

  const mapAsrStatus = useCallback(
    (status: string, errorText?: string) => {
      if (errorText) return t("settings.shared.errorWithDetail", { detail: errorText });
      if (status === "connecting") return t("settings.asr.status.connecting");
      if (status === "socket-open") return t("settings.asr.status.socketOpen");
      if (status === "recording") return t("settings.asr.status.recording");
      if (status === "stopping") return t("settings.asr.status.stopping");
      if (status === "error") return t("settings.asr.status.failed");
      return "idle";
    },
    [t],
  );

  const resetAsrUi = useCallback(
    (options: { clearTranscript?: boolean } = {}) => {
      setAsrDebugStatus("idle");
      setAsrDebugRecording(false);
      setAsrDebugInterimText("");
      setAsrFallbackNotice("");
      if (options.clearTranscript !== false) {
        setAsrDebugFinalText("");
      }
    },
    [],
  );

  const createAsrSession = useCallback(
    () =>
      new AsrDebugSession({
        getAccessToken: () => accessTokenRef.current,
        getVoiceWsPath: () =>
          String(capabilitiesRef.current?.websocketPath || "/api/voice/ws"),
        getAsrDefaults: () => capabilitiesRef.current?.asr?.defaults,
        onState: (patch) => {
          if (patch.status !== undefined || patch.error !== undefined) {
            setAsrDebugStatus(
              mapAsrStatus(
                String(patch.status || ""),
                patch.error ? String(patch.error) : undefined,
              ),
            );
          }
          if (patch.recording !== undefined) {
            setAsrDebugRecording(Boolean(patch.recording));
          }
          if (patch.interimText !== undefined) {
            setAsrDebugInterimText(String(patch.interimText || ""));
          }
          if (patch.finalText !== undefined) {
            setAsrDebugFinalText(String(patch.finalText || ""));
          }
        },
        appendDebug: (line) => onDispatch({ type: "APPEND_DEBUG", line }),
      }),
    [mapAsrStatus, onDispatch],
  );

  const resetAsrSession = useCallback(
    (options: { clearTranscript?: boolean } = {}) => {
      sessionRef.current?.destroy();
      sessionRef.current = createAsrSession();
      resetAsrUi(options);
    },
    [createAsrSession, resetAsrUi],
  );

  const ensureVoiceCapabilitiesLoaded = useCallback(async () => {
    if (capabilitiesRef.current) {
      return capabilitiesRef.current;
    }
    const nextCapabilities = await getVoiceCapabilitiesFlexible();
    const runtimeConfig = resolveVoiceAsrRuntimeConfig(
      nextCapabilities,
      clientGate,
      clientGateCustomized,
    );
    capabilitiesRef.current = nextCapabilities;
    onPatchVoiceChat({
      capabilities: nextCapabilities,
      capabilitiesLoaded: true,
      capabilitiesError: "",
      speechRate:
        Number(nextCapabilities?.tts?.speechRateDefault) || speechRate,
      clientGate: clientGateCustomized
        ? clientGate
        : runtimeConfig.asrDefaults.clientGate,
    });
    return nextCapabilities;
  }, [
    clientGate,
    clientGateCustomized,
    onPatchVoiceChat,
    speechRate,
  ]);

  const handleStartAsrDebug = useCallback(async () => {
    try {
      setAsrFallbackNotice("");
      setAsrDebugStatus(t("settings.asr.status.preparing"));
      const resolvedAccessToken = appMode
        ? await ensureAccessToken("missing")
        : String(accessTokenRef.current || "").trim();
      accessTokenRef.current = resolvedAccessToken;
      if (resolvedAccessToken && resolvedAccessToken !== accessToken.trim()) {
        onAccessTokenResolved(resolvedAccessToken);
      }
      if (!resolvedAccessToken) {
        throw new Error("voice access_token is required");
      }
      let nextCapabilities = capabilitiesRef.current;
      if (!nextCapabilities) {
        try {
          nextCapabilities = await ensureVoiceCapabilitiesLoaded();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          onDispatch({
            type: "APPEND_DEBUG",
            line: `[settings-asr] capabilities fetch failed, fallback to defaults: ${message}`,
          });
          setAsrFallbackNotice(t("settings.asr.fallbackNotice"));
          nextCapabilities = {
            websocketPath: DEFAULT_VOICE_WS_PATH,
            asr: {
              defaults: resolveDefaultVoiceAsrDefaults(),
            },
          };
          capabilitiesRef.current = nextCapabilities;
        }
      }
      if (nextCapabilities?.asr?.configured === false) {
        throw new Error(t("settings.asr.backendNotConfigured"));
      }
      const runtimeConfig = resolveVoiceAsrRuntimeConfig(nextCapabilities);
      const effectiveRuntimeConfig = resolveVoiceAsrRuntimeConfig(
        nextCapabilities,
        clientGate,
        clientGateCustomized,
      );
      if (!sessionRef.current) {
        sessionRef.current = createAsrSession();
      }
      await sessionRef.current.start({
        websocketPath: runtimeConfig.websocketPath,
        asrDefaults: effectiveRuntimeConfig.asrDefaults,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAsrDebugStatus(t("settings.shared.errorWithDetail", { detail: message }));
      setAsrDebugRecording(false);
    }
  }, [
    accessToken,
    appMode,
    clientGate,
    clientGateCustomized,
    createAsrSession,
    ensureVoiceCapabilitiesLoaded,
    onAccessTokenResolved,
    onDispatch,
    t,
  ]);

  const handleStopAsrDebug = useCallback(() => {
    try {
      sessionRef.current?.stopAndCommit();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAsrDebugStatus(t("settings.shared.errorWithDetail", { detail: message }));
      setAsrDebugRecording(false);
    }
  }, [t]);

  const handleClearAsrDebug = useCallback(() => {
    sessionRef.current?.clearTranscript();
    setAsrDebugInterimText("");
    setAsrDebugFinalText("");
    if (!asrDebugRecording) {
      setAsrDebugStatus("idle");
    }
  }, [asrDebugRecording]);

  useEffect(() => {
    sessionRef.current = createAsrSession();
    return () => {
      sessionRef.current?.destroy();
      sessionRef.current = null;
    };
  }, [createAsrSession]);

  useEffect(() => {
    if (capabilities) {
      capabilitiesRef.current = capabilities;
    }
  }, [capabilities]);

  useEffect(() => {
    if (!chatIdRef.current) {
      chatIdRef.current = chatId;
      return;
    }
    if (chatIdRef.current !== chatId) {
      chatIdRef.current = chatId;
      resetAsrSession();
    }
  }, [chatId, resetAsrSession]);

  return (
    <div className="field-group" style={{ marginTop: "14px" }}>
      <label htmlFor="asr-debug-final">{t("settings.asr.label")}</label>
      <div className="settings-inline-actions">
        <UiButton
          variant="primary"
          size="sm"
          onClick={() => void handleStartAsrDebug()}
          disabled={asrDebugRecording}
        >
          {t("settings.asr.start")}
        </UiButton>
        <UiButton
          variant="danger"
          size="sm"
          onClick={handleStopAsrDebug}
          disabled={!asrDebugRecording}
        >
          {t("settings.asr.stop")}
        </UiButton>
        <UiButton variant="secondary" size="sm" onClick={handleClearAsrDebug}>
          {t("settings.asr.clear")}
        </UiButton>
      </div>
      <p className="settings-hint">{asrDebugStatus}</p>
      {asrFallbackNotice && <p className="settings-hint">{asrFallbackNotice}</p>}
      <label htmlFor="asr-debug-interim" style={{ marginTop: "10px" }}>
        {t("settings.asr.interim")}
      </label>
      <textarea
        id="asr-debug-interim"
        rows={2}
        className="settings-textarea settings-readonly-textarea"
        placeholder={t("settings.asr.interimPlaceholder")}
        value={asrDebugInterimText}
        readOnly
      />
      <label htmlFor="asr-debug-final" style={{ marginTop: "10px" }}>
        {t("settings.asr.final")}
      </label>
      <textarea
        id="asr-debug-final"
        rows={4}
        className="settings-textarea settings-readonly-textarea"
        placeholder={t("settings.asr.finalPlaceholder")}
        value={asrDebugFinalText}
        readOnly
      />
      <p className="settings-hint">{t("settings.asr.hint")}</p>
    </div>
  );
};
