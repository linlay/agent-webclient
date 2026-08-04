import React from "react";
import {
  getResourceBlob,
  isLegacyResourceUrl,
  isLogicalResourceRef,
} from "@/shared/data";

export interface AuthenticatedResourceUrlState {
  url: string;
  loading: boolean;
  error: unknown;
}

export function useAuthenticatedResourceUrl(
  source: string | undefined,
  chatId: string,
): AuthenticatedResourceUrlState {
  const normalized = String(source || "").trim();
  const authenticated =
    isLegacyResourceUrl(normalized) || isLogicalResourceRef(normalized, chatId);
  const [state, setState] = React.useState<AuthenticatedResourceUrlState>({
    url: authenticated ? "" : normalized,
    loading: authenticated,
    error: null,
  });

  React.useEffect(() => {
    if (!authenticated) {
      setState({ url: normalized, loading: false, error: null });
      return;
    }

    const controller = new AbortController();
    let objectUrl = "";
    setState({ url: "", loading: true, error: null });
    void getResourceBlob(normalized, { chatId, signal: controller.signal })
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ url: "", loading: false, error });
        }
      });

    return () => {
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [authenticated, chatId, normalized]);

  return state;
}
