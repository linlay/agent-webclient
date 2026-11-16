import { listKBases } from "@/shared/data/api/requests/kbases";
import type { KnowledgeBase } from "@/shared/data/api/dto/kbases";
import { useRef, useState } from "react";
import { workspaceNameFromPath } from "@/features/agents/lib/agentCreate";
import {
  buildProjectCreateRequest,
  changeProjectCreationType,
  initialProjectCreationSelection,
  projectCreationProblem,
  setProjectCreationGroups,
  type ProjectCreationProblem,
  type ProjectCreationSelection,
} from "@/features/agents/lib/projectCreation";
import {
  createAgent,
  loadAgentCreationOptions,
  type AgentCreationOptionsResponse,
  type AgentCreationTypeKey,
} from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { useDirectoryPicker } from "@/shared/ui/useDirectoryPicker";

const PROBLEM_MESSAGES: Record<ProjectCreationProblem, string> = {
  typeUnavailable: "leftSidebar.createProject.typeUnavailable",
  directoryRequired: "leftSidebar.createProject.directoryRequired",
  modelRequired: "leftSidebar.createProject.modelRequired",
  acpBridgeRequired: "leftSidebar.createProject.acpRequired",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useAgentProjectCreate(options: {
  onCreated?: (agentKey: string) => Promise<void> | void;
  onError?: (error: unknown) => void;
} = {}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [workspaceDir, setWorkspaceDirState] = useState("");
  const [projectNameTouched, setProjectNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [creationOptions, setCreationOptions] = useState<AgentCreationOptionsResponse | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState("");
  const [selection, setSelection] = useState<ProjectCreationSelection | null>(null);
  // Guards against a slow response from an earlier open overwriting this one.
  const loadSeq = useRef(0);
  const librarySeq = useRef(0);
  const [libraries, setLibraries] = useState<KnowledgeBase[]>([]);
  const [libraryChoice, setLibraryChoice] = useState("");

  const directory = useDirectoryPicker();

  const loadOptions = async () => {
    const seq = ++loadSeq.current;
    setOptionsLoading(true);
    setOptionsError("");
    try {
      const response = await loadAgentCreationOptions();
      if (seq !== loadSeq.current) return;
      const projectOptions = {
        ...response,
        types: (["general", "coder", "kbase", "acp"] as const).flatMap(key =>
          response.types.filter(item => item.key === key)),
      };
      setCreationOptions(projectOptions);
      setSelection(initialProjectCreationSelection(projectOptions));
    } catch (loadError) {
      if (seq !== loadSeq.current) return;
      setCreationOptions(null);
      setSelection(null);
      setOptionsError(errorMessage(loadError));
    } finally {
      if (seq === loadSeq.current) setOptionsLoading(false);
    }
  };

  const begin = () => {
    if (open) return;
    setWorkspaceDirState("");
    setProjectName("");
    setProjectNameTouched(false);
    setError("");
    directory.close();
    setLibraryChoice("");
    const seq = ++librarySeq.current;
    setLibraries([]);
    void listKBases().then(result => { if (seq === librarySeq.current) setLibraries(result.data || []); }).catch(e => { if (seq === librarySeq.current) setError(errorMessage(e)); });
    setOpen(true);
    void loadOptions();
  };

  const setWorkspaceDir = (value: string) => {
    setWorkspaceDirState(value);
    setError("");
    if (!projectNameTouched) {
      setProjectName(value.trim() ? workspaceNameFromPath(value) : "");
    }
  };

  const updateSelection = (
    change: (
      current: ProjectCreationSelection,
      loaded: AgentCreationOptionsResponse,
    ) => ProjectCreationSelection,
  ) => {
    if (!creationOptions || !selection) return;
    setSelection(change(selection, creationOptions));
    setError("");
  };

  // Desktop shows its native picker; browser clients browse the Platform host.
  const openDirectoryBrowser = async () => {
    if (submitting || directory.loading || directory.open) return;
    setError("");
    try {
      const path = await directory.pick(workspaceDir.trim());
      if (path) setWorkspaceDir(path);
    } catch (selectionError) {
      setError(errorMessage(selectionError));
    }
  };

  // The listing is the directory the user is looking at only when no request
  // is pending and the last one succeeded.
  const problem = creationOptions && selection
    ? projectCreationProblem(creationOptions, selection, workspaceDir)
    : null;

  const submit = async () => {
    if (!creationOptions || !selection || submitting) return;
    if (problem) {
      setError(t(PROBLEM_MESSAGES[problem]));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const request = buildProjectCreateRequest(creationOptions, selection, workspaceDir, projectName);
      const choice = libraryChoice || (selection.typeKey === "kbase" ? "__new__" : "");
      if (selection.typeKey !== "acp") {
        if (choice === "__new__") request.createLibrary = {name: projectName.trim() || workspaceNameFromPath(workspaceDir), sourcePath: workspaceDir.trim()};
        else if (choice) request.definition.kbaseConfig = {libraryId: choice};
      }
      const response = await createAgent(request);
      const createdKey = String(response.data?.key || "").trim();
      setOpen(false);
      await options.onCreated?.(createdKey);
    } catch (submitError) {
      // Keep the dialog open and show why Agent Platform rejected the request.
      setError(errorMessage(submitError));
      options.onError?.(submitError);
    } finally {
      setSubmitting(false);
    }
  };

  return {
    libraries,
    libraryChoice: libraryChoice || (selection?.typeKey === "kbase" ? "__new__" : ""),
    setLibraryChoice: (value: string) => { setLibraryChoice(value); if (!workspaceDir.trim()) { const source = libraries.find(library => library.id === value)?.collections[0]?.sourcePath; if (source) setWorkspaceDir(source); } },
    open,
    projectName,
    workspaceDir,
    projectNameTouched,
    submitting,
    error,
    creationOptions,
    optionsLoading,
    optionsError,
    selection,
    problem,
    browserOpen: directory.open,
    browserLoading: directory.loading,
    browserError: directory.error,
    browserListing: directory.listing,
    browserCanChoose: directory.canChoose,
    nativeDirectoryPickerAvailable: directory.nativeAvailable,
    begin,
    close: () => { ++librarySeq.current; ++loadSeq.current; directory.close(); setOpen(false); },
    submit,
    reloadOptions: () => void loadOptions(),
    setProjectName,
    setWorkspaceDir,
    setProjectNameTouched,
    setType: (typeKey: AgentCreationTypeKey) =>
      updateSelection((current, loaded) => changeProjectCreationType(loaded, current, typeKey)),
    setGroups: (groupKeys: string[]) =>
      updateSelection((current, loaded) => setProjectCreationGroups(loaded, current, groupKeys)),
    setModelKey: (modelKey: string) =>
      updateSelection((current) => ({ ...current, modelKey })),
    setAcpBridgeId: (acpBridgeId: string) =>
      updateSelection((current) => ({ ...current, acpBridgeId })),
    openBrowser: () => void openDirectoryBrowser(),
    closeBrowser: directory.close,
    browseTo: directory.browseTo,
    chooseBrowsedDirectory: () => {
      const path = directory.choose();
      if (path) setWorkspaceDir(path);
    },
  };
}

export type AgentProjectCreateRuntime = ReturnType<typeof useAgentProjectCreate>;
