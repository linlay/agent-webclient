import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

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

import {
	ContentViewerPanel,
	buildViewerTextLines,
	resolveFileViewerContentKind,
	resolveFileViewerHtml,
} from "@/features/viewers/components/ContentViewerPanel";

describe("ContentViewerPanel", () => {
	it("renders no inline controls or body for unsupported files", () => {
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

		expect(html).not.toContain("<button");
		expect(html).not.toContain("content-viewer-body");
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
