import React from "react";
import { Button, Dropdown, type MenuProps } from "antd";
import type { WorkPanelLocalApplication } from "@/shared/contracts/generated/agentWebclientBridge";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useDesktopDocumentOpen } from "../hooks/useDesktopDocumentOpen";
import type { ViewerTarget } from "../lib/viewerTarget";
import styles from "./DesktopDocumentOpenActions.module.css";

function ApplicationIcon({ application }: { application?: WorkPanelLocalApplication }) {
  return application?.iconDataUrl && /^data:image\/(?:png|jpeg|webp);base64,/u.test(application.iconDataUrl)
    ? <img className={styles.icon} src={application.iconDataUrl} alt="" aria-hidden="true" />
    : <MaterialIcon name="open_in_new" />;
}

export function DesktopDocumentOpenActions({ target, refreshKey = 0, layout = "card" }: {
  target: ViewerTarget; refreshKey?: number; layout?: "card" | "toolbar";
}) {
  const { t } = useI18n();
  const local = useDesktopDocumentOpen(target, refreshKey);
  if (!local.available) return null;
  const preferred = local.applications.find((application) => application.isDefault)
    || (local.applications.length === 1 ? local.applications[0] : undefined);
  const initialChecking = local.checking && local.applications.length === 0;
  const disabled = local.busy || initialChecking;
  const size = layout === "toolbar" ? "small" : undefined;
  const applicationName = (name: string) => name.replace(/^Microsoft (PowerPoint|Word|Excel)$/u, "$1");
  const items: MenuProps["items"] = local.applications.map((application) => ({
    key: application.id,
    label: <span className={styles.menuLabel}>
      <span className={styles.applicationName}>{application.name}</span>
      {application.isDefault ? <span className={styles.defaultBadge}>{t("contentViewer.localCopy.defaultBadge")}</span> : null}
    </span>,
    icon: <ApplicationIcon application={application} />,
    style: { padding: "6px 10px", fontSize: 13 },
    disabled,
  }));
  const menu: MenuProps = { items, className: styles.applicationMenu, onClick: ({ key }) => { void local.open(key); } };
  const dropdownProps = { trigger: ["click"] as ("click")[], disabled, menu, placement: "bottomRight" as const,
    overlayStyle: { maxWidth: "calc(100vw - 32px)" } };
  const button = preferred ? <Button size={size} type={layout === "card" ? "primary" : "default"} className={styles.openButton}
    disabled={disabled} loading={local.busy || initialChecking}
    aria-label={t("contentViewer.localCopy.openIn", { name: preferred.name })}
    icon={<ApplicationIcon application={preferred} />} onClick={() => void local.open(preferred.id)}>
    <span className={styles.buttonLabel}>{t("contentViewer.localCopy.openIn", { name: applicationName(preferred.name) })}</span>
  </Button> : null;

  return <div className={layout === "toolbar" ? styles.toolbar : styles.actions}>
    {preferred ? local.applications.length > 1 ? <div className={styles.split}>
      {button}
      <Dropdown {...dropdownProps}>
        <Button size={size} type={layout === "card" ? "primary" : "default"} className={styles.choiceButton}
          disabled={disabled} aria-label={t("contentViewer.localCopy.chooseApplication")}
          icon={<MaterialIcon name="expand_more" />} />
      </Dropdown>
    </div> : button : local.applications.length > 1 ?
      <Dropdown {...dropdownProps}>
        <Button size={size} type={layout === "card" ? "primary" : "default"} className={styles.openButton}
          disabled={disabled} loading={initialChecking || local.busy} icon={<MaterialIcon name="expand_more" />}>
          {t("contentViewer.localCopy.chooseApplication")}
        </Button>
      </Dropdown> : <Button size={size} className={styles.openButton} disabled loading={local.checking} icon={<MaterialIcon name="open_in_new" />}>
        {t(local.checking ? "contentViewer.localCopy.checking" : local.queryError
          ? "contentViewer.localCopy.queryFailed" : "contentViewer.localCopy.noApplications")}
      </Button>}
    {local.queryError ? <span className={styles.error} role="alert">{local.queryError}</span> : null}
    {local.actionError ? <span className={styles.error} role="alert">{local.actionError}</span> : null}
    {!local.applications.length || local.queryError || local.actionError ?
      <Button size={size} type="link" disabled={disabled} onClick={() => void local.refresh()}>{t("contentViewer.localCopy.retry")}</Button> : null}
  </div>;
}
