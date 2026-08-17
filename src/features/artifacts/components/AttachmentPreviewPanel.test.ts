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
	AttachmentPreviewPanel,
	buildTextPreviewLines,
	resolveWorkspaceHtmlSrcDoc,
	resolveWorkspaceFilePreviewKind,
} from "@/features/artifacts/components/AttachmentPreviewPanel";

describe("buildTextPreviewLines", () => {
	it("renders no inline controls or body for unsupported files", () => {
		const html = renderToStaticMarkup(
			React.createElement(AttachmentPreviewPanel, {
				preview: {
					name: "archive.zip",
					url: "artifacts/run_1/archive.zip",
					downloadUrl: "artifacts/run_1/archive.zip",
					kind: "unsupported",
				},
			}),
		);

		expect(html).not.toContain("<button");
		expect(html).not.toContain("attachment-preview-toolbar");
		expect(html).not.toContain("attachment-preview-body");
	});

	it("marks the requested line as the target line", () => {
		expect(buildTextPreviewLines("one\ntwo\nthree", 2)).toEqual([
			{ lineNumber: 1, text: "one", target: false },
			{ lineNumber: 2, text: "two", target: true },
			{ lineNumber: 3, text: "three", target: false },
		]);
	});

	it("normalizes invalid target lines to no highlight", () => {
		expect(buildTextPreviewLines("one", 0)).toEqual([
			{ lineNumber: 1, text: "one", target: false },
		]);
	});

	it("uses the file response content kind and MIME type for workspace previews", () => {
		expect(
			resolveWorkspaceFilePreviewKind(
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
			resolveWorkspaceFilePreviewKind(
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
			resolveWorkspaceFilePreviewKind(
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
				resolveWorkspaceFilePreviewKind(
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

		expect(resolveWorkspaceHtmlSrcDoc(response)).toBe(response.content);
		expect(
			resolveWorkspaceHtmlSrcDoc({ ...response, truncated: true }),
		).toBeNull();
	});
});
