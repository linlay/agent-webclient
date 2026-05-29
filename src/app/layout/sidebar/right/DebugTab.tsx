import React from "react";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import type { AgentEvent } from "@/app/state/types";
import { formatDebugTimestamp } from "@/shared/utils/debugTime";
import {
	classifyEventGroup,
	type DebugEventGroup,
	getEventId,
	getEventRowGroupClass,
	isErrorEventType,
	shouldDisplayDebugEvent,
} from "@/features/timeline/lib/debugEventDisplay";
import { t } from "@/shared/i18n";
import { Flex, Tabs, Tag } from "antd";

function formatDebugTime(timestamp?: number): string {
	return formatDebugTimestamp(timestamp);
}

export const DEBUG_EVENT_TABS: Array<{
	key: "all" | Exclude<DebugEventGroup, "">;
	labelKey: string;
	color: string;
}> = [
	{ key: "all", labelKey: "rightSidebar.debug.tabs.all", color: "blue" },
	{ key: "request", labelKey: "rightSidebar.debug.tabs.request", color: "#5A86C8" },
	{ key: "chat", labelKey: "rightSidebar.debug.tabs.chat", color: "#6B92BF" },
	{ key: "run", labelKey: "rightSidebar.debug.tabs.run", color: "#4476AD" },
	{ key: "awaiting", labelKey: "rightSidebar.debug.tabs.awaiting", color: "#D2B395" },
	{ key: "memory", labelKey: "rightSidebar.debug.tabs.memory", color: "#7091B6" },
	{ key: "reasoning", labelKey: "rightSidebar.debug.tabs.reasoning", color: "#7AB9A8" },
	{ key: "planning", labelKey: "rightSidebar.debug.tabs.planning", color: "#8B9AD8" },
	{ key: "content", labelKey: "rightSidebar.debug.tabs.content", color: "#5AA79D" },
	{ key: "tool", labelKey: "rightSidebar.debug.tabs.tool", color: "#D6A05E" },
	{ key: "action", labelKey: "rightSidebar.debug.tabs.action", color: "#CA9168" },
	{ key: "plan", labelKey: "rightSidebar.debug.tabs.plan", color: "#8E82C4" },
	{ key: "task", labelKey: "rightSidebar.debug.tabs.task", color: "#A094D0" },
	{ key: "artifact", labelKey: "rightSidebar.debug.tabs.artifact", color: "#D98A42" },
];

export type DebugTabKey = (typeof DEBUG_EVENT_TABS)[number]["key"];

export function buildDebugEventGroups(
	events: AgentEvent[],
): Map<DebugTabKey, Array<{ event: AgentEvent; index: number }>> {
	const grouped = new Map<DebugTabKey, Array<{ event: AgentEvent; index: number }>>();

	DEBUG_EVENT_TABS.forEach((tab) => grouped.set(tab.key, []));

	events.forEach((event, index) => {
		if (!shouldDisplayDebugEvent(event)) {
			return;
		}
		grouped.get("all")?.push({ event, index });
		const group = classifyEventGroup(String(event.type || ""));
		if (group && group !== "request") {
			grouped.get(group)?.push({ event, index });
		}
	});

	return grouped;
}

const EventRow: React.FC<{
	event: AgentEvent;
	index: number;
	onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}> = ({ event, index, onClick }) => {
	const type = String(event.type || "");
	const ts = formatDebugTime(event.timestamp);
	const kindClass = getEventRowGroupClass(type);
	const errorClass = isErrorEventType(type) ? "is-error-type" : "";
	const id = getEventId(event);

	return (
		<Flex
			className={`event-row is-clickable ${kindClass} ${errorClass}`.trim()}
			data-event-index={index}
			align="center"
			onClick={onClick}
		>
			<Flex vertical style={{ flex: 1 }}>
				<Flex justify="space-between">
					<strong>{type}</strong>
					<span className="event-row-time">{ts}</span>
				</Flex>
				<span className="event-row-time">{id}</span>
			</Flex>
		</Flex>
	);
};

export const DebugTab: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();

	const openEventPopover = React.useCallback(
		(event: AgentEvent, idx: number, target: HTMLDivElement) => {
			const rect = target.getBoundingClientRect();
			dispatch({
				type: "SET_EVENT_POPOVER",
				index: idx,
				event,
				anchor: {
					x: rect.left,
					y: rect.bottom,
				},
			});
		},
		[dispatch],
	);

	const eventsByTab = React.useMemo(
		() => buildDebugEventGroups(state.debugEvents),
		[state.debugEvents],
	);

	const tabItems = React.useMemo(
		() =>
			DEBUG_EVENT_TABS.flatMap((tab) => {
				const entries = eventsByTab.get(tab.key) || [];
				if (tab.key !== "all" && entries.length === 0) {
					return [];
				}
				return [
					{
						key: tab.key,
						label: t("rightSidebar.debug.tabs.labelWithCount", {
							label: t(tab.labelKey),
							count: entries.length,
						}),
						color: tab.color,
						children: (
							<div className="debug-events-tab">
								{entries.map(({ event, index }) => (
									<EventRow
										key={`${index}-${String(event.type || "")}`}
										event={event}
										index={index}
										onClick={(e) =>
											openEventPopover(event, index, e.currentTarget)
										}
									/>
								))}
							</div>
						),
					},
				];
			}),
		[eventsByTab, openEventPopover],
	);

	return (
		<div className="debug-panel">
			<div className="list" id="events-list">
				{state.debugEvents.length === 0 ? (
					<div className="status-line">{t("rightSidebar.debug.empty")}</div>
				) : (
					<Tabs
						size="small"
						renderTabBar={(props) => {
							return (
								<Flex wrap gap={6}>
									{tabItems.map((item) => (
										<Tag
											key={item.key}
											style={{ cursor: "pointer", borderRadius: 12 }}
											color={
												props.activeKey === item.key ? item.color : undefined
											}
											onClick={(e) => props.onTabClick(item.key, e)}
										>
											{item.label}
										</Tag>
									))}
								</Flex>
							);
						}}
						items={tabItems}
					/>
				)}
			</div>
		</div>
	);
};
