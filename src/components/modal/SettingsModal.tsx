import React, { useEffect, useState } from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";
import { ACCESS_TOKEN_STORAGE_KEY } from "../../context/constants";
import { setAccessToken } from "../../lib/apiClient";
import { getVoiceRuntime } from "../../lib/voiceRuntime";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";

export const SettingsModal: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const [tokenInput, setTokenInput] = useState(state.accessToken);
	const [error, setError] = useState("");
	const [ttsDebugText, setTtsDebugText] = useState("");

	const handleSave = () => {
		const token = tokenInput.trim();
		setAccessToken(token);
		localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
		dispatch({ type: "SET_ACCESS_TOKEN", token });
		getVoiceRuntime()?.resetVoiceRuntime();
		window.dispatchEvent(new CustomEvent("agent:refresh-agents"));
		window.dispatchEvent(new CustomEvent("agent:refresh-chats"));
		window.dispatchEvent(new CustomEvent("agent:refresh-teams"));
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

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			dispatch({ type: "SET_SETTINGS_OPEN", open: false });
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [dispatch]);

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
						placeholder="输入调试文本，发送并播放..."
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
			</div>
		</div>
	);
};
