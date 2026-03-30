import React, { useMemo } from "react";
import { useAppState, useAppDispatch } from "../../context/AppContext";
import { MaterialIcon } from "../common/MaterialIcon";
import { UiButton } from "../ui/UiButton";
import { UiInput } from "../ui/UiInput";
import { UiTag } from "../ui/UiTag";
import { UiListItem } from "../ui/UiListItem";
import {
	pickChatAgentLabel,
	formatChatTimeLabel,
} from "../../lib/chatListFormatter";
import type { Chat, WorkerRow } from "../../context/types";

const ChatItem: React.FC<{
	chat: Chat;
	agents: Array<{ key?: string; name?: string }>;
	isActive: boolean;
	onClick: () => void;
}> = ({ chat, agents, isActive, onClick }) => {
	const label = pickChatAgentLabel(chat, agents);
	const time = formatChatTimeLabel(chat.updatedAt);
	const title = chat.chatName || chat.chatId || "(无标题)";

	return (
		<UiListItem
			className={`chat-item ${isActive ? "is-active" : ""}`}
			selected={isActive}
			dense
			onClick={onClick}
		>
			<div className="chat-item-head">
				<div className="chat-title-wrap">
					<div className="chat-title">{title}</div>
				</div>
				<div className="chat-time">{time}</div>
			</div>
			<div className="chat-meta-line">
				<UiTag tone="muted">{label}</UiTag>
			</div>
		</UiListItem>
	);
};

const WorkerItem: React.FC<{
	row: WorkerRow;
	isActive: boolean;
	onClick: () => void;
}> = ({ row, isActive, onClick }) => {
	const time = row.latestUpdatedAt
		? formatChatTimeLabel(row.latestUpdatedAt)
		: "--";
	const preview =
		row.latestRunContent ||
		(row.hasHistory ? row.latestChatName : "暂无历史对话");

	return (
		<UiListItem
			className={`chat-item worker-item ${isActive ? "is-active" : ""} ${row.hasHistory ? "" : "is-empty"}`}
			selected={isActive}
			onClick={onClick}
		>
			<div className="worker-row-main">
				<div className="chat-item-head">
					<div className="chat-title-wrap">
						<div className="chat-title">
							<MaterialIcon
								name={row.type === "team" ? "groups" : "person"}
								className="inline-icon"
							/>
							<span>{row.displayName}</span>
						</div>
						{row.type === "team" ? (
							<span className="team-agent-labels">
								{row.teamAgentLabels.join(" / ")}
							</span>
						) : (
							<span className="worker-role">
								{row.role || "--"}
							</span>
						)}
					</div>
					<div className="chat-time">{time}</div>
				</div>
			</div>
			<div className="chat-meta-line">{preview}</div>
		</UiListItem>
	);
};

export const LeftSidebar: React.FC = () => {
	const state = useAppState();
	const dispatch = useAppDispatch();

	const filteredChats = useMemo(() => {
		const filter = state.chatFilter.toLowerCase().trim();
		if (!filter) return state.chats;
		return state.chats.filter((chat) => {
			const name = (chat.chatName || "").toLowerCase();
			const id = (chat.chatId || "").toLowerCase();
			return name.includes(filter) || id.includes(filter);
		});
	}, [state.chats, state.chatFilter]);

	const filteredWorkerRows = useMemo(() => {
		const filter = state.chatFilter.toLowerCase().trim();
		if (!filter) return state.workerRows;
		return state.workerRows.filter((row) =>
			String(row.searchText || "").includes(filter),
		);
	}, [state.workerRows, state.chatFilter]);

	const handleSelectChat = (chatId: string) => {
		window.dispatchEvent(
			new CustomEvent("agent:load-chat", { detail: { chatId } }),
		);
		if (state.layoutMode === "mobile-drawer") {
			dispatch({ type: "SET_LEFT_DRAWER_OPEN", open: false });
		}
	};

	const handleStartNewConversation = () => {
		window.dispatchEvent(
			new CustomEvent("agent:start-new-conversation"),
		);
	};

	return (
		<aside
			className={`sidebar left-sidebar ${state.leftDrawerOpen || state.layoutMode !== "mobile-drawer" ? "is-open" : ""}`}
			id="left-sidebar"
		>
			<div className="sidebar-head">
				<div className="sidebar-title-row">
					<h2>
						{state.conversationMode === "worker" ? "员工" : "对话"}
					</h2>
					<UiButton
						className="icon-btn"
						size="sm"
						onClick={handleStartNewConversation}
					>
						<MaterialIcon name="edit_square" />
						<span>新对话</span>
					</UiButton>
				</div>

				<UiButton
					className="drawer-close"
					aria-label="关闭对话列表"
					variant="ghost"
					size="sm"
					iconOnly
					onClick={() =>
						dispatch({ type: "SET_LEFT_DRAWER_OPEN", open: false })
					}
				>
					<MaterialIcon name="close" />
				</UiButton>
			</div>

			{state.conversationMode !== "worker" && (
				<label className="field-label field-label-spaced" htmlFor="chat-search">
					搜索
				</label>
			)}
			<div className="sidebar-filter-row">
				<UiInput
					id="chat-search"
					inputSize="md"
					type="text"
					placeholder={
						state.conversationMode === "worker"
							? "按 名称 / key / teamId 过滤..."
							: "搜索对话..."
					}
					value={state.chatFilter}
					onChange={(e) =>
						dispatch({
							type: "SET_CHAT_FILTER",
							filter: e.target.value,
						})
					}
				/>

				<UiButton
					className="icon-btn icon-btn-fixed"
					size="sm"
					onClick={() => {
						if (state.conversationMode === "worker") {
							window.dispatchEvent(
								new CustomEvent("agent:refresh-worker-data"),
							);
						} else {
							window.dispatchEvent(
								new CustomEvent("agent:refresh-chats"),
							);
						}
					}}
				>
					<MaterialIcon name="refresh" />
					<span>刷新</span>
				</UiButton>
			</div>

			{state.conversationMode !== "worker" && (
				<div className="chat-meta">
					<span className="chat-meta-label">智能体</span>
					{state.chatId && state.chatAgentById.has(state.chatId) && (
						<UiTag className="chip" tone="accent">
							{state.chatAgentById.get(state.chatId)}
						</UiTag>
					)}
				</div>
			)}

			<div className="chat-list" id="chat-list">
				{state.conversationMode === "worker" ? (
					filteredWorkerRows.length === 0 ? (
						<div className="status-line">暂无员工/小组</div>
					) : (
						filteredWorkerRows.map((row) => (
							<WorkerItem
								key={row.key}
								row={row}
								isActive={row.key === state.workerSelectionKey}
								onClick={() =>
									window.dispatchEvent(
										new CustomEvent("agent:select-worker", {
											detail: { workerKey: row.key },
										}),
									)
								}
							/>
						))
					)
				) : filteredChats.length === 0 ? (
					<div className="status-line">暂无对话</div>
				) : (
					filteredChats.map((chat) => (
						<ChatItem
							key={chat.chatId}
							chat={chat}
							agents={state.agents}
							isActive={chat.chatId === state.chatId}
							onClick={() => handleSelectChat(chat.chatId)}
						/>
					))
				)}
			</div>

			{/* {state.conversationMode === "worker" &&
				state.workerRelatedChats.length > 0 && (
					<div className="chat-list worker-related-list">
						<div className="chat-meta">
							<span className="chat-meta-label">关联会话</span>
						</div>
						{state.workerRelatedChats.map((chat) => (
							<UiListItem
								key={chat.chatId}
								className={`chat-item ${chat.chatId === state.chatId ? "is-active" : ""}`}
								selected={chat.chatId === state.chatId}
								dense
								onClick={() => handleSelectChat(chat.chatId)}
							>
								<div className="chat-title">
									{chat.chatName || chat.chatId}
								</div>
								<div className="chat-meta-line">
									{formatChatTimeLabel(chat.updatedAt)}
								</div>
							</UiListItem>
						))}
					</div>
				)} */}
		</aside>
	);
};
