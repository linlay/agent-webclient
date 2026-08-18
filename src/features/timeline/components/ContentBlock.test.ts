import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TimelineNode } from "@/app/state/types";
import { ContentBlock } from "@/features/timeline/components/ContentBlock";

const mockDispatch = jest.fn();
let mockChatId = "chat_01";

jest.mock("@/app/state/AppContext", () => ({
	useAppDispatch: () => mockDispatch,
	useAppState: () => ({
		chatId: mockChatId,
		chatAgentById: new Map(),
		chats: [],
		pendingNewChatAgentKey: "coder-agent",
		workerSelectionKey: "",
		workerIndexByKey: new Map(),
		rightSidebarOpen: false,
		rightSidebarOpenTab: null,
		viewerTabs: [],
		activeViewerKey: "",
		webPreviews: [],
		activeWebPreviewUrl: "",
	}),
}));

const mockMarkdownContentProps: Array<{
	content: string;
	chatId?: string;
	onWorkspaceFileLinkClick?: (link: {
		href: string;
		filePath: string;
		line?: number;
	}) => void;
	onResourceFileLinkClick?: (link: {
		href: string;
		name: string;
		classification: {
			kind: "chat";
			source: string;
			fetchUrl: string;
			requiresPlatformAuth: boolean;
		};
	}) => void;
	onWebLinkClick?: (link: {
		href: string;
		url: string;
		title: string;
	}) => void;
}> = [];

jest.mock("@/shared/ui/MarkdownContent", () => {
	const ReactRuntime = require("react");

	return {
		MarkdownContent: (props: {
			content: string;
			chatId?: string;
			onWorkspaceFileLinkClick?: (link: {
				href: string;
				filePath: string;
				line?: number;
			}) => void;
			onResourceFileLinkClick?: (link: {
				href: string;
				name: string;
				classification: {
					kind: "chat";
					source: string;
					fetchUrl: string;
					requiresPlatformAuth: boolean;
				};
			}) => void;
			onWebLinkClick?: (link: {
				href: string;
				url: string;
				title: string;
			}) => void;
		}) => {
			mockMarkdownContentProps.push(props);
			return ReactRuntime.createElement(
				"div",
				{ className: "x-markdown" },
				props.content,
			);
		},
	};
});

describe("ContentBlock", () => {
	beforeEach(() => {
		mockDispatch.mockClear();
		mockMarkdownContentProps.length = 0;
		mockChatId = "chat_01";
	});

	it("passes the current chatId to Markdown resource rendering", () => {
		const node: TimelineNode = {
			id: "content_resource",
			kind: "content",
			role: "assistant",
			text: "![preview](image.png)",
			ts: 100,
		};

		renderToStaticMarkup(React.createElement(ContentBlock, { node }));

		expect(mockMarkdownContentProps[0]).toMatchObject({
			content: "![preview](image.png)",
			chatId: "chat_01",
		});
	});

	it("keeps assistant markdown whitespace collapsed instead of pre-wrapped", () => {
		const node: TimelineNode = {
			id: "content_1",
			kind: "content",
			role: "assistant",
			text: "> 第一段\n>\n> 第二段",
			ts: 100,
		};

		const html = renderToStaticMarkup(
			React.createElement(ContentBlock, { node }),
		);

		expect(html).toContain("timeline-markdown");
		expect(html).toContain("tw:whitespace-normal");
		expect(html).not.toContain("tw:whitespace-pre-wrap");
	});

	it("opens workspace file links in the right-sidebar Viewer", () => {
		const node: TimelineNode = {
			id: "content_1",
			kind: "content",
			role: "assistant",
			text: "[a.ts](/Users/demo/project/src/a.ts:12)",
			ts: 100,
		};

		renderToStaticMarkup(React.createElement(ContentBlock, { node }));
		mockMarkdownContentProps[0].onWorkspaceFileLinkClick?.({
			href: "/Users/demo/project/src/a.ts:12",
			filePath: "/Users/demo/project/src/a.ts",
			line: 12,
		});

		expect(mockDispatch).toHaveBeenCalledWith({
			type: "OPEN_RIGHT_SIDEBAR",
			tab: "viewer",
			viewerTarget: expect.objectContaining({
				type: "file",
				name: "a.ts",
				contentKind: "text",
				agentKey: "coder-agent",
				path: "/Users/demo/project/src/a.ts",
				line: 12,
			}),
		});
	});

	it("opens relative ChatScope files in the Resource Viewer", () => {
		const href = "artifacts/msx9nzkm/%E7%81%AF%E4%B8%8B.md";
		const node: TimelineNode = {
			id: "content_resource_link",
			kind: "content",
			role: "assistant",
			text: `[灯下.md](${href})`,
			ts: 100,
		};

		renderToStaticMarkup(React.createElement(ContentBlock, { node }));
		mockMarkdownContentProps[0].onResourceFileLinkClick?.({
			href,
			name: "灯下.md",
			classification: {
				kind: "chat",
				source: href,
				fetchUrl: "/api/resource?file=chat_01%2Fartifacts",
				requiresPlatformAuth: true,
			},
		});

		expect(mockDispatch).toHaveBeenCalledWith({
			type: "OPEN_RIGHT_SIDEBAR",
			tab: "viewer",
			viewerTarget: {
				type: "resource",
				name: "灯下.md",
				url: href,
				downloadUrl: href,
				contentKind: "text",
			},
		});
	});

	it("opens bare HTML file links with an HTML Viewer content kind", () => {
		const node: TimelineNode = {
			id: "content_html",
			kind: "content",
			role: "assistant",
			text: "[report](china-gdp-2010-2024.html)",
			ts: 100,
		};

		renderToStaticMarkup(React.createElement(ContentBlock, { node }));
		mockMarkdownContentProps[0].onWorkspaceFileLinkClick?.({
			href: "china-gdp-2010-2024.html",
			filePath: "china-gdp-2010-2024.html",
		});

		expect(mockDispatch).toHaveBeenCalledWith({
			type: "OPEN_RIGHT_SIDEBAR",
			tab: "viewer",
			viewerTarget: expect.objectContaining({
				type: "file",
				name: "china-gdp-2010-2024.html",
				contentKind: "html",
				agentKey: "coder-agent",
				path: "china-gdp-2010-2024.html",
			}),
		});
	});

	it("opens HTTP links in a right-sidebar web tab", () => {
		const node: TimelineNode = {
			id: "content_web",
			kind: "content",
			role: "assistant",
			text: "[百度](https://www.baidu.com)",
			ts: 100,
		};

		renderToStaticMarkup(React.createElement(ContentBlock, { node }));
		mockMarkdownContentProps[0].onWebLinkClick?.({
			href: "https://www.baidu.com",
			url: "https://www.baidu.com/",
			title: "百度",
		});

		expect(mockDispatch).toHaveBeenCalledWith({
			type: "OPEN_RIGHT_SIDEBAR",
			tab: "web",
			webPreview: {
				title: "百度",
				url: "https://www.baidu.com/",
			},
		});
	});
});
