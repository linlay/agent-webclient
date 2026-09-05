import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "./AgentConsole.module.css";
import {
  Modal,
  Popconfirm,
  Spin,
  Tooltip,
  message,
  type MenuProps,
} from "antd";
import { useAppContext } from "@/app/state/AppContext";
import type { Agent } from "@/features/agents/lib/agentState";
import {
  createAgent,
  deleteAgent,
  deleteAdminAgentPrivateSkill,
  getAdminAgentDetail,
  getAdminAgentEditorOptions,
  getAdminAgents,
  getAdminSource,
  getAdminSkills,
  getAdminTools,
  getAgents,
  importAdminAgent,
  importAdminAgentPrivateSkill,
  putAdminAgentOrder,
  updateAgent,
  updateAdminSource,
} from "@/shared/data";
import { dataEndpoints } from "@/shared/data/api/endpoints";
import type {
  AdminAgentDetailResponse,
  AdminAgentPrivateSkill,
  AgentEditorOptionsResponse,
  AdminSourceResponse,
  CoderModelOption,
  QueryReasoningEffort,
  ServiceTierOption,
} from "@/shared/data";
import {
  agentOrderPayload,
  filterAgentsPreservingOrder,
  moveAgentForDrop,
} from "@/features/agents/lib/agentOrdering";
import { buildModelMenuItems } from "@/features/model-config/components/ModelMenuPresenter";
import { AgentCreateModal } from "@/features/agents/components/AgentCreateModal";
import {
  AGENT_FORM_SECTION_IDS,
  AgentEditor,
  type AgentFormSectionId,
} from "@/features/agents/components/AgentEditor";
import { AgentListPane } from "@/features/agents/components/AgentListPane";
import { AgentSourceEditor } from "@/features/agents/components/AgentSourceEditor";
import { useAgentConsoleRuntime } from "@/features/agents/hooks/useAgentConsoleRuntime";
import {
  agentImportSuccessMessageKey,
  confirmAgentDraftDiscard,
  formatAgentArchiveSize,
} from "@/features/agents/lib/agentImport";
import type {
  AgentSkillOption,
  AgentToolOption,
} from "@/features/agents/lib/agentOptions";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { ModalTitleBar } from "@/shared/ui/ModalTitleBar";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";
import {
  EMPTY_FORM,
  asRecord,
  buildAdminToolOption,
  buildAgentListSummary,
  buildDefinition,
  createEmptyAgentForm,
  defaultReasoningEffort,
  fallbackDefinition,
  firstAdminAgentDiagnosticMessage,
  formFromDetail,
  getActiveAgentSectionId,
  getModelReasoningEfforts,
  hasEditableAdminDefinition,
  initialAgentInteractionMode,
  isInvalidAdminAgent,
  mergeAgentSkillOptions,
  normalizeModeForForm,
  normalizeReasoningEffort,
  normalizeServiceTier,
  optionLabel,
  privateSkillsFromDetail,
  promptEntriesFromJson,
  readAdminAgentDiagnostics,
  reasoningEffortLabel,
  resolveAdminAgentSourcePath,
  shouldReloadAgentDetail,
  shouldStartAgentConsoleBootstrap,
  toText,
  toolFilterForOption,
  toolOptionLabel,
  type AgentEditorMode,
  type AgentFormMode,
  type AgentFormState,
  type AgentInteractionMode,
  type AgentToolFilter,
  type EditableAgentDetail,
} from "@/features/agents/lib/agentDefinition";

export {
  buildAdminToolOption,
  buildAgentListSummary,
  buildDefinition,
  defaultReasoningEffort,
  firstAdminAgentDiagnosticMessage,
  formFromDetail,
  getActiveAgentSectionId,
  getModelReasoningEfforts,
  hasEditableAdminDefinition,
  initialAgentInteractionMode,
  isInvalidAdminAgent,
  mergeAgentSkillOptions,
  privateSkillsFromDetail,
  readAdminAgentDiagnostics,
  resolveAdminAgentSourcePath,
  shouldReloadAgentDetail,
  shouldStartAgentConsoleBootstrap,
  toolOptionLabel,
};

export { AGENT_FORM_SECTION_IDS };


export interface AgentConsoleProps {
  selectedAgentKey?: string;
  onSelectAgentKey?: (agentKey: string) => void;
  onClearSelection?: () => void;
  onClose?: () => void;
  titleBarVariant?: "default" | "drawer";
  onDirtyChange?: (dirty: boolean) => void;
  embedded?: boolean;
}

export const AGENT_CONSOLE_ADMIN_LIST_ROUTE = dataEndpoints.adminAgents.path;

export function shouldShowAgentSectionNav(
  editorMode: AgentEditorMode,
  canEditStructuredAgent: boolean,
): boolean {
  return editorMode === "structured" && canEditStructuredAgent;
}

export async function saveAgentOrderRequest(agents: Agent[]): Promise<void> {
  await putAdminAgentOrder({ order: agentOrderPayload(agents) });
}

const AGENT_CONSOLE_CLASS_NAME = "agent-console tw:overflow-hidden";
const AGENT_ERROR_CLASS_NAME =
  "agent-console-error tw:flex tw:items-center tw:justify-between tw:gap-3 tw:rounded-control tw:border tw:px-2.5 tw:py-2 tw:text-xs tw:text-accent-danger tw:[border-color:color-mix(in_srgb,var(--accent-danger)_42%,var(--line-soft))]";
const AGENT_BODY_CLASS_NAME =
  "agent-console-body tw:grid tw:min-h-0 tw:flex-auto tw:grid-cols-[280px_minmax(0,1fr)] tw:overflow-hidden tw:max-[860px]:grid-cols-1 tw:max-[860px]:overflow-auto";
const AGENT_DETAIL_CLASS_NAME =
  "agent-console-detail tw:min-h-0 tw:min-w-0 tw:overflow-auto tw:[&_.ant-select]:min-w-0 tw:[&_.ant-select]:w-full tw:[&_select]:min-h-8 tw:[&_select]:w-full tw:[&_select]:rounded-control tw:[&_select]:border tw:[&_select]:px-2 tw:[&_select]:py-1.5 tw:[&_select]:text-xs tw:[&_select]:text-ink-1 tw:[&_select]:[border-color:color-mix(in_srgb,var(--line-soft)_92%,transparent)] tw:[&_select]:bg-[color-mix(in_srgb,var(--bg-input)_92%,var(--bg-elev-2))]";
const AGENT_DETAIL_ADMIN_META_CLASS_NAME =
  "agent-detail-admin-meta tw:mb-3.5 tw:flex tw:flex-col tw:gap-2";
const AGENT_DIAGNOSTICS_CLASS_NAME =
  "agent-diagnostics tw:flex tw:flex-col tw:gap-1.5 tw:rounded-control tw:border tw:p-2.5 tw:text-xs tw:text-ink-1 tw:[border-color:color-mix(in_srgb,var(--accent-danger)_26%,var(--line-soft))] tw:bg-[color-mix(in_srgb,var(--accent-danger)_6%,transparent)] tw:[&>strong]:font-bold tw:[&>strong]:text-accent-danger";
const AGENT_DIAGNOSTIC_ITEM_CLASS_NAME =
  "agent-diagnostic-item tw:flex tw:min-w-0 tw:flex-col tw:gap-[3px]";
const AGENT_DIAGNOSTIC_CODE_CLASS_NAME =
  "agent-diagnostic-code tw:text-[11px] tw:font-bold tw:text-ink-muted";
const AGENT_SECTION_NAV_CLASS_NAME =
  "agent-section-nav tw:sticky tw:top-0 tw:flex tw:items-center tw:gap-1";
const AGENT_SECTION_NAV_LINKS_CLASS_NAME =
  "agent-section-nav-links tw:flex tw:min-w-0 tw:flex-1 tw:overflow-x-auto";
const AGENT_SECTION_NAV_LINK_CLASS_NAME =
  "agent-section-nav-link tw:flex-none tw:whitespace-nowrap";
const AGENT_SECTION_NAV_ACTIONS_CLASS_NAME =
  "agent-section-nav-actions tw:ml-auto tw:flex tw:flex-none tw:items-center tw:gap-1";
const AGENT_SECTION_NAV_ICON_BUTTON_CLASS_NAME =
  "agent-section-nav-icon-button ui-icon-hover-24";
const AGENT_SECTION_NAV_SAVE_CLASS_NAME = "agent-section-nav-save tw:flex-none";
const AGENT_UNEDITABLE_CLASS_NAME =
  "agent-console-uneditable tw:flex tw:items-center tw:gap-2 tw:rounded-control tw:border tw:px-3 tw:py-2.5 tw:text-xs tw:text-accent-danger tw:[border-color:color-mix(in_srgb,var(--accent-danger)_26%,var(--line-soft))] tw:bg-[color-mix(in_srgb,var(--accent-danger)_6%,transparent)]";
export const AgentConsole: React.FC<AgentConsoleProps> = ({
  selectedAgentKey = "",
  onSelectAgentKey,
  onClearSelection,
  onClose,
  titleBarVariant = "default",
  onDirtyChange,
  embedded = false,
}) => {
  const { t } = useI18n();
  const { state, dispatch } = useAppContext();
  const [internalSelectedKey, setInternalSelectedKey] = useState("");
  const effectiveSelectedKey = selectedAgentKey || internalSelectedKey;
  const [localAgents, setLocalAgents] = useState<Agent[]>([]);
  const [searchText, setSearchText] = useState("");
  const [formMode, setFormMode] = useState<AgentFormMode>("create");
  const [editorMode, setEditorMode] = useState<AgentEditorMode>("structured");
  const [interactionMode, setInteractionMode] =
    useState<AgentInteractionMode>("edit");
  const [iconEditorOpen, setIconEditorOpen] = useState(false);
  const [form, setForm] = useState<AgentFormState>(createEmptyAgentForm);
  const [detail, setDetail] = useState<EditableAgentDetail | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingSource, setLoadingSource] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [editorOptions, setEditorOptions] =
    useState<AgentEditorOptionsResponse | null>(null);
  const [toolOptions, setToolOptions] = useState<AgentToolOption[]>([]);
  const [toolSearchText, setToolSearchText] = useState("");
  const [toolFilter, setToolFilter] = useState<AgentToolFilter>("all");
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [skillsExpanded, setSkillsExpanded] = useState(false);
  const [skillSearchText, setSkillSearchText] = useState("");
  const [skillOptions, setSkillOptions] = useState<
    Array<{ key: string; label: string; description?: string }>
  >([]);
  const [savingForm, setSavingForm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [privateSkillModalOpen, setPrivateSkillModalOpen] = useState(false);
  const [privateSkillFile, setPrivateSkillFile] = useState<File | null>(null);
  const [privateSkillDragActive, setPrivateSkillDragActive] = useState(false);
  const [privateSkillImporting, setPrivateSkillImporting] = useState(false);
  const [privateSkillError, setPrivateSkillError] = useState("");
  const [deletingPrivateSkillKey, setDeletingPrivateSkillKey] = useState("");
  const [savingOrder, setSavingOrder] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [draggingAgentKey, setDraggingAgentKey] = useState("");
  const [sourceDraft, setSourceDraft] = useState("");
  const [sourceSha256, setSourceSha256] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [sourceLoadedKey, setSourceLoadedKey] = useState("");
  const [sourceDirty, setSourceDirty] = useState(false);
  const [structuredDirty, setStructuredDirty] = useState(false);
  const [activeAgentSectionId, setActiveAgentSectionId] =
    useState<AgentFormSectionId>(AGENT_FORM_SECTION_IDS[0]);
  const didInitialSelectRef = useRef(false);
  const {
    didBootstrapAgentsRef,
    didBootstrapOptionsRef,
    listLoadSeqRef,
    optionsLoadSeqRef,
    sourceLoadSeqRef,
  } = useAgentConsoleRuntime();
  const selectedAgentKeyRef = useRef(selectedAgentKey);
  const loadedDetailKeyRef = useRef("");
  const detailScrollRef = useRef<HTMLDivElement>(null);
  const sectionNavRef = useRef<HTMLElement>(null);
  const privateSkillFileInputRef = useRef<HTMLInputElement>(null);
  const filteredAgents = useMemo(() => {
    const agents = Array.isArray(localAgents) ? localAgents : [];
    return filterAgentsPreservingOrder(agents, searchText);
  }, [searchText, localAgents]);
  const modeOptions = useMemo(() => {
    const availableModes = new Map(
      (editorOptions?.modes || []).map((item) => [
        normalizeModeForForm(item.key),
        item.label || item.key,
      ]),
    );
    return ["REACT", "CODER", "KBASE"].map((value) => ({
      value,
      label: availableModes.get(value) || value,
    }));
  }, [editorOptions]);
  const selectedModelReasoningEfforts = useMemo(
    () => getModelReasoningEfforts(editorOptions?.models, form.modelKey),
    [editorOptions, form.modelKey],
  );
  const selectedModelReasoningSupported = toText(form.modelKey)
    ? selectedModelReasoningEfforts.length > 0
    : undefined;
  const selectedModel = useMemo(
    () =>
      (editorOptions?.models || []).find(
        (model) => toText(model.key) === toText(form.modelKey),
      ),
    [editorOptions, form.modelKey],
  );
  const agentModelOptions = useMemo(
    () => (editorOptions?.models || []) as CoderModelOption[],
    [editorOptions],
  );
  const modelReasoningOptions = useMemo(
    () =>
      selectedModelReasoningEfforts.map((key) => ({
        key: key as QueryReasoningEffort,
        label: reasoningEffortLabel(key, t),
      })),
    [selectedModelReasoningEfforts, t],
  );
  const modelServiceTierOptions = useMemo<ServiceTierOption[]>(() => {
    const tiers = selectedModel?.serviceTiers || [];
    const uniqueTiers = new Set(["STANDARD", ...tiers]);
    return [...uniqueTiers].map((key) => ({ key, label: key }));
  }, [selectedModel]);
  const selectedModelLabel =
    toText(selectedModel?.name) || toText(form.modelKey) ||
    t("composer.query.model.loading");
  const selectedReasoningLabel = form.reasoningEnabled
    ? reasoningEffortLabel(form.reasoningEffort, t)
    : t("agentConsole.state.disabled");
  const selectedServiceTier = normalizeServiceTier(form.serviceTier);
  const showFastBadge = selectedServiceTier === "FAST";
  const queryModelButtonStateClass = loadingOptions
    ? "is-loading tw:pointer-events-auto"
    : "";
  const modelItems = useMemo<MenuProps["items"]>(
    () =>
      buildModelMenuItems({
        models: agentModelOptions,
        reasoningEfforts: modelReasoningOptions,
        serviceTiers: modelServiceTierOptions,
        modelOverride: {
          key: form.modelKey,
          ...(form.reasoningEnabled
            ? { reasoningEffort: normalizeReasoningEffort(form.reasoningEffort) as QueryReasoningEffort }
            : {}),
          ...(selectedServiceTier !== "STANDARD"
            ? { serviceTier: selectedServiceTier }
            : {}),
        },
        selectedModelLabel,
        selectedModelKey: form.modelKey,
        selectedReasoningEffort: form.reasoningEnabled
          ? (normalizeReasoningEffort(form.reasoningEffort) as QueryReasoningEffort)
          : undefined,
        selectedServiceTier,
        modelsLoading: loadingOptions,
        status: agentModelOptions.length > 0 ? "loaded" : "empty",
        t,
      }),
    [
      agentModelOptions,
      form.modelKey,
      form.reasoningEffort,
      form.reasoningEnabled,
      loadingOptions,
      modelReasoningOptions,
      modelServiceTierOptions,
      selectedModelLabel,
      selectedServiceTier,
      t,
    ],
  );
  const contextTagOptions = useMemo(
    () =>
      (editorOptions?.contextTags || []).map((item) => ({
        value: item.key,
        label: item.label || item.key,
      })),
    [editorOptions],
  );
  const visibilityScopeOptions = useMemo(
    () =>
      (editorOptions?.visibilityScopes?.length
        ? editorOptions.visibilityScopes
        : [
            { key: "nav", label: "nav" },
            { key: "copilot", label: "copilot" },
            { key: "invoke", label: "invoke" },
            { key: "internal", label: "internal" },
          ]
      ).map((item) => ({ value: item.key, label: item.label || item.key })),
    [editorOptions],
  );
  const privateSkills = useMemo(
    () => privateSkillsFromDetail(detail),
    [detail],
  );
  const agentSkillOptions = useMemo(
    () => mergeAgentSkillOptions(skillOptions, privateSkills, form.skills, t),
    [form.skills, privateSkills, skillOptions, t],
  );
  const filteredToolOptions = useMemo(() => {
    const query = toolSearchText.trim().toLowerCase();
    return toolOptions.filter((tool) => {
      if (toolFilter !== "all" && toolFilterForOption(tool) !== toolFilter) {
        return false;
      }
      if (!query) return true;
      return `${tool.key} ${tool.label} ${tool.kind} ${tool.sourceCategory}`
        .toLowerCase()
        .includes(query);
    });
  }, [toolFilter, toolOptions, toolSearchText]);
  const selectedTools = useMemo(
    () =>
      form.tools.map((key) =>
        toolOptions.find((tool) => tool.key === key) || {
          key,
          label: key,
          sourceCategory: "",
          kind: "",
        },
      ),
    [form.tools, toolOptions],
  );
  const selectedSkills = useMemo(
    () =>
      form.skills.map(
        (key) =>
          agentSkillOptions.find((skill) => skill.key === key) || {
            key,
            label: key,
            source: "center" as const,
          },
      ),
    [agentSkillOptions, form.skills],
  );
  const filteredSkillOptions = useMemo(() => {
    const query = skillSearchText.trim().toLowerCase();
    if (!query) return agentSkillOptions;
    return agentSkillOptions.filter((skill) =>
      `${skill.key} ${skill.label} ${skill.description || ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [agentSkillOptions, skillSearchText]);
  const greetingEntries = useMemo(
    () => promptEntriesFromJson(form.greetingsText),
    [form.greetingsText],
  );
  const wonderEntries = useMemo(
    () => promptEntriesFromJson(form.wondersText),
    [form.wondersText],
  );
  const agentFormSections = useMemo<
    Array<{
      id: AgentFormSectionId;
      label: string;
    }>
  >(
    () => [
      {
        id: AGENT_FORM_SECTION_IDS[0],
        label: t("agentConsole.section.basic"),
      },
      {
        id: AGENT_FORM_SECTION_IDS[1],
        label: t("agentConsole.section.model"),
      },
      {
        id: AGENT_FORM_SECTION_IDS[3],
        label: t("agentConsole.section.capabilities"),
      },
      {
        id: AGENT_FORM_SECTION_IDS[2],
        label: t("agentConsole.section.prompts"),
      },
      {
        id: AGENT_FORM_SECTION_IDS[4],
        label: t("agentConsole.section.advancedConfig"),
      },
    ],
    [t],
  );
  const selectedIconValue = useMemo(() => {
    if (form.iconKind === "image") return form.iconImage;
    if (form.iconKind === "builtin" && form.iconName)
      return { name: form.iconName };
    return undefined;
  }, [form.iconImage, form.iconKind, form.iconName]);
  const detailDiagnostics = useMemo(
    () => readAdminAgentDiagnostics(detail),
    [detail],
  );
  const detailSourcePath = useMemo(
    () => sourcePath || resolveAdminAgentSourcePath(detail),
    [detail, sourcePath],
  );
  const canEditStructuredAgent =
    formMode === "create" || hasEditableAdminDefinition(detail);
  const isReadOnly = formMode === "edit" && interactionMode === "view";
  const canEditSourceAgent =
    formMode === "edit" && !isReadOnly && Boolean(detailSourcePath);
  const hasUnsavedChanges = structuredDirty || sourceDirty;
  const canImportPrivateSkill =
    formMode === "edit" &&
    !isReadOnly &&
    canEditStructuredAgent &&
    toText(detail?.source?.kind).toLowerCase() === "directory" &&
    !savingForm &&
    !deleting &&
    !privateSkillImporting &&
    !deletingPrivateSkillKey;

  useEffect(() => {
    selectedAgentKeyRef.current = selectedAgentKey;
  }, [selectedAgentKey]);

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  useEffect(
    () => () => {
      onDirtyChange?.(false);
    },
    [onDirtyChange],
  );

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    setActiveAgentSectionId(AGENT_FORM_SECTION_IDS[0]);
  }, [effectiveSelectedKey, editorMode]);

  useEffect(() => {
    const root = detailScrollRef.current;
    if (!root || editorMode !== "structured" || !canEditStructuredAgent)
      return;

    const sections = AGENT_FORM_SECTION_IDS.map((id) =>
      root.querySelector<HTMLElement>(`#${id}`),
    ).filter((section): section is HTMLElement => Boolean(section));
    if (!sections.length) return;

    let frameId: number | null = null;
    const updateActiveSection = () => {
      frameId = null;
      const rootTop = root.getBoundingClientRect().top;
      const navHeight =
        sectionNavRef.current?.getBoundingClientRect().height ?? 0;
      const nextSectionId = getActiveAgentSectionId(
        sections.map((section) => ({
          id: section.id as AgentFormSectionId,
          top: section.getBoundingClientRect().top,
        })),
        rootTop + navHeight + 8,
        {
          atScrollEnd:
            root.scrollTop + root.clientHeight >= root.scrollHeight - 1,
        },
      );
      if (!nextSectionId) return;
      setActiveAgentSectionId((current) =>
        current === nextSectionId ? current : nextSectionId,
      );
    };
    const scheduleActiveSectionUpdate = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(updateActiveSection);
    };

    root.addEventListener("scroll", scheduleActiveSectionUpdate, {
      passive: true,
    });
    window.addEventListener("resize", scheduleActiveSectionUpdate);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleActiveSectionUpdate);
    resizeObserver?.observe(root);
    sections.forEach((section) => resizeObserver?.observe(section));
    updateActiveSection();

    return () => {
      root.removeEventListener("scroll", scheduleActiveSectionUpdate);
      window.removeEventListener("resize", scheduleActiveSectionUpdate);
      resizeObserver?.disconnect();
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [canEditStructuredAgent, editorMode, form.key]);

  useEffect(() => {
    setIconEditorOpen(false);
  }, [editorMode, effectiveSelectedKey, formMode]);

  const commitAgentSelection = useCallback(
    (agentKey: string) => {
      const key = agentKey.trim();
      sourceLoadSeqRef.current += 1;
      setInternalSelectedKey(key);
      if (key) onSelectAgentKey?.(key);
    },
    [onSelectAgentKey],
  );

  const resetToCreate = useCallback(() => {
    sourceLoadSeqRef.current += 1;
    loadedDetailKeyRef.current = "";
    setFormMode("create");
    setEditorMode("structured");
    setInteractionMode(initialAgentInteractionMode("create"));
    setForm(createEmptyAgentForm());
    setDetail(null);
    setSourceDraft("");
    setSourceSha256("");
    setSourcePath("");
    setSourceLoadedKey("");
    setSourceDirty(false);
    setStructuredDirty(false);
    setInternalSelectedKey("");
    setFormError("");
    setError("");
    onClearSelection?.();
  }, [onClearSelection]);

  const confirmDiscardChanges = useCallback(
    () =>
      confirmAgentDraftDiscard(
        hasUnsavedChanges,
        t("agentConsole.confirm.switch"),
      ),
    [hasUnsavedChanges, t],
  );

  const selectAgent = useCallback(
    (agentKey: string) => {
      const key = agentKey.trim();
      if (key === effectiveSelectedKey) {
        if (isReadOnly) {
          setInteractionMode("edit");
          setFormError("");
        }
        return;
      }
      if (!confirmDiscardChanges()) return;
      commitAgentSelection(key);
    },
    [
      commitAgentSelection,
      confirmDiscardChanges,
      effectiveSelectedKey,
      isReadOnly,
    ],
  );

  const startDirectCreate = useCallback(() => {
    if (!confirmDiscardChanges()) return false;
    resetToCreate();
    setCreateModalOpen(false);
    return true;
  }, [confirmDiscardChanges, resetToCreate]);

  const openCreateModal = useCallback(() => {
    setCreateModalOpen(true);
  }, []);

  const loadAgents = useCallback(
    async (preferredKey = "") => {
      const requestSeq = listLoadSeqRef.current + 1;
      listLoadSeqRef.current = requestSeq;
      setLoadingList(true);
      setError("");
      try {
        const response = await getAdminAgents();
        if (listLoadSeqRef.current !== requestSeq) return;
        const agents = Array.isArray(response.data)
          ? (response.data as Agent[])
          : [];
        setLocalAgents(agents);
        const normalizedPreferred = preferredKey.trim();
        const nextKey =
          normalizedPreferred &&
          agents.some((agent) => toText(agent.key) === normalizedPreferred)
            ? normalizedPreferred
            : agents[0]?.key || "";
        if (
          !selectedAgentKeyRef.current &&
          nextKey &&
          !didInitialSelectRef.current
        ) {
          didInitialSelectRef.current = true;
          setInternalSelectedKey(nextKey);
        }
      } catch (error) {
        if (listLoadSeqRef.current !== requestSeq) return;
        setError((error as Error).message);
      } finally {
        if (listLoadSeqRef.current === requestSeq) {
          setLoadingList(false);
        }
      }
    },
    [dispatch],
  );

  const refreshGlobalAgents = useCallback(async () => {
    try {
      const agentsResponse = await getAgents();
      const agents = Array.isArray(agentsResponse.data)
        ? (agentsResponse.data as Agent[])
        : [];
      dispatch({ type: "SET_AGENTS", agents });
    } catch {
      // 静默失败，不影响主流程
    }
  }, [dispatch]);

  const importAgentArchive = useCallback(
    async (file: File, overwrite: boolean) => {
      const response = await importAdminAgent({ file, overwrite });
      return response.data;
    },
    [],
  );

  const finishAgentArchiveImport = useCallback(
    async (imported: AdminAgentDetailResponse) => {
      const importedKey = toText(imported.key);
      setDetail(imported);
      setForm(formFromDetail(imported));
      setFormMode("edit");
      setEditorMode("structured");
      setSourceDraft("");
      setSourceSha256("");
      setSourcePath("");
      setSourceLoadedKey("");
      setSourceDirty(false);
      setStructuredDirty(false);
      setFormError("");
      commitAgentSelection(importedKey);
      setCreateModalOpen(false);
      await loadAgents(importedKey);
      await refreshGlobalAgents();
      const resultMessageKey = agentImportSuccessMessageKey(imported.status);
      if (imported.status === "invalid") {
        message.warning(t(resultMessageKey));
      } else {
        message.success(t(resultMessageKey));
      }
    },
    [commitAgentSelection, loadAgents, refreshGlobalAgents, t],
  );

  const saveAgentOrder = useCallback(async (agents: Agent[]) => {
    setSavingOrder(true);
    setError("");
    try {
      await saveAgentOrderRequest(agents);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSavingOrder(false);
    }
  }, []);

  const handleMoveAgent = useCallback(
    async (sourceKey: string, targetKey: string) => {
      if (!sourceKey || !targetKey || sourceKey === targetKey || savingOrder)
        return;
      const nextAgents = moveAgentForDrop(localAgents, sourceKey, targetKey);
      if (nextAgents === localAgents) return;
      setLocalAgents(nextAgents);
      await saveAgentOrder(nextAgents);
    },
    [saveAgentOrder, savingOrder, localAgents],
  );

  const loadEditorOptions = useCallback(async () => {
    const requestSeq = optionsLoadSeqRef.current + 1;
    optionsLoadSeqRef.current = requestSeq;
    setLoadingOptions(true);
    try {
      const [optionsResponse, toolsResponse, skillsResponse] =
        await Promise.all([
          getAdminAgentEditorOptions(),
          getAdminTools(),
          getAdminSkills(),
        ]);
      if (optionsLoadSeqRef.current !== requestSeq) return;
      setEditorOptions(
        (optionsResponse.data || null) as AgentEditorOptionsResponse | null,
      );
      setToolOptions(
        (Array.isArray(toolsResponse.data) ? toolsResponse.data : [])
          .map(buildAdminToolOption)
          .filter((item): item is AgentToolOption => Boolean(item)),
      );
      setSkillOptions(
        (Array.isArray(skillsResponse.data) ? skillsResponse.data : [])
          .map((item) => {
            const record = asRecord(item);
            const key = toText(record.key);
            if (!key) return null;
            const description = toText(record.description);
            return description
              ? { key, label: optionLabel(record) || key, description }
              : { key, label: optionLabel(record) || key };
          })
          .filter((item): item is { key: string; label: string; description?: string } =>
            Boolean(item),
          ),
      );
    } catch (error) {
      if (optionsLoadSeqRef.current !== requestSeq) return;
      setError((error as Error).message);
    } finally {
      if (optionsLoadSeqRef.current === requestSeq) {
        setLoadingOptions(false);
      }
    }
  }, []);

  const loadDetail = useCallback(async (agentKey: string) => {
    const key = agentKey.trim();
    if (!key) return;
    sourceLoadSeqRef.current += 1;
    setLoadingDetail(true);
    setEditorMode("structured");
    setInteractionMode(initialAgentInteractionMode("edit"));
    setSourceDraft("");
    setSourceSha256("");
    setSourcePath("");
    setSourceLoadedKey("");
    setSourceDirty(false);
    setStructuredDirty(false);
    setError("");
    setFormError("");
    try {
      const response = await getAdminAgentDetail(key);
      const nextDetail = response.data as EditableAgentDetail;
      setDetail(nextDetail);
      setForm(formFromDetail(nextDetail));
      setFormMode("edit");
    } catch (error) {
      setDetail(null);
      setFormMode("edit");
      setForm({ ...EMPTY_FORM, key });
      setFormError((error as Error).message);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!shouldStartAgentConsoleBootstrap(didBootstrapAgentsRef)) return;
    void loadAgents(selectedAgentKey);
  }, [loadAgents, selectedAgentKey]);

  useEffect(() => {
    if (!shouldStartAgentConsoleBootstrap(didBootstrapOptionsRef)) return;
    void loadEditorOptions();
  }, [loadEditorOptions]);

  useEffect(() => {
    if (selectedAgentKey) setInternalSelectedKey(selectedAgentKey);
  }, [selectedAgentKey]);

  useEffect(() => {
    if (
      !shouldReloadAgentDetail(
        loadedDetailKeyRef.current,
        effectiveSelectedKey,
      )
    ) {
      return;
    }
    loadedDetailKeyRef.current = effectiveSelectedKey;
    void loadDetail(effectiveSelectedKey);
  }, [effectiveSelectedKey, loadDetail]);

  useEffect(() => {
    if (effectiveSelectedKey || localAgents.length !== 0 || loadingList) return;
    loadedDetailKeyRef.current = "";
    resetToCreate();
  }, [effectiveSelectedKey, loadingList, resetToCreate, localAgents.length]);

  const updateForm = (patch: Partial<AgentFormState>) => {
    if (isReadOnly) return;
    setForm((current) => ({ ...current, ...patch }));
    setStructuredDirty(true);
    setFormError("");
  };

  const setModelKey = (value?: string) => {
    const modelKey = toText(value);
    if (editorOptions) {
      const efforts = getModelReasoningEfforts(editorOptions.models, modelKey);
      if (efforts.length === 0) {
        updateForm({
          modelKey,
          reasoningConfigured: false,
          reasoningEnabled: false,
          reasoningEffort: "",
        });
        return;
      }
      if (
        form.reasoningEnabled &&
        !efforts.includes(normalizeReasoningEffort(form.reasoningEffort))
      ) {
        updateForm({
          modelKey,
          reasoningConfigured: true,
          reasoningEffort: defaultReasoningEffort(efforts),
        });
        return;
      }
    }
    updateForm({ modelKey });
  };

  const setReasoningEffort = (value?: string) => {
    const effort = normalizeReasoningEffort(value);
    updateForm({
      reasoningConfigured: true,
      reasoningEnabled: Boolean(effort),
      reasoningEffort: effort,
    });
  };

  const onModelMenuClick: MenuProps["onClick"] = ({ key }) => {
    const itemKey = String(key);
    if (itemKey.startsWith("model:")) {
      setModelKey(decodeURIComponent(itemKey.slice("model:".length)));
      return;
    }
    if (itemKey.startsWith("reasoning:")) {
      setReasoningEffort(itemKey.slice("reasoning:".length));
      return;
    }
    if (itemKey.startsWith("serviceTier:")) {
      updateForm({
        serviceTier: normalizeServiceTier(
          itemKey.slice("serviceTier:".length),
        ),
      });
    }
  };

  const onModelMenuOpenChange = (open: boolean) => {
    if (open && !loadingOptions && !editorOptions) void loadEditorOptions();
  };

  const saveForm = async () => {
    if (!canEditStructuredAgent) {
      setFormError(t("agentConsole.error.structuredSaveUnavailable"));
      return;
    }
    if (!form.key.trim()) {
      setFormError(t("agentConsole.error.keyRequired"));
      return;
    }
    if (!form.name.trim()) {
      setFormError(t("agentConsole.error.nameRequired"));
      return;
    }
    setSavingForm(true);
    setError("");
    setFormError("");
    try {
      const baseDefinition =
        formMode === "edit" && detail
          ? detail.definition || fallbackDefinition(detail)
          : {};
      const definition = buildDefinition(
        form,
        baseDefinition,
        t,
        selectedModelReasoningSupported,
      );
      const response =
        formMode === "create"
          ? await createAgent({
              key: form.key.trim(),
              definition,
              soulPrompt: form.soulPrompt,
              agentsPrompt: form.agentsPrompt,
            })
          : await updateAgent({
              key: form.key.trim(),
              definition,
              soulPrompt: form.soulPrompt,
              agentsPrompt: form.agentsPrompt,
            });
      const saved = response.data;
      const savedKey = saved.key || form.key.trim();
      setDetail(saved);
      setForm(formFromDetail(saved));
      setFormMode("edit");
      setEditorMode("structured");
      setInteractionMode("edit");
      setSourceDraft("");
      setSourceSha256("");
      setSourcePath("");
      setSourceLoadedKey("");
      setSourceDirty(false);
      setStructuredDirty(false);
      message.success(t("agentConsole.message.saveSuccess"));
      await loadAgents(savedKey);
      await refreshGlobalAgents();
      commitAgentSelection(savedKey);
    } catch (error) {
      const errorMessage = (error as Error).message;
      setFormError(errorMessage);
      message.error(
        t("agentConsole.message.saveFailed", { detail: errorMessage }),
      );
    } finally {
      setSavingForm(false);
    }
  };

  const resetPrivateSkillImport = () => {
    setPrivateSkillFile(null);
    setPrivateSkillDragActive(false);
    setPrivateSkillError("");
    if (privateSkillFileInputRef.current)
      privateSkillFileInputRef.current.value = "";
  };

  const selectPrivateSkillArchive = (file: File | null) => {
    setPrivateSkillFile(file);
    setPrivateSkillError("");
  };

  const openPrivateSkillImport = () => {
    if (!canImportPrivateSkill) return;
    resetPrivateSkillImport();
    setPrivateSkillModalOpen(true);
  };

  const submitPrivateSkillImport = async () => {
    const agentKey = form.key.trim();
    if (!agentKey || !privateSkillFile) {
      setPrivateSkillError(t("agentConsole.privateSkill.import.required"));
      return;
    }
    setPrivateSkillImporting(true);
    setPrivateSkillError("");
    const hadUnsavedChanges = hasUnsavedChanges;
    try {
      const response = await importAdminAgentPrivateSkill({
        agentKey,
        file: privateSkillFile,
      });
      const saved = response.data;
      setDetail(saved);
      setForm((current) => {
        const imported = formFromDetail(saved);
        return {
          ...imported,
          ...current,
          skills: [...new Set([...imported.skills, ...current.skills])],
        };
      });
      setStructuredDirty(hadUnsavedChanges);
      setPrivateSkillModalOpen(false);
      resetPrivateSkillImport();
      await loadAgents(agentKey);
      await refreshGlobalAgents();
      commitAgentSelection(agentKey);
      message.success(t("agentConsole.privateSkill.import.success"));
    } catch (error) {
      const detail = (error as Error).message;
      setPrivateSkillError(detail);
    } finally {
      setPrivateSkillImporting(false);
    }
  };

  const confirmDeletePrivateSkill = (skill: AdminAgentPrivateSkill) => {
    const agentKey = form.key.trim();
    if (!agentKey || !skill.key || hasUnsavedChanges) return;
    Modal.confirm({
      title: t("agentConsole.privateSkill.delete.title"),
      content: t("agentConsole.privateSkill.delete.description", {
        name: skill.name || skill.key,
      }),
      okText: t("agentConsole.privateSkill.delete.confirm"),
      cancelText: t("agentConsole.privateSkill.delete.cancel"),
      okButtonProps: { danger: true },
      onOk: async () => {
        setDeletingPrivateSkillKey(skill.key);
        setFormError("");
        try {
          const response = await deleteAdminAgentPrivateSkill({
            agentKey,
            key: skill.key,
          });
          const saved = response.data;
          setDetail(saved);
          setForm(formFromDetail(saved));
          setStructuredDirty(false);
          await loadAgents(agentKey);
          message.success(t("agentConsole.privateSkill.delete.success"));
        } catch (error) {
          const detail = (error as Error).message;
          setFormError(detail);
          message.error(detail);
          throw error;
        } finally {
          setDeletingPrivateSkillKey("");
        }
      },
    });
  };

  const confirmDelete = async () => {
    const key = form.key.trim();
    if (!key || formMode !== "edit") return;
    setDeleting(true);
    setError("");
    setFormError("");
    try {
      await deleteAgent({ key });
      const remaining = localAgents.filter(
        (agent) => toText(agent.key) !== key,
      );
      setLocalAgents(remaining);
      await refreshGlobalAgents();
      const nextKey = remaining[0]?.key || "";
      if (nextKey) commitAgentSelection(nextKey);
      else resetToCreate();
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const setMode = (mode: string) => {
    if (mode === "PROXY" && !form.proxyConfigText.trim()) {
      updateForm({
        mode,
        proxyConfigText: JSON.stringify(
          {
            baseUrl: "",
            timeoutMs:
              editorOptions?.proxyConfigSchema?.defaultTimeoutMs || 300000,
          },
          null,
          2,
        ),
      });
      return;
    }
    updateForm({ mode });
  };

  const cancelEditing = useCallback(() => {
    if (
      hasUnsavedChanges &&
      !window.confirm(t("agentConsole.confirm.cancelEdit"))
    ) {
      return;
    }
    sourceLoadSeqRef.current += 1;
    if (detail) setForm(formFromDetail(detail));
    setEditorMode("structured");
    setInteractionMode("view");
    setIconEditorOpen(false);
    setSourceDraft("");
    setSourceSha256("");
    setSourcePath("");
    setSourceLoadedKey("");
    setSourceDirty(false);
    setStructuredDirty(false);
    setFormError("");
  }, [detail, hasUnsavedChanges, t]);

  const startEditing = useCallback(() => {
    setInteractionMode("edit");
    setFormError("");
  }, []);

  const applySourceResponse = (response: AdminSourceResponse) => {
    setSourceDraft(response.content);
    setSourceSha256(response.sha256);
    setSourcePath(response.source?.path || "");
    setSourceLoadedKey(response.target.key || "");
    setSourceDirty(false);
  };

  const toggleEditorMode = async () => {
    if (isReadOnly || !canEditSourceAgent) return;
    if (
      hasUnsavedChanges &&
      !window.confirm(t("agentConsole.confirm.switchEditor"))
    ) {
      return;
    }
    if (editorMode === "source") {
      setSourceDirty(false);
      setEditorMode("structured");
      return;
    }

    if (structuredDirty && detail) {
      setForm(formFromDetail(detail));
      setStructuredDirty(false);
    }
    setEditorMode("source");
    const key = form.key.trim();
    if (!key || sourceLoadedKey === key) return;
    const requestSeq = sourceLoadSeqRef.current + 1;
    sourceLoadSeqRef.current = requestSeq;
    setLoadingSource(true);
    setFormError("");
    try {
      const response = await getAdminSource({ type: "agent", key });
      if (sourceLoadSeqRef.current !== requestSeq) return;
      applySourceResponse(response.data);
    } catch (error) {
      if (sourceLoadSeqRef.current !== requestSeq) return;
      setFormError((error as Error).message);
    } finally {
      if (sourceLoadSeqRef.current === requestSeq) {
        setLoadingSource(false);
      }
    }
  };

  const saveSource = async () => {
    const key = form.key.trim();
    if (!key || sourceLoadedKey !== key) return;
    const requestSeq = sourceLoadSeqRef.current + 1;
    sourceLoadSeqRef.current = requestSeq;
    setSavingForm(true);
    setError("");
    setFormError("");
    try {
      const response = await updateAdminSource({
        target: { type: "agent", key },
        content: sourceDraft,
        baseSha256: sourceSha256 || undefined,
      });
      if (sourceLoadSeqRef.current === requestSeq) {
        applySourceResponse(response.data);
      }
      await loadAgents(key);
      await refreshGlobalAgents();
      const detailResponse = await getAdminAgentDetail(key);
      if (sourceLoadSeqRef.current === requestSeq) {
        const nextDetail = detailResponse.data as EditableAgentDetail;
        setDetail(nextDetail);
        setForm(formFromDetail(nextDetail));
        setFormMode("edit");
        setInteractionMode("edit");
        setStructuredDirty(false);
      }
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setSavingForm(false);
    }
  };

  const sourceSaveDisabled =
    savingForm ||
    deleting ||
    loadingSource ||
    sourceLoadedKey !== form.key ||
    !sourceDirty;

  return (
    <div
      className={`${embedded ? "command-modal-section" : "management-page-console"} ${AGENT_CONSOLE_CLASS_NAME} ${embedded ? "is-embedded" : ""}`}
    >
      {embedded ? (
        <ModalTitleBar
          title={t("commandModal.agents.title")}
          variant={titleBarVariant}
          onClose={() => onClose?.()}
        />
      ) : null}
      <AgentCreateModal
        open={createModalOpen}
        t={t}
        onCancel={() => setCreateModalOpen(false)}
        onDirectCreate={startDirectCreate}
        onBeforeZipImport={confirmDiscardChanges}
        onZipImport={importAgentArchive}
        onImported={finishAgentArchiveImport}
      />
      <Modal
        open={privateSkillModalOpen}
        title={t("agentConsole.privateSkill.import.title")}
        width={560}
        destroyOnClose
        okText={t("agentConsole.privateSkill.import.submit")}
        cancelText={t("agentConsole.import.cancel")}
        confirmLoading={privateSkillImporting}
        okButtonProps={{
          disabled: !privateSkillFile,
        }}
        maskClosable={!privateSkillImporting}
        keyboard={!privateSkillImporting}
        onOk={() => void submitPrivateSkillImport()}
        onCancel={() => {
          if (privateSkillImporting) return;
          setPrivateSkillModalOpen(false);
          resetPrivateSkillImport();
        }}
      >
        <div className="tw:flex tw:flex-col tw:gap-4 tw:pt-1">
          <input
            ref={privateSkillFileInputRef}
            className="tw:hidden"
            type="file"
            accept=".zip,application/zip"
            aria-label={t("agentConsole.privateSkill.import.selectFile")}
            onChange={(event) => {
              selectPrivateSkillArchive(event.target.files?.[0] || null);
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            className={`tw:flex tw:min-h-36 tw:w-full tw:cursor-pointer tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:rounded-control tw:border tw:border-dashed tw:p-5 tw:text-center tw:transition-colors tw:focus-visible:outline tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-accent tw:disabled:cursor-not-allowed ${
              privateSkillDragActive
                ? "tw:border-accent tw:bg-accent-soft"
                : "tw:border-line-soft tw:bg-bg-subtle"
            }`}
            onClick={() => privateSkillFileInputRef.current?.click()}
            disabled={privateSkillImporting}
            onDragEnter={(event) => {
              event.preventDefault();
              setPrivateSkillDragActive(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();
              setPrivateSkillDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setPrivateSkillDragActive(false);
              selectPrivateSkillArchive(event.dataTransfer.files?.[0] || null);
            }}
          >
            <MaterialIcon name="folder_zip" />
            {privateSkillFile ? (
              <>
                <strong className="tw:max-w-full tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-sm tw:text-ink-1">
                  {privateSkillFile.name}
                </strong>
                <span className="tw:text-xs tw:text-ink-muted">
                  {formatAgentArchiveSize(privateSkillFile.size)}
                </span>
              </>
            ) : (
              <>
                <span className="tw:text-sm tw:text-ink-1">
                  {t("agentConsole.privateSkill.import.drop")}
                </span>
                <span className="tw:max-w-lg tw:text-xs tw:leading-5 tw:text-ink-muted">
                  {t("agentConsole.privateSkill.import.description")}
                </span>
              </>
            )}
          </button>
          {privateSkillError && (
            <div className="tw:text-xs tw:text-danger">{privateSkillError}</div>
          )}
        </div>
      </Modal>
      {error && (
        <div className={AGENT_ERROR_CLASS_NAME}>
          <span>{error}</span>
          <UiButton size="sm" variant="ghost" onClick={() => loadAgents()}>
            {t("agentConsole.action.retry")}
          </UiButton>
        </div>
      )}

      <div className={AGENT_BODY_CLASS_NAME}>
        <AgentListPane
          agents={filteredAgents}
          selectedAgentKey={effectiveSelectedKey}
          draggingAgentKey={draggingAgentKey}
          loading={loadingList || savingForm || deleting}
          savingOrder={savingOrder}
          searchText={searchText}
          t={t}
          getSummary={(agent) => {
            const agentKey = toText(agent.key);
            return buildAgentListSummary(agent, agentKey === form.key ? form : undefined);
          }}
          getDiagnostic={firstAdminAgentDiagnosticMessage}
          isInvalid={isInvalidAdminAgent}
          onSearchTextChange={setSearchText}
          onRefresh={() => void loadAgents(effectiveSelectedKey)}
          onCreate={openCreateModal}
          onSelect={selectAgent}
          onDraggingAgentKeyChange={setDraggingAgentKey}
          onMove={handleMoveAgent}
        />

        <div
          ref={detailScrollRef}
          className={`${AGENT_DETAIL_CLASS_NAME} ${editorMode === "source" ? "is-source-editor" : ""}`}
        >
          <Spin spinning={loadingDetail || loadingSource}>
            <nav
              ref={sectionNavRef}
              className={AGENT_SECTION_NAV_CLASS_NAME}
              aria-label={t("agentConsole.sectionNav.ariaLabel")}
            >
              {shouldShowAgentSectionNav(
                editorMode,
                canEditStructuredAgent,
              ) && (
                <div className={AGENT_SECTION_NAV_LINKS_CLASS_NAME}>
                  {agentFormSections.map((section) => (
                    <a
                      className={`${AGENT_SECTION_NAV_LINK_CLASS_NAME} ${activeAgentSectionId === section.id ? "is-active" : ""}`}
                      href={`#${section.id}`}
                      key={section.id}
                      onClick={() => setActiveAgentSectionId(section.id)}
                    >
                      {section.label}
                    </a>
                  ))}
                </div>
              )}
              <div className={AGENT_SECTION_NAV_ACTIONS_CLASS_NAME}>
                {isReadOnly ? (
                  (canEditStructuredAgent || Boolean(detailSourcePath)) && (
                    <>
                      <UiButton
                        size="sm"
                        variant="primary"
                        onClick={startEditing}
                      >
                        <MaterialIcon name="edit" />
                        <span>{t("agentConsole.action.edit")}</span>
                      </UiButton>
                    </>
                  )
                ) : (
                  <>
                    {canEditSourceAgent && (
                      <Tooltip
                        title={
                        editorMode === "source"
                          ? t("agentConsole.action.structuredEdit")
                          : t("agentConsole.action.sourceEdit")
                        }
                        arrow={false}
                      >
                        <UiButton
                          className={AGENT_SECTION_NAV_ICON_BUTTON_CLASS_NAME}
                          size="sm"
                          variant="ghost"
                          iconOnly
                          active={editorMode === "source"}
                          onClick={() => {
                            void toggleEditorMode();
                          }}
                          disabled={savingForm || deleting || loadingSource}
                          loading={loadingSource}
                          aria-label={
                            editorMode === "source"
                              ? t("agentConsole.action.structuredEdit")
                              : t("agentConsole.action.sourceEdit")
                          }
                        >
                          <MaterialIcon
                            name={editorMode === "source" ? "tune" : "code"}
                          />
                        </UiButton>
                      </Tooltip>
                    )}
                    {formMode === "edit" && (
                      <Popconfirm
                        title={t("agentConsole.confirm.deleteTitle")}
                        okText={t("agentConsole.confirm.deleteOk")}
                        cancelText={t("agentConsole.confirm.deleteCancel")}
                        okButtonProps={{ danger: true }}
                        onConfirm={confirmDelete}
                        disabled={deleting}
                      >
                        <UiButton
                          className={`${AGENT_SECTION_NAV_ICON_BUTTON_CLASS_NAME} tw:!text-danger`}
                          size="sm"
                          variant="ghost"
                          iconOnly
                          disabled={deleting || savingForm}
                          loading={deleting}
                          aria-label={t("agentConsole.action.delete")}
                        >
                          <MaterialIcon name="delete" />
                        </UiButton>
                      </Popconfirm>
                    )}
                    {formMode === "edit" && (
                      <UiButton
                        size="sm"
                        variant="ghost"
                        onClick={cancelEditing}
                        disabled={savingForm || deleting}
                      >
                        {t("agentConsole.action.cancelEdit")}
                      </UiButton>
                    )}
                    <UiButton
                      className={AGENT_SECTION_NAV_SAVE_CLASS_NAME}
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        if (editorMode === "source") {
                          void saveSource();
                        } else {
                          void saveForm();
                        }
                      }}
                      disabled={
                        editorMode === "source"
                          ? sourceSaveDisabled
                          : !canEditStructuredAgent || deleting
                      }
                      loading={savingForm}
                    >
                      <MaterialIcon name="save" />
                      <span>
                        {formMode === "create"
                          ? t("agentConsole.action.create")
                          : editorMode === "source"
                            ? t("agentConsole.action.saveSource")
                            : t("agentConsole.action.saveChanges")}
                      </span>
                    </UiButton>
                  </>
                )}
              </div>
            </nav>

            {formMode === "edit" && detailDiagnostics.length > 0 && (
              <div className={AGENT_DETAIL_ADMIN_META_CLASS_NAME}>
                <div className={AGENT_DIAGNOSTICS_CLASS_NAME} role="status">
                  <strong>{t("agentConsole.diagnostics.title")}</strong>
                  {detailDiagnostics.map((diagnostic, index) => (
                    <div
                      className={AGENT_DIAGNOSTIC_ITEM_CLASS_NAME}
                      key={`${diagnostic.code}-${index}`}
                    >
                      <span className={AGENT_DIAGNOSTIC_CODE_CLASS_NAME}>
                        {[diagnostic.severity, diagnostic.code]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      <span>{diagnostic.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {editorMode === "source" ? (
              sourceLoadedKey === form.key ? (
                <AgentSourceEditor
                  value={sourceDraft}
                  dirty={sourceDirty}
                  error={formError}
                  t={t}
                  onChange={(value) => {
                    setSourceDraft(value);
                    setSourceDirty(true);
                    setFormError("");
                  }}
                />
              ) : null
            ) : canEditStructuredAgent ? (
              <AgentEditor
                isReadOnly={isReadOnly}
                t={t}
                form={form}
                formError={formError}
                selectedIconValue={selectedIconValue}
                iconEditorOpen={iconEditorOpen}
                setIconEditorOpen={setIconEditorOpen}
                updateForm={updateForm}
                modeOptions={modeOptions}
                setMode={setMode}
                loadingOptions={loadingOptions}
                visibilityScopeOptions={visibilityScopeOptions}
                greetingEntries={greetingEntries}
                wonderEntries={wonderEntries}
                modelItems={modelItems}
                onModelMenuClick={onModelMenuClick}
                onModelMenuOpenChange={onModelMenuOpenChange}
                queryModelButtonStateClass={queryModelButtonStateClass}
                showFastBadge={showFastBadge}
                selectedModelLabel={selectedModelLabel}
                selectedReasoningLabel={selectedReasoningLabel}
                contextTagOptions={contextTagOptions}
                filteredToolOptions={filteredToolOptions}
                selectedTools={selectedTools}
                filteredSkillOptions={filteredSkillOptions}
                selectedSkills={selectedSkills}
                toolFilter={toolFilter}
                toolSearchText={toolSearchText}
                skillSearchText={skillSearchText}
                toolsExpanded={toolsExpanded}
                skillsExpanded={skillsExpanded}
                canImportPrivateSkill={canImportPrivateSkill}
                setToolFilter={setToolFilter}
                setToolSearchText={setToolSearchText}
                setSkillSearchText={setSkillSearchText}
                setToolsExpanded={setToolsExpanded}
                setSkillsExpanded={setSkillsExpanded}
                openPrivateSkillImport={openPrivateSkillImport}
              />
            ) : (
              <div className={AGENT_UNEDITABLE_CLASS_NAME}>
                <MaterialIcon name="warning" />
                <span>{t("agentConsole.diagnostics.uneditable")}</span>
              </div>
            )}

            {editorMode !== "source" && (
              formError && <div className="settings-error">{formError}</div>
            )}
          </Spin>
        </div>
      </div>
    </div>
  );
};
