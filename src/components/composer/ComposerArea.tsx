import React, {
	useRef,
	useCallback,
	useState,
	useEffect,
	useMemo,
} from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";
import { MentionSuggest } from "./MentionSuggest";
import { SlashPalette } from "./SlashPalette";
import { SteerBar } from "./SteerBar";
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
} from "../../lib/slashCommands";
import { useSlashCommandExecution } from "../../hooks/useSlashCommandExecution";
import { MaterialIcon } from "../common/MaterialIcon";
import { UiButton } from "../ui/UiButton";
import { useSpeechInput } from "./useSpeechInput";

export const ComposerArea: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const composerRef = useRef<HTMLDivElement>(null);
	const composerPillRef = useRef<HTMLDivElement>(null);
	const slashPaletteRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const isComposingRef = useRef(false);
	const pendingSendRef = useRef(false);
	const pendingSentMessageRef = useRef("");
	const [inputValue, setInputValue] = useState("");
	const [slashDismissed, setSlashDismissed] = useState(false);
	const [activeSlashIndex, setActiveSlashIndex] = useState(0);
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
		state.streaming &&
		!isFrontendActive &&
		(hasSteerDraft || hasPendingSteers);
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
	const currentWorker = useMemo(
		() => resolveCurrentWorkerSummary(state),
		[state],
	);
	const voiceModeAvailable = currentWorker?.type === "agent";
	const isVoiceMode = state.inputMode === "voice";
	const voiceUserPreview = state.voiceChat.partialUserText || "等待你开口...";
	const voiceAssistantPreview =
		state.voiceChat.partialAssistantText ||
		(state.voiceChat.status === "thinking"
			? "正在组织回答..."
			: "等待回答...");
	const voiceStatusText = useMemo(() => {
		const status = state.voiceChat.status;
		if (status === "connecting") return "正在连接语聊...";
		if (status === "listening") return "正在听你说话";
		if (status === "thinking") return "正在思考回复";
		if (status === "speaking") return "正在语音回答";
		if (status === "error") {
			return state.voiceChat.error || "语聊链路异常";
		}
		return "切换到语聊模式";
	}, [state.voiceChat.error, state.voiceChat.status]);
	const voiceConnectionText = useMemo(() => {
		if (state.voiceChat.error) return "语音链路异常";
		const wsStatus = state.voiceChat.wsStatus;
		if (wsStatus === "open") return "语音链路已连接";
		if (wsStatus === "connecting") return "语音链路连接中";
		if (wsStatus === "closed") return "语音链路已断开";
		if (wsStatus === "error") return "语音链路异常";
		return "等待建立语音链路";
	}, [state.voiceChat.error, state.voiceChat.wsStatus]);
	const showVoiceConnectionBadge =
		Boolean(state.voiceChat.error) ||
		state.voiceChat.wsStatus === "connecting" ||
		state.voiceChat.wsStatus === "closed" ||
		state.voiceChat.wsStatus === "error";
	const hasVoiceUserPreview = Boolean(state.voiceChat.partialUserText.trim());
	const hasVoiceAssistantPreview = Boolean(
		state.voiceChat.partialAssistantText.trim(),
	);
	const showSlashPalette =
		!isVoiceMode &&
		!isFrontendActive &&
		!state.commandModal.open &&
		!slashDismissed &&
		slashCommands.length > 0;

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
			window.removeEventListener(
				"scroll",
				updateSlashPopoverPosition,
				true,
			);
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

	useEffect(() => {
		if (!isVoiceMode) return;
		closeMention();
		setSlashDismissed(true);
	}, [closeMention, isVoiceMode]);

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

	const toggleVoiceMode = useCallback(() => {
		if (!voiceModeAvailable || state.streaming || isFrontendActive) {
			return;
		}
		dispatch({
			type: "SET_INPUT_MODE",
			mode: isVoiceMode ? "text" : "voice",
		});
	}, [
		dispatch,
		isFrontendActive,
		isVoiceMode,
		state.streaming,
		voiceModeAvailable,
	]);
	const {
		speechSupported,
		speechListening,
		speechStatus,
		toggleSpeechInput,
		stopSpeechInput,
	} = useSpeechInput({
		inputValue,
		setInputValue,
		setSlashDismissed,
		updateMentionSuggestions,
	});
	const showSpeechHint =
		!isVoiceMode &&
		(!speechSupported ||
			speechStatus.startsWith("语音识别错误") ||
			speechStatus === "语音识别未启动，请重试");
	const slashAvailability = useMemo(
		() => ({
			streaming: state.streaming,
			hasLatestQuery: Boolean(latestQueryText),
			isFrontendActive,
			canUseVoiceMode: Boolean(voiceModeAvailable),
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
			isFrontendActive,
			voiceModeAvailable,
		],
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

	const appendTextBlock = useCallback((base: string, extra: string) => {
		const nextExtra = String(extra || "");
		if (!nextExtra.trim()) return base;
		if (!base.trim()) return nextExtra;
		return `${base}${base.endsWith("\n") ? "" : "\n"}${nextExtra}`;
	}, []);

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

	const executeSlashCommand = useSlashCommandExecution({
		slashAvailability,
		closeMention,
		latestQueryText,
		resetForNewConversation,
		dispatch,
		toggleVoiceMode,
		interruptCurrentRun,
		setInputValue,
		setSlashDismissed,
		state: {
			desktopDebugSidebarEnabled: state.desktopDebugSidebarEnabled,
			layoutMode: state.layoutMode,
			planningMode: state.planningMode,
			rightDrawerOpen: state.rightDrawerOpen,
		},
	});

	const handleSend = useCallback(() => {
		if (isVoiceMode) return;
		if (speechListening) {
			stopSpeechInput();
		}
		if (showSlashPalette) {
			const selected =
				slashCommands[activeSlashIndex] || slashCommands[0];
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
		isVoiceMode,
		showSlashPalette,
		slashCommands,
		speechListening,
		state.streaming,
		stopSpeechInput,
	]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (isVoiceMode) {
				e.preventDefault();
				return;
			}
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
			isVoiceMode,
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
			const draft = String((event as CustomEvent).detail?.draft || "");
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
		if (!isVoiceMode && !isFrontendActive) return;
		stopSpeechInput();
	}, [isFrontendActive, isVoiceMode, stopSpeechInput]);

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

	return (
		<div
			ref={composerRef}
			className={`composer-area ${isFrontendActive ? "is-frontend-active" : ""}`}
		>
			<SlashPalette
				open={showSlashPalette}
				slashPaletteRef={slashPaletteRef}
				slashCommands={slashCommands}
				activeSlashIndex={activeSlashIndex}
				slashAvailability={slashAvailability}
				planningMode={state.planningMode}
				slashPopoverStyle={slashPopoverStyle}
				onSelect={(commandId) => void executeSlashCommand(commandId)}
			/>
			{state.mentionOpen && <MentionSuggest />}
			{shouldShowSteerBar && (
				<SteerBar
					pendingSteers={state.pendingSteers}
					steerDraft={state.steerDraft}
					steerSubmitting={steerSubmitting}
					onSubmit={() => void handleSteer()}
					onCancel={handleCancelSteer}
				/>
			)}
			<div
				className={`composer-layout ${isFrontendActive ? "is-frontend-active" : ""}`}
			>
				<div
					ref={composerPillRef}
					className={`composer-pill ${isFrontendActive ? "hidden" : ""} ${isVoiceMode ? "is-voice-mode" : ""}`}
				>
					<div className="composer-mode-shell">
						<div className="composer-mode-main">
							{isVoiceMode ? (
								<div
									className={`voice-chat-panel is-${state.voiceChat.status}`}
									aria-live="polite"
								>
									<div className="voice-chat-panel-header">
										<div className="voice-chat-panel-identity">
											<div
												className={`voice-chat-orb is-${state.voiceChat.status}`}
												aria-hidden="true"
											>
												<span />
												<span />
												<span />
											</div>
											<div className="voice-chat-panel-heading">
												<div className="voice-chat-panel-title-row">
													<div className="voice-chat-panel-title">
														语聊中
													</div>
													<div className="voice-chat-worker">
														当前员工：
														<strong>
															{state.voiceChat
																.currentAgentName ||
																currentWorker?.displayName ||
																"--"}
														</strong>
													</div>
												</div>
											</div>
										</div>
										<div
											className={`voice-chat-status is-${state.voiceChat.status}`}
										>
											<span className="voice-chat-status-dot" />
											{voiceStatusText}
										</div>
									</div>
									<div className="voice-chat-summary-grid">
										<div className="voice-chat-snippet voice-chat-snippet-user">
											<div className="voice-chat-snippet-label">
												你刚刚说
											</div>
											<div
												className={`voice-chat-snippet-text ${!hasVoiceUserPreview ? "is-placeholder" : ""}`}
												title={voiceUserPreview}
											>
												{voiceUserPreview}
											</div>
										</div>
										<div className="voice-chat-snippet voice-chat-snippet-assistant">
											<div className="voice-chat-snippet-label">
												助手回复
											</div>
											<div
												className={`voice-chat-snippet-text ${!hasVoiceAssistantPreview ? "is-placeholder" : ""}`}
												title={voiceAssistantPreview}
											>
												{voiceAssistantPreview}
											</div>
										</div>
									</div>
									{state.voiceChat.error && (
										<div className="voice-chat-error">
											{state.voiceChat.error}
										</div>
									)}
								</div>
							) : (
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
										if (
											slashCommands.length > 0 ||
											next.startsWith("/")
										) {
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
							)}
						</div>
					</div>
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
						<div
							className={`composer-actions ${isVoiceMode ? "has-voice-controls" : ""}`.trim()}
						>
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
							) : !isVoiceMode ? (
								<>
									<UiButton
										className={`voice-btn ${speechListening ? "is-listening" : ""}`}
										variant="secondary"
										size="sm"
										iconOnly
										disabled={isFrontendActive}
										onClick={toggleSpeechInput}
										aria-label={
											!speechSupported
												? "语音输入不可用"
												: speechListening
													? "停止语音输入"
													: "语音输入"
										}
										title={
											isFrontendActive
												? "前端工具处理中，暂时不能语音输入"
												: speechStatus
										}
									>
										<MaterialIcon name="mic" />
									</UiButton>
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
								</>
							) : (
								<></>
							)}
						</div>
					</div>
					{showSpeechHint && (
						<div className="voice-hint">{speechStatus}</div>
					)}
				</div>
			</div>
		</div>
	);
};
