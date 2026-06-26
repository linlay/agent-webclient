import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatActionsMenu } from "@/app/layout/sidebar/ChatActionsMenu";

const mockDispatch = jest.fn();
const mockRenameChat = jest.fn();
const mockModalConfirm = jest.fn();
let mockMenuItems: Array<Record<string, any>> = [];

jest.mock("@/app/state/AppContext", () => ({
	useAppContext: () => ({
		state: { chatId: "chat_1" },
		dispatch: mockDispatch,
	}),
}));

jest.mock("@/shared/data", () => ({
	archiveChats: jest.fn(),
	deleteChat: jest.fn(),
	downloadChatExport: jest.fn(),
	renameChat: (...args: unknown[]) => mockRenameChat(...args),
}));

jest.mock("@/shared/ui/MaterialIcon", () => ({
	MaterialIcon: ({ name }: { name: string }) => {
		const React = require("react");
		return React.createElement("span", { "data-icon": name });
	},
}));

jest.mock("antd", () => {
	const React = require("react");
	return {
		Button: ({ children }: { children?: React.ReactNode }) =>
			React.createElement("button", null, children),
		Dropdown: ({
			children,
			menu,
		}: {
			children?: React.ReactNode;
			menu?: { items?: Array<Record<string, any>> };
		}) => {
			mockMenuItems = menu?.items || [];
			return React.createElement("div", null, children);
		},
		Input: (props: Record<string, unknown>) =>
			React.createElement("input", props),
		Modal: {
			confirm: (...args: unknown[]) => mockModalConfirm(...args),
		},
	};
});

describe("ChatActionsMenu", () => {
	beforeEach(() => {
		mockDispatch.mockClear();
		mockRenameChat.mockReset();
		mockModalConfirm.mockClear();
		mockMenuItems = [];
		mockRenameChat.mockResolvedValue({
			status: 200,
			code: 0,
			msg: "ok",
			data: { chatId: "chat_1", chatName: "Renamed chat", updated: true },
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
});
