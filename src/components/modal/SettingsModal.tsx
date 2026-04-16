import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";
import { ACCESS_TOKEN_STORAGE_KEY } from "../../context/constants";
import type {
  ConversationMode,
  ThemeMode,
  TransportMode,
  VoiceCapabilities,
  VoiceClientGateConfig,
  WsConnectionStatus,
} from "../../context/types";
import {
  ensureAccessToken,
  getCurrentAccessToken,
  getVoiceCapabilitiesFlexible,
  setAccessToken,
} from "../../lib/apiClient";
import { isAppMode } from "../../lib/routing";
import { AsrDebugSession } from "../../lib/asrDebugSession";
import {
  DEFAULT_VOICE_WS_PATH,
  normalizeVoiceClientGateConfig,
  resolveDefaultVoiceAsrDefaults,
  resolveVoiceAsrRuntimeConfig,
} from "../../lib/voiceAsrProtocol";
import {
  DEFAULT_TTS_DEBUG_TEXT,
  getVoiceRuntime,
} from "../../lib/voiceRuntime";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";
import {
  commitClientGateDraft,
  formatClientGateDraftState,
  syncClientGateDraftState,
  type ClientGateDraftField,
} from "./settingsClientGateDrafts";

export function formatWsStatusText(
  status: WsConnectionStatus,
  errorMessage = "",
): string {
  const detail = String(errorMessage || "").trim();
  if (status === "connected") {
    return "WebSocket 已连接";
  }
  if (status === "connecting") {
    return "WebSocket 连接中...";
  }
  if (status === "error" || detail) {
    return detail ? `WebSocket 连接异常：${detail}` : "WebSocket 连接异常";
  }
  return "WebSocket 未连接";
}

export const SettingsModal: React.FC = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const appMode = isAppMode();
  const isDesktopApp =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("desktopApp") === "1";
  const [tokenInput, setTokenInput] = useState(
    appMode ? getCurrentAccessToken() || state.accessToken : state.accessToken,
  );
  const [error, setError] = useState("");
  const [ttsDebugText, setTtsDebugText] = useState("");
  const [asrDebugStatus, setAsrDebugStatus] = useState("idle");
  const [asrDebugRecording, setAsrDebugRecording] = useState(false);
  const [asrDebugInterimText, setAsrDebugInterimText] = useState("");
  const [asrDebugFinalText, setAsrDebugFinalText] = useState("");
  const [asrFallbackNotice, setAsrFallbackNotice] = useState("");
  const [clientGateDrafts, setClientGateDrafts] = useState(() =>
    formatClientGateDraftState(state.voiceChat.clientGate),
  );
  const sessionRef = useRef<AsrDebugSession | null>(null);
  const accessTokenRef = useRef(state.accessToken);
  const capabilitiesRef = useRef<VoiceCapabilities | null>(
    state.voiceChat.capabilities,
  );
  const chatIdRef = useRef(state.chatId);
  const activeClientGateFieldRef = useRef<ClientGateDraftField | null>(null);

  accessTokenRef.current = appMode
    ? getCurrentAccessToken() || state.accessToken
    : state.accessToken;

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

  const handleTtsDebugSend = async () => {
    const text = ttsDebugText.trim();
    if (!text) {
      dispatch({ type: "SET_TTS_DEBUG_STATUS", status: "error: empty text" });
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

  const handleTransportModeChange = useCallback(
    (mode: TransportMode) => {
      dispatch({ type: "SET_TRANSPORT_MODE", mode });
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

  const mapAsrStatus = useCallback((status: string, errorText?: string) => {
    if (errorText) return `error: ${errorText}`;
    if (status === "connecting") return "正在连接 ASR...";
    if (status === "socket-open")
      return "ASR WebSocket 已连接，等待后端启动任务...";
    if (status === "recording") return "正在录音并发送到 Voice ASR...";
    if (status === "stopping") return "正在提交音频并等待最终识别...";
    if (status === "error") return "ASR 调试失败";
    return "idle";
  }, []);

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
        appendDebug: (line) => dispatch({ type: "APPEND_DEBUG", line }),
      }),
    [dispatch, mapAsrStatus],
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
    const capabilities = await getVoiceCapabilitiesFlexible();
    const runtimeConfig = resolveVoiceAsrRuntimeConfig(
      capabilities,
      state.voiceChat.clientGate,
      state.voiceChat.clientGateCustomized,
    );
    capabilitiesRef.current = capabilities;
    dispatch({
      type: "PATCH_VOICE_CHAT",
      patch: {
        capabilities,
        capabilitiesLoaded: true,
        capabilitiesError: "",
        speechRate:
          Number(capabilities?.tts?.speechRateDefault) ||
          state.voiceChat.speechRate,
        clientGate: state.voiceChat.clientGateCustomized
          ? state.voiceChat.clientGate
          : runtimeConfig.asrDefaults.clientGate,
      },
    });
    return capabilities;
  }, [
    dispatch,
    state.voiceChat.clientGate,
    state.voiceChat.clientGateCustomized,
    state.voiceChat.speechRate,
  ]);

  const handleStartAsrDebug = useCallback(async () => {
    try {
      setAsrFallbackNotice("");
      setAsrDebugStatus("正在准备 ASR 调试...");
      const accessToken = appMode
        ? await ensureAccessToken("missing")
        : String(accessTokenRef.current || "").trim();
      accessTokenRef.current = accessToken;
      if (
        accessToken &&
        accessToken !== String(state.accessToken || "").trim()
      ) {
        dispatch({ type: "SET_ACCESS_TOKEN", token: accessToken });
      }
      if (!accessToken) {
        throw new Error("voice access_token is required");
      }
      let capabilities = capabilitiesRef.current;
      if (!capabilities) {
        try {
          capabilities = await ensureVoiceCapabilitiesLoaded();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          dispatch({
            type: "APPEND_DEBUG",
            line: `[settings-asr] capabilities fetch failed, fallback to defaults: ${message}`,
          });
          setAsrFallbackNotice(
            "capabilities fetch failed, fallback to defaults",
          );
          capabilities = {
            websocketPath: DEFAULT_VOICE_WS_PATH,
            asr: {
              defaults: resolveDefaultVoiceAsrDefaults(),
            },
          };
          capabilitiesRef.current = capabilities;
        }
      }
      if (capabilities?.asr?.configured === false) {
        throw new Error("当前语音后端未配置 ASR");
      }
      const runtimeConfig = resolveVoiceAsrRuntimeConfig(capabilities);
      const effectiveRuntimeConfig = resolveVoiceAsrRuntimeConfig(
        capabilities,
        state.voiceChat.clientGate,
        state.voiceChat.clientGateCustomized,
      );
      if (!sessionRef.current) {
        sessionRef.current = createAsrSession();
      }
      await sessionRef.current.start({
        websocketPath: runtimeConfig.websocketPath,
        asrDefaults: effectiveRuntimeConfig.asrDefaults,
      });
    } catch (err) {
      const message = (err as Error).message;
      setAsrDebugStatus(`error: ${message}`);
      setAsrDebugRecording(false);
    }
  }, [
    appMode,
    createAsrSession,
    dispatch,
    ensureAccessToken,
    ensureVoiceCapabilitiesLoaded,
    state.accessToken,
    state.voiceChat.clientGate,
    state.voiceChat.clientGateCustomized,
  ]);

  const handleStopAsrDebug = useCallback(() => {
    try {
      sessionRef.current?.stopAndCommit();
    } catch (err) {
      setAsrDebugStatus(`error: ${(err as Error).message}`);
      setAsrDebugRecording(false);
    }
  }, []);

  const handleClearAsrDebug = useCallback(() => {
    sessionRef.current?.clearTranscript();
    setAsrDebugInterimText("");
    setAsrDebugFinalText("");
    if (!asrDebugRecording) {
      setAsrDebugStatus("idle");
    }
  }, [asrDebugRecording]);

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
    if (!state.settingsOpen) return;
    setTtsDebugText((current) =>
      current.trim() ? current : DEFAULT_TTS_DEBUG_TEXT,
    );
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
    sessionRef.current = createAsrSession();
    return () => {
      sessionRef.current?.destroy();
      sessionRef.current = null;
    };
  }, [createAsrSession]);

  useEffect(() => {
    if (state.voiceChat.capabilities) {
      capabilitiesRef.current = state.voiceChat.capabilities;
    }
  }, [state.voiceChat.capabilities]);

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

  useEffect(() => {
    if (!chatIdRef.current) {
      chatIdRef.current = state.chatId;
      return;
    }
    if (chatIdRef.current !== state.chatId) {
      chatIdRef.current = state.chatId;
      resetAsrSession();
    }
  }, [resetAsrSession, state.chatId]);

  const wsStatusText = formatWsStatusText(
    state.wsStatus,
    state.wsErrorMessage,
  );

  return (
    <div className="modal" id="settings-modal">
      <div className="modal-card settings-card">
        <div className="settings-head">
          <h3>设置</h3>
          <UiButton
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: "SET_SETTINGS_OPEN", open: false })}
          >
            关闭
          </UiButton>
        </div>

        <div className="settings-preferences-grid">
          <div className="field-group">
            <label>对话模式</label>
            <div
              className="settings-segmented"
              role="tablist"
              aria-label="对话模式"
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
                员工模式
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
                聊天模式
              </UiButton>
            </div>
            <p className="settings-hint">
              控制侧边栏优先以员工会话还是普通聊天视角展示，默认使用员工模式。
            </p>
          </div>

          {!isDesktopApp && (
            <div className="field-group">
              <label>界面主题</label>
              <div
                className="settings-segmented"
                role="tablist"
                aria-label="界面主题"
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
                  浅色
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
                  深色
                </UiButton>
              </div>
              <p className="settings-hint">
                同步切换自定义界面样式和 Ant Design 组件主题，并记住当前选择。
              </p>
            </div>
          )}

          <div className="field-group">
            <label>传输模式</label>
            <div
              className="settings-segmented"
              role="tablist"
              aria-label="传输模式"
            >
              <UiButton
                variant="ghost"
                size="sm"
                className={`settings-segmented-btn ${state.transportMode === "sse" ? "is-active" : ""}`}
                role="tab"
                aria-selected={state.transportMode === "sse"}
                active={state.transportMode === "sse"}
                disabled={state.streaming}
                onClick={() => handleTransportModeChange("sse")}
              >
                SSE
              </UiButton>
              <UiButton
                variant="ghost"
                size="sm"
                className={`settings-segmented-btn ${state.transportMode === "ws" ? "is-active" : ""}`}
                role="tab"
                aria-selected={state.transportMode === "ws"}
                active={state.transportMode === "ws"}
                disabled={state.streaming}
                onClick={() => handleTransportModeChange("ws")}
              >
                WebSocket
              </UiButton>
            </div>
            <p className="settings-hint">
              {state.streaming
                ? "当前流式响应中，结束后可切换传输模式。"
                : state.transportMode === "ws"
                  ? `当前使用 WebSocket 传输。${wsStatusText}。`
                  : "当前使用 SSE 传输。"}
            </p>
          </div>
        </div>

        <div className="field-group">
          <label htmlFor="settings-token">Access Token</label>
          <UiInput
            id="settings-token"
            inputSize="md"
            type="password"
            placeholder={
              appMode ? "Token 由宿主应用自动管理" : "输入访问令牌..."
            }
            value={tokenInput}
            readOnly={appMode}
            onChange={(e) => setTokenInput(e.target.value)}
          />
          {error && <p className="settings-error">{error}</p>}
          <p className="settings-hint">
            {appMode
              ? "App 模式下由宿主应用通过 Bridge 自动管理，用于 API Bearer 与 Voice WS query access_token。"
              : "用于 API Bearer 与 Voice WS query access_token；仅保存在当前浏览器本地。"}
          </p>
        </div>

        {!appMode && (
          <div className="settings-inline-actions">
            <UiButton variant="primary" size="sm" onClick={handleSave}>
              保存
            </UiButton>
          </div>
        )}

        <div className="settings-grid" style={{ marginTop: "16px" }}>
          <UiButton
            variant="secondary"
            size="sm"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("agent:refresh-agents"))
            }
          >
            刷新智能体
          </UiButton>
          <UiButton
            variant="secondary"
            size="sm"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("agent:refresh-teams"))
            }
          >
            刷新 Teams
          </UiButton>
          <UiButton
            variant="danger"
            size="sm"
            onClick={() => {
              dispatch({ type: "CLEAR_DEBUG" });
              dispatch({ type: "CLEAR_EVENTS" });
            }}
          >
            清空日志
          </UiButton>
        </div>

        <div className="field-group" style={{ marginTop: "14px" }}>
          <label htmlFor="client-gate-enabled">
            前端语音门限 / Client Gate
          </label>
          <label className="settings-toggle" htmlFor="client-gate-enabled">
            <input
              id="client-gate-enabled"
              type="checkbox"
              checked={state.voiceChat.clientGate.enabled}
              onChange={(event) =>
                patchClientGate({ enabled: event.target.checked })
              }
            />
            <span>启用前端本地门限过滤</span>
          </label>
          <div className="settings-numeric-grid">
            <div className="field-group">
              <label htmlFor="client-gate-threshold">RMS Threshold</label>
              <UiInput
                id="client-gate-threshold"
                inputSize="md"
                type="text"
                inputMode="decimal"
                value={clientGateDrafts.rmsThreshold}
                onChange={(event) =>
                  handleClientGateDraftChange(
                    "rmsThreshold",
                    event.target.value,
                  )
                }
                onFocus={() => handleClientGateFieldFocus("rmsThreshold")}
                onBlur={() => handleClientGateFieldCommit("rmsThreshold")}
                onKeyDown={(event) =>
                  handleClientGateFieldKeyDown("rmsThreshold", event)
                }
              />
            </div>
            <div className="field-group">
              <label htmlFor="client-gate-open-hold">Open Hold (ms)</label>
              <UiInput
                id="client-gate-open-hold"
                inputSize="md"
                type="text"
                inputMode="numeric"
                value={clientGateDrafts.openHoldMs}
                onChange={(event) =>
                  handleClientGateDraftChange("openHoldMs", event.target.value)
                }
                onFocus={() => handleClientGateFieldFocus("openHoldMs")}
                onBlur={() => handleClientGateFieldCommit("openHoldMs")}
                onKeyDown={(event) =>
                  handleClientGateFieldKeyDown("openHoldMs", event)
                }
              />
            </div>
            <div className="field-group">
              <label htmlFor="client-gate-close-hold">Close Hold (ms)</label>
              <UiInput
                id="client-gate-close-hold"
                inputSize="md"
                type="text"
                inputMode="numeric"
                value={clientGateDrafts.closeHoldMs}
                onChange={(event) =>
                  handleClientGateDraftChange("closeHoldMs", event.target.value)
                }
                onFocus={() => handleClientGateFieldFocus("closeHoldMs")}
                onBlur={() => handleClientGateFieldCommit("closeHoldMs")}
                onKeyDown={(event) =>
                  handleClientGateFieldKeyDown("closeHoldMs", event)
                }
              />
            </div>
            <div className="field-group">
              <label htmlFor="client-gate-preroll">Pre-roll (ms)</label>
              <UiInput
                id="client-gate-preroll"
                inputSize="md"
                type="text"
                inputMode="numeric"
                value={clientGateDrafts.preRollMs}
                onChange={(event) =>
                  handleClientGateDraftChange("preRollMs", event.target.value)
                }
                onFocus={() => handleClientGateFieldFocus("preRollMs")}
                onBlur={() => handleClientGateFieldCommit("preRollMs")}
                onKeyDown={(event) =>
                  handleClientGateFieldKeyDown("preRollMs", event)
                }
              />
            </div>
          </div>
          <p className="settings-hint">
            rmsThreshold 越大越难触发，适合过滤轻声；open/close
            控制开闭稳定性；preRoll 用于避免吞掉开头音节。
          </p>
          <p className="settings-hint">
            当前配置仅保留在本页会话内，ASR Debug
            会立即使用；进行中的语聊会立即更新本地门限；下次 ASR
            启动也会继续沿用该配置。
          </p>
        </div>

        <div className="field-group" style={{ marginTop: "14px" }}>
          <label htmlFor="tts-debug-input">TTS Voice 调试</label>
          <textarea
            id="tts-debug-input"
            rows={3}
            className="settings-textarea"
            placeholder={DEFAULT_TTS_DEBUG_TEXT}
            value={ttsDebugText}
            onChange={(e) => setTtsDebugText(e.target.value)}
          />
          <div className="settings-inline-actions">
            <UiButton variant="primary" size="sm" onClick={handleTtsDebugSend}>
              发送并播放
            </UiButton>
            <UiButton variant="danger" size="sm" onClick={handleTtsDebugStop}>
              停止播放
            </UiButton>
          </div>
          <p className="settings-hint">{state.ttsDebugStatus}</p>
        </div>

        <div className="field-group" style={{ marginTop: "14px" }}>
          <label htmlFor="asr-debug-final">ASR Voice 调试</label>
          <div className="settings-inline-actions">
            <UiButton
              variant="primary"
              size="sm"
              onClick={() => void handleStartAsrDebug()}
              disabled={asrDebugRecording}
            >
              开始录音
            </UiButton>
            <UiButton
              variant="danger"
              size="sm"
              onClick={handleStopAsrDebug}
              disabled={!asrDebugRecording}
            >
              停止并提交
            </UiButton>
            <UiButton
              variant="secondary"
              size="sm"
              onClick={handleClearAsrDebug}
            >
              清空结果
            </UiButton>
          </div>
          <p className="settings-hint">{asrDebugStatus}</p>
          {asrFallbackNotice && (
            <p className="settings-hint">{asrFallbackNotice}</p>
          )}
          <label htmlFor="asr-debug-interim" style={{ marginTop: "10px" }}>
            实时转写
          </label>
          <textarea
            id="asr-debug-interim"
            rows={2}
            className="settings-textarea settings-readonly-textarea"
            placeholder="等待 ASR interim 文本..."
            value={asrDebugInterimText}
            readOnly
          />
          <label htmlFor="asr-debug-final" style={{ marginTop: "10px" }}>
            最终转写
          </label>
          <textarea
            id="asr-debug-final"
            rows={4}
            className="settings-textarea settings-readonly-textarea"
            placeholder="等待 ASR final 文本..."
            value={asrDebugFinalText}
            readOnly
          />
          <p className="settings-hint">
            该调试只验证麦克风音频是否打到 Voice ASR，并展示识别结果，不触发
            TTS。
          </p>
        </div>
      </div>
    </div>
  );
};
