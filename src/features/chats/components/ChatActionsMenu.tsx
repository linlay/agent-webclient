import React, { useEffect, useRef, useState } from "react";
import { Button, Dropdown, Input, Modal, message, type MenuProps } from "antd";
import { useAppContext } from "@/app/state/AppContext";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { t } from "@/shared/i18n";
import {
	archiveChats,
	deleteChat,
	downloadChatExport,
	getChat,
	renameChat,
	type ChatDetailResponse,
} from "@/shared/data";
import { CopyInfoModal } from "@/shared/ui/CopyInfoModal";
import { buildChatCopyInfoGroups } from "@/features/chats/lib/chatCopyInfo";

export const ChatActionsMenu: React.FC<{
	chatId: string;
	chatName?: string;
	triggerClassName?: string;
	iconHover24?: boolean;
	onArchived?: (chatId: string) => void;
	onDeleted?: (chatId: string) => void;
}> = ({
	chatId,
	chatName,
	triggerClassName,
	iconHover24 = false,
	onArchived,
	onDeleted,
}) => {
	const { state, dispatch } = useAppContext();
	const [pending, setPending] = useState(false);
	const [copyInfoOpen, setCopyInfoOpen] = useState(false);
	const [copyInfoDetail, setCopyInfoDetail] = useState<ChatDetailResponse | null>(null);
	const [copyInfoLoading, setCopyInfoLoading] = useState(false);
	const [copyInfoError, setCopyInfoError] = useState("");
	const copyInfoRequestRef = useRef(0);
	useEffect(() => () => {
		copyInfoRequestRef.current += 1;
	}, []);
	const normalizedChatId = String(chatId || "").trim();
	const triggerClass = [
		"chat-actions-trigger",
		triggerClassName,
		iconHover24 ? "ui-icon-hover-24" : "",
	]
		.filter(Boolean)
		.join(" ");
	const menuItemClassName = iconHover24 ? "ui-icon-hover-24" : undefined;
	const menuIconClassName = iconHover24
		? "ui-icon-hover-24-target"
		: undefined;

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

	const handleRename = () => {
		if (!normalizedChatId || pending) return;
		let nextName = String(chatName || "").trim();
		Modal.confirm({
			title: t("chatActions.rename.title"),
			content: (
				<Input
					autoFocus
					defaultValue={nextName}
					maxLength={120}
					placeholder={t("chatActions.rename.placeholder")}
					onChange={(event) => {
						nextName = event.target.value;
					}}
				/>
			),
			okText: t("chatActions.rename.ok"),
			cancelText: t("chatActions.cancel"),
			onOk: async () => {
				const chatName = nextName.trim();
				if (!chatName) {
					throw new Error(t("chatActions.rename.required"));
				}
				setPending(true);
				try {
					const response = await renameChat({
						chatId: normalizedChatId,
						chatName,
					});
					const renamedName =
						String(response.data?.chatName || "").trim() || chatName;
					dispatch({
						type: "CHAT_RENAMED",
						chatId: normalizedChatId,
						chatName: renamedName,
					});
				} catch (error) {
					dispatch({
						type: "APPEND_DEBUG",
						line: `[rename chat error] ${(error as Error).message}`,
					});
					throw error;
				} finally {
					setPending(false);
				}
			},
		});
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
			message.success(t("chatActions.export.success"));
		} catch (error) {
			message.error(t("chatActions.export.failed"));
			dispatch({
				type: "APPEND_DEBUG",
				line: `[export chat error] ${(error as Error).message}`,
			});
		} finally {
			setPending(false);
		}
	};

	const loadCopyInfoDetail = () => {
		if (!normalizedChatId) return;
		const requestId = copyInfoRequestRef.current + 1;
		copyInfoRequestRef.current = requestId;
		setCopyInfoLoading(true);
		setCopyInfoError("");
		setCopyInfoDetail(null);
		void getChat(normalizedChatId, false)
			.then((response) => {
				if (copyInfoRequestRef.current !== requestId) return;
				setCopyInfoDetail(response.data);
			})
			.catch((error) => {
				if (copyInfoRequestRef.current !== requestId) return;
				const errorMessage = error instanceof Error ? error.message : String(error);
				setCopyInfoError(errorMessage);
				dispatch({
					type: "APPEND_DEBUG",
					line: `[load chat copy detail error] ${errorMessage}`,
				});
			})
			.finally(() => {
				if (copyInfoRequestRef.current === requestId) {
					setCopyInfoLoading(false);
				}
			});
	};

	const handleCopyInfo = () => {
		if (!normalizedChatId) return;
		setCopyInfoOpen(true);
		loadCopyInfoDetail();
	};

	const handleCloseCopyInfo = () => {
		copyInfoRequestRef.current += 1;
		setCopyInfoOpen(false);
		setCopyInfoDetail(null);
		setCopyInfoLoading(false);
		setCopyInfoError("");
	};

	const items: MenuProps["items"] = [
		{
			key: "export",
			className: menuItemClassName,
			icon: <MaterialIcon name="export" className={menuIconClassName} />,
			label: t("chatActions.export"),
			onClick: () => void handleExport(),
		},
		{
			key: "rename",
			className: menuItemClassName,
			icon: <MaterialIcon name="rename" className={menuIconClassName} />,
			label: t("chatActions.rename.menu"),
			onClick: handleRename,
		},
		{
			key: "archive",
			className: menuItemClassName,
			icon: <MaterialIcon name="inventory_2" className={menuIconClassName} />,
			label: t("chatActions.archive.menu"),
			onClick: handleArchive,
		},
		{
			key: "delete",
			danger: true,
			className: menuItemClassName,
			icon: <MaterialIcon name="delete" className={menuIconClassName} />,
			label: t("chatActions.delete.menu"),
			onClick: handleDelete,
		},
		{
			key: "copyInfo",
			className: menuItemClassName,
			icon: <MaterialIcon name="content_copy" className={menuIconClassName} />,
			label: t("chatActions.copyInfo"),
			onClick: handleCopyInfo,
		},
	];

	return (
		<>
			<Dropdown menu={{ items }} trigger={["click"]} placement="bottomRight">
				<Button
					type="text"
					size="small"
					className={triggerClass}
					loading={pending}
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
					}}
				>
					<MaterialIcon name="more_horiz" className={menuIconClassName} />
				</Button>
			</Dropdown>
			{copyInfoOpen ? (
				<CopyInfoModal
					open
					title={t("chatCopy.title")}
					groups={buildChatCopyInfoGroups({
						summary: { chatId: normalizedChatId, chatName },
						detail: copyInfoDetail,
						t,
					})}
					rawData={copyInfoDetail}
					rawReady={Boolean(copyInfoDetail)}
					loading={copyInfoLoading}
					error={copyInfoError}
					onRetry={loadCopyInfoDetail}
					onClose={handleCloseCopyInfo}
				/>
			) : null}
		</>
	);
};
