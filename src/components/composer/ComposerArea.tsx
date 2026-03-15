import React, { useRef, useCallback, useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useAppState, useAppDispatch } from "../../context/AppContext";
import { MentionSuggest } from "./MentionSuggest";
import { COMPOSER_MAX_LINES } from "../../context/constants";
import { createRequestId, interruptChat, steerChat } from "../../lib/apiClient";
import { parseLeadingMentionDraft } from "../../lib/mentionParser";
import { resolveMentionCandidatesFromState } from "../../lib/mentionCandidates";
import { resolveCurrentWorkerSummary } from "../../lib/currentWorker";
import { isImeEnterConfirming } from "../../lib/ime";
import { computeSlashPopoverPlacement } from "../../lib/slashPopoverPlacement";
import {
	getFilteredSlashCommands,
	getLatestQueryText,
	isSlashCommandDisabled,
	type SlashCommandId,
} from "../../lib/slashCommands";
import { MaterialIcon } from "../common/MaterialIcon";
import { UiButton } from "../ui/UiButton";

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
	const composerRef = useRef<HTMLDivElement>(null);
	const composerPillRef = useRef<HTMLDivElement>(null);
	const slashPaletteRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
	const speechBaseValueRef = useRef("");
	const speechFinalBufferRef = useRef("");
	const speechListeningRef = useRef(false);
	const isComposingRef = useRef(false);
	const pendingSendRef = useRef(false);
	const pendingSentMessageRef = useRef("");
	const [inputValue, setInputValue] = useState("");
	const [slashDismissed, setSlashDismissed] = useState(false);
	const [activeSlashIndex, setActiveSlashIndex] = useState(0);
	const [speechSupported, setSpeechSupported] = useState(false);
	const [speechListening, setSpeechListening] = useState(false);
	const [speechStatus, setSpeechStatus] = useState("点击开始听写");
	const [steerSubmitting, setSteerSubmitting] = useState(false);
	const [slashPopoverStyle, setSlashPopoverStyle] = useState<{
		left: number;
		top: number;
		width: number;
		maxHeight: number;
		placement: "above" | "below";
	} | null>(null);

	const isFrontendActive = !!state.activeFrontendTool;
	const hasPendingSteers = state.pendingSteers.length > 0;
	const hasSteerDraft = Boolean(state.steerDraft.trim());
	const shouldShowSteerBar =
		state.streaming && !isFrontendActive && (hasSteerDraft || hasPendingSteers);
	const timelineEntries = useMemo(() => {
		return state.timelineOrder
			.map((id) => state.timelineNodes.get(id))
			.filter((node): node is NonNullable<typeof node> => Boolean(node));
	}, [state.timelineOrder, state.timelineNodes]);
	const latestQueryText = useMemo(
		() => getLatestQueryText(timelineEntries),
		[timelineEntries],
	);
	const slashCommands = useMemo(
		() => getFilteredSlashCommands(inputValue),
		[inputValue],
	);
	const currentWorker = useMemo(() => resolveCurrentWorkerSummary(state), [state]);
	const showSlashPalette =
		!isFrontendActive
		&& !state.commandModal.open
		&& !slashDismissed
		&& slashCommands.length > 0;
	const slashAvailability = useMemo(
		() => ({
			streaming: state.streaming,
			hasLatestQuery: Boolean(latestQueryText),
			speechSupported,
			isFrontendActive,
			hasCurrentWorker: Boolean(currentWorker),
			workerHistoryCount: currentWorker?.relatedChats.length || 0,
			workerCount: state.workerRows.length,
			commandModalOpen: state.commandModal.open,
		}),
		[
			currentWorker,
			state.streaming,
			state.commandModal.open,
			state.workerRows.length,
			latestQueryText,
			speechSupported,
			isFrontendActive,
		],
	);

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
		if (!showSlashPalette) return;

		const updateSlashPopoverPosition = () => {
			const anchor = composerPillRef.current || textareaRef.current;
			if (!anchor) return;
			const rect = anchor.getBoundingClientRect();
			if (rect.width <= 0) {
				setSlashPopoverStyle(null);
				return;
			}
			setSlashPopoverStyle(
				computeSlashPopoverPlacement({
					anchorRect: {
						top: rect.top,
						bottom: rect.bottom,
						left: rect.left,
						width: rect.width,
					},
					viewport: {
						width: window.innerWidth,
						height: window.innerHeight,
					},
				}),
			);
		};
		updateSlashPopoverPosition();

		const onPointerDown = (event: MouseEvent) => {
			const target = event.target as Node | null;
			if (!target) return;
			if (
				showSlashPalette &&
				!composerRef.current?.contains(target) &&
				!slashPaletteRef.current?.contains(target)
			) {
				setSlashDismissed(true);
			}
		};

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			if (showSlashPalette) {
				setSlashDismissed(true);
			}
		};

		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		window.addEventListener("resize", updateSlashPopoverPosition);
		window.addEventListener("scroll", updateSlashPopoverPosition, true);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("resize", updateSlashPopoverPosition);
			window.removeEventListener("scroll", updateSlashPopoverPosition, true);
		};
	}, [inputValue, showSlashPalette]);

	useEffect(() => {
		if (showSlashPalette) return;
		setSlashPopoverStyle(null);
	}, [showSlashPalette]);

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
			setSlashDismissed(false);
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

	useEffect(() => {
		if (!showSlashPalette) {
			setActiveSlashIndex(0);
			return;
		}
		if (activeSlashIndex >= slashCommands.length) {
			setActiveSlashIndex(0);
		}
	}, [activeSlashIndex, showSlashPalette, slashCommands.length]);

	useEffect(() => {
		const message = inputValue.trim();
		if (!message) {
			pendingSendRef.current = false;
			pendingSentMessageRef.current = "";
			return;
		}
		if (message !== pendingSentMessageRef.current) {
			pendingSendRef.current = false;
		}
	}, [inputValue]);

	const mergeSpeechText = useCallback((base: string, append: string) => {
		if (!append) return base;
		return `${base}${append}`;
	}, []);

	const appendTextBlock = useCallback((base: string, extra: string) => {
		const nextExtra = String(extra || "");
		if (!nextExtra.trim()) return base;
		if (!base.trim()) return nextExtra;
		return `${base}${base.endsWith("\n") ? "" : "\n"}${nextExtra}`;
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
				setSlashDismissed(false);
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

	const resetForNewConversation = useCallback(() => {
		if (state.planAutoCollapseTimer) {
			window.clearTimeout(state.planAutoCollapseTimer);
			dispatch({ type: "SET_PLAN_AUTO_COLLAPSE_TIMER", timer: null });
		}
		state.abortController?.abort();
		window.dispatchEvent(new CustomEvent("agent:voice-reset"));
		dispatch({ type: "SET_CHAT_ID", chatId: "" });
		dispatch({ type: "SET_RUN_ID", runId: "" });
		dispatch({ type: "SET_REQUEST_ID", requestId: "" });
		dispatch({ type: "SET_STREAMING", streaming: false });
		dispatch({ type: "SET_ABORT_CONTROLLER", controller: null });
		dispatch({
			type:
				state.conversationMode === "worker"
					? "RESET_ACTIVE_CONVERSATION"
					: "RESET_CONVERSATION",
		});
	}, [
		dispatch,
		state.abortController,
		state.conversationMode,
		state.planAutoCollapseTimer,
	]);

	const interruptCurrentRun = useCallback(async () => {
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

	const executeSlashCommand = useCallback(
		async (commandId: SlashCommandId) => {
			if (isSlashCommandDisabled(commandId, slashAvailability)) {
				return;
			}

			setSlashDismissed(true);
			setInputValue("");
			closeMention();

			switch (commandId) {
				case "schedule":
					dispatch({
						type: "OPEN_COMMAND_MODAL",
						modal: { type: "schedule" },
					});
					return;
				case "detail":
					dispatch({
						type: "OPEN_COMMAND_MODAL",
						modal: { type: "detail" },
					});
					return;
				case "history":
					dispatch({
						type: "OPEN_COMMAND_MODAL",
						modal: { type: "history" },
					});
					return;
				case "switch":
					dispatch({
						type: "OPEN_COMMAND_MODAL",
						modal: { type: "switch" },
					});
					return;
				case "new":
					resetForNewConversation();
					return;
				case "redo":
					window.dispatchEvent(
						new CustomEvent("agent:send-message", {
							detail: { message: latestQueryText },
						}),
					);
					return;
				case "debug":
					if (state.layoutMode === "desktop-fixed") {
						dispatch({
							type: "SET_DESKTOP_DEBUG_SIDEBAR_ENABLED",
							enabled: !state.desktopDebugSidebarEnabled,
						});
					} else {
						dispatch({
							type: "SET_RIGHT_DRAWER_OPEN",
							open: !state.rightDrawerOpen,
						});
					}
					return;
				case "voice":
					toggleSpeechInput();
					return;
				case "settings":
					dispatch({ type: "SET_SETTINGS_OPEN", open: true });
					return;
				case "plan":
					dispatch({
						type: "SET_PLANNING_MODE",
						enabled: !state.planningMode,
					});
					return;
				case "stop":
					await interruptCurrentRun();
			}
		},
		[
			closeMention,
			dispatch,
			interruptCurrentRun,
			latestQueryText,
			resetForNewConversation,
			slashAvailability,
			state.desktopDebugSidebarEnabled,
			state.layoutMode,
			state.planningMode,
			state.rightDrawerOpen,
			toggleSpeechInput,
		],
	);

	const handleSend = useCallback(() => {
		if (showSlashPalette) {
			const selected = slashCommands[activeSlashIndex] || slashCommands[0];
			if (selected) {
				void executeSlashCommand(selected.id);
			}
			return;
		}

		const message = inputValue.trim();
		if (!message) return;
		if (
			pendingSendRef.current &&
			pendingSentMessageRef.current === message
		) {
			return;
		}
		if (state.streaming) {
			dispatch({ type: "SET_STEER_DRAFT", draft: message });
			setInputValue("");
			setSlashDismissed(false);
			closeMention();
			return;
		}
		pendingSendRef.current = true;
		pendingSentMessageRef.current = message;
		setInputValue("");
		setSlashDismissed(false);
		closeMention();
		window.dispatchEvent(
			new CustomEvent("agent:send-message", { detail: { message } }),
		);
	}, [
		activeSlashIndex,
		closeMention,
		dispatch,
		executeSlashCommand,
		inputValue,
		showSlashPalette,
		slashCommands,
		state.streaming,
	]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (isImeEnterConfirming(e, isComposingRef.current)) {
				return;
			}

			if (showSlashPalette) {
				if (e.key === "ArrowDown") {
					e.preventDefault();
					setActiveSlashIndex(
						(current) => (current + 1) % slashCommands.length,
					);
					return;
				}
				if (e.key === "ArrowUp") {
					e.preventDefault();
					setActiveSlashIndex(
						(current) =>
							(current - 1 + slashCommands.length) %
							slashCommands.length,
					);
					return;
				}
				if (e.key === "Escape") {
					e.preventDefault();
					setSlashDismissed(true);
					return;
				}
				if (e.key === "Enter" && !e.shiftKey) {
					e.preventDefault();
					const selected =
						slashCommands[activeSlashIndex] || slashCommands[0];
					if (selected) {
						void executeSlashCommand(selected.id);
					}
					return;
				}
			}

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
			activeSlashIndex,
			closeMention,
			dispatch,
			executeSlashCommand,
			handleSend,
			isComposingRef,
			selectMentionByIndex,
			showSlashPalette,
			slashCommands,
			state.mentionActiveIndex,
			state.mentionOpen,
			state.mentionSuggestions,
		],
	);

	const handleSteer = useCallback(async () => {
		const message = state.steerDraft.trim();
		if (!message || !state.streaming || steerSubmitting) return;

		const chatId = String(state.chatId || "").trim();
		const runId = resolveCurrentRunId();
		const requestId = createRequestId("req");
		const steerId =
			typeof globalThis.crypto?.randomUUID === "function"
				? globalThis.crypto.randomUUID()
				: createRequestId("steer");
		const agentKey = resolveCurrentAgentKey();
		const teamId = resolveCurrentTeamId();
		if (!chatId || !runId) {
			dispatch({
				type: "APPEND_DEBUG",
				line: `[steer] skipped: missing chatId/runId (chatId=${chatId || "-"}, runId=${runId || "-"})`,
			});
			return;
		}

		setSteerSubmitting(true);
		try {
			await steerChat({
				requestId,
				chatId,
				runId,
				steerId,
				agentKey: agentKey || undefined,
				teamId: teamId || undefined,
				message,
				planningMode: Boolean(state.planningMode),
			});
			dispatch({
				type: "APPEND_DEBUG",
				line: `[steer] submitted for chatId=${chatId}, runId=${runId}, requestId=${requestId}`,
			});
			dispatch({
				type: "ENQUEUE_PENDING_STEER",
				steer: {
					steerId,
					message,
					requestId,
					runId,
					createdAt: Date.now(),
				},
			});
			dispatch({ type: "SET_STEER_DRAFT", draft: "" });
		} catch (error) {
			dispatch({
				type: "APPEND_DEBUG",
				line: `[steer] failed: ${(error as Error).message}`,
			});
		} finally {
			setSteerSubmitting(false);
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
		steerSubmitting,
	]);

	const handleCancelSteer = useCallback(() => {
		const draft = String(state.steerDraft || "");
		dispatch({ type: "SET_STEER_DRAFT", draft: "" });
		setInputValue(draft);
		setSlashDismissed(false);
		updateMentionSuggestions(draft);
		window.requestAnimationFrame(() => {
			const el = textareaRef.current;
			if (!el) return;
			el.focus();
			const caret = draft.length;
			el.setSelectionRange(caret, caret);
		});
	}, [dispatch, state.steerDraft, updateMentionSuggestions]);

	useEffect(() => {
		const onFocusComposer = () => {
			window.requestAnimationFrame(() => {
				const el = textareaRef.current;
				if (!el) return;
				el.focus();
				const caret = el.value.length;
				el.setSelectionRange(caret, caret);
			});
		};

		window.addEventListener("agent:focus-composer", onFocusComposer);
		return () =>
			window.removeEventListener("agent:focus-composer", onFocusComposer);
	}, []);

	useEffect(() => {
		const onSetDraft = (event: Event) => {
			const draft = String(
				(event as CustomEvent).detail?.draft || "",
			);
			setInputValue(draft);
			setSlashDismissed(false);
			if (draft.startsWith("/")) {
				closeMention();
			} else {
				updateMentionSuggestions(draft);
			}
			window.requestAnimationFrame(() => {
				const el = textareaRef.current;
				if (!el) return;
				el.focus();
				const caret = draft.length;
				el.setSelectionRange(caret, caret);
			});
		};

		window.addEventListener("agent:set-composer-draft", onSetDraft);
		return () =>
			window.removeEventListener("agent:set-composer-draft", onSetDraft);
	}, [closeMention, updateMentionSuggestions]);

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
			setSlashDismissed(false);
			closeMention();
		};

		window.addEventListener("agent:select-mention", onSelectMention);
		return () =>
			window.removeEventListener("agent:select-mention", onSelectMention);
	}, [closeMention]);

	useEffect(() => {
		if (state.streaming || steerSubmitting) return;

		let nextValue = inputValue;
		let changed = false;

		const draft = String(state.steerDraft || "");
		if (draft.trim()) {
			nextValue = appendTextBlock(nextValue, draft);
			changed = true;
		}

		const pendingText = state.pendingSteers
			.map((steer) => String(steer.message || "").trim())
			.filter(Boolean)
			.join("\n");
		if (pendingText) {
			nextValue = appendTextBlock(nextValue, pendingText);
			changed = true;
		}

		if (!changed) return;

		setInputValue(nextValue);
		setSlashDismissed(false);
		updateMentionSuggestions(nextValue);
		if (draft.trim()) {
			dispatch({ type: "SET_STEER_DRAFT", draft: "" });
		}
		if (state.pendingSteers.length > 0) {
			dispatch({ type: "CLEAR_PENDING_STEERS" });
		}
		window.requestAnimationFrame(() => {
			const el = textareaRef.current;
			if (!el) return;
			el.focus();
			const caret = nextValue.length;
			el.setSelectionRange(caret, caret);
		});
	}, [
		appendTextBlock,
		dispatch,
		inputValue,
		state.pendingSteers,
		state.steerDraft,
		state.streaming,
		steerSubmitting,
		updateMentionSuggestions,
	]);

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

	const renderSlashPalette = (className = "", style?: React.CSSProperties) => (
		<div
			ref={slashPaletteRef}
			className={`slash-command-popover ${className}`.trim()}
			style={style}
		>
			<div className="slash-command-list">
				{slashCommands.map((command, index) => {
					const disabled = isSlashCommandDisabled(
						command.id,
						slashAvailability,
					);
					return (
						<UiButton
							key={command.id}
							className={`slash-command-item ${index === activeSlashIndex ? "active" : ""}`}
							variant="ghost"
							size="sm"
							disabled={disabled}
							onMouseDown={(e) => e.preventDefault()}
							onClick={() => void executeSlashCommand(command.id)}
						>
							<span className="slash-command-main">
								<span className="slash-command-name">
									{command.command}
								</span>
								<span className="slash-command-label">
									{command.label}
								</span>
							</span>
							{command.id === "plan" && state.planningMode && (
								<span className="slash-command-check" aria-hidden="true">
									<MaterialIcon name="check" />
								</span>
							)}
							<span className="slash-command-description">
								{command.description}
							</span>
						</UiButton>
					);
				})}
			</div>
		</div>
	);

	return (
		<div
			ref={composerRef}
			className={`composer-area ${isFrontendActive ? "is-frontend-active" : ""}`}
		>
			{showSlashPalette && slashPopoverStyle && typeof document !== "undefined"
				? createPortal(
					renderSlashPalette("is-portal", {
						left: slashPopoverStyle.left,
						top: slashPopoverStyle.top,
						width: slashPopoverStyle.width,
						maxHeight: slashPopoverStyle.maxHeight,
					}),
					document.body,
				)
				: showSlashPalette
					? renderSlashPalette("is-inline-fallback")
					: null}
			{state.mentionOpen && <MentionSuggest />}
			{shouldShowSteerBar && (
				<div className="steer-bar">
					<div className="steer-queue" aria-live="polite">
						{state.pendingSteers.map((steer, index) => (
							<div
								key={steer.steerId}
								className="steer-preview is-pending"
							>
								<div className="steer-preview-header">
									<span className="steer-preview-label">
										待生效引导 {index + 1}
									</span>
									<span className="steer-preview-status">
										等待 request.steer
									</span>
								</div>
								<span className="steer-preview-text">
									{steer.message}
								</span>
							</div>
						))}
						{hasSteerDraft && (
							<div className="steer-preview">
								<div className="steer-preview-header">
									<span className="steer-preview-label">
										待提交引导
									</span>
								</div>
								<span className="steer-preview-text">
									{state.steerDraft}
								</span>
							</div>
						)}
					</div>
					{hasSteerDraft && (
						<div className="steer-preview-actions">
							<UiButton
								className="steer-btn"
								variant="primary"
								size="sm"
								disabled={!state.steerDraft.trim() || steerSubmitting}
								onClick={handleSteer}
							>
								{steerSubmitting ? "提交中..." : "引导"}
							</UiButton>
							<UiButton
								className="steer-cancel-btn"
								variant="ghost"
								size="sm"
								disabled={steerSubmitting}
								onClick={handleCancelSteer}
							>
								取消
							</UiButton>
						</div>
					)}
				</div>
			)}
			<div
				ref={composerPillRef}
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
						setSlashDismissed(false);
						if (slashCommands.length > 0 || next.startsWith("/")) {
							closeMention();
						}
						if (!next.startsWith("/")) {
							updateMentionSuggestions(next);
						}
					}}
					onKeyDown={handleKeyDown}
					onCompositionStart={() => {
						isComposingRef.current = true;
					}}
					onCompositionEnd={() => {
						isComposingRef.current = false;
					}}
				/>
				<div className="composer-control-row">
					<div className="composer-plus-wrap">
						<UiButton
							className="composer-plus-btn"
							variant="ghost"
							size="sm"
							iconOnly
							aria-label="更多选项"
							title="更多选项"
						>
							<MaterialIcon name="add" />
						</UiButton>
						<UiButton
							className={`plan-toggle-btn ${state.planningMode ? "is-active" : ""}`}
							variant="ghost"
							size="sm"
							onClick={() =>
								dispatch({
									type: "SET_PLANNING_MODE",
									enabled: !state.planningMode,
								})
							}
						>
							计划
						</UiButton>
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
								onClick={() => void interruptCurrentRun()}
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
