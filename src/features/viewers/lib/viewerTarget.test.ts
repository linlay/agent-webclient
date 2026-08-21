import {
	buildResourceViewerTarget,
	buildResourceViewerTargetFromUrl,
	detectViewerContentKind,
	isViewerContentSupported,
} from "@/features/viewers/lib/viewerTarget";

describe("viewerTarget", () => {
	it("detects common browser-viewable content kinds", () => {
		expect(
			detectViewerContentKind({
				name: "diagram.png",
				mimeType: "image/png",
				url: "/resource/diagram.png",
			}),
		).toBe("image");

		expect(
			detectViewerContentKind({
				name: "guide.pdf",
				mimeType: "application/pdf",
				url: "/resource/guide.pdf",
			}),
		).toBe("pdf");

		expect(
			detectViewerContentKind({
				name: "notes.md",
				mimeType: "text/markdown",
				url: "/resource/notes.md",
			}),
		).toBe("text");

		expect(
			detectViewerContentKind({
				name: "report.html",
				mimeType: "text/html; charset=utf-8",
				url: "/resource/report.html",
			}),
		).toBe("html");

		expect(
			detectViewerContentKind({
				name: "clip.mp3",
				mimeType: "audio/mpeg",
				url: "/resource/clip.mp3",
			}),
		).toBe("audio");

		expect(
			detectViewerContentKind({
				name: "demo.mp4",
				mimeType: "video/mp4",
				url: "/resource/demo.mp4",
			}),
		).toBe("video");
	});

	it("marks Office and unknown resources as unsupported", () => {
		expect(
			isViewerContentSupported(detectViewerContentKind({
				name: "archive.zip",
				mimeType: "application/zip",
				url: "/resource/archive.zip",
			})),
		).toBe(false);
		expect(
			isViewerContentSupported(detectViewerContentKind({
				name: "brief.docx",
				url: "artifacts/run_1/brief.docx",
			})),
		).toBe(false);
	});

	it("keeps unsupported resources in Viewer state", () => {
		expect(
			buildResourceViewerTarget({
				name: "archive.zip",
				mimeType: "application/zip",
				url: "artifacts/run_1/archive.zip",
			}),
		).toMatchObject({
			name: "archive.zip",
			url: "artifacts/run_1/archive.zip",
			downloadUrl: "artifacts/run_1/archive.zip",
			type: "resource",
			contentKind: "unsupported",
		});
	});

	it("builds a decoded ChatScope Resource Viewer state", () => {
		expect(
			buildResourceViewerTargetFromUrl(
				"artifacts/msx9nzkm/%E7%81%AF%E4%B8%8B.md",
			),
		).toEqual({
			name: "灯下.md",
			url: "artifacts/msx9nzkm/%E7%81%AF%E4%B8%8B.md",
			downloadUrl: "artifacts/msx9nzkm/%E7%81%AF%E4%B8%8B.md",
			type: "resource",
			contentKind: "text",
		});
	});

	it("routes Office documents to a download-only content kind", () => {
		expect(
			detectViewerContentKind({
				name: "brief.ppt",
				mimeType: "text/plain",
				url: "/resource/brief.ppt",
			}),
		).toBe("office");

		expect(
			detectViewerContentKind({
				name: "draft.docx",
				mimeType:
					"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				url: "/resource/draft.docx",
			}),
		).toBe("office");

		expect(
			detectViewerContentKind({
				name: "budget.xlsx",
				mimeType: "application/octet-stream",
				url: "/resource/budget.xlsx",
			}),
		).toBe("office");
	});

	it("builds a Resource Viewer target with separate content and download URLs", () => {
		expect(
			buildResourceViewerTarget({
				name: "draft.txt",
				mimeType: "text/plain",
				url: "blob:draft-viewer",
				downloadUrl: "/resource/draft.txt",
				sizeBytes: 128,
			}),
		).toEqual({
			name: "draft.txt",
			url: "blob:draft-viewer",
			downloadUrl: "/resource/draft.txt",
			mimeType: "text/plain",
			sizeBytes: 128,
			resourceType: undefined,
			type: "resource",
			contentKind: "text",
		});
	});

	it("keeps resource size metadata in the Viewer target", () => {
		expect(
			buildResourceViewerTarget({
				name: "artifact.pdf",
				mimeType: "application/pdf",
				url: "/resource/artifact.pdf",
				sizeBytes: 4096,
			})?.sizeBytes,
		).toBe(4096);
	});
});
