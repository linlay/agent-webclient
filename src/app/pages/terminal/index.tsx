import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { TerminalWorkspace } from "@/features/terminal/components/TerminalWorkspace";
import { useI18n } from "@/shared/i18n";

export const TerminalPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const agentKey = useMemo(
    () => String(searchParams.get("agentKey") || "").trim(),
    [searchParams],
  );
  const terminalKey = useMemo(
    () => String(searchParams.get("terminalKey") || "").trim() || "main",
    [searchParams],
  );

  if (!agentKey) {
    return (
      <main className="terminal-surface terminal-surface-invalid" role="alert">
        <strong>{t("terminal.panelAria")}</strong>
        <span>{t("platformError.code.invalid_request")}</span>
      </main>
    );
  }

  return (
    <main className="terminal-surface" aria-label={t("terminal.panelAria")}>
      <TerminalWorkspace
        agentKey={agentKey}
        initialTerminalKey={terminalKey}
        availability={{ supported: true }}
      />
    </main>
  );
};
