import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatActionsMenu } from "@/features/chats/components/ChatActionsMenu";

const mockDispatch = jest.fn();
const mockRenameChat = jest.fn();
const mockGetChat = jest.fn();
const mockArchiveChats = jest.fn();
const mockDownloadConversationHtmlExport = jest.fn();
const mockModalConfirm = jest.fn();
const mockMessageError = jest.fn();
let mockMenuItems: Array<Record<string, any>> = [];

jest.mock("@/app/state/AppContext", () => ({
	useAppContext: () => ({
		state: { chatId: "chat_1" },
		dispatch: mockDispatch,
	}),
}));

jest.mock("@/shared/data", () => ({
	archiveChats: (...args: unknown[]) => mockArchiveChats(...args),
	deleteChat: jest.fn(),
	downloadChatExport: jest.fn(),
	downloadConversationHtmlExport: (...args: unknown[]) =>
		mockDownloadConversationHtmlExport(...args),
	getChat: (...args: unknown[]) => mockGetChat(...args),
	renameChat: (...args: unknown[]) => mockRenameChat(...args),
}));

jest.mock("@/shared/ui/MaterialIcon", () => ({
	MaterialIcon: ({ name, className }: { name: string; className?: string }) => {
		const React = require("react");
		return React.createElement("span", { "data-icon": name, className });
	},
}));

jest.mock("@/shared/ui/CopyInfoModal", () => ({
	CopyInfoModal: () => null,
}));

jest.mock("antd", () => {
	const React = require("react");
	return {
		Button: ({ children, className }: { children?: React.ReactNode; className?: string }) =>
			React.createElement("button", { className }, children),
		Dropdown: ({
			children,
			menu,
		}: {
			children?: React.ReactNode;
			menu?: {
				items?: Array<Record<string, any>>;
				onClick?: (info: Record<string, unknown>) => void;
			};
		}) => {
			mockMenuItems = (menu?.items || []).map((item) => ({
				...item,
				onClick: () => menu?.onClick?.({
					key: item.key,
					domEvent: { stopPropagation: jest.fn() },
				}),
			}));
			return React.createElement("div", null, children);
		},
		Input: (props: Record<string, unknown>) =>
			React.createElement("input", props),
		Modal: {
			confirm: (...args: unknown[]) => mockModalConfirm(...args),
		},
		message: {
			error: (...args: unknown[]) => mockMessageError(...args),
			success: jest.fn(),
			warning: jest.fn(),
			info: jest.fn(),
		},
	};
});

describe("ChatActionsMenu", () => {
	beforeEach(() => {
		mockDispatch.mockClear();
		mockRenameChat.mockReset();
		mockGetChat.mockReset();
		mockArchiveChats.mockReset();
		mockDownloadConversationHtmlExport.mockReset();
		mockModalConfirm.mockClear();
		mockMessageError.mockClear();
		mockMenuItems = [];
		mockRenameChat.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { chatId: "chat_1", chatName: "Renamed chat", updated: true },
		});
		mockArchiveChats.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { results: [{ chatId: "chat_1", success: true }] },
		});
	});

	it("opens rename modal, submits trimmed name, and dispatches local rename", async () => {
		renderToStaticMarkup(
			React.createElement(ChatActionsMenu, {
				chatId: "chat_1",
				chatName: "Old chat",
			}),
		);

		const renameItem = mockMenuItems.find((item) => item.key === "rename");
		expect(renameItem).toBeTruthy();

		renameItem?.onClick();
		expect(mockModalConfirm).toHaveBeenCalledTimes(1);

		const config = mockModalConfirm.mock.calls[0][0] as {
			content: React.ReactElement<{ onChange: (event: unknown) => void }>;
			onOk: () => Promise<void>;
		};
		expect(config.content.props.defaultValue).toBe("Old chat");

		config.content.props.onChange({
			target: { value: "  Fresh chat name  " },
		});
		await config.onOk();

		expect(mockRenameChat).toHaveBeenCalledWith({
			chatId: "chat_1",
			chatName: "Fresh chat name",
		});
		expect(mockDispatch).toHaveBeenCalledWith({
			type: "CHAT_RENAMED",
			chatId: "chat_1",
			chatName: "Renamed chat",
		});
	});

	it("archives without confirmation when clicking the archive menu item", async () => {
		const onArchived = jest.fn();
		renderToStaticMarkup(
			React.createElement(ChatActionsMenu, {
				chatId: "chat_1",
				chatName: "Demo chat",
				onArchived,
			}),
		);

		const archiveItem = mockMenuItems.find((item) => item.key === "archive");
		expect(archiveItem).toBeTruthy();

		await archiveItem?.onClick();

		expect(mockModalConfirm).not.toHaveBeenCalled();
		expect(mockArchiveChats).toHaveBeenCalledTimes(1);
		expect(mockArchiveChats).toHaveBeenCalledWith({ chatIds: ["chat_1"] });
		expect(mockDispatch).toHaveBeenCalledWith({
			type: "CHAT_ARCHIVED",
			chatId: "chat_1",
		});
		expect(onArchived).toHaveBeenCalledWith("chat_1");
	});

	it("toasts a failure and skips dispatch when archive reports failure", async () => {
		mockArchiveChats.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { results: [{ chatId: "chat_1", success: false, error: "nope" }] },
		});
		const onArchived = jest.fn();
		renderToStaticMarkup(
			React.createElement(ChatActionsMenu, {
				chatId: "chat_1",
				chatName: "Demo chat",
				onArchived,
			}),
		);

		const archiveItem = mockMenuItems.find((item) => item.key === "archive");
		expect(archiveItem).toBeTruthy();

		await archiveItem?.onClick();
		// 让异步链 settle
		await Promise.resolve();

		expect(mockArchiveChats).toHaveBeenCalledTimes(1);
		expect(mockDispatch).not.toHaveBeenCalledWith(
			expect.objectContaining({ type: "CHAT_ARCHIVED" }),
		);
		expect(onArchived).not.toHaveBeenCalled();
		expect(mockMessageError).toHaveBeenCalled();
	});

	it("adds 16/24 classes for left sidebar triggers and menu icons only when requested", () => {
		const html = renderToStaticMarkup(
			React.createElement(ChatActionsMenu, {
				chatId: "chat_1",
				iconHover24: true,
			}),
		);

		expect(html).toContain("chat-actions-trigger ui-icon-hover-24");
		expect(html).toContain("ui-icon-hover-24-target");
		expect(mockMenuItems).toHaveLength(6);
		expect(mockMenuItems.map((item) => item.key)).toEqual([
			"export",
			"exportHtml",
			"rename",
			"archive",
			"delete",
			"copyInfo",
		]);
		expect(mockMenuItems.find((item) => item.key === "delete")?.danger).toBe(true);
		expect(mockMenuItems.find((item) => item.key === "copyInfo")?.danger).toBeUndefined();
		expect(mockMenuItems).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ className: "ui-icon-hover-24" }),
			]),
		);
	});

	it("exports a static HTML snapshot through the dedicated data service", async () => {
		mockDownloadConversationHtmlExport.mockResolvedValue(undefined);
		renderToStaticMarkup(
			React.createElement(ChatActionsMenu, { chatId: " chat_1 " }),
		);

		const exportHtmlItem = mockMenuItems.find(
			(item) => item.key === "exportHtml",
		);
		exportHtmlItem?.onClick();
		await Promise.resolve();

		expect(mockDownloadConversationHtmlExport).toHaveBeenCalledWith("chat_1");
	});

	it("loads chat details without raw messages from copy information", () => {
		mockGetChat.mockReturnValue(new Promise(() => undefined));
		renderToStaticMarkup(
			React.createElement(ChatActionsMenu, {
				chatId: " chat_1 ",
				chatName: "Demo chat",
			}),
		);

		const copyItem = mockMenuItems.find((item) => item.key === "copyInfo");
		expect(copyItem).toBeTruthy();

		copyItem?.onClick();

		expect(mockGetChat).toHaveBeenCalledWith("chat_1", false);
	});
});
