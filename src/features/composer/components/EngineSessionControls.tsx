import React from "react";
import { Button, Dropdown, Modal, Tooltip, type MenuProps } from "antd";
import type { useEngineSession } from "@/features/composer/hooks/useEngineSession";
import { TerminalPane } from "@/features/terminal/components/TerminalPane";
import { useI18n } from "@/shared/i18n";

import { ComposerSettingsMenu } from "./ComposerSettingsMenu";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import type { ExternalConfigOption } from "@/shared/data/api/dto/agentEngine";

import styles from "./EngineSessionControls.module.css";

const terminalAvailable = { supported: true } as const;
const ignoreSessionChange = () => {};

interface EngineSessionControlsProps {
  session: ReturnType<typeof useEngineSession>;
  engineId: string;
  running: boolean;
  themeMode: string;
  compact?: boolean;
  disabled?: boolean;
}

export function EngineSessionControls(props: EngineSessionControlsProps) {
  const { session, running, compact = false, disabled = false } = props;
  const { t } = useI18n();
  const locked = disabled || session.busy || running || Boolean(session.error) || session.auth?.state === "authenticating";
  return <div aria-label={t("acp.session")} className="query-settings-controls tw:inline-flex tw:min-w-0 tw:items-center">
    {(session.previewLoading && !session.prepared && !running) || (session.busy && !(running && session.prepared)) || session.error || (session.auth && session.auth.state !== "authenticated")
      ? <EngineSessionNotice {...props} />
      : <EngineSettings session={session} locked={locked} compact={compact} />}
  </div>;
}

export function EngineSessionNotice({ session, engineId, running, themeMode }: EngineSessionControlsProps) {
  const { t } = useI18n();
  const errors: Record<string, string> = {
    auth_required: t("acp.authRequired"),
    interaction_required: t("acp.interactionRequired"),
    desktop_required: t("acp.desktopRequired"),
    session_configuration_stale: t("acp.configStale"),
    session_restore_failed: t("acp.restoreFailed"),
    engine_busy: t("acp.busy"),
  };
  const locked = session.busy || running || session.auth?.state === "authenticating";
  const operationId = session.auth?.authOperationId;
  const loadingConfig = session.previewLoading && !session.prepared && !running && !session.error;

  if (!loadingConfig && !session.error && !session.busy && (!session.auth || session.auth.state === "authenticated")) return null;

  const authenticating = session.auth?.state === "authenticating";
  const pending = session.busy || authenticating || loadingConfig;
  const needsAuth = session.error === "auth_required" || session.auth?.state === "required";
  const detail = authenticating ? t("acp.authenticating") : session.busy ? t("acp.preparing")
    : needsAuth ? t("acp.authRequired") : loadingConfig ? t("acp.loadingConfig") : errors[session.error] || t("acp.unavailable");
  const label = authenticating ? t("acp.waitingForLogin") : session.busy ? t("acp.connecting")
    : needsAuth ? t("acp.signInRequired") : loadingConfig ? t("acp.loadingConfig") : t("acp.connectionFailed");

  return (
    <section aria-label={t("acp.session")} className={styles.notice}>
      <Tooltip title={detail}>
        <span key={pending ? "pending" : "error"} role={pending ? "status" : "alert"}
          aria-label={detail} className={`${styles.status} ${pending ? styles.pending : ""}`}>
          <MaterialIcon name={pending ? "progress_activity" : "info"} className={pending ? styles.spinner : styles.icon} />
          <span className={styles.label}>{label}</span>
        </span>
      </Tooltip>
      {!running && session.error && !locked && (
        <Button type="text" size="small" disabled={!engineId} onClick={() => void session.prepare()}>
          {t("acp.retry")}
        </Button>
      )}
      {session.auth && session.auth.state !== "authenticated" && !authenticating && (
        <Dropdown trigger={["click"]} disabled={locked} menu={{
          items: session.auth.methods.map(method => ({
            key: method.id, label: method.name, disabled: !method.available,
            title: method.available ? method.name : t("acp.methodUnavailable"),
          })),
          onClick: ({ key }) => { if (!locked) void session.startAuth(key); },
        }}>
          <Button type="text" size="small" disabled={locked || !session.auth.methods.length}>
            {t("acp.login")}
          </Button>
        </Dropdown>
      )}
      {operationId && (
        <Button type="text" size="small" disabled={session.busy} onClick={() => void session.cancelAuth()}>
          {t("acp.cancel")}
        </Button>
      )}
      <Modal title={t("acp.login")} open={Boolean(session.terminal && operationId)}
        footer={null} destroyOnHidden onCancel={() => void session.cancelAuth()}>
        {session.terminal && operationId && (
          <div style={{ height: 320 }}>
            <TerminalPane key={operationId} tabId={operationId} agentKey={engineId}
              terminalKey={"auth-" + operationId} availability={terminalAvailable}
              isActive themeMode={themeMode} onSessionChange={ignoreSessionChange} />
          </div>
        )}
      </Modal>
    </section>
  );
}

function selectedLabel(option: ExternalConfigOption): string {
  if (option.type === "boolean") return option.name;
  return option.choices.find(choice => choice.value === option.currentValue)?.name || option.currentValue;
}

function EngineSettings({ session, locked, compact }: {
  session: ReturnType<typeof useEngineSession>;
  locked: boolean;
  compact: boolean;
}) {
  const { t } = useI18n();
  const options = session.prepared?.configOptions || [];
  const modes = options.filter(option => option.category === "mode");
  const models = options.filter(option => option.category === "model" || option.category === "thought_level");
  const others = options.filter(option => !modes.includes(option) && !models.includes(option));
  const menu = (items: ExternalConfigOption[]): MenuProps => ({
    items: items.map(option => ({
      key: option.id, type: "group", label: option.name,
      children: option.type === "boolean" ? [{
        key: JSON.stringify([option.id, !option.currentValue]), label: option.name,
        extra: option.currentValue ? <MaterialIcon name="check" /> : null,
        onClick: () => { if (!locked) void session.configure(option.id, !option.currentValue); },
      }] : option.choices.map(choice => ({
        key: JSON.stringify([option.id, choice.value]),
        label: choice.group ? `${choice.group} / ${choice.name}` : choice.name,
        extra: choice.value === option.currentValue ? <MaterialIcon name="check" /> : null,
        onClick: () => { if (!locked) void session.configure(option.id, choice.value); },
      })),
    })),
  });
  return <>
    {modes.map(option => <ComposerSettingsMenu key={option.id} icon="tune" showIcon compact={compact} disabled={locked}
      label={<span>{selectedLabel(option)}</span>} title={`${option.name}: ${selectedLabel(option)}`} menu={menu([option])} />)}
    {models.length > 0 && <ComposerSettingsMenu icon="brain" compact={compact} disabled={locked}
      label={<span>{models.map(selectedLabel).join(" · ")}</span>}
      title={models.map(option => `${option.name}: ${selectedLabel(option)}`).join(" · ")} menu={menu(models)} />}
    {others.length > 0 && <ComposerSettingsMenu icon="settings" compact={compact} disabled={locked}
      label={<span>{t("acp.moreSettings")}</span>} title={t("acp.moreSettings")} menu={menu(others)} />}
  </>;
}
