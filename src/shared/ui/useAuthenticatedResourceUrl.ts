import React from "react";
import {
  classifyResourceUrl,
  getResourceBlob,
  type ResourceUrlClassificationOptions,
} from "@/shared/data";
import {
  createObjectUrlLease,
  type ObjectUrlLease,
  withBlobMimeTypeFallback,
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

    const controller = new AbortController();
    let lease: ObjectUrlLease | null = null;
    setState({ requestKey, url: "", loading: true, error: null });
    void getResourceBlob(normalized, {
      chatId,
      signal: controller.signal,
      teamChat,
    })
      .then((blob) => {
        if (controller.signal.aborted) return;
        lease = createObjectUrlLease(
          withBlobMimeTypeFallback(blob, blobMimeTypeFallback),
        );
        setState({ requestKey, url: lease.url, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ requestKey, url: "", loading: false, error });
        }
      });

    return () => {
      controller.abort();
      lease?.revoke();
    };
  }, [blobMimeTypeFallback, chatId, classificationOptions, classified.kind, classified.source, normalized, requestKey, requestOptions, teamChat]);

  return state.requestKey === requestKey
    ? state
    : getImmediateState(normalized, chatId, requestOptions);
}
