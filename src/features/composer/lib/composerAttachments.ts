import type { Dispatch, SetStateAction } from "react";
import type { AppAction } from "@/app/state/actions";
import type { AppState } from "@/app/state/types";
import {
	createRequestId,
	extractUploadChatId,
	extractUploadReferences,
	uploadFile,
} from "@/shared/api/apiClient";
import {
	formatAttachmentSize,
	getAttachmentKind,
	getAttachmentKindLabel,
} from "@/features/artifacts/lib/attachmentUtils";
import { normalizeTimelineAttachments } from "@/features/artifacts/lib/timelineAttachments";
import { resolvePreferredAgentKey } from "@/features/composer/lib/queryRouting";

export interface ComposerAttachment {
	id: string;
	name: string;
	size: number;
	type?: string;
	mimeType?: string;
	resourceUrl?: string;
	previewUrl?: string;
	status: "uploading" | "ready" | "error";
	error: string;
	references: unknown[];
}

export function createAttachmentPreviewUrl(file: File): string {
	if (getAttachmentKind({ name: file.name, mimeType: file.type }) !== "image") {
		return "";
	}

	if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
		return "";
	}

	try {
		return URL.createObjectURL(file);
	} catch {
		return "";
	}
}

export function revokeAttachmentPreviewUrl(previewUrl?: string): void {
	if (
		!previewUrl ||
		!previewUrl.startsWith("blob:") ||
		typeof URL === "undefined" ||
		typeof URL.revokeObjectURL !== "function"
	) {
		return;
	}

	URL.revokeObjectURL(previewUrl);
}

export function getComposerAttachmentSubtitle(
	attachment: ComposerAttachment,
	showReadyMeta = false,
): string {
	if (attachment.status === "error") {
		return attachment.error || "上传失败";
	}

	if (attachment.status === "uploading") {
		return `${getAttachmentKindLabel(attachment)}上传中...`;
	}

	const sizeText = formatAttachmentSize(attachment.size);
	if (showReadyMeta) {
		return sizeText
			? `${getAttachmentKindLabel(attachment)} · ${sizeText}`
			: getAttachmentKindLabel(attachment);
	}

	if (getAttachmentKind(attachment) === "image") {
		return "";
	}

	return sizeText
		? `${getAttachmentKindLabel(attachment)} · ${sizeText}`
		: getAttachmentKindLabel(attachment);
}

export function createPendingComposerAttachments(
	files: File[],
): ComposerAttachment[] {
	return files.map((file) => ({
		id: createRequestId("upload"),
		name: file.name,
		size: file.size,
		type: getAttachmentKind({
			name: file.name,
			mimeType: file.type,
		}),
		mimeType: file.type || undefined,
		resourceUrl: "",
		previewUrl: createAttachmentPreviewUrl(file),
		status: "uploading",
		error: "",
		references: [],
	}));
}

export async function uploadComposerAttachments(input: {
	files: File[];
	nextAttachments: ComposerAttachment[];
	attachmentChatId: string;
	state: Pick<
		AppState,
		| "chatId"
		| "chatAgentById"
		| "pendingNewChatAgentKey"
		| "workerSelectionKey"
		| "workerIndexByKey"
	>;
	dispatch: Dispatch<AppAction>;
	setAttachments: Dispatch<SetStateAction<ComposerAttachment[]>>;
	setAttachmentChatId: Dispatch<SetStateAction<string>>;
}): Promise<void> {
	const {
		files,
		nextAttachments,
		attachmentChatId,
		state,
		dispatch,
		setAttachments,
		setAttachmentChatId,
	} = input;

	let nextChatId = String(state.chatId || attachmentChatId || "").trim();
	for (const [index, attachment] of nextAttachments.entries()) {
		const file = files[index];
		try {
			const response = await uploadFile({
				file,
				filename: file.name,
				requestId: attachment.id,
				chatId: nextChatId || undefined,
			});
			const responseChatId = extractUploadChatId(response.data);
			if (responseChatId) {
				nextChatId = responseChatId;
				setAttachmentChatId(responseChatId);
				if (!String(state.chatId || "").trim()) {
					const currentAgentKey = resolvePreferredAgentKey({
						chatId: state.chatId,
						chatAgentById: state.chatAgentById,
						pendingNewChatAgentKey: state.pendingNewChatAgentKey,
						workerSelectionKey: state.workerSelectionKey,
						workerIndexByKey: state.workerIndexByKey,
					});
					if (currentAgentKey) {
						dispatch({
							type: "SET_PENDING_NEW_CHAT_AGENT_KEY",
							agentKey: currentAgentKey,
						});
						dispatch({
							type: "SET_CHAT_AGENT_BY_ID",
							chatId: responseChatId,
							agentKey: currentAgentKey,
						});
					}
				}
			}
			const references = extractUploadReferences(response.data);
			if (references.length === 0) {
				throw new Error("上传成功，但接口未返回可用的文件引用");
			}
			const [normalizedAttachment] = normalizeTimelineAttachments(references);
			setAttachments((current) =>
				current.map((item) =>
					item.id === attachment.id
						? {
								...item,
								size: normalizedAttachment?.size ?? item.size,
								type: normalizedAttachment?.type || item.type,
								mimeType: normalizedAttachment?.mimeType || item.mimeType,
								resourceUrl: normalizedAttachment?.url || item.resourceUrl,
								status: "ready",
								error: "",
								references,
						  }
						: item,
				),
			);
		} catch (error) {
			setAttachments((current) =>
				current.map((item) =>
					item.id === attachment.id
						? {
								...item,
								status: "error",
								error: (error as Error).message || "上传失败",
								references: [],
						  }
						: item,
				),
			);
		}
	}
}
