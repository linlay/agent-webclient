import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { getAdminSkills, putAdminSkillPin } from "@/shared/data";
import type { AdminSkillsResponse, AdminSkillSummary } from "@/shared/data";
import { getDataSessionRevision } from "@/shared/data/auth/dataSession";
import { useI18n } from "@/shared/i18n";

const EMPTY: AdminSkillsResponse = { skills: [], packages: [], pinned: [] };
const asError = (error: unknown) => error instanceof Error ? error : new Error(String(error));

/** Management owns its HTTP lifecycle; never subscribes to the conversation transport. */
export function useAdminSkillCatalog() {
  const { locale } = useI18n();
  const session = getDataSessionRevision();
  const [snapshot, setSnapshot] = useState({ session, data: EMPTY });
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<Error | null>(null);
  const [pinError, setPinError] = useState<Error | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const mounted = useRef(false);
  const lifecycle = useRef(0);
  const readSequence = useRef(0);
  const pinRevision = useRef(0);
  const pendingWrite = useRef(false);
  const data = snapshot.session === session ? snapshot.data : EMPTY;

  const refresh = useCallback((): Promise<void> => {
    const sequence = ++readSequence.current;
    const identity = getDataSessionRevision();
    const startedAt = pinRevision.current;
    setListLoading(true);
    setListError(null);
    setPinError(null);
    const active = () => mounted.current && sequence === readSequence.current && identity === getDataSessionRevision();
    const request = (async () => {
      try {
        const response = await getAdminSkills();
        // Reject incompatible deployments explicitly, rather than displaying an empty catalog.
        const next = response.data;
        if (!next || !Array.isArray(next.skills) || !Array.isArray(next.packages) || !Array.isArray(next.pinned)) {
          throw new Error("Invalid /api/admin/skills response: expected skills, packages and pinned arrays");
        }
        if (!active()) return;
        setSnapshot(previous => ({ session: identity, data: {
          ...next,
          pinned: startedAt === pinRevision.current || previous.session !== identity ? next.pinned : previous.data.pinned,
        } }));
        setLoaded(true);
      } catch (error) {
        if (active()) setListError(asError(error));
      } finally {
        if (mounted.current && sequence === readSequence.current) {
          setListLoading(false);
        }
      }
    })();
    return request;
  }, []);

  useEffect(() => {
    mounted.current = true;
    setLoaded(false);
    setSaving(false);
    pendingWrite.current = false;
    return () => { mounted.current = false; ++lifecycle.current; };
  }, [session]);

  useEffect(() => {
    void refresh();
    return () => {
      ++readSequence.current;
    };
  }, [session, locale, refresh]);

  const toggleSkillPin = useCallback(async (id: string) => {
    if (pendingWrite.current || !loaded || snapshot.session !== getDataSessionRevision()) return;
    const identity = snapshot.session;
    const generation = lifecycle.current;
    const active = () => mounted.current && generation === lifecycle.current && identity === getDataSessionRevision();
    pendingWrite.current = true;
    setSaving(true);
    setPinError(null);
    try {
      const response = await putAdminSkillPin({ id, pinned: !data.pinned.includes(id.trim().toLowerCase()) });
      if (!active()) return;
      ++pinRevision.current;
      setSnapshot(previous => ({ ...previous, data: { ...previous.data, pinned: response.data.pinned } }));
    } catch (error) {
      if (active()) setPinError(asError(error));
    } finally {
      if (active()) {
        pendingWrite.current = false;
        setSaving(false);
      }
    }
  }, [data.pinned, loaded, snapshot.session]);

  const setSkills = useCallback((action: SetStateAction<AdminSkillSummary[]>) => {
    setSnapshot(previous => ({ ...previous, data: { ...previous.data,
      skills: typeof action === "function" ? action(previous.data.skills) : action,
    } }));
  }, []);
  return { skills: data.skills, packages: data.packages, pinnedSkillIds: data.pinned, setSkills,
    refresh, toggleSkillPin, listLoading, listError, pinError,
    pinsDisabled: saving || !loaded || snapshot.session !== session };
}
