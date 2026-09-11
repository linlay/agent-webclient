/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions":["node","node-addons"]}
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatActionsMenu } from "@/features/chats/components/ChatActionsMenu";

let mockPinnedOrder: string[] | null = null;
const mockPutChatOrder = jest.fn();
const mockDispatch = jest.fn();
const mockRenameChat = jest.fn();
const mockGetChat = jest.fn();
const mockArchiveChats = jest.fn();
const mockDeleteChat = jest.fn();
const mockDownloadChatExport = jest.fn();
const mockDownloadConversationHtmlExport = jest.fn();
const mockModalConfirm = jest.fn();
const mockMessageError = jest.fn();
let mockMenuItems: Array<Record<string, any>> = [];
let mockMenuGroups: Array<Record<string, any>> = [];

jest.mock("@/app/state/AppContext", () => ({
	useAppContext: () => ({
		state: { chatId: "chat_1", chatPinnedOrder: mockPinnedOrder },
		dispatch: mockDispatch,
	}),
}));

jest.mock("@/shared/data", () => ({
  putChatOrder: (...args: unknown[]) => mockPutChatOrder(...args),
	archiveChats: (...args: unknown[]) => mockArchiveChats(...args),
	deleteChat: (...args: unknown[]) => mockDeleteChat(...args),
	downloadChatExport: (...args: unknown[]) => mockDownloadChatExport(...args),
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
        App: { useApp: () => ({ modal: { confirm: mockModalConfirm } }) },
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
			const flatten = (entries: Array<Record<string, any>>): Array<Record<string, any>> =>
				entries.flatMap((item) =>
					Array.isArray(item.children)
						? flatten(item.children)
						: [{
							...item,
							onClick: () => menu?.onClick?.({
								key: item.key,
								domEvent: { stopPropagation: jest.fn() },
							}),
						}],
				);
			mockMenuGroups = menu?.items || [];
			mockMenuItems = flatten(mockMenuGroups);
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
		mockDeleteChat.mockReset();
		mockDownloadChatExport.mockReset();
		mockDownloadConversationHtmlExport.mockReset();
		mockModalConfirm.mockClear();
		mockMessageError.mockClear();
		mockMenuItems = [];
		mockMenuGroups = [];
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
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(mockArchiveChats).toHaveBeenCalledTimes(1);
		expect(mockDispatch).not.toHaveBeenCalledWith(
			expect.objectContaining({ type: "CHAT_ARCHIVED" }),
		);
		expect(onArchived).not.toHaveBeenCalled();
		expect(mockMessageError).toHaveBeenCalled();
	});

	it("deletes only after confirmation and resets the active chat after the callback", async () => {
		const onDeleted = jest.fn(() => {
			expect(mockDispatch).not.toHaveBeenCalledWith({ type: "SET_CHAT_ID", chatId: "" });
		});
		const resetEvents: string[] = [];
		const listener = (event: Event) => resetEvents.push(event.type);
		window.addEventListener("agent:reset-event-cache", listener);
		window.addEventListener("agent:voice-reset", listener);
		try {
			renderToStaticMarkup(React.createElement(ChatActionsMenu, {
				chatId: " chat_1 ", chatName: "Demo chat", onDeleted,
			}));
			mockMenuItems.find((item) => item.key === "delete")?.onClick();
			expect(mockDeleteChat).not.toHaveBeenCalled();
			const config = mockModalConfirm.mock.calls[0][0];
			expect(config.content).toBe("Demo chat");
			expect(config.okButtonProps).toEqual({ danger: true });
			await config.onOk();
			expect(mockDeleteChat).toHaveBeenCalledWith({ chatId: "chat_1" });
			expect(onDeleted).toHaveBeenCalledWith("chat_1");
			expect(mockDispatch.mock.calls.map(([action]) => action.type)).toEqual([
				"CHAT_DELETED", "SET_CHAT_ID", "SET_RUN_ID", "RESET_ACTIVE_CONVERSATION",
			]);
			expect(resetEvents).toEqual(["agent:reset-event-cache", "agent:voice-reset"]);
		} finally {
			window.removeEventListener("agent:reset-event-cache", listener);
			window.removeEventListener("agent:voice-reset", listener);
		}
	});

	it("keeps another active chat when deleting and rejects failed confirmation requests", async () => {
		renderToStaticMarkup(React.createElement(ChatActionsMenu, { chatId: "chat_2" }));
		mockMenuItems.find((item) => item.key === "delete")?.onClick();
		const config = mockModalConfirm.mock.calls[0][0];
		mockDeleteChat.mockRejectedValueOnce(new Error("denied"));
		await expect(config.onOk()).rejects.toThrow("denied");
		expect(mockDispatch).toHaveBeenCalledWith({
			type: "APPEND_DEBUG", line: "[delete chat error] denied",
		});
		expect(mockDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "CHAT_DELETED" }));
		await config.onOk();
		expect(mockDispatch).toHaveBeenCalledWith({ type: "CHAT_DELETED", chatId: "chat_2" });
		expect(mockDispatch).not.toHaveBeenCalledWith({ type: "SET_CHAT_ID", chatId: "" });
	});

	it("keeps Markdown export and logs export failures without confirmation", async () => {
		mockDownloadChatExport.mockRejectedValue(new Error("download failed"));
		renderToStaticMarkup(React.createElement(ChatActionsMenu, { chatId: " chat_1 " }));
		mockMenuItems.find((item) => item.key === "export")?.onClick();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(mockDownloadChatExport).toHaveBeenCalledWith("chat_1");
		expect(mockMessageError).toHaveBeenCalled();
		expect(mockModalConfirm).not.toHaveBeenCalled();
		expect(mockDispatch).toHaveBeenCalledWith({
			type: "APPEND_DEBUG", line: "[export chat markdown error] download failed",
		});
	});

	it("blocks other actions while an export is pending and unlocks after failure", async () => {
		(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
		const container = document.createElement("div");
		const root = createRoot(container);
		let rejectExport!: (error: Error) => void;
		mockDownloadChatExport.mockReturnValue(new Promise((_, reject) => {
			rejectExport = reject;
		}));
		try {
			await act(async () => {
				root.render(React.createElement(ChatActionsMenu, { chatId: "chat_1" }));
			});
			await act(async () => {
				mockMenuItems.find((item) => item.key === "export")?.onClick();
			});
			mockMenuItems.find((item) => item.key === "rename")?.onClick();
			mockMenuItems.find((item) => item.key === "archive")?.onClick();
			expect(mockModalConfirm).not.toHaveBeenCalled();
			expect(mockArchiveChats).not.toHaveBeenCalled();
			await act(async () => rejectExport(new Error("download failed")));
			mockMenuItems.find((item) => item.key === "rename")?.onClick();
			expect(mockModalConfirm).toHaveBeenCalledTimes(1);
			expect(mockMessageError).toHaveBeenCalled();
		} finally {
			await act(async () => root.unmount());
			delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
		}
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
		expect(mockMenuGroups.map((item) => item.key)).toEqual([
			"exportGroup",
			"rename",
			"archive",
			"delete",
			"copyInfo",
		]);
		expect(mockMenuGroups[0].children.map((item: Record<string, any>) => item.key)).toEqual([
			"export",
			"exportHtml",
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


describe("pin menu", () => {
  afterEach(() => { mockPinnedOrder = null; });
  it.each([false, true])("sends an explicit pinned value when current pin is %s", async pinned => {
    mockPinnedOrder = pinned ? ["chat_1"] : [];
    mockPutChatOrder.mockResolvedValue({ data: { sortMode: "recent", pinnedOrder: pinned ? [] : ["chat_1"] } });
    renderToStaticMarkup(React.createElement(ChatActionsMenu, { chatId: "chat_1" }));
    mockMenuItems.find(item => item.key === "pin")!.onClick();
    await Promise.resolve(); await Promise.resolve();
    expect(mockPutChatOrder).toHaveBeenLastCalledWith({ operation: "set_pinned", chatId: "chat_1", pinned: !pinned });
    expect(mockDispatch).toHaveBeenCalledWith({ type: "SET_CHAT_PINNING", order: pinned ? [] : ["chat_1"] });
  });
  it("keeps membership unchanged when a write fails and reports the error", async () => {
    mockPinnedOrder = [];
    mockDispatch.mockClear();
    mockPutChatOrder.mockRejectedValue(new Error("offline"));
    renderToStaticMarkup(React.createElement(ChatActionsMenu, { chatId: "chat_1" }));
    mockMenuItems.find(item => item.key === "pin")!.onClick();
    await Promise.resolve(); await Promise.resolve();
    expect(mockDispatch.mock.calls.some(([action]) => action.type === "SET_CHAT_PINNING")).toBe(false);
    expect(mockMessageError).toHaveBeenCalled();
  });
  it("hides pin actions when the backend has not advertised support", () => {
    mockPinnedOrder = null;
    renderToStaticMarkup(React.createElement(ChatActionsMenu, { chatId: "chat_1" }));
    expect(mockMenuItems.some(item => item.key === "pin")).toBe(false);
  });
});
