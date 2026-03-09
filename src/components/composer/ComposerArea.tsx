import React, { useRef, useCallback, useState, useEffect } from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";
import { MentionSuggest } from "./MentionSuggest";
import { COMPOSER_MAX_LINES } from "../../context/constants";
import { createRequestId, interruptChat, steerChat } from "../../lib/apiClient";
import { parseLeadingMentionDraft } from "../../lib/mentionParser";
import { resolveMentionCandidatesFromState } from "../../lib/mentionCandidates";
import { MaterialIcon } from "../common/MaterialIcon";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";

type SpeechRecognitionLike = {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	onstart: (() => void) | null;
	onend: (() => void) | null;
	onerror: ((event: { error?: string }) => void) | null;
	onresult:
		| ((event: {
				resultIndex: number;
				results: ArrayLike<{
					isFinal: boolean;
					0: { transcript: string };
				}>;
		  }) => void)
		| null;
	start: () => void;
	stop: () => void;
};

type SpeechConstructor = new () => SpeechRecognitionLike;

export const ComposerArea: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const plusMenuRef = useRef<HTMLDivElement>(null);
	const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
	const speechBaseValueRef = useRef("");
	const speechFinalBufferRef = useRef("");
	const speechListeningRef = useRef(false);
	const [inputValue, setInputValue] = useState("");
	const [plusMenuOpen, setPlusMenuOpen] = useState(false);
	const [speechSupported, setSpeechSupported] = useState(false);
	const [speechListening, setSpeechListening] = useState(false);
	const [speechStatus, setSpeechStatus] = useState("点击开始听写");

	const isFrontendActive = !!state.activeFrontendTool;

	const autoresize = useCallback(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = "auto";
		const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
		const maxHeight = lineHeight * COMPOSER_MAX_LINES;
		el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
		el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
	}, []);

	useEffect(() => {
		autoresize();
	}, [inputValue, autoresize]);

	useEffect(() => {
		const ctor =
			(
				window as Window & {
					SpeechRecognition?: SpeechConstructor;
					webkitSpeechRecognition?: SpeechConstructor;
				}
			).SpeechRecognition ||
			(
				window as Window & {
					webkitSpeechRecognition?: SpeechConstructor;
				}
			).webkitSpeechRecognition;
		setSpeechSupported(Boolean(ctor));
	}, []);

	useEffect(() => {
		if (!plusMenuOpen) return;

		const onPointerDown = (event: MouseEvent) => {
			const target = event.target as Node | null;
			if (!target) return;
			if (plusMenuRef.current?.contains(target)) return;
			setPlusMenuOpen(false);
		};

		const onEsc = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setPlusMenuOpen(false);
			}
		};

		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onEsc);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onEsc);
		};
	}, [plusMenuOpen]);

	const closeMention = useCallback(() => {
		dispatch({ type: "SET_MENTION_OPEN", open: false });
		dispatch({ type: "SET_MENTION_SUGGESTIONS", agents: [] });
		dispatch({ type: "SET_MENTION_ACTIVE_INDEX", index: 0 });
	}, [dispatch]);

	const updateMentionSuggestions = useCallback(
		(value: string) => {
			const draft = parseLeadingMentionDraft(value);
			if (!draft) {
				closeMention();
				return;
			}

			const query = String(draft.token || "").toLowerCase();
			const candidates = resolveMentionCandidatesFromState(state)
				.filter((agent) => {
					const key = String(agent.key || "").toLowerCase();
					const name = String(agent.name || "").toLowerCase();
					if (!query) return true;
					return key.includes(query) || name.includes(query);
				})
				.slice(0, 8);

			if (candidates.length === 0) {
				closeMention();
				return;
			}

			dispatch({ type: "SET_MENTION_SUGGESTIONS", agents: candidates });
			dispatch({ type: "SET_MENTION_ACTIVE_INDEX", index: 0 });
			dispatch({ type: "SET_MENTION_OPEN", open: true });
		},
		[closeMention, dispatch, state],
	);

	const selectMentionByIndex = useCallback(
		(index: number) => {
			const target = state.mentionSuggestions[index];
			if (!target) return;
			const displayLabel = String(target.name || "").trim() || target.key;
			const next = `@${displayLabel} `;
			setInputValue(next);
			closeMention();
			window.requestAnimationFrame(() => {
				const el = textareaRef.current;
				if (!el) return;
				el.focus();
				const caret = next.length;
				el.setSelectionRange(caret, caret);
			});
		},
		[closeMention, state.mentionSuggestions],
	);

	const handleSend = useCallback(() => {
		const message = inputValue.trim();
		if (!message || state.streaming) return;
		setInputValue("");
		/* Dispatch a custom event so hooks can pick up the send action */
		window.dispatchEvent(
			new CustomEvent("agent:send-message", { detail: { message } }),
		);
	}, [inputValue, state.streaming]);

	const mergeSpeechText = useCallback((base: string, append: string) => {
		if (!append) return base;
		return `${base}${append}`;
	}, []);

	const stopSpeechInput = useCallback(() => {
		speechListeningRef.current = false;
		setSpeechListening(false);
		setSpeechStatus("点击开始听写");
		const recognition = speechRecognitionRef.current;
		if (!recognition) return;
		try {
			recognition.stop();
		} catch {
			/* no-op */
		}
	}, []);

	const startSpeechInput = useCallback(() => {
		const ctor =
			(
				window as Window & {
					SpeechRecognition?: SpeechConstructor;
					webkitSpeechRecognition?: SpeechConstructor;
				}
			).SpeechRecognition ||
			(
				window as Window & {
					webkitSpeechRecognition?: SpeechConstructor;
				}
			).webkitSpeechRecognition;

		if (!ctor) {
			setSpeechStatus("当前浏览器不支持语音输入");
			return;
		}

		if (!speechRecognitionRef.current) {
			const recognition = new ctor();
			recognition.lang = "zh-CN";
			recognition.continuous = true;
			recognition.interimResults = true;
			recognition.onstart = () => {
				speechListeningRef.current = true;
				setSpeechListening(true);
				setSpeechStatus("正在听写...");
			};
			recognition.onend = () => {
				speechListeningRef.current = false;
				setSpeechListening(false);
				setSpeechStatus("点击开始听写");
			};
			recognition.onerror = (event) => {
				const msg = String(event?.error || "识别失败");
				speechListeningRef.current = false;
				setSpeechListening(false);
				setSpeechStatus(`语音识别错误: ${msg}`);
			};
			recognition.onresult = (event) => {
				let finalDelta = "";
				let interimDelta = "";
				for (
					let i = event.resultIndex;
					i < event.results.length;
					i += 1
				) {
					const chunk = event.results[i]?.[0]?.transcript || "";
					if (!chunk) continue;
					if (event.results[i].isFinal) {
						finalDelta += chunk;
					} else {
						interimDelta += chunk;
					}
				}
				if (finalDelta) {
					speechFinalBufferRef.current += finalDelta;
				}
				const next = mergeSpeechText(
					speechBaseValueRef.current,
					`${speechFinalBufferRef.current}${interimDelta}`,
				);
				setInputValue(next);
				updateMentionSuggestions(next);
			};
			speechRecognitionRef.current = recognition;
		}

		speechBaseValueRef.current = inputValue;
		speechFinalBufferRef.current = "";
		try {
			speechRecognitionRef.current.start();
		} catch {
			setSpeechStatus("语音识别未启动，请重试");
		}
	}, [inputValue, mergeSpeechText, updateMentionSuggestions]);

	const toggleSpeechInput = useCallback(() => {
		if (speechListeningRef.current) {
			stopSpeechInput();
		} else {
			startSpeechInput();
		}
	}, [startSpeechInput, stopSpeechInput]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (state.mentionOpen && state.mentionSuggestions.length > 0) {
				if (e.key === "ArrowDown") {
					e.preventDefault();
					dispatch({
						type: "SET_MENTION_ACTIVE_INDEX",
						index:
							(state.mentionActiveIndex + 1) %
							state.mentionSuggestions.length,
					});
					return;
				}
				if (e.key === "ArrowUp") {
					e.preventDefault();
					dispatch({
						type: "SET_MENTION_ACTIVE_INDEX",
						index:
							(state.mentionActiveIndex -
								1 +
								state.mentionSuggestions.length) %
							state.mentionSuggestions.length,
					});
					return;
				}
				if (e.key === "Escape") {
					e.preventDefault();
					closeMention();
					return;
				}
				if (e.key === "Enter" && !e.shiftKey) {
					e.preventDefault();
					selectMentionByIndex(state.mentionActiveIndex);
					return;
				}
			}

			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSend();
			}
		},
		[
			handleSend,
			state.mentionOpen,
			state.mentionSuggestions,
			state.mentionActiveIndex,
			dispatch,
			closeMention,
			selectMentionByIndex,
		],
	);

	const resolveCurrentRunId = useCallback(() => {
		const fromState = String(state.runId || "").trim();
		if (fromState) return fromState;

		for (let i = state.events.length - 1; i >= 0; i -= 1) {
			const event = state.events[i];
			const rid = String(
				(event as { runId?: string }).runId || "",
			).trim();
			if (rid) return rid;
		}
		return "";
	}, [state.runId, state.events]);

	const resolveCurrentAgentKey = useCallback(() => {
		const chatId = String(state.chatId || "").trim();
		if (chatId) {
			const remembered = String(
				state.chatAgentById.get(chatId) || "",
			).trim();
			if (remembered) return remembered;
		}
		return String(state.pendingNewChatAgentKey || "").trim();
	}, [state.chatId, state.chatAgentById, state.pendingNewChatAgentKey]);

	const resolveCurrentTeamId = useCallback(() => {
		if (String(state.chatId || "").trim()) return "";
		const selected = state.workerIndexByKey.get(
			String(state.workerSelectionKey || "").trim(),
		);
		if (!selected || selected.type !== "team") return "";
		return String(selected.sourceId || "").trim();
	}, [state.chatId, state.workerIndexByKey, state.workerSelectionKey]);

	const handleInterrupt = useCallback(async () => {
		const chatId = String(state.chatId || "").trim();
		const runId = resolveCurrentRunId();
		const requestId = createRequestId("req");
		const agentKey = resolveCurrentAgentKey();
		const teamId = resolveCurrentTeamId();
		if (!chatId || !runId) {
			dispatch({
				type: "APPEND_DEBUG",
				line: `[interrupt] skipped: missing chatId/runId (chatId=${chatId || "-"}, runId=${runId || "-"})`,
			});
			return;
		}

		try {
			await interruptChat({
				requestId,
				chatId,
				runId,
				agentKey: agentKey || undefined,
				teamId: teamId || undefined,
				message: "",
				planningMode: Boolean(state.planningMode),
			});
			dispatch({
				type: "APPEND_DEBUG",
				line: `[interrupt] requested for chatId=${chatId}, runId=${runId}, requestId=${requestId}`,
			});
		} catch (error) {
			dispatch({
				type: "APPEND_DEBUG",
				line: `[interrupt] failed: ${(error as Error).message}`,
			});
		} finally {
			state.abortController?.abort();
			window.dispatchEvent(
				new CustomEvent("agent:voice-stop-all", {
					detail: { reason: "interrupt", mode: "stop" },
				}),
			);
			dispatch({ type: "SET_STREAMING", streaming: false });
			dispatch({ type: "SET_ABORT_CONTROLLER", controller: null });
		}
	}, [
		dispatch,
		resolveCurrentRunId,
		resolveCurrentAgentKey,
		resolveCurrentTeamId,
		state.chatId,
		state.abortController,
		state.planningMode,
	]);

	const handleSteer = useCallback(async () => {
		const message = state.steerDraft.trim();
		if (!message || !state.streaming) return;

		const chatId = String(state.chatId || "").trim();
		const runId = resolveCurrentRunId();
		const requestId = createRequestId("req");
		const agentKey = resolveCurrentAgentKey();
		const teamId = resolveCurrentTeamId();
		if (!chatId || !runId) {
			dispatch({
				type: "APPEND_DEBUG",
				line: `[steer] skipped: missing chatId/runId (chatId=${chatId || "-"}, runId=${runId || "-"})`,
			});
			return;
		}

		try {
			await steerChat({
				requestId,
				chatId,
				runId,
				agentKey: agentKey || undefined,
				teamId: teamId || undefined,
				message,
				planningMode: Boolean(state.planningMode),
			});
			dispatch({
				type: "APPEND_DEBUG",
				line: `[steer] submitted for chatId=${chatId}, runId=${runId}, requestId=${requestId}`,
			});
			dispatch({ type: "SET_STEER_DRAFT", draft: "" });
		} catch (error) {
			dispatch({
				type: "APPEND_DEBUG",
				line: `[steer] failed: ${(error as Error).message}`,
			});
		}
	}, [
		state.steerDraft,
		state.streaming,
		state.chatId,
		resolveCurrentRunId,
		resolveCurrentAgentKey,
		resolveCurrentTeamId,
		dispatch,
		state.planningMode,
	]);

	useEffect(() => {
		const onSelectMention = (event: Event) => {
			const agentKey = String(
				(event as CustomEvent).detail?.agentKey || "",
			).trim();
			const agentName = String(
				(event as CustomEvent).detail?.agentName || "",
			).trim();
			if (!agentKey) return;
			const displayLabel = agentName || agentKey;
			setInputValue(`@${displayLabel} `);
			closeMention();
		};

		window.addEventListener("agent:select-mention", onSelectMention);
		return () =>
			window.removeEventListener("agent:select-mention", onSelectMention);
	}, [closeMention]);

	useEffect(() => {
		return () => {
			const recognition = speechRecognitionRef.current;
			if (!recognition) return;
			try {
				recognition.stop();
			} catch {
				/* no-op */
			}
		};
	}, []);

	return (
		<div
			className={`composer-area ${isFrontendActive ? "is-frontend-active" : ""}`}
		>
			{state.mentionOpen && <MentionSuggest />}
			{state.streaming && !isFrontendActive && (
				<div className="steer-bar">
					<UiInput
						type="text"
						className="steer-input"
						inputSize="md"
						placeholder="输入引导内容..."
						value={state.steerDraft}
						onChange={(e) =>
							dispatch({
								type: "SET_STEER_DRAFT",
								draft: e.target.value,
							})
						}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								handleSteer();
							}
						}}
					/>
					<UiButton
						className="steer-btn"
						variant="primary"
						size="sm"
						disabled={!state.steerDraft.trim()}
						onClick={handleSteer}
					>
						引导
					</UiButton>
				</div>
			)}
			<div
				className={`composer-pill ${isFrontendActive ? "hidden" : ""}`}
			>
				<textarea
					ref={textareaRef}
					id="message-input"
					rows={1}
					placeholder={
						isFrontendActive
							? "前端工具处理中，请在确认面板内提交"
							: "回复消息...（Enter 发送，Shift+Enter 换行）"
					}
					disabled={isFrontendActive}
					value={inputValue}
					onChange={(e) => {
						const next = e.target.value;
						setInputValue(next);
						updateMentionSuggestions(next);
					}}
					onKeyDown={handleKeyDown}
				/>
				<div className="composer-control-row">
					<div className="composer-plus-wrap" ref={plusMenuRef}>
						<UiButton
							className="composer-plus-btn"
							variant="ghost"
							size="sm"
							iconOnly
							aria-expanded={plusMenuOpen}
							aria-label="更多选项"
							onClick={() => setPlusMenuOpen((open) => !open)}
						>
							<MaterialIcon name="add" />
						</UiButton>
						{plusMenuOpen && (
							<div className="composer-plus-popover">
								<label
									className="planning-toggle"
									htmlFor="planning-mode-switch"
								>
									<input
										id="planning-mode-switch"
										type="checkbox"
										checked={state.planningMode}
										onChange={(e) =>
											dispatch({
												type: "SET_PLANNING_MODE",
												enabled: e.target.checked,
											})
										}
									/>
									<span>计划模式</span>
								</label>
							</div>
						)}
					</div>
					<div className="composer-actions">
						<UiButton
							className={`voice-btn ${speechListening ? "is-listening" : ""}`}
							variant="ghost"
							size="sm"
							iconOnly
							disabled={!speechSupported || isFrontendActive}
							onClick={toggleSpeechInput}
							title={speechStatus}
							aria-label={speechStatus}
						>
							<MaterialIcon
								name={speechListening ? "mic" : "mic_none"}
							/>
						</UiButton>
						{state.streaming ? (
							<UiButton
								className="interrupt-btn"
								id="interrupt-btn"
								variant="danger"
								size="sm"
								disabled={isFrontendActive}
								onClick={handleInterrupt}
							>
								<MaterialIcon name="stop" />
							</UiButton>
						) : (
							<UiButton
								className="send-btn"
								id="send-btn"
								variant="primary"
								size="sm"
								iconOnly
								disabled={isFrontendActive}
								onClick={handleSend}
								aria-label="发送"
							>
								<MaterialIcon name="arrow_upward" />
							</UiButton>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};
