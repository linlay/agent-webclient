import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isMcpTool } from "@/features/registries/lib/mcpRegistry";
import {
  defaultRegistryFileName,
  filterRegistryItems,
  normalizeToolToSummary,
  registryDetailFromSource,
  registryItemKey,
  registryTemplateForCategory,
  toolSearchHaystack,
  type RegistryEditableCategory,
  type RegistryStatusFilter,
} from "@/features/registries/lib/registryConsole";
import {
  getAdminRegistries,
  getAdminSource,
  getAdminTools,
  updateAdminSource,
  validateAdminRegistry,
  type AdminRegistryDetailResponse,
  type AdminRegistryListItem,
  type AdminToolSummary,
  type RegistryConsoleTab,
} from "@/shared/data";
import { useI18n } from "@/shared/i18n";

export function useRegistryConsoleRuntime() {
  const { t } = useI18n();
  const [items, setItems] = useState<AdminRegistryListItem[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [detail, setDetail] = useState<AdminRegistryDetailResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [searchText, setSearchText] = useState("");
  const [activeCategory, setActiveCategory] =
    useState<RegistryConsoleTab>("providers");
  const [statusFilter, setStatusFilter] =
    useState<RegistryStatusFilter>("all");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [newDraft, setNewDraft] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [toolItems, setToolItems] = useState<AdminToolSummary[]>([]);
  const [selectedTool, setSelectedTool] = useState<AdminToolSummary | null>(null);
  const [toolsLoading, setToolsLoading] = useState(false);
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const toolsRequestRef = useRef(0);

  const isToolsTab = activeCategory === "tools";
  const normalizedToolSummaries = useMemo(
    () => toolItems.map(normalizeToolToSummary),
    [toolItems],
  );
  const categoryCounts = useMemo(() => {
    const counts: Record<RegistryConsoleTab, number> = {
      providers: 0,
      models: 0,
      "viewport-servers": 0,
      tools: toolItems.length,
    };
    for (const item of items) {
      const category = item.category as RegistryConsoleTab;
      if (category in counts) counts[category] += 1;
    }
    return counts;
  }, [items, toolItems.length]);
  const currentCategoryItems = useMemo(
    () =>
      isToolsTab
        ? normalizedToolSummaries
        : items.filter((item) => item.category === activeCategory),
    [activeCategory, isToolsTab, items, normalizedToolSummaries],
  );
  const filteredToolItems = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    if (!needle) return normalizedToolSummaries;
    return normalizedToolSummaries.filter((item) => {
      const original = toolItems.find(
        (tool) => (tool.key || tool.name || "unknown") === item.file,
      );
      return original ? toolSearchHaystack(original).includes(needle) : false;
    });
  }, [normalizedToolSummaries, searchText, toolItems]);
  const filteredItems = useMemo(
    () =>
      isToolsTab
        ? filteredToolItems
        : filterRegistryItems(items, {
            searchText,
            categoryFilter: activeCategory as RegistryEditableCategory,
            statusFilter,
          }),
    [activeCategory, filteredToolItems, isToolsTab, items, searchText, statusFilter],
  );

  const refreshToolsList = useCallback(async () => {
    const request = ++toolsRequestRef.current;
    setToolsLoading(true);
    setError("");
    try {
      const response = await getAdminTools();
      const data = response.data;
      const list: AdminToolSummary[] = (
        Array.isArray(data)
          ? data
          : (data as unknown as { items?: AdminToolSummary[] })?.items || []
      ).filter((tool) => !isMcpTool(tool));
      if (request !== toolsRequestRef.current) return null;
      setToolItems(list);
      return list;
    } catch (loadError) {
      if (request === toolsRequestRef.current) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
      return null;
    } finally {
      if (request === toolsRequestRef.current) setToolsLoading(false);
    }
  }, []);

  const loadDetail = useCallback(
    async (item: Pick<AdminRegistryListItem, "category" | "file">) => {
      const request = ++detailRequestRef.current;
      setDetailLoading(true);
      setError("");
      try {
        const response = await getAdminSource({
          type: "registry",
          category: item.category,
          file: item.file,
        });
        if (request !== detailRequestRef.current) return;
        const nextDetail = registryDetailFromSource(response.data, item);
        setDetail(nextDetail);
        setDraft(nextDetail.content || "");
        setDirty(false);
        setNewDraft(false);
      } catch (loadError) {
        if (request === detailRequestRef.current) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (request === detailRequestRef.current) setDetailLoading(false);
      }
    },
    [],
  );

  const loadRegistries = useCallback(
    async (preferredKey?: string, categoryOverride?: RegistryEditableCategory) => {
      const request = ++listRequestRef.current;
      setLoading(true);
      setError("");
      try {
        const response = await getAdminRegistries();
        if (request !== listRequestRef.current) return;
        const nextItems = (response.data.items || []).filter(
          (item) => item.category !== "mcp-servers",
        );
        setItems(nextItems);
        const category =
          categoryOverride || (activeCategory as RegistryEditableCategory);
        const categoryItems = nextItems.filter(
          (item) => item.category === category,
        );
        const target =
          (preferredKey
            ? categoryItems.find((item) => registryItemKey(item) === preferredKey)
            : null) ||
          categoryItems.find((item) => registryItemKey(item) === selectedKey) ||
          categoryItems[0] ||
          null;
        if (target && !newDraft) {
          setSelectedKey(registryItemKey(target));
          await loadDetail(target);
        } else if (!newDraft) {
          setSelectedKey("");
          setDetail(null);
          setDraft("");
          setDirty(false);
        }
      } catch (loadError) {
        if (request === listRequestRef.current) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (request === listRequestRef.current) setLoading(false);
      }
    },
    [activeCategory, loadDetail, newDraft, selectedKey],
  );

  const loadTools = useCallback(async () => {
    const list = await refreshToolsList();
    if (!list) return;
    const first = list[0];
    setSelectedTool(first || null);
    setSelectedKey(first ? `tools/${first.key || first.name || "0"}` : "");
  }, [refreshToolsList]);

  useEffect(() => {
    void loadRegistries(undefined, "providers");
    // The initial category is stable; later refreshes are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmDiscard = useCallback(
    () => !dirty || window.confirm(t("registryConsole.confirm.discard")),
    [dirty, t],
  );

  const selectItem = useCallback((item: AdminRegistryListItem) => {
    if (!confirmDiscard()) return;
    const isTool = String(item.category) === "tools";
    const key = isTool ? `tools/${item.file}` : registryItemKey(item);
    setMessage("");
    setSelectedKey(key);
    if (isTool) {
      detailRequestRef.current += 1;
      setDetailLoading(false);
      setSelectedTool(
        toolItems.find(
          (tool) => (tool.key || tool.name || "unknown") === item.file,
        ) || null,
      );
    } else {
      void loadDetail(item);
    }
  }, [confirmDiscard, loadDetail, toolItems]);

  const switchCategory = useCallback((category: RegistryConsoleTab) => {
    if (category === activeCategory || !confirmDiscard()) return;
    setActiveCategory(category);
    setMessage("");
    setNewDraft(false);
    setDirty(false);
    detailRequestRef.current += 1;
    setDetailLoading(false);
    if (category === "tools") {
      setDetail(null);
      setDraft("");
      if (toolItems.length === 0) void loadTools();
      else {
        const first = toolItems[0];
        setSelectedKey(`tools/${first.key || first.name || "0"}`);
        setSelectedTool(first);
      }
      return;
    }
    const target = items.find((item) => item.category === category);
    if (target) {
      setSelectedKey(registryItemKey(target));
      void loadDetail(target);
    } else {
      setSelectedKey("");
      setDetail(null);
      setDraft("");
    }
  }, [activeCategory, confirmDiscard, items, loadDetail, loadTools, toolItems]);

  const startNew = useCallback(() => {
    if (isToolsTab || !confirmDiscard()) return;
    detailRequestRef.current += 1;
    setDetailLoading(false);
    const category = activeCategory as RegistryEditableCategory;
    const file = defaultRegistryFileName(category, items);
    const content = registryTemplateForCategory(category, file);
    setSelectedKey(`${category}/${file}`);
    setDetail({
      category,
      file,
      key: file.replace(/\.ya?ml$/i, ""),
      status: "ready",
      summary: {},
      content,
    });
    setDraft(content);
    setDirty(true);
    setNewDraft(true);
    setMessage(t("registryConsole.message.newDraft"));
    setError("");
  }, [activeCategory, confirmDiscard, isToolsTab, items, t]);

  const validateDraft = useCallback(async () => {
    if (!detail || isToolsTab) return;
    setValidating(true);
    setError("");
    try {
      const response = await validateAdminRegistry({
        category: detail.category,
        file: detail.file,
        content: draft,
      });
      setDetail((current) =>
        current
          ? {
              ...current,
              status: response.data.status,
              diagnostics: response.data.diagnostics,
              summary: response.data.summary,
              parsed: response.data.parsed,
            }
          : current,
      );
      setMessage(
        response.data.status === "invalid"
          ? t("registryConsole.message.validationInvalid")
          : t("registryConsole.message.validationReady"),
      );
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : String(validationError),
      );
    } finally {
      setValidating(false);
    }
  }, [detail, draft, isToolsTab, t]);

  const saveDraft = useCallback(async () => {
    if (!detail || isToolsTab) return;
    setSaving(true);
    setError("");
    try {
      const response = await updateAdminSource({
        target: {
          type: "registry",
          category: detail.category,
          file: detail.file,
        },
        content: draft,
        baseSha256: detail.sha256,
      });
      const refreshedResponse = await getAdminRegistries();
      const refreshedItems = (refreshedResponse.data.items || []).filter(
        (item) => item.category !== "mcp-servers",
      );
      const refreshed = refreshedItems.find(
        (item) =>
          item.category === detail.category && item.file === detail.file,
      );
      const nextDetail = registryDetailFromSource(response.data, {
        ...detail,
        ...refreshed,
      });
      setDetail(nextDetail);
      setDraft(nextDetail.content || draft);
      setDirty(false);
      setNewDraft(false);
      setSelectedKey(registryItemKey(nextDetail));
      setItems(refreshedItems);
      setMessage(t("registryConsole.message.savedWaiting"));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }, [detail, draft, isToolsTab, t]);

  const refreshCurrent = useCallback(() => {
    if (isToolsTab) void loadTools();
    else if (detail && !newDraft) void loadDetail(detail);
  }, [detail, isToolsTab, loadDetail, loadTools, newDraft]);

  const updateDraft = useCallback((value: string) => {
    setDraft(value);
    setDirty(true);
    setMessage("");
  }, []);

  return {
    activeCategory,
    categoryCounts,
    currentCategoryItems,
    detail,
    detailLoading,
    dirty,
    draft,
    error,
    filteredItems,
    isToolsTab,
    loading,
    loadRegistries,
    message,
    newDraft,
    refreshCurrent,
    saveDraft,
    saving,
    searchText,
    selectItem,
    selectedKey,
    selectedTool,
    setSearchText,
    setStatusDropdownOpen,
    setStatusFilter,
    startNew,
    statusDropdownOpen,
    statusFilter,
    switchCategory,
    toolsLoading,
    updateDraft,
    validateDraft,
    validating,
  };
}
