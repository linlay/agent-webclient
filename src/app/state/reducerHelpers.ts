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

export { upsertArtifact } from "@/features/artifacts/lib/artifactsState";
export { upsertFileChange } from "@/features/overview/lib/overviewState";
export { patchActiveAwaiting } from "@/features/tools/lib/toolsState";
