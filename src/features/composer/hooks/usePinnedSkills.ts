import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { getAgentSkills, putAgentSkillPin, invalidateAgentSkills } from "@/shared/data/api/routedClient";
import { getDataSessionRevision } from "@/shared/data/auth/dataSession";
import { usePushSignal, useReconnectSignal } from "@/features/transport/hooks/useRefreshSignals";
import { skillRefresh, retainSkillRefresh, affectsSkillsCatalog, SKILLS_REFRESH_EVENT } from "@/features/skills/lib/skillRefresh";
import { getBackendMode } from "@/shared/config/backendMode";
import { createDataCacheKey } from "@/shared/data/api/endpointRegistry";
import { dataEndpoints } from "@/shared/data/api/endpoints";
import { dataQueryCache } from "@/shared/data/query/serverState";
import { useI18n } from "@/shared/i18n";

const EMPTY_KEYS: readonly string[] = [];
const TTL_MS = 30_000;
let pinRevision = 0;
let readSequence = 0;
let publishedReadSequence = 0;

async function publishPins(key: string, pinned: string[]) {
  dataQueryCache.invalidate(key);
  await dataQueryCache.fetch(key, () => Promise.resolve(pinned), { ttlMs: TTL_MS });
}

/** One remote read supplies both the global catalog and user pins. */
export function usePinnedSkills(enabled: boolean, agentKey = "") {
  const { locale } = useI18n();
  const revision = getDataSessionRevision();
  const normalizedAgentKey = agentKey.trim();
  const endpoint = useMemo(() => ({
    ...dataEndpoints.agentSkills,
    key: `skills.catalog:${revision}:${locale}`,
  }), [revision, locale]);
  // A shared in-memory projection, populated by catalog reads and pin writes only.
  const pinsEndpoint = useMemo(() => ({ ...dataEndpoints.agentSkills, key: `skills.pins:${revision}` }), [revision]);
  const pinsCacheKey = createDataCacheKey(pinsEndpoint, "");
  const pins = useSyncExternalStore(
    useCallback(listener => dataQueryCache.subscribe(pinsCacheKey, listener), [pinsCacheKey]),
    useCallback(() => dataQueryCache.getSnapshot<string[]>(pinsCacheKey), [pinsCacheKey]),
    useCallback(() => dataQueryCache.getSnapshot<string[]>(pinsCacheKey), [pinsCacheKey]),
  );
  const cacheKey = createDataCacheKey(endpoint, normalizedAgentKey);
  const snapshot = useSyncExternalStore(
    useCallback(listener => dataQueryCache.subscribe(cacheKey, listener), [cacheKey]),
    useCallback(() => dataQueryCache.getSnapshot<import("@/shared/data/api/dto/agents").AgentSkillsResponse>(cacheKey, TTL_MS), [cacheKey]),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const pending = useRef(false);
  const refreshPins = useCallback((changed = true) => {
    setSaveError(null);
    const startedAt = pinRevision;
    const sequence = ++readSequence;
    return skillRefresh(cacheKey).read(
      async () => { dataQueryCache.markLoading(cacheKey); return (await getAgentSkills(normalizedAgentKey)).data; },
      () => { invalidateAgentSkills(normalizedAgentKey); dataQueryCache.invalidate(cacheKey); },
      response => {
        if (revision !== getDataSessionRevision()) return;
        dataQueryCache.invalidate(cacheKey);
        void dataQueryCache.fetch(cacheKey, () => Promise.resolve(response), { ttlMs: TTL_MS });
        if (startedAt === pinRevision && sequence > publishedReadSequence) {
          publishedReadSequence = sequence;
          void publishPins(pinsCacheKey, response.pinned);
        }
      },
      error => {
        if (revision !== getDataSessionRevision()) return;
        dataQueryCache.invalidate(cacheKey);
        void dataQueryCache.fetch(cacheKey, () => Promise.reject(error)).catch(() => undefined);
      }, changed,
    );
  }, [cacheKey, normalizedAgentKey, pinsCacheKey, revision]);
  const query = { ...snapshot, refetch: refreshPins };
  useEffect(() => {
    if (!enabled) return;
    const release = retainSkillRefresh(cacheKey);
    void refreshPins();
    const focus = () => { if (getBackendMode() === "gateway") void refreshPins(false); };
    const requested = (event: Event) => {
      if ((event as CustomEvent).detail?.agentKey === normalizedAgentKey) void refreshPins();
    };
    window.addEventListener("focus", focus);
    window.addEventListener(SKILLS_REFRESH_EVENT, requested);
    return () => { release(); window.removeEventListener("focus", focus); window.removeEventListener(SKILLS_REFRESH_EVENT, requested); };
  }, [enabled, normalizedAgentKey, refreshPins, cacheKey]);
  usePushSignal("catalog.updated", frame => { if (affectsSkillsCatalog(frame)) void refreshPins(); }, enabled);
  useReconnectSignal(() => { void refreshPins(); }, enabled);

  const pinnedSkillIds = pins.data ?? EMPTY_KEYS;
  const toggleSkillPin = useCallback(async (key: string) => {
    if (pending.current || pins.status !== "success" || (enabled && query.status !== "success")) return;
    pending.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await putAgentSkillPin({ id: key, pinned: !pinnedSkillIds.includes(key.trim().toLowerCase()) });
      if (revision !== getDataSessionRevision()) return;
      pinRevision += 1;
      await publishPins(pinsCacheKey, response.data.pinned);
    } catch (error) {
      if (revision === getDataSessionRevision()) setSaveError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }, [pins.status, pinnedSkillIds, revision, pinsCacheKey, enabled, query.status]);

  return {
    ...query,
    refetch: refreshPins,
    pinnedSkillIds,
    toggleSkillPin,
    refreshPins,
    pinsDisabled: saving || pins.status !== "success" || (enabled && query.status !== "success"),
    pinError: saveError || query.error,
  };
}
