import {
	keepLatestFilesByName,
	uploadComposerAttachments,
} from "@/features/composer/lib/composerAttachments";
import { uploadFile } from "@/shared/api/apiClient";

jest.mock("@/shared/api/apiClient", () => ({
	createRequestId: jest.fn((prefix: string) => `${prefix}_mock`),
	extractUploadChatId: jest.fn(
		(data: { chatId?: string }) => data.chatId || "",
	),
	extractUploadReferences: jest.fn(
		(data: { references?: unknown[] }) => data.references || [],
	),
	uploadFile: jest.fn(),
}));

function fileNamed(name: string): File {
	return { name } as File;
}

describe("composerAttachments", () => {
	it("keeps the latest file when selected attachments share a name", () => {
		const firstReport = fileNamed("report.pdf");
		const notes = fileNamed("notes.md");
		const latestReport = fileNamed("report.pdf");

		expect(
			keepLatestFilesByName([firstReport, notes, latestReport]),
		).toEqual([notes, latestReport]);
	});

	it("ignores stale upload responses for replaced attachments", async () => {
		const staleAttachment = {
			id: "upload_old",
			name: "report.pdf",
			size: 10,
			type: "file",
			resourceUrl: "",
			previewUrl: "",
			status: "uploading" as const,
			error: "",
			references: [],
		};
		const setAttachments = jest.fn();
		const setAttachmentChatId = jest.fn();
		(uploadFile as jest.Mock).mockResolvedValueOnce({
			data: {
				chatId: "chat_old",
				references: [{ name: "report.pdf", url: "/old" }],
			},
		});

		await uploadComposerAttachments({
			files: [fileNamed("report.pdf")],
			nextAttachments: [staleAttachment],
			attachmentChatId: "",
			state: {
				chatId: "",
				chatAgentById: {},
				pendingNewChatAgentKey: "",
				workerSelectionKey: "",
				workerIndexByKey: {},
			},
			dispatch: jest.fn(),
			setAttachments,
			setAttachmentChatId,
			isLatestAttachment: () => false,
		});

		expect(setAttachmentChatId).not.toHaveBeenCalled();
		expect(setAttachments).not.toHaveBeenCalled();
	});

	it("keeps uploaded images as image attachments when the backend returns file type", async () => {
		const imageAttachment = {
			id: "upload_img",
			name: "photo.png",
			size: 3,
			type: "image",
			mimeType: "image/png",
			resourceUrl: "",
			previewUrl: "blob:photo",
			status: "uploading" as const,
			error: "",
			references: [],
		};
		const setAttachments = jest.fn((updater) => {
			const next = updater([imageAttachment]);
			expect(next[0]).toMatchObject({
				type: "image",
				mimeType: "image/png",
				resourceUrl: "/api/resource?file=chat_1%2Fphoto.png",
				status: "ready",
			});
		});
		(uploadFile as jest.Mock).mockResolvedValueOnce({
			data: {
				chatId: "chat_1",
				references: [
					{
						name: "photo.png",
						type: "file",
						mimeType: "image/png",
						url: "/api/resource?file=chat_1%2Fphoto.png",
					},
				],
			},
		});

		await uploadComposerAttachments({
			files: [fileNamed("photo.png")],
			nextAttachments: [imageAttachment],
			attachmentChatId: "",
			state: {
				chatId: "chat_1",
				chatAgentById: {},
				pendingNewChatAgentKey: "",
				workerSelectionKey: "",
				workerIndexByKey: {},
			},
			dispatch: jest.fn(),
			setAttachments,
			setAttachmentChatId: jest.fn(),
		});

		expect(setAttachments).toHaveBeenCalledTimes(1);
	});
});
