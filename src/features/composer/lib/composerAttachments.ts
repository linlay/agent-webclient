import type { Dispatch, SetStateAction } from "react";
import type { AppAction } from "@/app/state/actions";
import type { AppState } from "@/app/state/types";
import {
	createRequestId,
	extractUploadChatId,
	extractUploadReferences,
	uploadFile,
} from "@/shared/data";
import {
	formatAttachmentSize,
	getAttachmentKind,
	getAttachmentKindLabel,
} from "@/features/artifacts/lib/attachmentUtils";
import { normalizeTimelineAttachments } from "@/features/artifacts/lib/timelineAttachments";
import { resolvePreferredAgentKey } from "@/features/composer/lib/queryRouting";
import { t as runtimeT } from "@/shared/i18n";
import type { TranslateParams } from "@/shared/i18n";

type Translate = (key: string, params?: TranslateParams) => string;

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

export interface ComposerContextReferenceInput {
	type: "chat" | "site";
	id: string;
	name: string;
	url?: string;
	meta?: Record<string, unknown>;
}

export interface ComposerRequiredSkill {
	key: string;
	label: string;
}

export function createComposerContextAttachment(
	reference: ComposerContextReferenceInput,
): ComposerAttachment {
	const normalizedReference = {
		type: reference.type,
		id: String(reference.id || "").trim(),
		name: String(reference.name || "").trim(),
		...(String(reference.url || "").trim()
			? { url: String(reference.url || "").trim() }
			: {}),
		...(reference.meta ? { meta: { ...reference.meta } } : {}),
	};
	return {
		id: `${normalizedReference.type}:${normalizedReference.id}`,
		name: normalizedReference.name,
		size: 0,
		type: normalizedReference.type,
		resourceUrl: normalizedReference.url,
		status: "ready",
		error: "",
		references: [normalizedReference],
	};
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
	t: Translate = runtimeT,
): string {
	if (attachment.type === "chat") {
		return t("composer.reference.kind.chat");
	}
	if (attachment.type === "site") {
		return t("composer.reference.kind.site");
	}
	if (attachment.status === "error") {
		return attachment.error || t("attachments.error.uploadFailed");
	}

	if (attachment.status === "uploading") {
		return t("attachments.status.uploadingWithType", {
			kind: getAttachmentKindLabel(attachment, t),
		});
	}

	const sizeText = formatAttachmentSize(attachment.size);
	if (showReadyMeta) {
		return sizeText
			? `${getAttachmentKindLabel(attachment, t)} · ${sizeText}`
			: getAttachmentKindLabel(attachment, t);
	}

	if (getAttachmentKind(attachment) === "image") {
		return "";
	}

	return sizeText
		? `${getAttachmentKindLabel(attachment, t)} · ${sizeText}`
		: getAttachmentKindLabel(attachment, t);
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

function getAttachmentNameKey(name: string): string {
	return String(name || "").trim();
}

export function keepLatestFilesByName(files: File[]): File[] {
	const seen = new Set<string>();
	const latestFiles: File[] = [];

	for (let index = files.length - 1; index >= 0; index -= 1) {
		const file = files[index];
		const nameKey = getAttachmentNameKey(file.name);
		if (!nameKey || seen.has(nameKey)) {
			continue;
		}
		seen.add(nameKey);
		latestFiles.push(file);
	}

	return latestFiles.reverse();
}

export function getComposerAttachmentNameKey(
	attachment: Pick<ComposerAttachment, "name">,
): string {
	return getAttachmentNameKey(attachment.name);
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
	isLatestAttachment?: (attachment: ComposerAttachment) => boolean;
}): Promise<void> {
	const {
		files,
		nextAttachments,
		attachmentChatId,
		state,
		dispatch,
		setAttachments,
		setAttachmentChatId,
		isLatestAttachment,
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
			if (isLatestAttachment && !isLatestAttachment(attachment)) {
				continue;
			}
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
				throw new Error(runtimeT("attachments.error.noFileRef"));
			}
			const [normalizedAttachment] = normalizeTimelineAttachments(references);
			const attachmentType = getAttachmentKind({
				name: normalizedAttachment?.name || attachment.name,
				mimeType: normalizedAttachment?.mimeType || attachment.mimeType,
				type: normalizedAttachment?.type || attachment.type,
			});
			setAttachments((current) =>
				current.map((item) =>
					item.id === attachment.id
						? {
								...item,
								size: normalizedAttachment?.size ?? item.size,
								type: attachmentType,
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
								error: (error as Error).message || runtimeT("attachments.error.uploadFailed"),
								references: [],
						  }
						: item,
				),
			);
		}
	}
}
