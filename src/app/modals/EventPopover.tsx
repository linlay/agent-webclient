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
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
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
	resolveEventGroupMeta,
	type RelatedEventEntry,
} from "@/app/modals/lib/eventPopoverGrouping";
import {
	formatReadableTimestamp,
	resolveDebugPreCallCopyPayloads,
	resolveDisplayPayloadTimestamp,
	resolveInitialPopoverState,
	stringifyPopoverPayload,
} from "@/app/modals/lib/eventPopoverFormatters";

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
	const [position, setPosition] = useState({ top: 80, right: 320 });
	const isOpen = state.eventPopoverIndex >= 0 && !!state.eventPopoverEventRef;
	const event = state.eventPopoverEventRef;
	const groupMeta = useMemo(() => resolveEventGroupMeta(event), [event]);
	const relatedEvents = useMemo<RelatedEventEntry[]>(() => {
		if (!event) return [];
		if (!groupMeta) {
			return [{ event, index: state.eventPopoverIndex }];
		}

		const matches = state.events.flatMap((candidate, index) => {
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
	}, [event, groupMeta, state.eventPopoverIndex, state.events]);
	const activeRelatedIndex = useMemo(() => {
		if (!event) return -1;

		const indexMatch = relatedEvents.findIndex(
			(entry) => entry.index === state.eventPopoverIndex,
		);
		if (indexMatch >= 0) return indexMatch;

		return relatedEvents.findIndex((entry) => entry.event === event);
	}, [event, relatedEvents, state.eventPopoverIndex]);
	const switcherSignature = useMemo(
		() => relatedEvents.map((entry) => entry.index).join(","),
		[relatedEvents],
	);
	const collectibleRelatedEvents = useMemo(
		() => getCollectibleRelatedEvents(event, groupMeta, relatedEvents),
		[event, groupMeta, relatedEvents],
	);
	const copyMenuItems = useMemo(
		() => buildEventCopyMenuItems(event, relatedEvents, popoverState.rawJsonStr, t),
		[event, relatedEvents, popoverState.rawJsonStr, t],
	);
	const primaryCopyMenuItem = useMemo(
		() => getPrimaryCopyMenuItem(copyMenuItems),
		[copyMenuItems],
	);

	useEffect(() => {
		setPopoverState(resolveInitialPopoverState(event));
		copyTimerRef.current.forEach((timer) => window.clearTimeout(timer));
		copyTimerRef.current.clear();
		setCopyStatus({});
		setLastCopyItem(buildDefaultCopyMenuItem(t));
		setCopyMenuOpen(false);
	}, [event, t]);

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

	const seq = event.seq ?? "-";
	const groupSummary = groupMeta
		? `${groupMeta.idKey}: ${groupMeta.idValue}`
		: t("eventPopover.group.unknown");
	const showSwitcher = relatedEvents.length > 1;
	const showCollect = collectibleRelatedEvents.length > 1;
	const copyIcon =
		copyStatus[lastCopyItem.key] === "copied" ? "check" : "content_copy";
	const readableTimestamp = formatReadableTimestamp(
		resolveDisplayPayloadTimestamp(popoverState.payload),
	);

	const handleCopy = (item: EventCopyMenuItem) => {
		const { key, label, text } = item;
		if (!text) {
			return;
		}
		setLastCopyItem({ key, label: stripCopyPrefix(label) });
		void copyText(text)
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

	return (
		<div
			ref={popoverRef}
			className="event-popover"
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
			<div className="event-popover-head">
				<div className="event-popover-head-main">
					<strong>{`#${seq} ${event.type}`}</strong>
					<span className="event-popover-meta">
						{showSwitcher && activeRelatedIndex >= 0
							? `${groupSummary} · ${activeRelatedIndex + 1}/${relatedEvents.length}`
							: groupSummary}
					</span>
					<span className="event-popover-meta">
						{t("eventPopover.meta.time", { time: readableTimestamp })}
					</span>
				</div>
				<div className="event-popover-actions">
					{showCollect && (
						<UiButton
							className="event-popover-action-btn"
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
							<div className="event-popover-copy-menu" role="menu" aria-label={t("eventPopover.copy.menuAria")}>
								{copyMenuItems.map((item) => (
									<UiButton
										key={item.key}
										variant="ghost"
										size="sm"
										className="event-popover-copy-menu-item"
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
							className="event-popover-action-btn"
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
					<UiButton
						className="event-popover-action-btn event-popover-close"
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
			<pre className="event-popover-body">{popoverState.displayJsonStr}</pre>
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
	resolveDebugPreCallCopyPayloads,
	buildEventCopyMenuItems,
	buildCopyMenuTitle,
	getPrimaryCopyMenuItem,
	resolveInitialPopoverState,
	stringifyPopoverPayload,
};
