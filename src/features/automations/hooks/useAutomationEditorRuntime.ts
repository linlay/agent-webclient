import { useCallback, useEffect, useRef, useState } from "react";
import { message } from "antd";
import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import type { CurrentWorkerSummary } from "@/features/workers/lib/currentWorker";
import {
  automationFormFromDetail,
  buildCreateAutomationPayloadForSubmit,
  buildUpdateAutomationPayloadForSubmit,
  createInitialAutomationForm,
  isCurrentAutomationSourceRequest,
  validateAutomationForm,
  type AutomationEditorMode,
  type AutomationFormState,
} from "@/features/automations/lib/automationForm";
import {
  createAutomation,
  deleteAutomation,
  getAdminSource,
  getAutomation,
  toggleAutomation,
  updateAdminSource,
  updateAutomation,
  type AdminSourceResponse,
} from "@/shared/data";

interface UseAutomationEditorRuntimeOptions {
  automationId: string;
  currentWorker: CurrentWorkerSummary | null;
  onDeleted?: (automationId: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: (automationId: string) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}

export function useAutomationEditorRuntime({
  automationId,
  currentWorker,
  onDeleted,
  onDirtyChange,
  onSaved,
  t,
}: UseAutomationEditorRuntimeOptions) {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const normalizedId = String(automationId || "").trim();
  const [form, setForm] = useState<AutomationFormState>(() =>
    createInitialAutomationForm(currentWorker),
  );
  const [editorMode, setEditorMode] =
    useState<AutomationEditorMode>("structured");
  const [loading, setLoading] = useState(Boolean(normalizedId));
  const [loadingSource, setLoadingSource] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [sourceDraft, setSourceDraft] = useState("");
  const [sourceSha256, setSourceSha256] = useState("");
  const [sourceLoadedId, setSourceLoadedId] = useState("");
  const [sourceDirty, setSourceDirty] = useState(false);
  const [dirty, setDirty] = useState(false);
  const sourceLoadSeqRef = useRef(0);
  const selectedIdRef = useRef(normalizedId);

  const resetForCreate = useCallback(() => {
    sourceLoadSeqRef.current += 1;
    selectedIdRef.current = "";
    setForm(createInitialAutomationForm(currentWorker));
    setEditorMode("structured");
    setSourceDraft("");
    setSourceSha256("");
    setSourceLoadedId("");
    setSourceDirty(false);
    setDirty(false);
    setError("");
    setFormError("");
    setLoading(false);
  }, [currentWorker]);

  const loadAutomation = useCallback(async () => {
    const id = String(automationId || "").trim();
    if (!id) {
      resetForCreate();
      return;
    }
    const requestSeq = sourceLoadSeqRef.current + 1;
    sourceLoadSeqRef.current = requestSeq;
    selectedIdRef.current = id;
    setLoading(true);
    setError("");
    setFormError("");
    setEditorMode("structured");
    setSourceDraft("");
    setSourceSha256("");
    setSourceLoadedId("");
    setSourceDirty(false);
    try {
      const response = await getAutomation(id);
      if (requestSeq !== sourceLoadSeqRef.current || selectedIdRef.current !== id) {
        return;
      }
      setForm(automationFormFromDetail(response.data));
      setDirty(false);
    } catch (loadError) {
      if (requestSeq === sourceLoadSeqRef.current) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    } finally {
      if (requestSeq === sourceLoadSeqRef.current) setLoading(false);
    }
  }, [automationId, resetForCreate]);

  useEffect(() => {
    void loadAutomation();
    return () => {
      sourceLoadSeqRef.current += 1;
    };
  }, [loadAutomation]);

  useEffect(() => {
    onDirtyChange?.(dirty || sourceDirty);
  }, [dirty, onDirtyChange, sourceDirty]);

  const updateForm = useCallback((patch: Partial<AutomationFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
    setDirty(true);
    setFormError("");
  }, []);

  const saveForm = useCallback(async () => {
    const validation = validateAutomationForm(form, t);
    if (validation) {
      setFormError(validation);
      return;
    }
    setSaving(true);
    setError("");
    setFormError("");
    try {
      const response = normalizedId
        ? await updateAutomation(buildUpdateAutomationPayloadForSubmit(form))
        : await createAutomation(buildCreateAutomationPayloadForSubmit(form));
      setForm(automationFormFromDetail(response.data));
      setDirty(false);
      message.success(t("automationConsole.message.saveSuccess"));
      onSaved?.(response.data.id);
    } catch (saveError) {
      const detail = saveError instanceof Error ? saveError.message : String(saveError);
      setFormError(detail);
      message.error(t("automationConsole.message.saveFailed", { detail }));
    } finally {
      setSaving(false);
    }
  }, [form, normalizedId, onSaved, t]);

  const applySourceResponse = useCallback((response: AdminSourceResponse) => {
    setSourceDraft(response.content);
    setSourceSha256(response.sha256);
    setSourceLoadedId(response.target.key || "");
    setSourceDirty(false);
    setDirty(false);
  }, []);

  const toggleEditorMode = useCallback(async () => {
    if (!normalizedId) return;
    if (editorMode === "source") {
      setEditorMode("structured");
      return;
    }
    const id = normalizedId;
    setEditorMode("source");
    if (sourceLoadedId === id) return;
    const requestSeq = sourceLoadSeqRef.current + 1;
    sourceLoadSeqRef.current = requestSeq;
    setLoadingSource(true);
    setFormError("");
    try {
      const response = await getAdminSource({ type: "automation", key: id });
      if (
        isCurrentAutomationSourceRequest(
          requestSeq,
          sourceLoadSeqRef.current,
          id,
          selectedIdRef.current,
        )
      ) {
        applySourceResponse(response.data);
      }
    } catch (sourceError) {
      if (requestSeq === sourceLoadSeqRef.current) {
        setFormError(
          sourceError instanceof Error ? sourceError.message : String(sourceError),
        );
      }
    } finally {
      if (requestSeq === sourceLoadSeqRef.current) setLoadingSource(false);
    }
  }, [applySourceResponse, editorMode, normalizedId, sourceLoadedId]);

  const updateSourceDraft = useCallback((value: string) => {
    setSourceDraft(value);
    setSourceDirty(true);
    setDirty(true);
    setFormError("");
  }, []);

  const saveSource = useCallback(async () => {
    if (!normalizedId || sourceLoadedId !== normalizedId || !sourceDirty) return;
    const id = normalizedId;
    const requestSeq = sourceLoadSeqRef.current + 1;
    sourceLoadSeqRef.current = requestSeq;
    setSaving(true);
    setError("");
    setFormError("");
    try {
      const response = await updateAdminSource({
        target: { type: "automation", key: id },
        content: sourceDraft,
        baseSha256: sourceSha256 || undefined,
      });
      if (
        isCurrentAutomationSourceRequest(
          requestSeq,
          sourceLoadSeqRef.current,
          id,
          selectedIdRef.current,
        )
      ) {
        applySourceResponse(response.data);
      }
      const detailResponse = await getAutomation(id);
      if (requestSeq === sourceLoadSeqRef.current) {
        setForm(automationFormFromDetail(detailResponse.data));
      }
      onSaved?.(id);
    } catch (sourceError) {
      setFormError(
        sourceError instanceof Error ? sourceError.message : String(sourceError),
      );
    } finally {
      setSaving(false);
    }
  }, [applySourceResponse, normalizedId, onSaved, sourceDraft, sourceDirty, sourceLoadedId, sourceSha256]);

  const toggleEnabled = useCallback(async () => {
    if (!normalizedId) {
      updateForm({ enabled: !form.enabled });
      return;
    }
    setSavingToggle(true);
    setError("");
    try {
      const response = await toggleAutomation({
        id: normalizedId,
        enabled: !form.enabled,
      });
      setForm(automationFormFromDetail(response.data));
      dispatch({
        type: "SET_AUTOMATIONS",
        automations: state.automations.map((item) =>
          item.id === response.data.id ? { ...item, ...response.data } : item,
        ),
      });
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : String(toggleError));
    } finally {
      setSavingToggle(false);
    }
  }, [dispatch, form.enabled, normalizedId, state.automations, updateForm]);

  const deleteCurrent = useCallback(async () => {
    if (!normalizedId) return;
    setDeleting(true);
    setError("");
    try {
      await deleteAutomation({ id: normalizedId });
      dispatch({
        type: "SET_AUTOMATIONS",
        automations: state.automations.filter((item) => item.id !== normalizedId),
      });
      setDirty(false);
      onDeleted?.(normalizedId);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : String(deleteError));
    } finally {
      setDeleting(false);
    }
  }, [dispatch, normalizedId, onDeleted, state.automations]);

  return {
    deleteCurrent,
    deleting,
    dirty: dirty || sourceDirty,
    editorMode,
    error,
    form,
    formError,
    loadAutomation,
    loading,
    loadingSource,
    saveForm,
    saveSource,
    saving,
    savingToggle,
    sourceDraft,
    sourceDirty,
    sourceLoadedId,
    toggleEditorMode,
    toggleEnabled,
    updateForm,
    updateSourceDraft,
  };
}
