import { useEffect, useRef } from "react";
import { useAppContext } from "@/app/state/AppContext";
import { isMemoryEnabled } from "@/shared/config/featureFlags";
import { useMemoryRecords } from "@/features/memory/hooks/useMemoryRecords";
import { toText } from "@/shared/utils/eventUtils";
import { isAppMode } from "@/shared/utils/routing";

export function useMemoryRecordsInitialization(): void {
  const { state } = useAppContext();
  const memoryEnabled = isMemoryEnabled();
  const { agentKey, loadRecords } = useMemoryRecords(memoryEnabled);
  const initialRecordsLoadCompletedRef = useRef(false);

  useEffect(() => {
    if (!memoryEnabled || initialRecordsLoadCompletedRef.current) return;
    if (isAppMode() && !toText(state.accessToken)) return;

    let cancelled = false;
    void loadRecords({ includeDetail: false }).then(() => {
      if (!cancelled) initialRecordsLoadCompletedRef.current = true;
    });
    // Retry initialization if its context changes before completion. Once it
    // finishes, subsequent queries remain explicit user actions.
    return () => { cancelled = true; };
  }, [agentKey, loadRecords, memoryEnabled, state.accessToken]);
}
