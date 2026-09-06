import { getViewerTargetKey } from "@/features/viewers/lib/viewerTarget";
import type { ViewerTarget } from "@/features/viewers/lib/viewerTarget";
import type { TimelineSource } from "@/features/timeline/lib/timelineState";

export type RightSidebarTabKey =
  | "overview"
  | "btw"
  | "debug"
  | "viewer"
  | "sourceDetail"
  | "planningPreview"
  | "web"
  | "skill";

export interface PlanningPreviewState {
  nodeId: string;
  label: string;
}

export interface WebPreviewState {
  title: string;
  url: string;
}

export interface SkillViewerState {
  key: string;
  label: string;
}

export interface ViewersState {
  rightSidebarOpen: boolean;
  rightSidebarOpenTab: RightSidebarTabKey | null;
  activeSourceDetail: TimelineSource | null;
  planningPreviews: PlanningPreviewState[];
  webPreviews: WebPreviewState[];
  webPreviewRefreshRevisionByUrl: Map<string, number>;
  activeWebPreviewUrl: string;
  activeViewerKey: string;
  activePlanningPreviewNodeId: string;
  skillTabs: SkillViewerState[];
  activeSkillKey: string;
  viewerTabs: ViewerTarget[];
}

export type ViewersAction =
  | { type: "OPEN_RIGHT_SIDEBAR"; tab?: RightSidebarTabKey; viewerTarget?: ViewerTarget | null; removeViewerKey?: string; sourceDetail?: TimelineSource | null; planningPreview?: PlanningPreviewState | null; removePlanningPreviewNodeId?: string; webPreview?: WebPreviewState | null; activeWebPreviewUrl?: string; removeWebPreviewUrl?: string; activeViewerKey?: string; activePlanningPreviewNodeId?: string; skillPreview?: SkillViewerState | null; removeSkillKey?: string; activeSkillKey?: string }
  | { type: "REFRESH_WEB_PREVIEW"; url: string }
  | { type: "CLOSE_WEB_PREVIEW"; url: string }
  | { type: "CLOSE_RIGHT_SIDEBAR" };

export function createInitialViewersState(): ViewersState {
  return { rightSidebarOpen: false, rightSidebarOpenTab: null, activeSourceDetail: null, planningPreviews: [], webPreviews: [], webPreviewRefreshRevisionByUrl: new Map(), activeWebPreviewUrl: "", activeViewerKey: "", activePlanningPreviewNodeId: "", skillTabs: [], activeSkillKey: "", viewerTabs: [] };
}

export function reduceViewersState<S extends ViewersState>(state: S, action: ViewersAction): S;
export function reduceViewersState<S extends ViewersState>(state: S, action: { type: string }): S | null;
export function reduceViewersState<S extends ViewersState>(state: S, input: { type: string }): S | null {
  const action = input as ViewersAction;
  switch (action.type) {
    case "REFRESH_WEB_PREVIEW": {
      if (!state.webPreviews.some((preview) => preview.url === action.url)) {
        return state;
      }
      const nextRevisions = new Map(state.webPreviewRefreshRevisionByUrl);
      nextRevisions.set(
        action.url,
        (nextRevisions.get(action.url) ?? 0) + 1,
      );
      return { ...state, webPreviewRefreshRevisionByUrl: nextRevisions };
    }
    case "CLOSE_WEB_PREVIEW": {
      if (!state.webPreviews.some((preview) => preview.url === action.url)) {
        return state;
      }
      const webPreviews = state.webPreviews.filter(
        (preview) => preview.url !== action.url,
      );
      const webPreviewRefreshRevisionByUrl = new Map(
        state.webPreviewRefreshRevisionByUrl,
      );
      webPreviewRefreshRevisionByUrl.delete(action.url);
      const wasActive = state.activeWebPreviewUrl === action.url;
      return {
        ...state,
        webPreviews,
        webPreviewRefreshRevisionByUrl,
        activeWebPreviewUrl: wasActive
          ? webPreviews[webPreviews.length - 1]?.url || ""
          : state.activeWebPreviewUrl,
        rightSidebarOpenTab:
          wasActive && webPreviews.length === 0 && state.rightSidebarOpenTab === "web"
            ? "overview"
            : state.rightSidebarOpenTab,
      };
    }
    case "OPEN_RIGHT_SIDEBAR": {
      const hasViewerTarget = Object.prototype.hasOwnProperty.call(action, "viewerTarget");
      const hasSourceDetail = Object.prototype.hasOwnProperty.call(action, "sourceDetail");
      const hasPlanningPreview = Object.prototype.hasOwnProperty.call(action, "planningPreview");
      const hasWebPreview = Object.prototype.hasOwnProperty.call(action, "webPreview");
      const hasActiveWebPreviewUrl = Object.prototype.hasOwnProperty.call(
        action,
        "activeWebPreviewUrl",
      );
      const removeViewerKey = Object.prototype.hasOwnProperty.call(action, "removeViewerKey")
        ? action.removeViewerKey
        : undefined;
      const removePlanningPreviewNodeId = Object.prototype.hasOwnProperty.call(action, "removePlanningPreviewNodeId")
        ? action.removePlanningPreviewNodeId
        : undefined;
      const removeWebPreviewUrl = Object.prototype.hasOwnProperty.call(action, "removeWebPreviewUrl")
        ? action.removeWebPreviewUrl
        : undefined;
      const hasActiveViewerKey = Object.prototype.hasOwnProperty.call(
        action,
        "activeViewerKey",
      );
      const hasActivePlanningPreviewNodeId = Object.prototype.hasOwnProperty.call(
        action,
        "activePlanningPreviewNodeId",
      );
      const hasSkillPreview = Object.prototype.hasOwnProperty.call(action, "skillPreview");
      const removeSkillKey = Object.prototype.hasOwnProperty.call(action, "removeSkillKey")
        ? action.removeSkillKey
        : undefined;
      const hasActiveSkillKey = Object.prototype.hasOwnProperty.call(action, "activeSkillKey");
      let nextViewerTabs = state.viewerTabs;
      if (removeViewerKey) {
        nextViewerTabs = nextViewerTabs.filter(
          (target) => getViewerTargetKey(target) !== removeViewerKey,
        );
      } else {
        const incomingTarget = hasViewerTarget ? action.viewerTarget : undefined;
        if (incomingTarget) {
          const incomingKey = getViewerTargetKey(incomingTarget);
          const existingIndex = nextViewerTabs.findIndex(
            (target) => getViewerTargetKey(target) === incomingKey,
          );
          if (existingIndex >= 0) {
            nextViewerTabs = [...nextViewerTabs];
            nextViewerTabs[existingIndex] = incomingTarget;
          } else {
            nextViewerTabs = [...nextViewerTabs, incomingTarget];
          }
        } else if (hasViewerTarget) {
          nextViewerTabs = [];
        }
      }
      let nextActiveViewerKey = state.activeViewerKey;
      if (removeViewerKey) {
        if (nextActiveViewerKey === removeViewerKey) {
          const lastTarget = nextViewerTabs[nextViewerTabs.length - 1];
          nextActiveViewerKey = lastTarget ? getViewerTargetKey(lastTarget) : "";
        }
      } else {
        const incomingTarget = hasViewerTarget ? action.viewerTarget : undefined;
        if (incomingTarget) {
          nextActiveViewerKey = getViewerTargetKey(incomingTarget);
        } else if (hasActiveViewerKey) {
          nextActiveViewerKey = String(action.activeViewerKey || "");
        }
      }
      let nextPlanningPreviews = state.planningPreviews;
      if (removePlanningPreviewNodeId) {
        nextPlanningPreviews = nextPlanningPreviews.filter(
          (p) => p.nodeId !== removePlanningPreviewNodeId,
        );
      } else {
        const incomingPlanning = hasPlanningPreview ? action.planningPreview : undefined;
        if (incomingPlanning) {
          const existingIndex = nextPlanningPreviews.findIndex(
            (p) => p.nodeId === incomingPlanning.nodeId,
          );
          if (existingIndex >= 0) {
            nextPlanningPreviews = nextPlanningPreviews
              .filter((_, i) => i !== existingIndex)
              .concat(incomingPlanning);
          } else {
            nextPlanningPreviews = [...nextPlanningPreviews, incomingPlanning];
          }
        } else if (hasPlanningPreview) {
          nextPlanningPreviews = [];
        }
      }
      let nextActivePlanningPreviewNodeId = state.activePlanningPreviewNodeId;
      if (removePlanningPreviewNodeId) {
        if (nextActivePlanningPreviewNodeId === removePlanningPreviewNodeId) {
          nextActivePlanningPreviewNodeId =
            nextPlanningPreviews[nextPlanningPreviews.length - 1]?.nodeId || "";
        }
      } else {
        const incomingPlanning = hasPlanningPreview ? action.planningPreview : undefined;
        if (incomingPlanning) {
          nextActivePlanningPreviewNodeId = incomingPlanning.nodeId;
        } else if (hasActivePlanningPreviewNodeId) {
          nextActivePlanningPreviewNodeId = String(action.activePlanningPreviewNodeId || "");
        }
      }
      let nextWebPreviews = state.webPreviews;
      let nextActiveWebPreviewUrl = state.activeWebPreviewUrl;
      let nextWebPreviewRefreshRevisionByUrl =
        state.webPreviewRefreshRevisionByUrl;
      if (removeWebPreviewUrl) {
        nextWebPreviews = nextWebPreviews.filter(
          (preview) => preview.url !== removeWebPreviewUrl,
        );
        if (nextWebPreviewRefreshRevisionByUrl.has(removeWebPreviewUrl)) {
          nextWebPreviewRefreshRevisionByUrl = new Map(
            nextWebPreviewRefreshRevisionByUrl,
          );
          nextWebPreviewRefreshRevisionByUrl.delete(removeWebPreviewUrl);
        }
        if (nextActiveWebPreviewUrl === removeWebPreviewUrl) {
          nextActiveWebPreviewUrl =
            nextWebPreviews[nextWebPreviews.length - 1]?.url || "";
        }
      } else {
        const incomingWebPreview = hasWebPreview
          ? action.webPreview
          : undefined;
        if (incomingWebPreview) {
          const existingIndex = nextWebPreviews.findIndex(
            (preview) => preview.url === incomingWebPreview.url,
          );
          if (existingIndex >= 0) {
            nextWebPreviews = [...nextWebPreviews];
            nextWebPreviews[existingIndex] = incomingWebPreview;
          } else {
            nextWebPreviews = [...nextWebPreviews, incomingWebPreview];
          }
          nextActiveWebPreviewUrl = incomingWebPreview.url;
        } else if (hasWebPreview) {
          nextWebPreviews = [];
          nextActiveWebPreviewUrl = "";
        }
      }
      if (hasActiveWebPreviewUrl) {
        const requestedActiveUrl = String(action.activeWebPreviewUrl || "");
        nextActiveWebPreviewUrl = nextWebPreviews.some(
          (preview) => preview.url === requestedActiveUrl,
        )
          ? requestedActiveUrl
          : nextActiveWebPreviewUrl;
      }
      let nextSkillTabs = state.skillTabs;
      let nextActiveSkillKey = state.activeSkillKey;
      if (removeSkillKey) {
        nextSkillTabs = nextSkillTabs.filter((s) => s.key !== removeSkillKey);
        if (nextActiveSkillKey === removeSkillKey) {
          nextActiveSkillKey = nextSkillTabs[nextSkillTabs.length - 1]?.key || "";
        }
      } else {
        const incomingSkillPreview = hasSkillPreview ? action.skillPreview : undefined;
        if (incomingSkillPreview) {
          const existingIndex = nextSkillTabs.findIndex(
            (s) => s.key === incomingSkillPreview.key,
          );
          if (existingIndex >= 0) {
            nextSkillTabs = [...nextSkillTabs];
            nextSkillTabs[existingIndex] = incomingSkillPreview;
          } else {
            nextSkillTabs = [...nextSkillTabs, incomingSkillPreview];
          }
          nextActiveSkillKey = incomingSkillPreview.key;
        } else if (hasSkillPreview) {
          nextSkillTabs = [];
          nextActiveSkillKey = "";
        }
      }
      if (hasActiveSkillKey) {
        const requestedActiveKey = String(action.activeSkillKey || "");
        if (nextSkillTabs.some((s) => s.key === requestedActiveKey)) {
          nextActiveSkillKey = requestedActiveKey;
        }
      }
      return {
        ...state,
        rightSidebarOpen: true,
        rightSidebarOpenTab: action.tab ?? null,
        viewerTabs: nextViewerTabs,
        planningPreviews: nextPlanningPreviews,
        webPreviews: nextWebPreviews,
        webPreviewRefreshRevisionByUrl:
          nextWebPreviewRefreshRevisionByUrl,
        activeWebPreviewUrl: nextActiveWebPreviewUrl,
        activeSourceDetail: hasSourceDetail
          ? action.sourceDetail ?? null
          : state.activeSourceDetail,
        activeViewerKey: nextActiveViewerKey,
        activePlanningPreviewNodeId: nextActivePlanningPreviewNodeId,
        skillTabs: nextSkillTabs,
        activeSkillKey: nextActiveSkillKey,
      };
    }
    case "CLOSE_RIGHT_SIDEBAR":
      return {
        ...state,
        rightSidebarOpen: false,
        rightSidebarOpenTab: null,
        activeSourceDetail: null,
      };
    default: return null;
  }
}
