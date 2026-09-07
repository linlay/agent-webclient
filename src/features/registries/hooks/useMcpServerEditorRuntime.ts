import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deleteAdminSource,
  getAdminSource,
  updateAdminSource,
  validateAdminRegistry,
  type AdminRegistryDetailResponse,
  type AdminRegistryListItem,
} from "@/shared/data";
import { createMcpDetailRequestCoordinator } from "@/features/registries/lib/mcpDetailRequestCoordinator";
import {
  buildMcpServerDefinition,
  EMPTY_MCP_SERVER_FORM,
  mcpServerFormFromDefinition,
  stringifyMcpServerYaml,
  type McpServerFormState,
} from "@/features/registries/lib/mcpServerForm";
import {
  defaultMcpServerFileName,
  mcpDetailFromSource,
  mcpDetailToListItem,
  mergeMcpValidationSummary,
  selectMcpServerAfterDelete,
  shouldLoadMcpServerDirectly,
  type McpCatalogSnapshot,
  type McpDetailLoadResult,
  type McpServerEditorMode,
} from "@/features/registries/lib/mcpServerConsole";
import {
  findMcpServerByRouteKey,
  mcpServerItemKey,
  mcpServerKey,
  registryText,
} from "@/features/registries/lib/mcpRegistry";
import { useI18n } from "@/shared/i18n";

interface McpCatalogController {
  error: string;
  items: AdminRegistryListItem[];
  itemsRef: React.MutableRefObject<AdminRegistryListItem[]>;
  loading: boolean;
  refreshCatalog: (silent?: boolean) => Promise<McpCatalogSnapshot | null>;
  removeServerLocally: (deletedFile: string, deletedServerKey: string) => void;
  setError: React.Dispatch<React.SetStateAction<string>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface UseMcpServerEditorRuntimeOptions {
  catalog: McpCatalogController;
  onRouteServerKeyChange: (serverKey: string) => void;
  routeServerKey: string;
}

export function useMcpServerEditorRuntime({
  catalog,
  onRouteServerKeyChange,
  routeServerKey,
}: UseMcpServerEditorRuntimeOptions) {
  const { t } = useI18n();
  const routeServerKeyRef = useRef(routeServerKey);
  const didLoadRef = useRef(false);
  const [selectedItemKey, setSelectedItemKey] = useState("");
  const [detail, setDetail] = useState<AdminRegistryDetailResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [editorMode, setEditorMode] =
    useState<McpServerEditorMode>("structured");
  const [form, setForm] = useState<McpServerFormState>(EMPTY_MCP_SERVER_FORM);
  const [baseDefinition, setBaseDefinition] = useState<Record<string, unknown>>(
    {},
  );
  const [structuredAvailable, setStructuredAvailable] = useState(true);
  const [toolSearchText, setToolSearchText] = useState("");
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [routeNotFound, setRouteNotFound] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [newDraft, setNewDraft] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const detailRequestCoordinator = useMemo(
    () => createMcpDetailRequestCoordinator<McpDetailLoadResult>(),
    [],
  );

  useEffect(() => {
    routeServerKeyRef.current = routeServerKey;
  }, [routeServerKey]);

  useEffect(() => {
    if (!dirty) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  // Catalog refreshes may update status/tool metadata, but never replace the draft.
  useEffect(() => {
    setDetail((current) => {
      if (!current) return current;
      const item = catalog.items.find(
        (candidate) => candidate.file === current.file,
      );
      if (!item) return current;
      return {
        ...current,
        key: item.key,
        name: item.name,
        status: item.status,
        summary: item.summary,
        updatedAt: item.updatedAt,
      };
    });
  }, [catalog.items]);

  const updateForm = useCallback((patch: Partial<McpServerFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
    setDirty(true);
    setFormError("");
    setMessage("");
  }, []);

  const updateDraft = useCallback((content: string) => {
    setDraft(content);
    setDirty(true);
    setFormError("");
    setMessage("");
  }, []);

  const invalidateDetailLoad = useCallback(() => {
    detailRequestCoordinator.invalidate();
    setDetailLoading(false);
  }, [detailRequestCoordinator]);

  const clearSelection = useCallback(() => {
    invalidateDetailLoad();
    setSelectedItemKey("");
    setDetail(null);
    setDraft("");
    setForm(EMPTY_MCP_SERVER_FORM);
    setBaseDefinition({});
    setStructuredAvailable(true);
    setEditorMode("structured");
  }, [invalidateDetailLoad]);

  const loadDetail = useCallback(
    async (item: AdminRegistryListItem) => {
      const itemKey = mcpServerItemKey(item);
      const selection = detailRequestCoordinator.run(itemKey, async () => {
        const response = await getAdminSource({
          type: "registry",
          category: "mcp-servers",
          file: item.file,
        });
        const refreshedItem =
          catalog.itemsRef.current.find(
            (candidate) => candidate.file === item.file,
          ) || item;
        let nextDetail = mcpDetailFromSource(response.data, refreshedItem);
        let validationError = "";
        try {
          const validation = await validateAdminRegistry({
            category: "mcp-servers",
            file: item.file,
            content: nextDetail.content || "",
          });
          nextDetail = {
            ...nextDetail,
            status: validation.data.status,
            diagnostics: validation.data.diagnostics,
            parsed: validation.data.parsed,
          };
        } catch (validationFailure) {
          validationError =
            validationFailure instanceof Error
              ? validationFailure.message
              : String(validationFailure);
        }
        return { detail: nextDetail, item: refreshedItem, validationError };
      });

      setDetailLoading(true);
      setError("");
      setFormError("");
      try {
        const result = await selection.promise;
        if (!detailRequestCoordinator.isLatest(selection.selectionId)) return;
        if (result.validationError) setFormError(result.validationError);
        setSelectedItemKey(mcpServerItemKey(result.item));
        setDetail(result.detail);
        setDraft(result.detail.content || "");
        const definition = result.detail.parsed;
        if (definition) {
          setBaseDefinition(definition);
          setForm(
            mcpServerFormFromDefinition(
              definition,
              mcpServerKey(result.detail),
            ),
          );
          setStructuredAvailable(true);
          setEditorMode("structured");
        } else {
          setBaseDefinition({});
          setForm({
            ...EMPTY_MCP_SERVER_FORM,
            serverKey: mcpServerKey(result.detail),
          });
          setStructuredAvailable(false);
          setEditorMode("source");
        }
        setDirty(false);
        setNewDraft(false);
        setRouteNotFound(false);
      } catch (loadError) {
        if (detailRequestCoordinator.isLatest(selection.selectionId)) {
          setError(
            loadError instanceof Error ? loadError.message : String(loadError),
          );
        }
      } finally {
        if (detailRequestCoordinator.isLatest(selection.selectionId)) {
          setDetailLoading(false);
        }
      }
    },
    [catalog.itemsRef, detailRequestCoordinator],
  );

  const loadPage = useCallback(
    async (preferredServerKey = "", preserveUnassigned = false) => {
      catalog.setLoading(true);
      setError("");
      try {
        const snapshot = await catalog.refreshCatalog(false);
        if (!snapshot) return;
        if (preserveUnassigned) {
          clearSelection();
          setShowUnassigned(true);
          setRouteNotFound(false);
          return;
        }
        const target = preferredServerKey
          ? findMcpServerByRouteKey(snapshot.items, preferredServerKey)
          : snapshot.items[0] || null;
        if (preferredServerKey && !target) {
          clearSelection();
          setRouteNotFound(true);
          setShowUnassigned(false);
          return;
        }
        if (target) {
          setShowUnassigned(false);
          await loadDetail(target);
        } else {
          clearSelection();
          setRouteNotFound(false);
        }
      } finally {
        catalog.setLoading(false);
      }
    },
    [catalog, clearSelection, loadDetail],
  );

  useEffect(() => {
    if (didLoadRef.current) return;
    didLoadRef.current = true;
    void loadPage(routeServerKeyRef.current);
  }, [loadPage]);

  useEffect(() => {
    if (
      !didLoadRef.current ||
      catalog.loading ||
      newDraft ||
      showUnassigned ||
      dirty ||
      !routeServerKey
    ) {
      return;
    }
    const target = findMcpServerByRouteKey(catalog.items, routeServerKey);
    if (!target) {
      invalidateDetailLoad();
      setRouteNotFound(true);
      setSelectedItemKey("");
      setDetail(null);
      return;
    }
    const targetKey = mcpServerItemKey(target);
    if (targetKey !== selectedItemKey) {
      setToolSearchText("");
      void loadDetail(target);
    }
  }, [
    catalog.items,
    catalog.loading,
    dirty,
    invalidateDetailLoad,
    loadDetail,
    newDraft,
    routeServerKey,
    selectedItemKey,
    showUnassigned,
  ]);

  const confirmDiscard = useCallback(
    () => !dirty || window.confirm(t("mcpServers.confirm.discard")),
    [dirty, t],
  );

  const toggleEditorMode = useCallback(() => {
    if (editorMode === "source" && !structuredAvailable) {
      setFormError(t("mcpServers.error.fixSourceFirst"));
      return;
    }
    if (!confirmDiscard()) return;
    setDirty(false);
    setFormError("");
    setMessage("");
    if (editorMode === "source") {
      setDraft((current) => detail?.content || current);
      setForm(
        mcpServerFormFromDefinition(
          baseDefinition,
          detail ? mcpServerKey(detail) : "",
        ),
      );
      setEditorMode("structured");
      return;
    }
    setForm(
      mcpServerFormFromDefinition(
        baseDefinition,
        detail ? mcpServerKey(detail) : "",
      ),
    );
    setEditorMode("source");
  }, [
    baseDefinition,
    confirmDiscard,
    detail,
    editorMode,
    structuredAvailable,
    t,
  ]);

  const refreshPage = useCallback(() => {
    if (!confirmDiscard()) return;
    void loadPage(
      detail ? mcpServerKey(detail) : routeServerKey,
      showUnassigned,
    );
  }, [confirmDiscard, detail, loadPage, routeServerKey, showUnassigned]);

  const selectServer = useCallback(
    (item: AdminRegistryListItem) => {
      if (!confirmDiscard()) return;
      const serverKey = mcpServerKey(item);
      const loadDirectly = shouldLoadMcpServerDirectly({
        currentRouteKey: routeServerKey,
        dirty,
        newDraft,
        selectedItemKey,
        targetItemKey: mcpServerItemKey(item),
        targetRouteKey: serverKey,
      });
      setShowUnassigned(false);
      setRouteNotFound(false);
      setToolSearchText("");
      setMessage("");
      setDetailLoading(true);
      onRouteServerKeyChange(serverKey);
      void (async () => {
        const snapshot = await catalog.refreshCatalog(true);
        const refreshedItem =
          snapshot?.items.find((candidate) => candidate.file === item.file) ||
          item;
        if (loadDirectly) await loadDetail(refreshedItem);
      })();
    },
    [
      catalog,
      confirmDiscard,
      dirty,
      loadDetail,
      newDraft,
      onRouteServerKeyChange,
      routeServerKey,
      selectedItemKey,
    ],
  );

  const selectUnassigned = useCallback(() => {
    if (!confirmDiscard()) return;
    clearSelection();
    setShowUnassigned(true);
    setRouteNotFound(false);
    setToolSearchText("");
    setDirty(false);
    setNewDraft(false);
    setMessage("");
    onRouteServerKeyChange("");
  }, [clearSelection, confirmDiscard, onRouteServerKeyChange]);

  const startNew = useCallback(() => {
    if (!confirmDiscard()) return;
    invalidateDetailLoad();
    const file = defaultMcpServerFileName(catalog.items);
    const serverKey = file.replace(/\.ya?ml$/i, "");
    const initialForm: McpServerFormState = {
      ...EMPTY_MCP_SERVER_FORM,
      serverKey,
      baseUrl: "http://localhost:11969",
    };
    const definition = buildMcpServerDefinition(initialForm);
    const content = stringifyMcpServerYaml(definition);
    setSelectedItemKey(`mcp-servers/${file}`);
    setDetail({
      category: "mcp-servers",
      file,
      key: serverKey,
      status: "ready",
      summary: {},
      content,
      parsed: definition,
    });
    setDraft(content);
    setForm(initialForm);
    setBaseDefinition(definition);
    setStructuredAvailable(true);
    setEditorMode("structured");
    setShowUnassigned(false);
    setRouteNotFound(false);
    setDirty(true);
    setNewDraft(true);
    setError("");
    setMessage(t("mcpServers.message.newDraft"));
    onRouteServerKeyChange("");
  }, [
    catalog.items,
    confirmDiscard,
    invalidateDetailLoad,
    onRouteServerKeyChange,
    t,
  ]);

  const draftTarget = useCallback(() => {
    if (!detail) return null;
    const targetFile =
      newDraft && editorMode === "structured"
        ? `${form.serverKey.trim()}.yml`
        : detail.file;
    if (
      newDraft &&
      catalog.items.some(
        (item) =>
          item.file.toLowerCase() === targetFile.toLowerCase() &&
          item.file !== detail.file,
      )
    ) {
      throw new Error(t("mcpServers.error.keyExists"));
    }
    const content =
      editorMode === "structured"
        ? stringifyMcpServerYaml(buildMcpServerDefinition(form, baseDefinition))
        : draft;
    return { content, targetFile };
  }, [
    baseDefinition,
    catalog.items,
    detail,
    draft,
    editorMode,
    form,
    newDraft,
    t,
  ]);

  const validateDraft = useCallback(async () => {
    if (!detail) return;
    setValidating(true);
    setError("");
    setFormError("");
    try {
      const target = draftTarget();
      if (!target) return;
      const response = await validateAdminRegistry({
        category: "mcp-servers",
        file: target.targetFile,
        content: target.content,
      });
      setDetail((current) =>
        current
          ? {
              ...current,
              status: response.data.status,
              diagnostics: response.data.diagnostics,
              summary: mergeMcpValidationSummary(
                current.summary,
                response.data.summary,
              ),
            }
          : current,
      );
      setMessage(
        response.data.status === "invalid"
          ? t("mcpServers.message.validationInvalid")
          : t("mcpServers.message.validationReady"),
      );
    } catch (validationError) {
      setFormError(
        validationError instanceof Error
          ? validationError.message
          : String(validationError),
      );
    } finally {
      setValidating(false);
    }
  }, [detail, draftTarget, t]);

  const saveDraft = useCallback(async () => {
    if (!detail) return;
    setSaving(true);
    setError("");
    setFormError("");
    try {
      const target = draftTarget();
      if (!target) return;
      const response = await updateAdminSource({
        target: {
          type: "registry",
          category: "mcp-servers",
          file: target.targetFile,
        },
        content: target.content,
        baseSha256: detail.sha256,
      });
      let nextDetail = mcpDetailFromSource(response.data, detail);
      const validation = await validateAdminRegistry({
        category: "mcp-servers",
        file: nextDetail.file,
        content: nextDetail.content || target.content,
      });
      nextDetail = {
        ...nextDetail,
        key:
          registryText(validation.data.parsed?.serverKey) ||
          registryText(validation.data.parsed?.["server-key"]) ||
          registryText(validation.data.parsed?.key) ||
          nextDetail.key,
        name: registryText(validation.data.parsed?.name) || nextDetail.name,
        status: validation.data.status,
        diagnostics: validation.data.diagnostics,
        summary: mergeMcpValidationSummary(
          detail.summary,
          validation.data.summary,
        ),
        parsed: validation.data.parsed,
      };
      const nextItem = mcpDetailToListItem(nextDetail);
      const nextRouteKey = mcpServerKey(nextDetail);
      setDetail(nextDetail);
      setDraft(nextDetail.content || target.content);
      if (nextDetail.parsed) {
        setBaseDefinition(nextDetail.parsed);
        setForm(mcpServerFormFromDefinition(nextDetail.parsed, nextRouteKey));
        setStructuredAvailable(true);
      } else {
        setBaseDefinition({});
        setStructuredAvailable(false);
        setEditorMode("source");
      }
      setDirty(false);
      setNewDraft(false);
      setSelectedItemKey(mcpServerItemKey(nextItem));
      setMessage(t("mcpServers.message.saved"));
      const snapshot = await catalog.refreshCatalog(false);
      const refreshedItem = snapshot?.items.find(
        (candidate) => candidate.file === nextDetail.file,
      );
      const refreshedRouteKey = refreshedItem
        ? mcpServerKey(refreshedItem)
        : nextRouteKey;
      if (refreshedItem) setSelectedItemKey(mcpServerItemKey(refreshedItem));
      onRouteServerKeyChange(refreshedRouteKey);
    } catch (saveError) {
      setFormError(
        saveError instanceof Error ? saveError.message : String(saveError),
      );
    } finally {
      setSaving(false);
    }
  }, [catalog, detail, draftTarget, onRouteServerKeyChange, t]);

  const confirmDelete = useCallback(async () => {
    if (!detail || newDraft) return;
    const deletedFile = detail.file;
    const deletedServerKey = mcpServerKey(detail);
    const previousItems = catalog.items;
    setDeleting(true);
    setError("");
    setFormError("");
    try {
      await deleteAdminSource({
        target: {
          type: "registry",
          category: "mcp-servers",
          file: deletedFile,
        },
        baseSha256: detail.sha256,
      });
      setDirty(false);
      const snapshot = await catalog.refreshCatalog(false);
      const remainingItems =
        snapshot?.items ||
        previousItems.filter((item) => item.file !== deletedFile);
      if (!snapshot) catalog.removeServerLocally(deletedFile, deletedServerKey);
      const nextItem = selectMcpServerAfterDelete(
        previousItems,
        remainingItems,
        deletedFile,
      );
      setMessage(t("mcpServers.message.deleted"));
      setToolSearchText("");
      if (nextItem) {
        const nextServerKey = mcpServerKey(nextItem);
        onRouteServerKeyChange(nextServerKey);
        await loadDetail(nextItem);
      } else {
        clearSelection();
        setRouteNotFound(false);
        onRouteServerKeyChange("");
      }
    } catch (deleteError) {
      setFormError(
        deleteError instanceof Error
          ? deleteError.message
          : String(deleteError),
      );
    } finally {
      setDeleting(false);
    }
  }, [
    catalog,
    clearSelection,
    detail,
    loadDetail,
    newDraft,
    onRouteServerKeyChange,
    t,
  ]);

  return {
    baseDefinition,
    confirmDelete,
    deleting,
    detail,
    detailLoading,
    dirty,
    draft,
    editorMode,
    error,
    form,
    formError,
    loadDetail,
    loadPage,
    message,
    newDraft,
    refreshPage,
    routeNotFound,
    saveDraft,
    saving,
    selectServer,
    selectedItemKey,
    selectUnassigned,
    setToolSearchText,
    showUnassigned,
    startNew,
    structuredAvailable,
    toggleEditorMode,
    toolSearchText,
    updateDraft,
    updateForm,
    validateDraft,
    validating,
  };
}

export type McpServerEditorRuntime = ReturnType<
  typeof useMcpServerEditorRuntime
>;
