import React, { useState } from "react";
import { Button, Dropdown, Modal, type MenuProps } from "antd";
import { useAppContext } from "@/app/state/AppContext";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import {
	deleteChat,
	downloadChatExport,
} from "@/features/transport/lib/apiClientProxy";

export const ChatActionsMenu: React.FC<{
	chatId: string;
	chatName?: string;
}> = ({ chatId, chatName }) => {
	const { state, dispatch } = useAppContext();
	const [pending, setPending] = useState(false);
	const normalizedChatId = String(chatId || "").trim();

	const clearActiveChatIfNeeded = () => {
		if (String(state.chatId || "") !== normalizedChatId) {
			return;
		}
		dispatch({ type: "SET_CHAT_ID", chatId: "" });
		dispatch({ type: "SET_RUN_ID", runId: "" });
		dispatch({ type: "RESET_ACTIVE_CONVERSATION" });
		window.dispatchEvent(new CustomEvent("agent:reset-event-cache"));
		window.dispatchEvent(new CustomEvent("agent:voice-reset"));
	};

	const handleDelete = () => {
		if (!normalizedChatId || pending) return;
		Modal.confirm({
			title: "删除对话",
			content: chatName || normalizedChatId,
			okText: "删除",
			okButtonProps: { danger: true },
			cancelText: "取消",
			onOk: async () => {
				setPending(true);
				try {
					await deleteChat({ chatId: normalizedChatId });
					dispatch({ type: "CHAT_DELETED", chatId: normalizedChatId });
					clearActiveChatIfNeeded();
				} catch (error) {
					dispatch({
						type: "APPEND_DEBUG",
						line: `[delete chat error] ${(error as Error).message}`,
					});
					throw error;
				} finally {
					setPending(false);
				}
			},
		});
	};

	const handleExport = async () => {
		if (!normalizedChatId || pending) return;
		setPending(true);
		try {
			await downloadChatExport(normalizedChatId);
		} catch (error) {
			dispatch({
				type: "APPEND_DEBUG",
				line: `[export chat error] ${(error as Error).message}`,
			});
		} finally {
			setPending(false);
		}
	};

	const items: MenuProps["items"] = [
		{
			key: "export",
			icon: <MaterialIcon name="download" />,
			label: "导出",
			onClick: () => void handleExport(),
		},
		{
			key: "delete",
			danger: true,
			icon: <MaterialIcon name="delete" />,
			label: "删除",
			onClick: handleDelete,
		},
	];

	return (
		<Dropdown menu={{ items }} trigger={["click"]} placement="bottomRight">
			<Button
				type="text"
				size="small"
				className="chat-actions-trigger"
				loading={pending}
				icon={<MaterialIcon name="more_vert" />}
				onClick={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
			/>
		</Dropdown>
	);
};
