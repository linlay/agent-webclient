import type { AppAction } from "@/app/state/actions";
import type {
	ActiveAwaiting,
	FileChangeSummary,
	PublishedArtifact,
} from "@/app/state/types";

export { buildConversationResetState } from "@/app/state/conversationReset";

export function setMapValue<K, V>(source: Map<K, V>, key: K, value: V): Map<K, V> {
	const next = new Map(source);
	next.set(key, value);
	return next;
}

export function deleteMapValue<K, V>(source: Map<K, V>, key: K): Map<K, V> {
	if (!source.has(key)) {
		return source;
	}
	const next = new Map(source);
	next.delete(key);
	return next;
}

export function addSetValue<T>(source: Set<T>, value: T): Set<T> {
	if (source.has(value)) {
		return source;
	}
	const next = new Set(source);
	next.add(value);
	return next;
}

export function removeSetValue<T>(source: Set<T>, value: T): Set<T> {
	if (!source.has(value)) {
		return source;
	}
	const next = new Set(source);
	next.delete(value);
	return next;
}

export function toggleSetValue<T>(source: Set<T>, value: T): Set<T> {
	const next = new Set(source);
	if (next.has(value)) {
		next.delete(value);
	} else {
		next.add(value);
	}
	return next;
}

export function upsertArtifact(
	artifacts: PublishedArtifact[],
	artifact: PublishedArtifact,
): PublishedArtifact[] {
	const index = artifacts.findIndex(
		(item) => item.artifactId === artifact.artifactId,
	);
	if (index < 0) {
		return [...artifacts, artifact];
	}
	const next = artifacts.slice();
	next[index] = artifact;
	return next;
}

export function upsertFileChange(
	fileChanges: FileChangeSummary[],
	fileChange: FileChangeSummary,
): FileChangeSummary[] {
	const runId = String(fileChange.runId || "").trim();
	const filePath = String(fileChange.filePath || "").trim();
	if (!runId || !filePath) {
		return fileChanges;
	}
	const normalizedChange: FileChangeSummary = {
		runId,
		filePath,
		addedLines: Math.max(0, Number(fileChange.addedLines) || 0),
		deletedLines: Math.max(0, Number(fileChange.deletedLines) || 0),
		editedLines: Math.max(0, Number(fileChange.editedLines) || 0),
		operationCount: Math.max(1, Number(fileChange.operationCount) || 1),
		lastUpdatedAt:
			Number.isFinite(fileChange.lastUpdatedAt) && fileChange.lastUpdatedAt > 0
				? fileChange.lastUpdatedAt
				: Date.now(),
	};

	const index = fileChanges.findIndex(
		(item) => item.runId === runId && item.filePath === filePath,
	);
	if (index < 0) {
		return [...fileChanges, normalizedChange];
	}

	const current = fileChanges[index];
	const next = fileChanges.slice();
	next[index] = {
		runId,
		filePath,
		addedLines: current.addedLines + normalizedChange.addedLines,
		deletedLines: current.deletedLines + normalizedChange.deletedLines,
		editedLines: current.editedLines + normalizedChange.editedLines,
		operationCount: current.operationCount + normalizedChange.operationCount,
		lastUpdatedAt: Math.max(current.lastUpdatedAt, normalizedChange.lastUpdatedAt),
	};
	return next;
}

export function patchActiveAwaiting(
	current: ActiveAwaiting,
	patch: Extract<AppAction, { type: "PATCH_ACTIVE_AWAITING" }>["patch"],
): ActiveAwaiting {
	const resolutionPatch =
		patch.resolutionReason === "timeout" ||
		patch.resolutionReason === "remote_answered"
			? { resolutionReason: patch.resolutionReason }
			: patch.resolvedByOther === false
				? { resolutionReason: undefined }
				: {};

	if (current.mode === "form") {
		return {
			...current,
			...(typeof patch.resolvedByOther === "boolean"
				? { resolvedByOther: patch.resolvedByOther }
				: {}),
			...resolutionPatch,
			...(typeof patch.pendingSubmitId === "string"
				? { pendingSubmitId: patch.pendingSubmitId }
				: {}),
			...(typeof patch.loading === "boolean" ? { loading: patch.loading } : {}),
			...(typeof patch.loadError === "string"
				? { loadError: patch.loadError }
				: {}),
			...(typeof patch.viewportHtml === "string"
				? { viewportHtml: patch.viewportHtml }
				: {}),
		};
	}

	if (typeof patch.resolvedByOther === "boolean") {
		return {
			...current,
			resolvedByOther: patch.resolvedByOther,
			...resolutionPatch,
			...(typeof patch.pendingSubmitId === "string"
				? { pendingSubmitId: patch.pendingSubmitId }
				: {}),
		};
	}
	if (
		patch.resolutionReason === "timeout" ||
		patch.resolutionReason === "remote_answered"
	) {
		return {
			...current,
			resolutionReason: patch.resolutionReason,
		};
	}
	if (typeof patch.pendingSubmitId === "string") {
		return {
			...current,
			pendingSubmitId: patch.pendingSubmitId,
		};
	}

	return current;
}
