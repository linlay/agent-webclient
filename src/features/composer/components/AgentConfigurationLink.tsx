import { isEmbedMode } from "@/shared/config/embed";
import React, { useState } from "react";
import { isDesktopAppMode } from "@/shared/utils/routing";
import { openDesktopAgentConfiguration } from "@/shared/data/desktop/desktopAgentConfiguration";
import { useI18n } from "@/shared/i18n";
import { useClientPageNavigation } from "@/shared/ui/ClientNavigationContext";
import { toMobileRoute } from "@/shared/utils/mobileRoutes";

export function AgentConfigurationLink({ agentKey }: { agentKey: string }) {
  const { t } = useI18n();
  const navigatePage = useClientPageNavigation();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  if (isEmbedMode()) return <span>{t("composer.agent.unavailable")}</span>;
  if (!isDesktopAppMode()) {
    const target = `/agents/${encodeURIComponent(agentKey)}`;
    return <a href={navigatePage ? toMobileRoute(target) : target} className="tw:underline"
      onClick={event => {
        if (!navigatePage || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        void navigatePage(target);
      }}>
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
