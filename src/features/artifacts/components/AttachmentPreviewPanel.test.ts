import {
	buildTextPreviewLines,
	resolveWorkspaceFilePreviewKind,
} from "@/features/artifacts/components/AttachmentPreviewPanel";

describe("buildTextPreviewLines", () => {
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
	});
});
