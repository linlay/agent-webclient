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
  getAdminAgentCreationOptions,
  listHostDirectories,
  type AgentCreationOptionsResponse,
  type AgentCreationTypeKey,
  type HostDirectoryListResponse,
} from "@/shared/data";
import { useI18n } from "@/shared/i18n";

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

  const [browserOpen, setBrowserOpen] = useState(false);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserError, setBrowserError] = useState("");
  const [browserListing, setBrowserListing] = useState<HostDirectoryListResponse | null>(null);

  const loadOptions = async () => {
    const seq = ++loadSeq.current;
    setOptionsLoading(true);
    setOptionsError("");
    try {
      const response = await getAdminAgentCreationOptions();
      if (seq !== loadSeq.current) return;
      setCreationOptions(response.data);
      setSelection(initialProjectCreationSelection(response.data));
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
    setBrowserOpen(false);
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

  // The directory lives on the Agent Platform host, which may not be this
  // machine, so it is browsed through the platform instead of a local picker.
  const browseTo = async (path: string) => {
    setBrowserLoading(true);
    setBrowserError("");
    try {
      const response = await listHostDirectories(path);
      setBrowserListing(response.data);
    } catch (browseError) {
      setBrowserError(errorMessage(browseError));
    } finally {
      setBrowserLoading(false);
    }
  };

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
      const response = await createAgent(
        buildProjectCreateRequest(creationOptions, selection, workspaceDir, projectName),
      );
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
    browserOpen,
    browserLoading,
    browserError,
    browserListing,
    begin,
    close: () => setOpen(false),
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
    openBrowser: () => {
      setBrowserOpen(true);
      void browseTo(workspaceDir.trim());
    },
    closeBrowser: () => setBrowserOpen(false),
    browseTo: (path: string) => void browseTo(path),
    chooseBrowsedDirectory: () => {
      if (!browserListing) return;
      setWorkspaceDir(browserListing.path);
      setBrowserOpen(false);
    },
  };
}

export type AgentProjectCreateRuntime = ReturnType<typeof useAgentProjectCreate>;
