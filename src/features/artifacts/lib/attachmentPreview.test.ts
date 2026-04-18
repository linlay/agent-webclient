import {
	buildAttachmentPreviewState,
	canPreviewAttachment,
	getAttachmentPreviewKind,
} from "@/features/artifacts/lib/attachmentPreview";

describe("attachmentPreview", () => {
	it("detects common browser-previewable attachment kinds", () => {
		expect(
			getAttachmentPreviewKind({
				name: "diagram.png",
				mimeType: "image/png",
				url: "/resource/diagram.png",
			}),
		).toBe("image");

		expect(
			getAttachmentPreviewKind({
				name: "guide.pdf",
				mimeType: "application/pdf",
				url: "/resource/guide.pdf",
			}),
		).toBe("pdf");

		expect(
			getAttachmentPreviewKind({
				name: "notes.md",
				mimeType: "text/markdown",
				url: "/resource/notes.md",
			}),
		).toBe("text");

		expect(
			getAttachmentPreviewKind({
				name: "clip.mp3",
				mimeType: "audio/mpeg",
				url: "/resource/clip.mp3",
			}),
		).toBe("audio");

		expect(
			getAttachmentPreviewKind({
				name: "demo.mp4",
				mimeType: "video/mp4",
				url: "/resource/demo.mp4",
			}),
		).toBe("video");
	});

	it("marks unsupported attachments for download fallback", () => {
		expect(
			canPreviewAttachment({
				name: "archive.zip",
				mimeType: "application/zip",
				url: "/resource/archive.zip",
			}),
		).toBe(false);
	});

	it("builds preview state from preview urls when available", () => {
		expect(
			buildAttachmentPreviewState({
				name: "draft.txt",
				mimeType: "text/plain",
				url: "/resource/draft.txt",
				previewUrl: "blob:draft-preview",
				size: 128,
			}),
		).toEqual({
			name: "draft.txt",
			url: "blob:draft-preview",
			downloadUrl: "/resource/draft.txt",
			mimeType: "text/plain",
			size: 128,
			type: undefined,
			kind: "text",
		});
	});
});
