import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TimelineNode } from "@/app/state/types";
import { ContentBlock } from "@/features/timeline/components/ContentBlock";

const mockDispatch = jest.fn();

jest.mock("@/app/state/AppContext", () => ({
	useAppDispatch: () => mockDispatch,
	useAppState: () => ({
		chatId: "",
		chatAgentById: new Map(),
		chats: [],
		pendingNewChatAgentKey: "coder-agent",
		workerSelectionKey: "",
		workerIndexByKey: new Map(),
		rightSidebarOpen: false,
		rightSidebarOpenTab: null,
		attachmentPreview: [],
		activeAttachmentPreviewUrl: "",
		webPreviews: [],
		activeWebPreviewUrl: "",
	}),
}));

const mockMarkdownContentProps: Array<{
	content: string;
	onWorkspaceFileLinkClick?: (link: {
		href: string;
		filePath: string;
		line?: number;
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
			onWorkspaceFileLinkClick?: (link: {
				href: string;
				filePath: string;
				line?: number;
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

	it("opens workspace file links in the right sidebar preview", () => {
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
			tab: "preview",
			preview: expect.objectContaining({
				name: "a.ts",
				kind: "text",
				sourcePath: "/Users/demo/project/src/a.ts",
				line: 12,
				url: "workspace-file:coder-agent:%2FUsers%2Fdemo%2Fproject%2Fsrc%2Fa.ts:12",
				downloadUrl: "",
				workspaceFile: {
					agentKey: "coder-agent",
					path: "/Users/demo/project/src/a.ts",
				},
			}),
		});
	});

	it("opens bare HTML file links with an HTML preview kind", () => {
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
			tab: "preview",
			preview: expect.objectContaining({
				name: "china-gdp-2010-2024.html",
				kind: "html",
				sourcePath: "china-gdp-2010-2024.html",
				workspaceFile: {
					agentKey: "coder-agent",
					path: "china-gdp-2010-2024.html",
				},
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
