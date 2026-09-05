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

export function reduceViewersState(state: ViewersState, action: ViewersAction): ViewersState {
  switch (action.type) {
    case "CLOSE_RIGHT_SIDEBAR": return { ...state, rightSidebarOpen: false };
    case "CLOSE_WEB_PREVIEW": return { ...state, webPreviews: state.webPreviews.filter((item) => item.url !== action.url) };
    case "REFRESH_WEB_PREVIEW": return { ...state, webPreviewRefreshRevisionByUrl: new Map(state.webPreviewRefreshRevisionByUrl).set(action.url, (state.webPreviewRefreshRevisionByUrl.get(action.url) || 0) + 1) };
    case "OPEN_RIGHT_SIDEBAR": return { ...state, rightSidebarOpen: true, rightSidebarOpenTab: action.tab ?? state.rightSidebarOpenTab };
  }
}
