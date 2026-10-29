import React from "react";
import { resolveHtmlVisualizationAssets } from "@/shared/utils/htmlVisualizationAssets";
import {
  HTML_ELEMENT_BRIDGE_TIMEOUT_MS,
  HTML_ELEMENT_REVIEW_ACTION,
  HTML_ELEMENT_REVIEW_EVENT,
  HTML_ELEMENT_REVIEW_MAX,
  buildHtmlElementReviewDocument,
  buildHtmlElementReviewPayload,
  buildHtmlElementReviewText,
  createInitialHtmlElementReviewState,
  htmlElementReviewReducer,
  normalizeHtmlElementSelection,
  submittableHtmlElementAnnotations,
} from "../lib/htmlElementReview";

function createToken() {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `html-review-${suffix}`;
}

function createAnnotationId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `annotation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useHtmlElementReview(input: {
  enabled: boolean;
  html: string;
  fileName: string;
  revision: string;
  reloadToken?: number;
  onLimitReached?: () => void;
}) {
  const {
    enabled,
    html,
    fileName,
    revision,
    reloadToken = 0,
    onLimitReached,
  } = input;
  const [state, dispatch] = React.useReducer(
    htmlElementReviewReducer,
    undefined,
    createInitialHtmlElementReviewState,
  );
  const [ready, setReady] = React.useState(false);
  const [bridgeFailed, setBridgeFailed] = React.useState(false);

  const token = React.useMemo(createToken, []);
  const srcDoc = React.useMemo(
    () => enabled
      ? buildHtmlElementReviewDocument(resolveHtmlVisualizationAssets(html), token)
      : "",
    [enabled, html, token],
  );

  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const srcDocRef = React.useRef(srcDoc);
  srcDocRef.current = srcDoc;
  const loadedSrcDocRef = React.useRef<string | null>(null);
  const loadedRef = React.useRef(false);
  const readyRef = React.useRef(false);
  const timeoutRef = React.useRef<number | undefined>(undefined);
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const onLimitReachedRef = React.useRef(onLimitReached);
  onLimitReachedRef.current = onLimitReached;

  const postSync = React.useCallback(() => {
    const target = frameRef.current?.contentWindow;
    if (!target) return;
    const current = stateRef.current;
    target.postMessage({
      type: HTML_ELEMENT_REVIEW_ACTION,
      token,
      enabled: current.annotating,
      locked: Boolean(current.pending),
      annotations: current.annotations.map((annotation) => ({
        id: annotation.id,
        number: annotation.number,
        fullXPath: annotation.fullXPath,
      })),
    }, "*");
  }, [token]);

  const clearTimeoutRef = React.useCallback(() => {
    if (timeoutRef.current !== undefined) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  const onLoad = React.useCallback(() => {
    loadedSrcDocRef.current = srcDocRef.current;
    if (loadedRef.current) {
      // A second load without a new srcDoc is an in-preview navigation. The
      // previous annotations belong to the old document and cannot be trusted.
      dispatch({ type: "RESET" });
    }
    loadedRef.current = true;
    readyRef.current = false;
    setReady(false);
    setBridgeFailed(false);
    clearTimeoutRef();
    timeoutRef.current = window.setTimeout(() => {
      if (readyRef.current) return;
      setBridgeFailed(true);
    }, HTML_ELEMENT_BRIDGE_TIMEOUT_MS);
    postSync();
  }, [clearTimeoutRef, postSync]);

  React.useEffect(() => {
    if (loadedSrcDocRef.current === srcDoc) return;
    loadedRef.current = false;
    readyRef.current = false;
    setReady(false);
    setBridgeFailed(false);
    clearTimeoutRef();
  }, [clearTimeoutRef, srcDoc]);

  React.useEffect(() => () => clearTimeoutRef(), [clearTimeoutRef]);

  React.useEffect(() => {
    if (!enabled) return;
    const onMessage = (event: MessageEvent) => {
      const frameWindow = frameRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || data.type !== HTML_ELEMENT_REVIEW_EVENT || data.token !== token) return;
      const payload = data.payload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return;
      const record = payload as Record<string, unknown>;
      const eventName = String(record.event || "");

      if (eventName === "ready") {
        readyRef.current = true;
        setReady(true);
        setBridgeFailed(false);
        clearTimeoutRef();
        return;
      }

      if (eventName === "html-element-selected") {
        const selection = normalizeHtmlElementSelection({
          fullXPath: record.fullXPath,
          cssSelector: record.cssSelector,
          tagName: record.tagName,
          attributes: record.attributes,
          textExcerpt: record.textExcerpt,
          rect: record.rect,
        });
        if (!selection) return;
        const current = stateRef.current;
        if (!current.annotating || current.pending) return;
        if (current.annotations.length >= HTML_ELEMENT_REVIEW_MAX) {
          onLimitReachedRef.current?.();
          return;
        }
        dispatch({ type: "SELECT", selection });
        return;
      }

      if (eventName === "escape") {
        if (stateRef.current.pending) dispatch({ type: "CANCEL_PENDING" });
        else dispatch({ type: "STOP" });
        return;
      }

      if (eventName === "annotation-invalid") {
        const annotationId = String(record.annotationId || "");
        if (annotationId) dispatch({ type: "INVALIDATE", id: annotationId });
        return;
      }

      if (eventName === "annotation-valid") {
        const annotationId = String(record.annotationId || "");
        if (annotationId) dispatch({ type: "VALIDATE", id: annotationId });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [clearTimeoutRef, enabled, token]);

  const pendingLocked = Boolean(state.pending);
  const syncKey = state.annotations
    .map((annotation) => `${annotation.id}:${annotation.number}:${annotation.fullXPath}`)
    .join("|");

  React.useEffect(() => {
    if (!enabled || !loadedRef.current) return;
    postSync();
  }, [enabled, pendingLocked, postSync, state.annotating, syncKey]);

  const previousHtmlRef = React.useRef(html);
  React.useEffect(() => {
    if (!enabled) return;
    if (previousHtmlRef.current === html) return;
    previousHtmlRef.current = html;
    dispatch({ type: "RESET" });
  }, [enabled, html]);

  const previousReloadRef = React.useRef(reloadToken);
  React.useEffect(() => {
    if (previousReloadRef.current === reloadToken) return;
    previousReloadRef.current = reloadToken;
    dispatch({ type: "RESET" });
  }, [reloadToken]);

  const protectionCount = state.annotations.length + (state.pending ? 1 : 0);
  React.useEffect(() => {
    if (!enabled || protectionCount === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [enabled, protectionCount]);

  const start = React.useCallback(() => {
    if (!enabled || !readyRef.current) return;
    dispatch({ type: "START" });
  }, [enabled]);

  const stop = React.useCallback(() => dispatch({ type: "STOP" }), []);
  const reset = React.useCallback(() => dispatch({ type: "RESET" }), []);
  const toggleList = React.useCallback(() => {
    dispatch({ type: "SET_LIST", open: !stateRef.current.listOpen });
  }, []);
  const closeList = React.useCallback(() => dispatch({ type: "SET_LIST", open: false }), []);
  const setPendingRequirement = React.useCallback((value: string) => {
    dispatch({ type: "PENDING_REQUIREMENT", value });
  }, []);
  const confirmPending = React.useCallback(() => {
    dispatch({ type: "CONFIRM_PENDING", id: createAnnotationId() });
  }, []);
  const cancelPending = React.useCallback(() => dispatch({ type: "CANCEL_PENDING" }), []);
  const updateRequirement = React.useCallback((id: string, value: string) => {
    dispatch({ type: "UPDATE_REQUIREMENT", id, value });
  }, []);
  const removeAnnotation = React.useCallback((id: string) => {
    dispatch({ type: "REMOVE", id });
  }, []);

  const submittable = React.useMemo(
    () => submittableHtmlElementAnnotations(state.annotations, state.invalidIds),
    [state.annotations, state.invalidIds],
  );

  const prepareHandoff = React.useCallback(() => {
    const current = stateRef.current;
    const payload = buildHtmlElementReviewPayload({
      fileName,
      revision,
      annotations: current.annotations,
      invalidIds: current.invalidIds,
    });
    if (!payload) return null;
    const text = buildHtmlElementReviewText({
      fileName,
      annotations: current.annotations,
      invalidIds: current.invalidIds,
    });
    if (!text) return null;
    return { payload, text };
  }, [fileName, revision]);

  const completeHandoff = React.useCallback(() => dispatch({ type: "RESET" }), []);

  return {
    ready,
    bridgeFailed,
    annotating: state.annotating,
    pending: state.pending,
    annotations: state.annotations,
    invalidIds: state.invalidIds,
    listOpen: state.listOpen,
    count: state.annotations.length,
    protectionCount,
    submittableCount: submittable.length,
    canHandoff: submittable.length > 0 && !state.pending,
    frameRef,
    srcDoc,
    onLoad,
    start,
    stop,
    reset,
    toggleList,
    closeList,
    setPendingRequirement,
    confirmPending,
    cancelPending,
    updateRequirement,
    removeAnnotation,
    prepareHandoff,
    completeHandoff,
  };
}

export type HtmlElementReviewController = ReturnType<typeof useHtmlElementReview>;
