import type { AppAction } from "@/app/state/actions";
import type { ActiveAwaiting, AppState, PublishedArtifact } from "@/app/state/types";

export function buildConversationResetState(
	state: AppState,
	options: { preserveWorkerContext?: boolean } = {},
): AppState {
	const preserveWorkerContext = Boolean(options.preserveWorkerContext);
	return {
		...state,
		runId: "",
		requestId: "",
		streaming: false,
		abortController: null,
		messagesById: new Map(),
		messageOrder: [],
		events: [],
		artifacts: [],
		plan: null,
		planRuntimeByTaskId: new Map(),
		taskItemsById: new Map(),
		taskGroupsById: new Map(),
		activeTaskIds: new Set(),
		agentGroupsByGroupId: new Map(),
		groupIdByTaskId: new Map(),
		groupIdByMainToolId: new Map(),
		planCurrentRunningTaskId: "",
		planLastTouchedTaskId: "",
		artifactExpanded: false,
		artifactManualOverride: null,
		artifactAutoCollapseTimer: null,
		planExpanded: false,
		planManualOverride: null,
		planAutoCollapseTimer: null,
		toolStates: new Map(),
		toolNodeById: new Map(),
		contentNodeById: new Map(),
		pendingTools: new Map(),
		reasoningNodeById: new Map(),
		reasoningCollapseTimers: new Map(),
		actionStates: new Map(),
		executedActionIds: new Set(),
		timelineNodes: new Map(),
		timelineOrder: [],
		timelineNodeByMessageId: new Map(),
		timelineDomCache: new Map(),
		timelineCounter: 0,
		renderQueue: {
			dirtyNodeIds: new Set(),
			scheduled: false,
			stickToBottomRequested: false,
			fullSyncNeeded: false,
		},
		activeReasoningKey: "",
		activeFrontendTool: null,
		activeAwaiting: null,
		attachmentPreview: null,
		inputMode: "text",
		voiceChat: {
			...state.voiceChat,
			status: "idle",
			sessionActive: false,
			partialUserText: "",
			partialAssistantText: "",
			activeAssistantContentId: "",
			activeRequestId: "",
			activeTtsTaskId: "",
			ttsCommitted: false,
			error: "",
			wsStatus: "idle",
			currentAgentKey: "",
			currentAgentName: "",
		},
		workerRelatedChats: preserveWorkerContext ? state.workerRelatedChats : [],
		workerChatPanelCollapsed: preserveWorkerContext
			? state.workerChatPanelCollapsed
			: true,
		steerDraft: "",
		pendingSteers: [],
		downvotedRunKeys: new Set(),
		eventPopoverIndex: -1,
		eventPopoverEventRef: null,
		eventPopoverAnchor: null,
		commandStatusOverlay: {
			visible: false,
			commandType: null,
			phase: "success",
			text: "",
			timer: null,
		},
		commandModal: {
			open: false,
			type: null,
			searchText: "",
			historySearch: "",
			activeIndex: 0,
			scope: "all",
			focusArea: "search",
			scheduleTask: "",
			scheduleRule: "",
		},
	};
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

export function patchActiveAwaiting(
	current: ActiveAwaiting,
	patch: Extract<AppAction, { type: "PATCH_ACTIVE_AWAITING" }>["patch"],
): ActiveAwaiting {
	if (current.mode === "form") {
		return {
			...current,
			...(typeof patch.resolvedByOther === "boolean"
				? { resolvedByOther: patch.resolvedByOther }
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
		};
	}

	return current;
}
