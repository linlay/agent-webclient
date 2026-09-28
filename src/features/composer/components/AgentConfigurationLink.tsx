import React, { useState } from "react";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { openDesktopAgentConfiguration } from "@/shared/data/desktop/desktopAgentConfiguration";
import { useI18n } from "@/shared/i18n";

export function AgentConfigurationLink({ agentKey }: { agentKey: string }) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!isDesktopAppMode()) {
    return <a href={`/agents/${encodeURIComponent(agentKey)}`} className="tw:underline">
      {t("composer.agent.unavailable")}
    </a>;
  }
  return <span>
    <button
      type="button"
      className="tw:underline"
      disabled={pending}
      aria-busy={pending}
      onClick={async () => {
        setPending(true);
        setFailed(false);
        try {
          await openDesktopAgentConfiguration(agentKey);
        } catch {
          setFailed(true);
        } finally {
          setPending(false);
        }
      }}
    >
      {t("composer.agent.unavailable")}
    </button>
    {failed && <span role="alert" className="tw:block">
      {t("composer.agent.configurationOpenFailed")}
    </span>}
  </span>;
}
