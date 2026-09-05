import type { UiTimerHandle } from "@/shared/contracts/ui";

export interface ResourceFile {
  mimeType: string;
  name: string;
  sha256: string;
  sizeBytes: number;
  type: "file";
  url: string;
}

export interface ArtifactFile extends ResourceFile {
  artifactId?: string;
}

export interface PublishedArtifact {
  artifactId: string;
  artifact: ResourceFile;
  timestamp: number;
}

export interface ArtifactsState {
  artifacts: PublishedArtifact[];
  artifactExpanded: boolean;
  artifactManualOverride: boolean | null;
  artifactAutoCollapseTimer: UiTimerHandle | null;
}

export type ArtifactsAction =
  | { type: "UPSERT_ARTIFACT"; artifact: PublishedArtifact }
  | { type: "SET_ARTIFACT_EXPANDED"; expanded: boolean }
  | { type: "SET_ARTIFACT_MANUAL_OVERRIDE"; override: boolean | null }
  | { type: "SET_ARTIFACT_AUTO_COLLAPSE_TIMER"; timer: UiTimerHandle | null };

export function createInitialArtifactsState(): ArtifactsState {
  return { artifacts: [], artifactExpanded: false, artifactManualOverride: null, artifactAutoCollapseTimer: null };
}

export function reduceArtifactsState(state: ArtifactsState, action: ArtifactsAction): ArtifactsState {
  switch (action.type) {
    case "UPSERT_ARTIFACT": return { ...state, artifacts: [...state.artifacts.filter((item) => item.artifactId !== action.artifact.artifactId), action.artifact] };
    case "SET_ARTIFACT_EXPANDED": return { ...state, artifactExpanded: action.expanded };
    case "SET_ARTIFACT_MANUAL_OVERRIDE": return { ...state, artifactManualOverride: action.override };
    case "SET_ARTIFACT_AUTO_COLLAPSE_TIMER": return { ...state, artifactAutoCollapseTimer: action.timer };
  }
}
