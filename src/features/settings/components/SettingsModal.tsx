import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAppState, useAppDispatch } from "@/app/state/AppContext";
import { ACCESS_TOKEN_STORAGE_KEY } from "@/app/state/constants";
import type {
  ConversationMode,
  ThemeMode,
  TransportMode,
  VoiceClientGateConfig,
} from "@/app/state/types";
import { getCurrentAccessToken, setAccessToken } from "@/shared/api/apiClient";
import { isAppMode } from "@/shared/utils/routing";
import {
  normalizeVoiceClientGateConfig,
} from "@/features/voice/lib/voiceAsrProtocol";
import { getVoiceRuntime } from "@/features/voice/lib/voiceRuntime";
import { UiButton } from "@/shared/ui/UiButton";
import {
  commitClientGateDraft,
  formatClientGateDraftState,
  syncClientGateDraftState,
  type ClientGateDraftField,
} from "@/features/settings/lib/settingsClientGateDrafts";
import { useI18n } from "@/shared/i18n";
import { SettingsTransport } from "@/features/settings/components/SettingsTransport";
import { SettingsToken } from "@/features/settings/components/SettingsToken";
import { SettingsClientGate } from "@/features/settings/components/SettingsClientGate";
import { SettingsTtsDebug } from "@/features/settings/components/SettingsTtsDebug";
import { SettingsAsrDebug } from "@/features/settings/components/SettingsAsrDebug";
export { formatWsStatusText } from "@/features/settings/lib/formatWsStatusText";

export const SettingsModal: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  const appMode = isAppMode();
  const isDesktopApp =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("desktopApp") === "1";
  const [tokenInput, setTokenInput] = useState(
    appMode ? getCurrentAccessToken() || state.accessToken : state.accessToken,
  );
  const [error, setError] = useState("");
  const [clientGateDrafts, setClientGateDrafts] = useState(() =>
    formatClientGateDraftState(state.voiceChat.clientGate),
  );
  const activeClientGateFieldRef = useRef<ClientGateDraftField | null>(null);

  const patchClientGate = useCallback(
    (patch: Partial<VoiceClientGateConfig>) => {
      dispatch({
        type: "PATCH_VOICE_CHAT",
        patch: {
          clientGate: normalizeVoiceClientGateConfig({
            ...state.voiceChat.clientGate,
            ...patch,
          }),
          clientGateCustomized: true,
        },
      });
    },
    [dispatch, state.voiceChat.clientGate],
  );

  const handlePatchVoiceChat = useCallback(
    (patch: Partial<typeof state.voiceChat>) => {
      dispatch({
        type: "PATCH_VOICE_CHAT",
        patch,
      });
    },
    [dispatch],
  );

  const handleSave = () => {
    if (appMode) {
      dispatch({ type: "SET_SETTINGS_OPEN", open: false });
      return;
    }
    const token = tokenInput.trim();
    setAccessToken(token);
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
    dispatch({ type: "SET_ACCESS_TOKEN", token });
    getVoiceRuntime()?.resetVoiceRuntime();
    window.dispatchEvent(new CustomEvent("agent:refresh-worker-data"));
    setError("");
    dispatch({ type: "SET_SETTINGS_OPEN", open: false });
  };

  const handleTtsDebugSend = async (textInput: string) => {
    const text = textInput.trim();
    if (!text) {
      dispatch({
        type: "SET_TTS_DEBUG_STATUS",
        status: t("settings.shared.errorWithDetail", {
          detail: "empty text",
        }),
      });
      return;
    }
    try {
      dispatch({ type: "SET_TTS_DEBUG_STATUS", status: "sending..." });
      await getVoiceRuntime()?.debugSpeakTtsVoice(text);
    } catch (err) {
      dispatch({
        type: "SET_TTS_DEBUG_STATUS",
        status: `error: ${(err as Error).message}`,
      });
    }
  };

  const handleTtsDebugStop = () => {
    window.dispatchEvent(
      new CustomEvent("agent:voice-stop-all", {
        detail: { reason: "debug_stop", mode: "stop" },
      }),
    );
  };

  const handleThemeChange = useCallback(
    (themeMode: ThemeMode) => {
      dispatch({ type: "SET_THEME_MODE", themeMode });
    },
    [dispatch],
  );

  const handleConversationModeChange = useCallback((mode: ConversationMode) => {
    window.dispatchEvent(
      new CustomEvent("agent:set-conversation-mode", {
        detail: { mode },
      }),
    );
  }, []);

  const handleTransportModeChange = useCallback(
    (transportMode: TransportMode) => {
      dispatch({ type: "SET_TRANSPORT_MODE", mode: transportMode });
    },
    [dispatch],
  );

  const handleClientGateDraftChange = useCallback(
    (field: ClientGateDraftField, value: string) => {
      setClientGateDrafts((current) => ({
        ...current,
        [field]: value,
      }));
    },
    [],
  );

  const handleClientGateFieldFocus = useCallback(
    (field: ClientGateDraftField) => {
      activeClientGateFieldRef.current = field;
    },
    [],
  );

  const handleClientGateFieldCommit = useCallback(
    (field: ClientGateDraftField) => {
      const result = commitClientGateDraft(
        field,
        clientGateDrafts,
        state.voiceChat.clientGate,
      );
      activeClientGateFieldRef.current = null;
      setClientGateDrafts(result.nextDrafts);
      if (result.nextPatch) {
        patchClientGate(result.nextPatch);
      }
    },
    [clientGateDrafts, patchClientGate, state.voiceChat.clientGate],
  );

  const handleClientGateFieldKeyDown = useCallback(
    (
      field: ClientGateDraftField,
      event: React.KeyboardEvent<HTMLInputElement>,
    ) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      handleClientGateFieldCommit(field);
      event.currentTarget.blur();
    },
    [handleClientGateFieldCommit],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      dispatch({ type: "SET_SETTINGS_OPEN", open: false });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dispatch]);

  useEffect(() => {
    setClientGateDrafts(formatClientGateDraftState(state.voiceChat.clientGate));
  }, [state.settingsOpen]);

  useEffect(() => {
    setTokenInput(
      appMode
        ? getCurrentAccessToken() || state.accessToken
        : state.accessToken,
    );
  }, [appMode, state.accessToken]);

  useEffect(() => {
    if (!state.settingsOpen) return;
    setClientGateDrafts((current) =>
      syncClientGateDraftState(
        current,
        state.voiceChat.clientGate,
        activeClientGateFieldRef.current,
      ),
    );
  }, [state.settingsOpen, state.voiceChat.clientGate]);

  return (
    <div className="modal" id="settings-modal">
      <div className="modal-card settings-card">
        <div className="settings-head">
          <h3>{t("settings.title")}</h3>
          <UiButton
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: "SET_SETTINGS_OPEN", open: false })}
          >
            {t("settings.close")}
          </UiButton>
        </div>

        <div className="settings-preferences-grid">
          <div className="field-group">
            <label>{t("settings.conversationMode.label")}</label>
            <div
              className="settings-segmented"
              role="tablist"
              aria-label={t("settings.conversationMode.label")}
            >
              <UiButton
                variant="ghost"
                size="sm"
                className={`settings-segmented-btn ${state.conversationMode === "worker" ? "is-active" : ""}`}
                role="tab"
                aria-selected={state.conversationMode === "worker"}
                active={state.conversationMode === "worker"}
                onClick={() => handleConversationModeChange("worker")}
              >
                {t("settings.conversationMode.worker")}
              </UiButton>
              <UiButton
                variant="ghost"
                size="sm"
                className={`settings-segmented-btn ${state.conversationMode === "chat" ? "is-active" : ""}`}
                role="tab"
                aria-selected={state.conversationMode === "chat"}
                active={state.conversationMode === "chat"}
                onClick={() => handleConversationModeChange("chat")}
              >
                {t("settings.conversationMode.chat")}
              </UiButton>
            </div>
            <p className="settings-hint">{t("settings.conversationMode.hint")}</p>
          </div>

          {!isDesktopApp && (
            <div className="field-group">
              <label>{t("settings.theme.label")}</label>
              <div
                className="settings-segmented"
                role="tablist"
                aria-label={t("settings.theme.label")}
              >
                <UiButton
                  variant="ghost"
                  size="sm"
                  className={`settings-segmented-btn ${state.themeMode === "light" ? "is-active" : ""}`}
                  role="tab"
                  aria-selected={state.themeMode === "light"}
                  active={state.themeMode === "light"}
                  onClick={() => handleThemeChange("light")}
                >
                  {t("settings.theme.light")}
                </UiButton>
                <UiButton
                  variant="ghost"
                  size="sm"
                  className={`settings-segmented-btn ${state.themeMode === "dark" ? "is-active" : ""}`}
                  role="tab"
                  aria-selected={state.themeMode === "dark"}
                  active={state.themeMode === "dark"}
                  onClick={() => handleThemeChange("dark")}
                >
                  {t("settings.theme.dark")}
                </UiButton>
              </div>
              <p className="settings-hint">{t("settings.theme.hint")}</p>
            </div>
          )}

          <SettingsTransport
            transportMode={state.transportMode}
            wsStatus={state.wsStatus}
            wsErrorMessage={state.wsErrorMessage}
            streaming={state.streaming}
            onTransportModeChange={handleTransportModeChange}
          />
        </div>

        <SettingsToken
          appMode={appMode}
          tokenInput={tokenInput}
          error={error}
          onTokenInputChange={setTokenInput}
          onSave={handleSave}
        />

        <div className="settings-grid" style={{ marginTop: "16px" }}>
          <UiButton
            variant="secondary"
            size="sm"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("agent:refresh-agents"))
            }
          >
            {t("settings.actions.refreshAgents")}
          </UiButton>
          <UiButton
            variant="secondary"
            size="sm"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("agent:refresh-teams"))
            }
          >
            {t("settings.actions.refreshTeams")}
          </UiButton>
          <UiButton
            variant="danger"
            size="sm"
            onClick={() => {
              dispatch({ type: "CLEAR_DEBUG" });
              dispatch({ type: "CLEAR_EVENTS" });
            }}
          >
            {t("settings.actions.clearLogs")}
          </UiButton>
        </div>

        <SettingsClientGate
          clientGate={state.voiceChat.clientGate}
          clientGateDrafts={clientGateDrafts}
          onEnabledChange={(enabled) => patchClientGate({ enabled })}
          onDraftChange={handleClientGateDraftChange}
          onFieldFocus={handleClientGateFieldFocus}
          onFieldCommit={handleClientGateFieldCommit}
          onFieldKeyDown={handleClientGateFieldKeyDown}
        />

        <SettingsTtsDebug
          settingsOpen={state.settingsOpen}
          ttsDebugStatus={state.ttsDebugStatus}
          onSend={(text) => void handleTtsDebugSend(text)}
          onStop={handleTtsDebugStop}
        />

        <SettingsAsrDebug
          appMode={appMode}
          accessToken={
            appMode
              ? getCurrentAccessToken() || state.accessToken
              : state.accessToken
          }
          chatId={state.chatId}
          speechRate={state.voiceChat.speechRate}
          capabilities={state.voiceChat.capabilities}
          clientGate={state.voiceChat.clientGate}
          clientGateCustomized={state.voiceChat.clientGateCustomized}
          onAccessTokenResolved={(token) =>
            dispatch({ type: "SET_ACCESS_TOKEN", token })
          }
          onPatchVoiceChat={handlePatchVoiceChat}
          onDispatch={dispatch}
        />
      </div>
    </div>
  );
};
