import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getAgentSkills, putAgentSkillPin, invalidateAgentSkills, getCurrentAccessToken } from "@/shared/data/api/routedClient";
import { getGatewaySession } from "@/shared/data/auth/gatewaySession";
import { getBackendMode } from "@/shared/config/backendMode";
import { createDataCacheKey } from "@/shared/data/api/endpointRegistry";
import { dataEndpoints } from "@/shared/data/api/endpoints";
import { dataQueryCache, useDataQuery } from "@/shared/data/query/serverState";

const EMPTY_KEYS: readonly string[] = [];
const TTL_MS = 30_000;
let lastIdentity: string | undefined;
let sessionRevision = 0;
let pinRevision = 0;
let readSequence = 0;
let publishedReadSequence = 0;

function currentSessionRevision() {
  const identity = `${getBackendMode()}\0${getCurrentAccessToken()}\0${getGatewaySession()?.user?.subject || ""}`;
  if (identity !== lastIdentity) {
    lastIdentity = identity;
    sessionRevision += 1;
  }
  return sessionRevision;
}

async function publishPins(key: string, pinned: string[]) {
  dataQueryCache.invalidate(key);
  await dataQueryCache.fetch(key, () => Promise.resolve(pinned), { ttlMs: TTL_MS });
}

/** One remote read supplies both the global catalog and user pins. */
export function usePinnedSkills(enabled: boolean, agentKey = "") {
  const revision = currentSessionRevision();
  const normalizedAgentKey = agentKey.trim();
  const endpoint = useMemo(() => ({
    ...dataEndpoints.agentSkills,
    key: `skills.catalog:${revision}`,
  }), [revision]);
  // A shared in-memory projection, populated by catalog reads and pin writes only.
  const pinsEndpoint = useMemo(() => ({ ...dataEndpoints.agentSkills, key: `skills.pins:${revision}` }), [revision]);
  const pinsCacheKey = createDataCacheKey(pinsEndpoint, "");
  const pins = useSyncExternalStore(
    useCallback(listener => dataQueryCache.subscribe(pinsCacheKey, listener), [pinsCacheKey]),
    useCallback(() => dataQueryCache.getSnapshot<string[]>(pinsCacheKey), [pinsCacheKey]),
    useCallback(() => dataQueryCache.getSnapshot<string[]>(pinsCacheKey), [pinsCacheKey]),
  );
  const read = useCallback(async (key: string) => {
    const startedAt = pinRevision;
    const sequence = ++readSequence;
    const response = await getAgentSkills(key);
    if (revision === sessionRevision && startedAt === pinRevision && sequence > publishedReadSequence) {
      publishedReadSequence = sequence;
      await publishPins(pinsCacheKey, response.data.pinned);
    }
    return response;
  }, [revision, pinsCacheKey]);
  const query = useDataQuery(endpoint, normalizedAgentKey, read, { enabled: false, ttlMs: TTL_MS });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const pending = useRef(false);
  const refreshPins = useCallback(() => {
    setSaveError(null);
    invalidateAgentSkills(normalizedAgentKey);
    query.invalidate();
    return query.refetch();
  }, [normalizedAgentKey, query.invalidate, query.refetch]);

  useEffect(() => {
    setSaveError(null);
    if (!enabled) return;
    const refresh = () => { void refreshPins().catch(() => undefined); };
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [enabled, refreshPins]);

  const pinnedSkillKeys = pins.data ?? EMPTY_KEYS;
  const toggleSkillPin = useCallback(async (key: string) => {
    if (pending.current || pins.status !== "success" || (enabled && query.status !== "success")) return;
    pending.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await putAgentSkillPin({ key, pinned: !pinnedSkillKeys.includes(key.trim().toLowerCase()) });
      if (revision !== sessionRevision) return;
      pinRevision += 1;
      await publishPins(pinsCacheKey, response.data.pinned);
    } catch (error) {
      if (revision === sessionRevision) setSaveError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }, [pins.status, pinnedSkillKeys, revision, pinsCacheKey, enabled, query.status]);

  return {
    ...query,
    refetch: refreshPins,
    pinnedSkillKeys,
    toggleSkillPin,
    refreshPins,
    pinsDisabled: saving || pins.status !== "success" || (enabled && query.status !== "success"),
    pinError: saveError || query.error,
  };
}
