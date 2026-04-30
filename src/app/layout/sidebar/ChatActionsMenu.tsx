import React, { useState } from "react";
import { Button, Dropdown, Modal, type MenuProps } from "antd";
import { useAppContext } from "@/app/state/AppContext";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { t } from "@/shared/i18n";
import {
	archiveChats,
	deleteChat,
	downloadChatExport,
} from "@/features/transport/lib/apiClientProxy";

export const ChatActionsMenu: React.FC<{
	chatId: string;
	chatName?: string;
	onArchived?: (chatId: string) => void;
	onDeleted?: (chatId: string) => void;
}> = ({ chatId, chatName, onArchived, onDeleted }) => {
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
			title: t("chatActions.delete.title"),
			content: chatName || normalizedChatId,
			okText: t("chatActions.delete.ok"),
			okButtonProps: { danger: true },
			cancelText: t("chatActions.cancel"),
			onOk: async () => {
				setPending(true);
				try {
					await deleteChat({ chatId: normalizedChatId });
					dispatch({ type: "CHAT_DELETED", chatId: normalizedChatId });
					onDeleted?.(normalizedChatId);
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

	const handleArchive = () => {
		if (!normalizedChatId || pending) return;
		Modal.confirm({
			title: t("chatActions.archive.title"),
			content: chatName || normalizedChatId,
			okText: t("chatActions.archive.ok"),
			cancelText: t("chatActions.cancel"),
			onOk: async () => {
				setPending(true);
				try {
					const response = await archiveChats({ chatIds: [normalizedChatId] });
					const result = response.data?.results?.[0];
					if (!result?.success) {
						throw new Error(result?.error || t("chatActions.archive.failed"));
					}
					dispatch({ type: "CHAT_ARCHIVED", chatId: normalizedChatId });
					onArchived?.(normalizedChatId);
					clearActiveChatIfNeeded();
				} catch (error) {
					dispatch({
						type: "APPEND_DEBUG",
						line: `[archive chat error] ${(error as Error).message}`,
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
			label: t("chatActions.export"),
			onClick: () => void handleExport(),
		},
		{
			key: "archive",
			icon: <MaterialIcon name="inventory_2" />,
			label: t("chatActions.archive.menu"),
			onClick: handleArchive,
		},
		{
			key: "delete",
			danger: true,
			icon: <MaterialIcon name="delete" />,
			label: t("chatActions.delete.menu"),
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
				onClick={(event) => {
					event.preventDefault();
					event.stopPropagation();
				}}
			>
				<MaterialIcon name="more_vert" />
			</Button>
		</Dropdown>
	);
};
