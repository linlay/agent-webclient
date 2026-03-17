import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";
import { ACCESS_TOKEN_STORAGE_KEY } from "../../context/constants";
import type { VoiceCapabilities } from "../../context/types";
import {
	getVoiceCapabilitiesFlexible,
	setAccessToken,
} from "../../lib/apiClient";
import { AsrDebugSession } from "../../lib/asrDebugSession";
import {
	DEFAULT_VOICE_ASR_DEFAULTS,
	DEFAULT_VOICE_WS_PATH,
	resolveVoiceAsrRuntimeConfig,
} from "../../lib/voiceAsrProtocol";
import { DEFAULT_TTS_DEBUG_TEXT, getVoiceRuntime } from "../../lib/voiceRuntime";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";

export const SettingsModal: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const [tokenInput, setTokenInput] = useState(state.accessToken);
	const [error, setError] = useState("");
	const [ttsDebugText, setTtsDebugText] = useState("");
	const [asrDebugStatus, setAsrDebugStatus] = useState("idle");
	const [asrDebugRecording, setAsrDebugRecording] = useState(false);
	const [asrDebugInterimText, setAsrDebugInterimText] = useState("");
	const [asrDebugFinalText, setAsrDebugFinalText] = useState("");
	const [asrFallbackNotice, setAsrFallbackNotice] = useState("");
	const sessionRef = useRef<AsrDebugSession | null>(null);
	const accessTokenRef = useRef(state.accessToken);
	const capabilitiesRef = useRef<VoiceCapabilities | null>(
		state.voiceChat.capabilities,
	);
	const chatIdRef = useRef(state.chatId);

	accessTokenRef.current = state.accessToken;

	const handleSave = () => {
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

	const handleThemeToggle = () => {
		const current = document.documentElement.getAttribute("data-theme");
		const next = current === "dark" ? "light" : "dark";
		document.documentElement.setAttribute("data-theme", next);
	};

	const mapAsrStatus = useCallback((status: string, errorText?: string) => {
		if (errorText) return `error: ${errorText}`;
		if (status === "connecting") return "正在连接 ASR...";
		if (status === "socket-open") return "ASR WebSocket 已连接，等待后端启动任务...";
		if (status === "recording") return "正在录音并发送到 Voice ASR...";
		if (status === "stopping") return "正在提交音频并等待最终识别...";
		if (status === "error") return "ASR 调试失败";
		return "idle";
	}, []);

	const resetAsrUi = useCallback((options: { clearTranscript?: boolean } = {}) => {
		setAsrDebugStatus("idle");
		setAsrDebugRecording(false);
		setAsrDebugInterimText("");
		setAsrFallbackNotice("");
		if (options.clearTranscript !== false) {
			setAsrDebugFinalText("");
		}
	}, []);

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
				appendDebug: (line) =>
					dispatch({ type: "APPEND_DEBUG", line }),
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
			},
		});
		return capabilities;
	}, [dispatch, state.voiceChat.speechRate]);

	const handleStartAsrDebug = useCallback(async () => {
		try {
			setAsrFallbackNotice("");
			setAsrDebugStatus("正在准备 ASR 调试...");
			let capabilities = capabilitiesRef.current;
			if (!capabilities) {
				try {
					capabilities = await ensureVoiceCapabilitiesLoaded();
				} catch (err) {
					const message =
						err instanceof Error ? err.message : String(err);
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
							defaults: DEFAULT_VOICE_ASR_DEFAULTS,
						},
					};
					capabilitiesRef.current = capabilities;
				}
			}
			if (capabilities?.asr?.configured === false) {
				throw new Error("当前语音后端未配置 ASR");
			}
			const runtimeConfig = resolveVoiceAsrRuntimeConfig(capabilities);
			if (!sessionRef.current) {
				sessionRef.current = createAsrSession();
			}
			await sessionRef.current.start({
				websocketPath: runtimeConfig.websocketPath,
				asrDefaults: runtimeConfig.asrDefaults,
			});
		} catch (err) {
			const message = (err as Error).message;
			setAsrDebugStatus(`error: ${message}`);
			setAsrDebugRecording(false);
		}
	}, [createAsrSession, dispatch, ensureVoiceCapabilitiesLoaded]);

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
	}, [state.settingsOpen]);

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
		if (!chatIdRef.current) {
			chatIdRef.current = state.chatId;
			return;
		}
		if (chatIdRef.current !== state.chatId) {
			chatIdRef.current = state.chatId;
			resetAsrSession();
		}
	}, [resetAsrSession, state.chatId]);

	return (
		<div
			className="modal"
			id="settings-modal"
			onClick={(e) => {
				if (e.target === e.currentTarget)
					dispatch({ type: "SET_SETTINGS_OPEN", open: false });
			}}
		>
			<div className="modal-card settings-card">
				<div className="settings-head">
					<h3>设置</h3>
					<UiButton
						variant="ghost"
						size="sm"
						onClick={() =>
							dispatch({ type: "SET_SETTINGS_OPEN", open: false })
						}
					>
						关闭
					</UiButton>
				</div>

				<div className="field-group">
					<label htmlFor="settings-token">Access Token</label>
					<UiInput
						id="settings-token"
						inputSize="md"
						type="password"
						placeholder="输入访问令牌..."
						value={tokenInput}
						onChange={(e) => setTokenInput(e.target.value)}
					/>
					{error && <p className="settings-error">{error}</p>}
					<p className="settings-hint">
						用于 API Bearer 与 Voice WS query access_token；仅保存在当前浏览器本地。
					</p>
				</div>

				<div className="settings-inline-actions">
					<UiButton variant="primary" size="sm" onClick={handleSave}>
						保存
					</UiButton>
				</div>

				<div className="settings-grid" style={{ marginTop: "16px" }}>
					<UiButton
						variant="secondary"
						size="sm"
						onClick={() =>
							window.dispatchEvent(
								new CustomEvent("agent:refresh-agents"),
							)
						}
					>
						刷新智能体
					</UiButton>
					<UiButton
						variant="secondary"
						size="sm"
						onClick={() =>
							window.dispatchEvent(
								new CustomEvent("agent:refresh-teams"),
							)
						}
					>
						刷新 Teams
					</UiButton>
					<UiButton
						variant="secondary"
						size="sm"
						onClick={handleThemeToggle}
					>
						切换主题
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
						<UiButton
							variant="primary"
							size="sm"
							onClick={handleTtsDebugSend}
						>
							发送并播放
						</UiButton>
						<UiButton
							variant="danger"
							size="sm"
							onClick={handleTtsDebugStop}
						>
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
						该调试只验证麦克风音频是否打到 Voice ASR，并展示识别结果，不触发 TTS。
					</p>
				</div>
			</div>
		</div>
	);
};
