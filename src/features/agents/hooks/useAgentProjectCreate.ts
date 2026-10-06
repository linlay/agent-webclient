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
  // Only the latest directory request may update the browser; a slower earlier
  // response, or one that arrives after the browser was closed, is dropped.
  const browseSeq = useRef(0);

  const loadOptions = async () => {
    const seq = ++loadSeq.current;
    setOptionsLoading(true);
    setOptionsError("");
    try {
      const response = await loadAgentCreationOptions();
      if (seq !== loadSeq.current) return;
      setCreationOptions(response);
      setSelection(initialProjectCreationSelection(response));
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
    closeBrowser();
    setBrowserListing(null);
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
    const seq = ++browseSeq.current;
    setBrowserLoading(true);
    setBrowserError("");
    try {
      const response = await listHostDirectories(path);
      if (seq !== browseSeq.current) return;
      setBrowserListing(response.data);
    } catch (browseError) {
      if (seq !== browseSeq.current) return;
      // The previous listing stays visible so the user can navigate elsewhere,
      // but it can no longer be confirmed: the error is about another directory.
      setBrowserError(errorMessage(browseError));
    } finally {
      if (seq === browseSeq.current) setBrowserLoading(false);
    }
  };

  const closeBrowser = () => {
    browseSeq.current += 1;
    setBrowserLoading(false);
    setBrowserError("");
    setBrowserOpen(false);
  };

  // The listing is the directory the user is looking at only when no request
  // is pending and the last one succeeded.
  const browserCanChoose = Boolean(browserListing) && !browserLoading && !browserError;

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
    browserCanChoose,
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
    closeBrowser,
    browseTo: (path: string) => void browseTo(path),
    chooseBrowsedDirectory: () => {
      if (!browserCanChoose || !browserListing) return;
      setWorkspaceDir(browserListing.path);
      closeBrowser();
    },
  };
}

export type AgentProjectCreateRuntime = ReturnType<typeof useAgentProjectCreate>;
