import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentAccessToken, getSkillOrder, putSkillOrder, getConnectorOrder, putConnectorOrder } from "@/shared/data/api/routedClient";
import { getGatewaySession } from "@/shared/data/auth/gatewaySession";
import { getBackendMode } from "@/shared/config/backendMode";
import { dataEndpoints } from "@/shared/data/api/endpoints";
import { createDataCacheKey } from "@/shared/data/api/endpointRegistry";
import { dataQueryCache, useDataQuery } from "@/shared/data/query/serverState";

const EMPTY_KEYS: readonly string[] = [];
const TTL_MS = 30_000;
let lastIdentity: string | undefined;
let sessionRevision = 0;

// Opaque cache keys contain no token. Only the server decides user identity.
function currentSessionRevision(): number {
  const identity = `${getBackendMode()}\0${getCurrentAccessToken()}\0${getGatewaySession()?.user?.subject || ""}`;
  if (identity !== lastIdentity) {
    lastIdentity = identity;
    sessionRevision += 1;
  }
  return sessionRevision;
}

const catalogs = {
  skills: { endpoint: dataEndpoints.skillOrder, read: getSkillOrder, write: putSkillOrder },
  connectors: { endpoint: dataEndpoints.connectorOrder, read: getConnectorOrder, write: putConnectorOrder },
};

export function useCatalogOrder(catalog: keyof typeof catalogs, enabled: boolean) {
  const config = catalogs[catalog];
  const revision = currentSessionRevision();
  const endpoint = useMemo(() => ({
    ...config.endpoint,
    key: `${config.endpoint.key}:${revision}`,
  }), [config, revision]);
  const query = useDataQuery(endpoint, undefined, config.read, { enabled: false, ttlMs: TTL_MS });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const pending = useRef(false);
  const refreshPins = useCallback(() => {
    setSaveError(null);
    query.invalidate();
    return query.refetch();
  }, [query.invalidate, query.refetch]);

  useEffect(() => {
    setSaveError(null);
    if (!enabled) return;
    const refresh = () => { void refreshPins().catch(() => undefined); };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [enabled, refreshPins]);

  const pinnedKeys = query.data?.order ?? EMPTY_KEYS;
  const togglePin = useCallback(async (key: string) => {
    if (pending.current || query.status !== "success") return;
    pending.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await config.write({ key, pinned: !pinnedKeys.includes(key.trim().toLowerCase()) });
      const cacheKey = createDataCacheKey(endpoint);
      dataQueryCache.invalidate(cacheKey);
      await dataQueryCache.fetch(cacheKey, () => Promise.resolve(response.data), { ttlMs: TTL_MS });
    } catch (error) {
      setSaveError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }, [config, endpoint, pinnedKeys, query.status]);

  return {
    pinnedKeys,
    togglePin,
    refreshPins,
    pinsDisabled: saving || query.status !== "success",
    pinError: saveError || query.error,
  };
}
