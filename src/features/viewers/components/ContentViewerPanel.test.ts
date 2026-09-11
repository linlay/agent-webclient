import React from "react";
import { renderToStaticMarkup as renderMarkup } from "react-dom/server";
import { I18nProvider } from "@/shared/i18n";
import fs from "node:fs";
import path from "node:path";

function renderToStaticMarkup(element: React.ReactElement) {
	return renderMarkup(React.createElement(I18nProvider, { locale: "zh-CN", persistLocale: false }, element));
}

jest.mock("@/app/state/AppContext", () => ({
	useAppState: () => ({ chatId: "chat_1", chats: [] }),
}));

jest.mock("@/shared/ui/useAuthenticatedResourceUrl", () => ({
	useAuthenticatedResourceUrl: () => ({
		url: "",
		loading: false,
		error: null,
	}),
}));

jest.mock("@/shared/data/desktop/desktopCurrentResourceAction", () => ({
	canUseDesktopCurrentResourceActions: () => true,
	checkDesktopCurrentResourceActionsAvailable: () => Promise.resolve(true),
	detectDesktopFileManager: () => "finder",
	requestDesktopCurrentResourceAction: jest.fn(),
	resolveDesktopCurrentResourceIdentity: () => ({
		chatId: "chat_1",
		profile: "artifact",
		relativePath: "artifacts/run_1/report.docx",
	}),
}));

import {
	ContentViewerPanel,
	DesktopLocalResourceActions,
	buildViewerTextLines,
	resolveContentViewerErrorMessage,
	resolveFileViewerContentKind,
	resolveFileViewerHtml,
	shouldRequestDesktopLocalResourceActions,
} from "@/features/viewers/components/ContentViewerPanel";

describe("ContentViewerPanel", () => {
	it("renders a read-only metadata and explicit download surface for archives", () => {
		const html = renderToStaticMarkup(
			React.createElement(ContentViewerPanel, {
				target: {
					type: "resource",
					name: "archive.zip",
					url: "artifacts/run_1/archive.zip",
					downloadUrl: "artifacts/run_1/archive.zip",
					contentKind: "unsupported",
				},
			}),
		);

		expect(html).toContain("content-viewer-body");
		expect(html).toContain("archive.zip");
		expect(html).toContain("<button");
		expect(html).toMatch(/下\s*载/u);
	});

	it("explains unsafe Markdown as an unsupported text encoding", () => {
		const html = renderToStaticMarkup(
			React.createElement(ContentViewerPanel, {
				target: {
					type: "resource",
					name: "novel.md",
					url: "artifacts/run_1/novel.md",
					downloadUrl: "artifacts/run_1/novel.md",
					contentKind: "unsupported",
					documentKind: "document-binary",
					mimeType: "application/octet-stream",
				},
			}),
		);

		expect(html).toContain("不是安全的 UTF-8 文本");
		expect(html).not.toContain("二进制文件（只读）");
		expect(html).toMatch(/下\s*载/u);
	});

	it("renders the Desktop local action controls inside the viewer content area", () => {
		const html = renderToStaticMarkup(
			React.createElement(DesktopLocalResourceActions, {
				resource: {
					chatId: "chat_1",
					profile: "artifact",
					relativePath: "artifacts/run_1/report.docx",
				},
			}),
		);

		expect(html).toContain("content-viewer-local-actions");
		expect(html).toContain("在访达中显示");
		expect(html).toContain("用默认应用打开");
	});

	it.each(["office", "unsupported"] as const)(
		"requests Desktop local action capability for %s resources",
		(contentKind) => {
			expect(shouldRequestDesktopLocalResourceActions({
				bridgeAvailable: true,
				contentKind,
				enabled: true,
				identityAvailable: true,
				targetType: "resource",
			})).toBe(true);
		},
	);

	it("does not render local actions for previewable resources", () => {
		const html = renderToStaticMarkup(
			React.createElement(ContentViewerPanel, {
				target: {
					type: "resource",
					name: "manual.pdf",
					url: "artifacts/run_1/manual.pdf",
					downloadUrl: "artifacts/run_1/manual.pdf",
					contentKind: "pdf",
				},
				enableDesktopLocalResourceActions: true,
			}),
		);

		expect(html).not.toContain("content-viewer-local-actions");
		expect(shouldRequestDesktopLocalResourceActions({
			bridgeAvailable: true,
			contentKind: "pdf",
			enabled: true,
			identityAvailable: true,
			targetType: "resource",
		})).toBe(false);
	});

	it("enables local document actions in the Main Chat RightSidebar", () => {
		const source = fs.readFileSync(
			path.join(process.cwd(), "src/app/layout/sidebar/right/RightSidebar.tsx"),
			"utf8",
		);
		expect(source).toMatch(
			/<ContentViewerPanel[\s\S]*?target=\{target\}[\s\S]*?enableDesktopLocalResourceActions/,
		);
	});

	it("marks the requested line as the target line", () => {
		expect(buildViewerTextLines("one\ntwo\nthree", 2)).toEqual([
			{ lineNumber: 1, text: "one", target: false },
			{ lineNumber: 2, text: "two", target: true },
			{ lineNumber: 3, text: "three", target: false },
		]);
	});

	it("normalizes invalid target lines to no highlight", () => {
		expect(buildViewerTextLines("one", 0)).toEqual([
			{ lineNumber: 1, text: "one", target: false },
		]);
	});

	it("shows the original Platform 403 message in an opened file viewer", () => {
		const platformError = Object.assign(
			new Error("Workspace file access denied"),
			{ status: 403, code: 403 },
		);

		expect(
			resolveContentViewerErrorMessage(platformError, "Unable to load file"),
		).toBe("Workspace file access denied");
	});

	it("uses the file response content kind and MIME type for workspace previews", () => {
		expect(
			resolveFileViewerContentKind(
				{
					agentKey: "coder",
					workspaceRoot: "/workspace",
					requestedPath: "Dockerfile",
					path: "Dockerfile",
					absolutePath: "/workspace/Dockerfile",
					name: "Dockerfile",
					kind: "file",
					contentKind: "text",
					sizeBytes: 10,
					truncated: false,
				},
				"text",
			),
		).toBe("text");

		expect(
			resolveFileViewerContentKind(
				{
					agentKey: "coder",
					workspaceRoot: "/workspace",
					requestedPath: "manual.pdf",
					path: "manual.pdf",
					absolutePath: "/workspace/manual.pdf",
					name: "manual.pdf",
					kind: "file",
					contentKind: "binary",
					mimeType: "application/pdf",
					sizeBytes: 10,
					truncated: false,
				},
				"text",
			),
		).toBe("pdf");

		expect(
			resolveFileViewerContentKind(
				{
					agentKey: "coder",
					workspaceRoot: "/workspace",
					requestedPath: "diagram.png",
					path: "diagram.png",
					absolutePath: "/workspace/diagram.png",
					name: "diagram.png",
					kind: "file",
					contentKind: "binary",
					mimeType: "image/png",
					contentUrl: "/api/file?agentKey=coder&path=diagram.png&response=content",
					sizeBytes: 10,
					truncated: false,
				},
				"text",
			),
		).toBe("image");
	});

	it.each([
		["report.html", "text/plain"],
		["report.txt", "text/html; charset=utf-8"],
	])(
		"prioritizes HTML name or MIME detection for %s",
		(name, mimeType) => {
			expect(
				resolveFileViewerContentKind(
					{
					agentKey: "coder",
					workspaceRoot: "/workspace",
					requestedPath: name,
					path: name,
					absolutePath: `/workspace/${name}`,
					name,
					kind: "file",
					contentKind: "text",
					mimeType,
					content: "<html></html>",
					sizeBytes: 13,
					truncated: false,
				},
				"text",
				),
			).toBe("html");
		},
	);

	it("uses complete workspace HTML content as srcDoc", () => {
		const response = {
			agentKey: "coder",
			workspaceRoot: "/workspace",
			requestedPath: "report.html",
			path: "report.html",
			absolutePath: "/workspace/report.html",
			name: "report.html",
			kind: "file",
			contentKind: "text" as const,
			mimeType: "text/html",
			content: "<script>window.chartReady = true</script>",
			sizeBytes: 47,
			truncated: false,
		};

		expect(resolveFileViewerHtml(response)).toBe(response.content);
		expect(
			resolveFileViewerHtml({ ...response, truncated: true }),
		).toBeNull();
	});
});
