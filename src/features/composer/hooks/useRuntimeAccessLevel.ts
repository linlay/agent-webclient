import { useCallback, useRef } from "react";
import {
  createRequestId,
  type AccessLevelUpdateParams,
  type AccessLevelUpdateResponse,
  type ApiResponse,
  type QueryAccessLevel,
} from "@/shared/api/apiClient";
import { updateAccessLevel as updateAccessLevelRequest } from "@/features/transport/lib/apiClientProxy";
import type { TranslateParams } from "@/shared/i18n";

type SetAccessLevel = (value: QueryAccessLevel) => void;
type Translate = (key: string, params?: TranslateParams) => string;
type RuntimeAccessMessageApi = {
  warning: (content: string) => unknown;
  error: (content: string) => unknown;
};

interface ApplyRuntimeAccessLevelChangeOptions {
  previousAccessLevel: QueryAccessLevel;
  nextAccessLevel: QueryAccessLevel;
  activeRunId: string;
  activeRunAgentKey: string;
  setAccessLevel: SetAccessLevel;
  messageApi: RuntimeAccessMessageApi;
  t: Translate;
  isLatestRequest?: () => boolean;
  requestIdFactory?: () => string;
  updateAccessLevel?: (
    params: AccessLevelUpdateParams,
  ) => Promise<ApiResponse<AccessLevelUpdateResponse>>;
}

function shouldApplyResult(isLatestRequest?: () => boolean): boolean {
  return !isLatestRequest || isLatestRequest();
}

function formatRejectedMessage(
  t: Translate,
  response: ApiResponse<AccessLevelUpdateResponse>,
): string {
  const detail = String(response.data?.detail || response.msg || "").trim();
  if (!detail) {
    return t("composer.accessLevel.rejected");
  }
  return t("composer.accessLevel.rejectedWithDetail", { detail });
}

function formatFailedMessage(t: Translate, error: unknown): string {
  const detail = error instanceof Error ? String(error.message || "").trim() : "";
  if (!detail) {
    return t("composer.accessLevel.failed");
  }
  return t("composer.accessLevel.failedWithDetail", { detail });
}

export async function applyRuntimeAccessLevelChange({
  previousAccessLevel,
  nextAccessLevel,
  activeRunId,
  activeRunAgentKey,
  setAccessLevel,
  messageApi,
  t,
  isLatestRequest,
  requestIdFactory = () => createRequestId("access"),
  updateAccessLevel = updateAccessLevelRequest,
}: ApplyRuntimeAccessLevelChangeOptions): Promise<void> {
  if (nextAccessLevel === previousAccessLevel) {
    return;
  }

  setAccessLevel(nextAccessLevel);
  if (!activeRunId || !activeRunAgentKey) {
    return;
  }

  try {
    const response = await updateAccessLevel({
      requestId: requestIdFactory(),
      runId: activeRunId,
      agentKey: activeRunAgentKey,
      accessLevel: nextAccessLevel,
      reason: "user toggled permission",
    });
    if (!shouldApplyResult(isLatestRequest)) {
      return;
    }
    if (response.data?.accepted === false) {
      setAccessLevel(previousAccessLevel);
      void messageApi.warning(formatRejectedMessage(t, response));
    }
  } catch (error) {
    if (!shouldApplyResult(isLatestRequest)) {
      return;
    }
    setAccessLevel(previousAccessLevel);
    void messageApi.error(formatFailedMessage(t, error));
  }
}

interface UseRuntimeAccessLevelInput {
  accessLevel: QueryAccessLevel;
  activeRunId: string;
  activeRunAgentKey: string;
  setAccessLevel: SetAccessLevel;
  messageApi: RuntimeAccessMessageApi;
  t: Translate;
}

export function useRuntimeAccessLevel({
  accessLevel,
  activeRunId,
  activeRunAgentKey,
  setAccessLevel,
  messageApi,
  t,
}: UseRuntimeAccessLevelInput): (nextAccessLevel: QueryAccessLevel) => void {
  const requestSeqRef = useRef(0);

  return useCallback(
    (nextAccessLevel: QueryAccessLevel) => {
      requestSeqRef.current += 1;
      const requestSeq = requestSeqRef.current;
      void applyRuntimeAccessLevelChange({
        previousAccessLevel: accessLevel,
        nextAccessLevel,
        activeRunId,
        activeRunAgentKey,
        setAccessLevel,
        messageApi,
        t,
        isLatestRequest: () => requestSeqRef.current === requestSeq,
      });
    },
    [
      accessLevel,
      activeRunAgentKey,
      activeRunId,
      messageApi,
      setAccessLevel,
      t,
    ],
  );
}
