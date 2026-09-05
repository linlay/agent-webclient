import { useAppDispatch, useAppState } from "@/app/state/AppContext";
import { useI18n } from "@/shared/i18n";

/** Shared application bindings used by both Memory page and modal runtimes. */
export function useMemoryRuntime() {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { t } = useI18n();
  return { state, dispatch, t };
}
