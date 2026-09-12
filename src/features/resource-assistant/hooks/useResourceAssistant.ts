import { useCallback, useEffect, useRef, useState } from "react";
import { message } from "antd";
import { getAgents } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { firstChatAgent, resourceAssistantUrl, resourceComposerPrefill, type ResourceAssistantRequest } from "../lib/resourceAssistant";

export function useResourceAssistant() {
  const { t } = useI18n();
  const [opening, setOpening] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const open = useCallback(async (request: ResourceAssistantRequest, onOpened?: () => void) => {
    if (pending.current) return;
    pending.current = true;
    setOpening(true);
    const source = window.location.href;
    try {
      const prefill = resourceComposerPrefill(request, t);
      let agentKey = "";
      if (isDesktopAppMode()) {
        agentKey = new URL(source).searchParams.get("chatDefaultAgentKey")?.trim() || "";
      } else {
        agentKey = firstChatAgent((await getAgents({ scope: "nav", includeTeam: false })).data);
      }
      if (!mounted.current || window.location.href !== source) return;
      if (!agentKey) throw new Error(t("resourceAssistant.agentUnavailable"));
      // Full URL navigation lets the Desktop management surface hand off before
      // the destination Composer consumes its one-shot query parameters.
      const target = resourceAssistantUrl(agentKey, prefill);
      if (target.length > 8192) throw new Error(t("resourceAssistant.draftTooLong"));
      window.location.assign(target);
      onOpened?.();
    } catch (error) {
      if (mounted.current) void message.error(error instanceof Error ? error.message : t("resourceAssistant.openFailed"));
    } finally {
      pending.current = false;
      if (mounted.current) setOpening(false);
    }
  }, [t]);
  return { open, opening };
}
