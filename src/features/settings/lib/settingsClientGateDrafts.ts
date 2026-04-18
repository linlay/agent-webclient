import type { VoiceClientGateConfig } from "@/app/state/types";

export type ClientGateDraftField =
	| "rmsThreshold"
	| "openHoldMs"
	| "closeHoldMs"
	| "preRollMs";

export type ClientGateDraftState = Record<ClientGateDraftField, string>;

export function formatClientGateDraftState(
	config: VoiceClientGateConfig,
): ClientGateDraftState {
	return {
		rmsThreshold: String(config.rmsThreshold),
		openHoldMs: String(config.openHoldMs),
		closeHoldMs: String(config.closeHoldMs),
		preRollMs: String(config.preRollMs),
	};
}

export function parseClientGateDraftValue(
	field: ClientGateDraftField,
	draft: string,
): number | null {
	const trimmed = draft.trim();
	if (!trimmed) {
		return null;
	}
	const parsed = Number(trimmed);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return null;
	}
	return field === "rmsThreshold" ? parsed : parsed;
}

export function syncClientGateDraftState(
	currentDrafts: ClientGateDraftState,
	config: VoiceClientGateConfig,
	activeField: ClientGateDraftField | null,
): ClientGateDraftState {
	const nextDrafts = formatClientGateDraftState(config);
	if (!activeField) {
		return nextDrafts;
	}
	return {
		...nextDrafts,
		[activeField]: currentDrafts[activeField],
	};
}

export function commitClientGateDraft(
	field: ClientGateDraftField,
	drafts: ClientGateDraftState,
	config: VoiceClientGateConfig,
): {
	nextDrafts: ClientGateDraftState;
	nextPatch: Partial<VoiceClientGateConfig> | null;
} {
	const parsed = parseClientGateDraftValue(field, drafts[field]);
	if (parsed == null) {
		return {
			nextDrafts: formatClientGateDraftState(config),
			nextPatch: null,
		};
	}
	const nextConfig = {
		...config,
		[field]: parsed,
	};
	return {
		nextDrafts: formatClientGateDraftState(nextConfig),
		nextPatch: {
			[field]: parsed,
		},
	};
}
