import React, {
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Popover } from "antd";
import { useAppState, useAppDispatch } from "@/app/state/AppContext";
import type { AgentEvent } from "@/app/state/types";
import {
	getChatSystemPrompt,
	getChatLLMTraceRaw,
	getChatRawJsonl,
} from "@/shared/data";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import type { MaterialIconName } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { SCROLLBAR_THIN_CLASS_NAME } from "@/shared/styles/scrollbarClassNames";
import { useI18n } from "@/shared/i18n";
import {
	buildCopyMenuTitle,
	buildDefaultCopyMenuItem,
	buildEventCopyMenuItems,
	copyText,
	getPrimaryCopyMenuItem,
	stripCopyPrefix,
	type CopyFeedbackState,
	type CopyMenuItemState,
	type EventCopyMenuItem,
} from "@/app/modals/lib/eventPopoverCopyMenu";
import {
	buildCollectedSnapshot,
	canCollectEvent,
	getCollectibleRelatedEvents,
	mapCollectedSnapshotType,
	readEventIdValue,
	resolveEventGroupMeta,
	type RelatedEventEntry,
} from "@/app/modals/lib/eventPopoverGrouping";
import {
	formatReadableTimestamp,
	resolveDisplayPayloadTimestamp,
	resolveInitialPopoverState,
	stringifyPopoverPayload,
} from "@/app/modals/lib/eventPopoverFormatters";
import { SystemPromptModal } from "@/app/modals/SystemPromptModal";
import {
	buildSystemPromptTimeoutLoadState,
	isValidRawLLMTraceFile,
	SYSTEM_PROMPT_LOAD_TIMEOUT_MS,
	resolveRawLLMTraceFile,
	resolveSystemPromptCalls,
	resolveSystemPromptText,
	type SystemPromptLoadState,
} from "@/app/modals/lib/systemPromptTrace";

type RawJsonlLoader = (chatId: string) => Promise<string>;
type RawLLMTraceLoader = (file: string) => Promise<string>;

const EVENT_POPOVER_CLASS_NAME =
	"event-popover tw:fixed tw:z-[60] tw:flex tw:flex-col tw:overflow-hidden tw:rounded-[var(--radius-md)] tw:border tw:border-line-soft tw:bg-bg-elev-2 tw:shadow-overlay";

const EVENT_POPOVER_HEAD_CLASS_NAME =
	"event-popover-head tw:flex tw:items-center tw:gap-3 tw:border-b tw:border-line-soft tw:px-3 tw:py-2";

const EVENT_POPOVER_HEAD_MAIN_CLASS_NAME =
	"event-popover-head-main tw:flex tw:flex-1 tw:flex-col tw:gap-0.5";

const EVENT_POPOVER_TITLE_CLASS_NAME = "tw:text-xs";

const EVENT_POPOVER_META_CLASS_NAME =
	"event-popover-meta tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[11px] tw:text-ink-muted";

const EVENT_POPOVER_ACTIONS_CLASS_NAME =
	"event-popover-actions tw:inline-flex tw:flex-shrink-0 tw:flex-wrap tw:items-center tw:justify-end tw:gap-1.5";

const EVENT_POPOVER_ACTION_BUTTON_CLASS_NAME =
	"event-popover-action-btn tw:!h-4 tw:!min-h-4 tw:!min-w-4 tw:!w-4 tw:!px-0 tw:!py-0 tw:text-ink-muted tw:hover:bg-bg-hover tw:hover:text-ink-1 tw:hover:shadow-none tw:[&_.material-icon]:!text-base";

const EVENT_POPOVER_SYSTEM_ACTION_BUTTON_CLASS_NAME = [
	EVENT_POPOVER_ACTION_BUTTON_CLASS_NAME,
	"event-popover-system-action",
].join(" ");

const EVENT_POPOVER_CLOSE_BUTTON_CLASS_NAME = [
	EVENT_POPOVER_ACTION_BUTTON_CLASS_NAME,
	"event-popover-close",
].join(" ");

const EVENT_POPOVER_COPY_MENU_CLASS_NAME =
	"event-popover-copy-menu tw:flex tw:min-w-[168px] tw:flex-col tw:gap-0.5";

const EVENT_POPOVER_COPY_MENU_ITEM_CLASS_NAME =
	"event-popover-copy-menu-item tw:w-full tw:!justify-start tw:whitespace-nowrap tw:!text-[11px]";

const EVENT_POPOVER_BODY_CLASS_NAME = [
	"event-popover-body",
	"tw:m-0 tw:max-h-[50vh] tw:flex-1 tw:overflow-auto tw:whitespace-pre-wrap tw:break-all tw:px-3 tw:py-2.5 tw:font-code tw:text-[10px] tw:font-normal tw:leading-[1.48] tw:text-ink-2",
	SCROLLBAR_THIN_CLASS_NAME,
].join(" ");

function resolveRawJsonlChatId(
	event: AgentEvent | null,
	relatedEvents: RelatedEventEntry[],
): string {
	const eventChatId = readEventIdValue(event || {}, "chatId");
	if (eventChatId) {
		return eventChatId;
	}

	for (const entry of relatedEvents) {
		const relatedChatId = readEventIdValue(entry.event || {}, "chatId");
		if (relatedChatId) {
			return relatedChatId;
		}
	}

	return "";
}

function buildRawJsonlCopyMenuItem(
	chatId: string,
	t: (key: string, params?: Record<string, unknown>) => string,
	loadRawJsonl: RawJsonlLoader = getChatRawJsonl,
): EventCopyMenuItem | null {
	const normalizedChatId = String(chatId || "").trim();
	if (!normalizedChatId) {
		return null;
	}

	return {
		key: "rawJsonl",
		label: t("eventPopover.copy.rawJsonl"),
		text: "",
		loadText: () => loadRawJsonl(normalizedChatId),
	};
}

function shouldIncludeRawJsonlCopyItem(event: AgentEvent | null): boolean {
	const type = String(event?.type || "").toLowerCase();
	return type.startsWith("chat.") || type.startsWith("run.");
}

function buildRawLLMTraceCopyMenuItem(
	file: string,
	t: (key: string, params?: Record<string, unknown>) => string,
	loadRawLLMTrace: RawLLMTraceLoader = getChatLLMTraceRaw,
): EventCopyMenuItem | null {
	const normalizedFile = String(file || "").trim();
	if (!isValidRawLLMTraceFile(normalizedFile)) {
		return null;
	}

	return {
		key: "rawLlmJson",
		label: t("eventPopover.copy.rawLlmJson"),
		text: "",
		loadText: () => loadRawLLMTrace(normalizedFile),
	};
}

const useIsomorphicLayoutEffect =
	typeof window === "undefined" ? useEffect : useLayoutEffect;

export const EventPopover: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const { t } = useI18n();
	const popoverRef = useRef<HTMLDivElement | null>(null);
	const copyTimerRef = useRef<Map<string, number>>(new Map());
	const [popoverState, setPopoverState] = useState(() =>
		resolveInitialPopoverState(state.eventPopoverEventRef),
	);
	const [copyStatus, setCopyStatus] = useState<Record<string, CopyFeedbackState>>({});
	const [lastCopyItem, setLastCopyItem] = useState<CopyMenuItemState>(
		() => buildDefaultCopyMenuItem(t),
	);
	const [copyMenuOpen, setCopyMenuOpen] = useState(false);
	const [systemPromptOpen, setSystemPromptOpen] = useState(false);
	const [systemPromptLoadState, setSystemPromptLoadState] =
		useState<SystemPromptLoadState>({ status: "idle" });
	const [position, setPosition] = useState({ top: 80, right: 320 });
	const isOpen = state.eventPopoverIndex >= 0 && !!state.eventPopoverEventRef;
	const event = state.eventPopoverEventRef;
	const groupMeta = useMemo(() => resolveEventGroupMeta(event), [event]);
	const relatedEvents = useMemo<RelatedEventEntry[]>(() => {
		if (!event) return [];
		if (!groupMeta) {
			return [{ event, index: state.eventPopoverIndex }];
		}

		const matches = state.debugEvents.flatMap((candidate, index) => {
			const candidateGroupMeta = resolveEventGroupMeta(candidate);
			if (
				!candidateGroupMeta ||
				candidateGroupMeta.family !== groupMeta.family ||
				candidateGroupMeta.idKey !== groupMeta.idKey ||
				candidateGroupMeta.idValue !== groupMeta.idValue
			) {
				return [];
			}

			return [{ event: candidate, index }];
		});

		return matches.length > 0
			? matches
			: [{ event, index: state.eventPopoverIndex }];
	}, [event, groupMeta, state.eventPopoverIndex, state.debugEvents]);
	const switcherSignature = useMemo(
		() => relatedEvents.map((entry) => entry.index).join(","),
		[relatedEvents],
	);
	const collectibleRelatedEvents = useMemo(
		() => getCollectibleRelatedEvents(event, groupMeta, relatedEvents),
		[event, groupMeta, relatedEvents],
	);
	const rawJsonlChatId = useMemo(
		() => resolveRawJsonlChatId(event, relatedEvents),
		[event, relatedEvents],
	);
	const rawJsonlCopyItem = useMemo(
		() => {
			if (!shouldIncludeRawJsonlCopyItem(event) || !rawJsonlChatId) return null;
			return buildRawJsonlCopyMenuItem(rawJsonlChatId, t);
		},
		[event, rawJsonlChatId, t],
	);
	const rawLLMTraceFile = useMemo(
		() => resolveRawLLMTraceFile(event),
		[event],
	);
	const copyMenuItems = useMemo(() => {
		const items = buildEventCopyMenuItems(
			event,
			relatedEvents,
			popoverState.rawJsonStr,
			t,
		);
		const rawLLMTraceItem = buildRawLLMTraceCopyMenuItem(rawLLMTraceFile, t);
		return [
			...items,
			...(rawLLMTraceItem ? [rawLLMTraceItem] : []),
		];
	}, [event, relatedEvents, rawLLMTraceFile, popoverState.rawJsonStr, t]);
	const primaryCopyMenuItem = useMemo(
		() => getPrimaryCopyMenuItem(copyMenuItems),
		[copyMenuItems],
	);
	const systemPromptCall = useMemo(
		() => resolveSystemPromptCalls(event, state.debugEvents)[0] || null,
		[event, state.debugEvents],
	);

	useEffect(() => {
		setPopoverState(resolveInitialPopoverState(event));
		copyTimerRef.current.forEach((timer) => window.clearTimeout(timer));
		copyTimerRef.current.clear();
		setCopyStatus({});
		setLastCopyItem(buildDefaultCopyMenuItem(t));
		setCopyMenuOpen(false);
		setSystemPromptOpen(false);
		setSystemPromptLoadState({ status: "idle" });
	}, [event, t]);

	useEffect(() => {
		if (
			!systemPromptOpen ||
			!systemPromptCall
		) {
			return;
		}

		let cancelled = false;
		const timeout = window.setTimeout(() => {
			if (cancelled) return;
			cancelled = true;
			setSystemPromptLoadState(
				buildSystemPromptTimeoutLoadState(
					t("eventPopover.systemPromptModal.timeout"),
				),
			);
		}, SYSTEM_PROMPT_LOAD_TIMEOUT_MS);
		setSystemPromptLoadState({ status: "loading" });
		void getChatSystemPrompt({
			chatId: systemPromptCall.chatId,
			runId: systemPromptCall.runId,
			agentKey: systemPromptCall.agentKey,
		})
			.then((response) => resolveSystemPromptText(response.data.systemMessage))
			.then((text) => {
				if (cancelled) return;
				window.clearTimeout(timeout);
				setSystemPromptLoadState(
					text ? { status: "ready", text } : { status: "empty" },
				);
			})
			.catch((error) => {
				if (cancelled) return;
				window.clearTimeout(timeout);
				setSystemPromptLoadState({
					status: "error",
					message: error instanceof Error ? error.message : String(error || ""),
				});
			});

		return () => {
			cancelled = true;
			window.clearTimeout(timeout);
		};
	}, [
		systemPromptOpen,
		systemPromptCall,
		t,
	]);

	useEffect(() => {
		return () => {
			copyTimerRef.current.forEach((timer) => window.clearTimeout(timer));
			copyTimerRef.current.clear();
		};
	}, []);

	useIsomorphicLayoutEffect(() => {
		if (!isOpen) return;
		const el = popoverRef.current;
		if (!el) return;

		const updatePosition = () => {
			const margin = 8;
			const viewW = window.innerWidth;
			const viewH = window.innerHeight;
			const width = Math.min(420, Math.max(260, viewW - margin * 2));
			el.style.width = `${width}px`;

			const anchor = state.eventPopoverAnchor ?? {
				x: Math.max(margin, viewW - width - margin),
				y: 80,
			};

			const height = el.offsetHeight || 320;
			const maxTop = Math.max(margin, viewH - height - margin);
			const top = Math.max(margin, Math.min(anchor.y + 8, maxTop));
			const maxLeft = Math.max(margin, viewW - width - margin);
			const left = Math.max(margin, Math.min(anchor.x, maxLeft));
			const right = Math.max(margin, viewW - left - width);
			setPosition({ top, right });
		};

		updatePosition();
		window.addEventListener("resize", updatePosition);
		return () => window.removeEventListener("resize", updatePosition);
	}, [isOpen, popoverState.displayJsonStr, state.eventPopoverAnchor, switcherSignature]);

	if (!isOpen || !event) {
		return null;
	}

	const showCollect = collectibleRelatedEvents.length > 1;
	const copyIcon: MaterialIconName =
		copyStatus[lastCopyItem.key] === "copied" ? "check" : "content_copy";
	const rawJsonlIcon: MaterialIconName =
		copyStatus["rawJsonl"] === "copied" ? "check" : "description";
	const rawJsonlTitle =
		copyStatus["rawJsonl"] === "copied"
			? t("eventPopover.feedback.copied", { label: "raw JSONL" })
			: copyStatus["rawJsonl"] === "error"
				? t("eventPopover.feedback.copyFailed", { label: "raw JSONL" })
				: t("eventPopover.action.copyRawJsonl");
	const readableTimestamp = formatReadableTimestamp(
		resolveDisplayPayloadTimestamp(popoverState.payload),
	);

	const handleCopy = (item: EventCopyMenuItem) => {
		const { key, label } = item;
		if (!item.text && !item.loadText) {
			return;
		}
		setLastCopyItem({ key, label: stripCopyPrefix(label) });
		const textPromise = item.loadText
			? item.loadText()
			: Promise.resolve(item.text);
		void textPromise
			.then((text) => copyText(text))
			.then(() => {
				const existing = copyTimerRef.current.get(key);
				if (existing) {
					window.clearTimeout(existing);
				}
				setCopyStatus((current) => ({ ...current, [key]: "copied" }));
				const timer = window.setTimeout(() => {
					setCopyStatus((current) => ({ ...current, [key]: "idle" }));
					copyTimerRef.current.delete(key);
				}, 1600);
				copyTimerRef.current.set(key, timer);
			})
			.catch(() => {
				const existing = copyTimerRef.current.get(key);
				if (existing) {
					window.clearTimeout(existing);
				}
				setCopyStatus((current) => ({ ...current, [key]: "error" }));
				const timer = window.setTimeout(() => {
					setCopyStatus((current) => ({ ...current, [key]: "idle" }));
					copyTimerRef.current.delete(key);
				}, 1600);
				copyTimerRef.current.set(key, timer);
			});
	};

	const performRawCopy = (item: EventCopyMenuItem) => {
		const { key } = item;
		if (!item.text && !item.loadText) {
			return;
		}
		const textPromise = item.loadText
			? item.loadText()
			: Promise.resolve(item.text);
		void textPromise
			.then((text) => copyText(text))
			.then(() => {
				const existing = copyTimerRef.current.get(key);
				if (existing) {
					window.clearTimeout(existing);
				}
				setCopyStatus((current) => ({ ...current, [key]: "copied" }));
				const timer = window.setTimeout(() => {
					setCopyStatus((current) => ({ ...current, [key]: "idle" }));
					copyTimerRef.current.delete(key);
				}, 1600);
				copyTimerRef.current.set(key, timer);
			})
			.catch(() => {
				const existing = copyTimerRef.current.get(key);
				if (existing) {
					window.clearTimeout(existing);
				}
				setCopyStatus((current) => ({ ...current, [key]: "error" }));
				const timer = window.setTimeout(() => {
					setCopyStatus((current) => ({ ...current, [key]: "idle" }));
					copyTimerRef.current.delete(key);
				}, 1600);
				copyTimerRef.current.set(key, timer);
			});
	};

	const copyMenuTitle = buildCopyMenuTitle(lastCopyItem, copyStatus, t);
	const openSystemPrompt = () => {
		setSystemPromptLoadState({ status: "idle" });
		setSystemPromptOpen(true);
	};

	const handleRawJsonlCopy = () => {
		if (!rawJsonlCopyItem) return;
		performRawCopy(rawJsonlCopyItem);
	};

	return (
		<div
			ref={popoverRef}
			className={EVENT_POPOVER_CLASS_NAME}
			id="event-popover"
			onDoubleClick={() => {
				if (primaryCopyMenuItem) {
					handleCopy(primaryCopyMenuItem);
				}
			}}
			title={t("eventPopover.title.doubleClickCopy")}
			style={{
				top: `${position.top}px`,
				right: `${position.right}px`,
				width: `min(420px, calc(100vw - 16px))`,
			}}
		>
			<div className={EVENT_POPOVER_HEAD_CLASS_NAME}>
				<div className={EVENT_POPOVER_HEAD_MAIN_CLASS_NAME}>
					<strong className={EVENT_POPOVER_TITLE_CLASS_NAME}>{event.type}</strong>
					<span className={EVENT_POPOVER_META_CLASS_NAME}>
						{t("eventPopover.meta.time", { time: readableTimestamp })}
					</span>
				</div>
				<div className={EVENT_POPOVER_ACTIONS_CLASS_NAME}>
					{showCollect && (
						<UiButton
							className={EVENT_POPOVER_ACTION_BUTTON_CLASS_NAME}
							variant="ghost"
							size="sm"
							iconOnly
							aria-label={t("eventPopover.action.collectSnapshot")}
							title={t("eventPopover.action.collectSnapshot")}
							onClick={() => {
								const payload = buildCollectedSnapshot(event, collectibleRelatedEvents);
								const rawJsonStr = stringifyPopoverPayload(payload);
								setPopoverState({
									payload,
									rawJsonStr,
									displayJsonStr: rawJsonStr,
								});
							}}
						>
							<MaterialIcon name="inventory_2" />
						</UiButton>
					)}
					<Popover
						open={copyMenuOpen}
						trigger="click"
						placement="bottomRight"
						arrow={false}
						classNames={{
							root: "event-popover-copy-menu-overlay",
						}}
						onOpenChange={setCopyMenuOpen}
						content={
							<div className={EVENT_POPOVER_COPY_MENU_CLASS_NAME} role="menu" aria-label={t("eventPopover.copy.menuAria")}>
								{copyMenuItems.map((item) => (
									<UiButton
										key={item.key}
										variant="ghost"
										size="sm"
										className={EVENT_POPOVER_COPY_MENU_ITEM_CLASS_NAME}
										aria-label={item.label}
										title={item.label}
										onClick={() => {
											setCopyMenuOpen(false);
											handleCopy(item);
										}}
									>
										{item.label}
									</UiButton>
								))}
							</div>
						}
					>
						<UiButton
							className={EVENT_POPOVER_ACTION_BUTTON_CLASS_NAME}
							variant="ghost"
							size="sm"
							iconOnly
							aria-label={t("eventPopover.copy.openMenu")}
							aria-haspopup="menu"
							aria-expanded={copyMenuOpen}
							title={copyMenuTitle}
						>
							<MaterialIcon name={copyIcon} />
						</UiButton>
					</Popover>
					{rawJsonlCopyItem && (
					<UiButton
						className={EVENT_POPOVER_ACTION_BUTTON_CLASS_NAME}
						variant="ghost"
						size="sm"
						iconOnly
						aria-label={t("eventPopover.action.copyRawJsonl")}
						title={rawJsonlTitle}
						onClick={handleRawJsonlCopy}
					>
						<MaterialIcon name={rawJsonlIcon} />
					</UiButton>
				)}
					{systemPromptCall && (
						<UiButton
							className={EVENT_POPOVER_SYSTEM_ACTION_BUTTON_CLASS_NAME}
							variant="ghost"
							size="sm"
							iconOnly
							aria-label={t("eventPopover.action.systemPrompt")}
							title={t("eventPopover.action.systemPrompt")}
							onClick={openSystemPrompt}
						>
							<MaterialIcon name="subject" />
						</UiButton>
					)}
					<UiButton
						className={EVENT_POPOVER_CLOSE_BUTTON_CLASS_NAME}
						variant="ghost"
						size="sm"
						iconOnly
						aria-label={t("eventPopover.close")}
						title={t("eventPopover.close")}
						onClick={() =>
							dispatch({
								type: "SET_EVENT_POPOVER",
								index: -1,
								event: null,
								anchor: null,
							})
						}
					>
						<MaterialIcon name="close" />
					</UiButton>
				</div>
			</div>
			<pre className={EVENT_POPOVER_BODY_CLASS_NAME}>{popoverState.displayJsonStr}</pre>
			<SystemPromptModal
				loadState={systemPromptLoadState}
				open={systemPromptOpen}
				onClose={() => setSystemPromptOpen(false)}
			/>
		</div>
	);
};

export const __TEST_ONLY__ = {
	canCollectEvent,
	copyText,
	formatReadableTimestamp,
	getCollectibleRelatedEvents,
	buildCollectedSnapshot,
	mapCollectedSnapshotType,
	resolveEventGroupMeta,
	resolveSystemPromptCalls,
	resolveSystemPromptText,
	buildSystemPromptTimeoutLoadState,
	SYSTEM_PROMPT_LOAD_TIMEOUT_MS,
	resolveRawJsonlChatId,
	buildRawJsonlCopyMenuItem,
	resolveRawLLMTraceFile,
	buildRawLLMTraceCopyMenuItem,
	isValidRawLLMTraceFile,
	buildEventCopyMenuItems,
	buildCopyMenuTitle,
	getPrimaryCopyMenuItem,
	resolveInitialPopoverState,
	stringifyPopoverPayload,
	shouldIncludeRawJsonlCopyItem,
};
