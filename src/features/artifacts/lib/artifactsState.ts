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

export function reduceArtifactsState<S extends ArtifactsState>(state: S, action: ArtifactsAction): S;
export function reduceArtifactsState<S extends ArtifactsState>(state: S, action: { type: string }): S | null;
export function reduceArtifactsState<S extends ArtifactsState>(state: S, input: { type: string }): S | null {
  const action = input as ArtifactsAction;
  switch (action.type) {
    case "UPSERT_ARTIFACT":
      return { ...state, artifacts: upsertArtifact(state.artifacts, action.artifact) };
    case "SET_ARTIFACT_EXPANDED":
      return { ...state, artifactExpanded: action.expanded };
    case "SET_ARTIFACT_MANUAL_OVERRIDE":
      return { ...state, artifactManualOverride: action.override };
    case "SET_ARTIFACT_AUTO_COLLAPSE_TIMER":
      return { ...state, artifactAutoCollapseTimer: action.timer };
    default: return null;
  }
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
