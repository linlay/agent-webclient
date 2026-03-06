import React, { useEffect, useMemo, useRef } from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";
import type { AgentEvent, ToolState } from "../../context/types";
import type { DebugTab } from "../../context/constants";
import { DEBUG_TABS } from "../../context/constants";
import { MaterialIcon } from "../common/MaterialIcon";
import { UiButton } from "../ui/UiButton";

function safeStr(v: unknown): string {
	if (typeof v === "string") return v;
	if (v === null || v === undefined) return "";
	return String(v);
}

function classifyEventKind(eventType: string): string {
	const type = String(eventType || "").toLowerCase();
	if (/(\.error|\.fail|\.cancel|\.cancelled)$/.test(type)) return "error";
	if (type === "request.query" || type.startsWith("run.")) return "run";
	if (type.startsWith("tool.")) return "tool";
	if (type.startsWith("content.") || type.startsWith("reasoning."))
		return "content";
	if (type.startsWith("plan.") || type.startsWith("task.")) return "plan";
	return "";
}

function summarizeEvent(event: AgentEvent): string {
	const keys = [
		"chatId",
		"runId",
		"contentId",
		"reasoningId",
		"toolId",
		"actionId",
		"planId",
		"taskId",
	];

	const kv = keys
		.filter((key) =>
			Object.prototype.hasOwnProperty.call(event, key),
		)
		.map((key) => `${key}=${safeStr(event[key])}`)
		.join(" ");

	if (event.type === "request.query") {
		const message = safeStr(event.message).trim();
		return message || kv;
	}

	if (kv) return kv;

	if (
		event.type === "content.delta" ||
		event.type === "reasoning.delta"
	) {
		return safeStr(event.delta).slice(0, 120);
	}

	if (
		event.type === "content.snapshot" ||
		event.type === "reasoning.snapshot"
	) {
		return safeStr(event.text).slice(0, 120);
	}

	if (event.type === "tool.result") {
		const result = event.result;
		return typeof result === "string"
			? result.slice(0, 120)
			: safeStr(JSON.stringify(result)).slice(0, 120);
	}

	return "";
}

const EventRow: React.FC<{
	event: AgentEvent;
	index: number;
	onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}> = ({ event, index, onClick }) => {
	const type = String(event.type || "");
	const seq = event.seq ?? "-";
	const ts = event.timestamp
		? new Date(event.timestamp).toLocaleTimeString()
		: "--";
	const kindClass = classifyEventKind(type)
		? `event-kind-${classifyEventKind(type)}`
		: "";
	const summary = summarizeEvent(event);

	return (
		<div
			className={`event-row is-clickable ${kindClass}`}
			data-event-index={index}
			onClick={onClick}
		>
			<div className="event-row-head">
				<strong>{`#${seq} ${type}`}</strong>
				<span className="event-row-time">{ts}</span>
			</div>
			{summary && <div className="event-row-summary">{summary}</div>}
		</div>
	);
};

function toPrettyJson(value: unknown): string {
	if (value === undefined || value === null) return "{}";
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed) return "{}";
		try {
			return JSON.stringify(JSON.parse(trimmed), null, 2);
		} catch {
			return value;
		}
	}
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

/* Tool card for the "Tools" tab */
const ToolCard: React.FC<{
	toolState: ToolState;
	status: string;
	tsLabel: string;
	payloadText: string;
}> = ({ toolState, status, tsLabel, payloadText }) => {
	return (
		<article className="debug-event-card">
			<div className="debug-event-head">
				<strong>{`tool: ${toolState.toolName || toolState.toolId}`}</strong>
				<span className="event-row-time">{tsLabel}</span>
			</div>
			<div className="mono debug-event-meta">
				{`runId=${toolState.runId || "-"} toolId=${toolState.toolId} | status=${status}`}
			</div>
			<pre className="debug-event-json">{payloadText}</pre>
		</article>
	);
};

const tabLabels: Record<DebugTab, string> = {
	events: "Events",
	logs: "Logs",
	tools: "Tools",
};

export const RightSidebar: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();
	const debugLogRef = useRef<HTMLPreElement | null>(null);
	const pendingToolsRef = useRef<HTMLDivElement | null>(null);

	const toolEntries = useMemo(() => {
		return Array.from(state.toolStates.values()).map((toolState) => {
			const nodeId = state.toolNodeById.get(toolState.toolId);
			const node = nodeId ? state.timelineNodes.get(nodeId) : null;
			const payload = {
				kind: "tool",
				runId: toolState.runId || null,
				toolId: toolState.toolId,
				toolName: toolState.toolName || null,
				toolType: toolState.toolType || null,
				toolKey: toolState.toolKey || null,
				toolApi: toolState.toolApi || null,
				description: toolState.description || null,
				status: node?.status || "pending",
				args: toolState.toolParams ?? (toolState.argsBuffer || {}),
				result: node?.kind === "tool" ? node.result : null,
				error: node?.status === "failed"
					? node?.kind === "tool" && node.result
						? node.result.text
						: null
					: null,
			};

			return {
				toolState,
				status: String(node?.status || "pending"),
				tsLabel: node?.ts
					? new Date(node.ts).toLocaleTimeString()
					: "--",
				payloadText: toPrettyJson(payload),
				sortTs: Number(node?.ts || 0),
			};
		}).sort((a, b) => a.sortTs - b.sortTs);
	}, [state.toolStates, state.toolNodeById, state.timelineNodes]);

	useEffect(() => {
		const el = debugLogRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [state.debugLines, state.activeDebugTab]);

	useEffect(() => {
		const el = pendingToolsRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [toolEntries, state.activeDebugTab]);

	return (
		<aside
			className={`sidebar right-sidebar ${
				state.layoutMode === "desktop-fixed"
					? state.desktopDebugSidebarEnabled
						? "is-open"
						: ""
					: state.rightDrawerOpen
						? "is-open"
						: ""
			}`}
			id="right-sidebar"
		>
			<div className="sidebar-head">
				<h2>调试面板</h2>
				<UiButton
					className="drawer-close"
					aria-label="关闭调试面板"
					variant="ghost"
					size="sm"
					iconOnly
					onClick={() =>
						dispatch({ type: "SET_RIGHT_DRAWER_OPEN", open: false })
					}
				>
					<MaterialIcon name="close" />
				</UiButton>
			</div>

			<div className="debug-tabs">
				{DEBUG_TABS.map((tab) => (
					<UiButton
						key={tab}
						className={`debug-tab ${state.activeDebugTab === tab ? "active" : ""}`}
						variant="ghost"
						size="sm"
						active={state.activeDebugTab === tab}
						onClick={() =>
							dispatch({ type: "SET_ACTIVE_DEBUG_TAB", tab })
						}
					>
						{tabLabels[tab]}
					</UiButton>
				))}
			</div>

			<div className="debug-panel">
				{/* Events Tab */}
				{state.activeDebugTab === "events" && (
					<>
						{/* <div className="debug-panel-head">
							<button
								className="debug-clear-btn"
								onClick={() =>
									dispatch({ type: "CLEAR_EVENTS" })
								}
							>
								清空
							</button>
						</div> */}
						<div className="list" id="events-list">
							{state.events.length === 0 ? (
								<div className="status-line">暂无事件</div>
							) : (
								state.events.map((event, idx) => (
									<EventRow
										key={idx}
										event={event}
										index={idx}
										onClick={(e) => {
											const rect =
												e.currentTarget.getBoundingClientRect();
											dispatch({
												type: "SET_EVENT_POPOVER",
												index: idx,
												event,
												anchor: {
													x: rect.left,
													y: rect.bottom,
												},
											});
										}}
									/>
								))
							)}
						</div>
					</>
				)}

				{/* Logs Tab */}
				{state.activeDebugTab === "logs" && (
					<>
						<div className="debug-panel-head">
							<button
								className="debug-clear-btn"
								id="clear-logs-btn"
								onClick={() =>
									dispatch({ type: "CLEAR_DEBUG" })
								}
							>
								清空
							</button>
						</div>
						<pre
							ref={debugLogRef}
							className="debug-log"
							id="debug-log"
						>
							{state.debugLines.length === 0
								? "暂无日志"
								: state.debugLines.join("\n")}
						</pre>
					</>
				)}

				{/* Tools Tab */}
				{state.activeDebugTab === "tools" && (
					<div ref={pendingToolsRef} className="list" id="pending-tools">
						{toolEntries.length === 0 ? (
							<div className="status-line">暂无 tool 事件</div>
						) : (
							toolEntries.map((entry) => (
								<ToolCard
									key={entry.toolState.toolId}
									toolState={entry.toolState}
									status={entry.status}
									tsLabel={entry.tsLabel}
									payloadText={entry.payloadText}
								/>
							))
						)}
					</div>
				)}
			</div>
		</aside>
	);
};
