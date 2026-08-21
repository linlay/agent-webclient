import React from "react";
import {
  classifyResourceUrl,
  getResourceBlob,
  type ResourceUrlClassificationOptions,
} from "@/shared/data";
import {
  authenticatedResourceBlobCache,
  withBlobMimeTypeFallback,
  type AuthenticatedResourceCacheState,
} from "./authenticatedResourceUrl";

export interface AuthenticatedResourceUrlState {
  url: string;
  loading: boolean;
  error: unknown;
}

interface InternalAuthenticatedResourceUrlState
  extends AuthenticatedResourceUrlState {
  requestKey: string;
}

export interface AuthenticatedResourceUrlOptions
  extends ResourceUrlClassificationOptions {
  blobMimeTypeFallback?: string;
}

function createRequestKey(
  source: string,
  chatId: string,
  options: AuthenticatedResourceUrlOptions,
): string {
  return `${chatId}\u0000${options.teamChat ? "team" : "agent"}\u0000${options.blobMimeTypeFallback || ""}\u0000${source}`;
}

function getImmediateState(
  source: string,
  chatId: string,
  options: AuthenticatedResourceUrlOptions,
): InternalAuthenticatedResourceUrlState {
  const requestKey = createRequestKey(source, chatId, options);
  if (!source) {
    return { requestKey, url: "", loading: false, error: null };
  }
  const classified = classifyResourceUrl(source, chatId, options);
  if (classified.kind === "external" || classified.kind === "inline") {
    return { requestKey, url: classified.source, loading: false, error: null };
  }
  if (classified.kind === "invalid") {
    return {
      requestKey,
      url: "",
      loading: false,
      error: new Error("Unsupported resource URL"),
    };
  }
  return { requestKey, url: "", loading: true, error: null };
}

export function useAuthenticatedResourceUrl(
  source: string | undefined,
  chatId: string,
  options: AuthenticatedResourceUrlOptions = {},
): AuthenticatedResourceUrlState {
  const normalized = String(source || "").trim();
  const teamChat = Boolean(options.teamChat);
  const blobMimeTypeFallback = String(options.blobMimeTypeFallback || "")
    .trim()
    .toLowerCase();
  const requestOptions = React.useMemo(
    () => ({ teamChat, blobMimeTypeFallback }),
    [blobMimeTypeFallback, teamChat],
  );
  const classificationOptions = React.useMemo(
    () => ({ teamChat }),
    [teamChat],
  );
  const classified = classifyResourceUrl(normalized, chatId, classificationOptions);
  const requestKey = createRequestKey(normalized, chatId, requestOptions);
  const [state, setState] = React.useState<InternalAuthenticatedResourceUrlState>(
    () => getImmediateState(normalized, chatId, requestOptions),
  );

  React.useEffect(() => {
    if (!normalized) {
      setState({ requestKey, url: "", loading: false, error: null });
      return;
    }
    if (classified.kind === "external" || classified.kind === "inline") {
      setState({ requestKey, url: classified.source, loading: false, error: null });
      return;
    }
    if (classified.kind === "invalid") {
      setState(getImmediateState(normalized, chatId, requestOptions));
      return;
    }

    // 共享缓存持有 object-URL 租约与请求去重，组件卸载/重挂
    // （虚拟列表滚动、markdown 重渲染）不再触发重复网络请求。
    const subscription = authenticatedResourceBlobCache.acquire(
      requestKey,
      () => getResourceBlob(normalized, { chatId, teamChat })
        .then((blob) => withBlobMimeTypeFallback(blob, blobMimeTypeFallback)),
    );
    const listener = (next: AuthenticatedResourceCacheState) => {
      setState({ requestKey, ...next });
    };
    setState({ requestKey, ...subscription.state });
    subscription.subscribe(listener);

    return () => {
      subscription.unsubscribe(listener);
      subscription.release();
    };
  }, [blobMimeTypeFallback, chatId, classificationOptions, classified.kind, classified.source, normalized, requestKey, requestOptions, teamChat]);

  return state.requestKey === requestKey
    ? state
    : getImmediateState(normalized, chatId, requestOptions);
}
