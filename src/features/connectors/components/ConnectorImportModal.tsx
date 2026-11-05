import { useRef, useState } from "react";
import { Input, Modal, Segmented, Select } from "antd";
import { useI18n } from "@/shared/i18n";
import { MCP_ICON_ARTWORK } from "../lib/mcpIconPresets";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { CONNECTOR_IMPORT_ICON_PRESETS, formatConnectorArchiveSize } from "@/features/connectors/lib/connectorImport";
import type { useConnectorImport } from "@/features/connectors/hooks/useConnectorImport";
import styles from "./ConnectorsConsole.module.css";

export function ConnectorImportModal({ runtime }: { runtime: ReturnType<typeof useConnectorImport> }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const iconInput = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  return <Modal
    open={runtime.open}
    title={t("connectors.import.title")}
    width={600}
    styles={{ body: { maxHeight: "calc(100dvh - 220px)", overflowY: "auto", paddingRight: 4 } }}
    destroyOnClose
    maskClosable={!runtime.submitting}
    keyboard={!runtime.submitting}
    closable={!runtime.submitting}
    onCancel={runtime.close}
    onOk={() => void runtime.submit()}
    confirmLoading={runtime.submitting}
    okText={t(runtime.overwriteRequired ? "connectors.import.overwrite.action" : "connectors.import.submit")}
    cancelText={t("connectors.import.cancel")}
    okButtonProps={{ disabled: !runtime.canSubmit, danger: runtime.overwriteRequired }}
    cancelButtonProps={{ disabled: runtime.submitting }}
  >
    <div className={styles.importBody}>
      <Segmented block value={runtime.mode} disabled={runtime.submitting}
        options={[{ label: t("connectors.import.archive"), value: "archive" }, { label: t("connectors.import.mcp.tab"), value: "mcp" }]}
        onChange={value => runtime.setMode(value as "archive" | "mcp")} />
      {runtime.mode === "mcp" ? <>
        <div className={styles.importField}>
        <label htmlFor="connector-mcp-url">{t("connectors.import.mcp.url")}</label>
        <Input id="connector-mcp-url" type="url" autoComplete="off" spellCheck={false} placeholder="https://example.com/mcp"
          value={runtime.mcpUrl} disabled={runtime.submitting} onChange={event => runtime.setMCPURL(event.target.value)} />
        </div>
        <div className={styles.importIdentity}>
        <div className={styles.importField}>
        <label htmlFor="connector-mcp-name">{t("connectors.import.mcp.name")}</label>
        <Input id="connector-mcp-name" required maxLength={128} autoComplete="off" placeholder={t("connectors.import.mcp.namePlaceholder")}
          value={runtime.mcpName} disabled={runtime.submitting} onChange={event => runtime.setMCPName(event.target.value)} />
        </div>
        <div className={styles.importField}>
        <label htmlFor="connector-mcp-id">{t("connectors.import.mcp.id")}</label>
        <Input id="connector-mcp-id" required maxLength={64} autoComplete="off" spellCheck={false} placeholder={t("connectors.import.mcp.idPlaceholder")}
          value={runtime.mcpId} disabled={runtime.submitting} onChange={event => runtime.setMCPId(event.target.value)} />
        </div>
        </div>
        <div className={styles.importField}>
        <label htmlFor="connector-mcp-description">{t("connectors.import.mcp.description")}</label>
        <Input.TextArea id="connector-mcp-description" maxLength={2000} autoSize={{ minRows: 2, maxRows: 4 }} placeholder={t("connectors.import.mcp.descriptionPlaceholder")}
          value={runtime.description} disabled={runtime.submitting} onChange={event => runtime.setDescription(event.target.value)} />
        </div>
        <div className={styles.importField}>
        <label>{t("connectors.import.mcp.icon")}</label>
        <div className={styles.importIconControls}>
        <div className={styles.importIconPalette} role="group" aria-label={t("connectors.import.mcp.presetIcons")}>
          {CONNECTOR_IMPORT_ICON_PRESETS.map(preset => <button key={preset} type="button" className={styles.importIconChoice}
            aria-pressed={runtime.iconPreset === preset} aria-label={t(`connectors.import.mcp.icon.${preset}`)} title={t(`connectors.import.mcp.icon.${preset}`)}
            disabled={runtime.submitting} onClick={() => runtime.setIconPreset(runtime.iconPreset === preset ? undefined : preset)}>
            <img src={MCP_ICON_ARTWORK[preset]} alt="" draggable={false} />
          </button>)}
        </div>
        <div className={styles.importIconRow}>
          <input ref={iconInput} className={styles.fileInput} type="file" accept="image/png,.png" disabled={runtime.submitting}
            aria-label={t("connectors.import.mcp.chooseIcon")} onChange={event => {
              void runtime.acceptIcon(event.target.files?.[0] || null); event.currentTarget.value = "";
            }} />
          {runtime.iconPng && <img className={styles.importIconPreview} src={`data:image/png;base64,${runtime.iconPng}`} alt={t("connectors.import.mcp.iconPreview")} />}
          <button type="button" className="ui-btn ui-btn-sm" disabled={runtime.submitting || runtime.iconReading} onClick={() => iconInput.current?.click()}>{t("connectors.import.mcp.chooseIcon")}</button>
          {runtime.iconName && <button type="button" className="ui-btn ui-btn-sm" disabled={runtime.submitting} onClick={() => void runtime.acceptIcon(null)}>{t("connectors.import.mcp.removeIcon")}</button>}
        </div>
        </div>
        </div>
        <div className={styles.importField}>
        <label htmlFor="connector-mcp-auth">{t("connectors.import.mcp.auth")}</label>
        <Select id="connector-mcp-auth" value={runtime.authMode} disabled={runtime.submitting}
          options={[{ label: t("connectors.import.mcp.oauth"), value: "mcp" }, { label: t("connectors.import.mcp.oneid"), value: "oneid" }, { label: t("connectors.import.mcp.token"), value: "token" }, { label: t("connectors.import.mcp.none"), value: "none" }]}
          onChange={runtime.setAuthMode} />
        </div>
        {runtime.authMode === "token" && <>
          <label htmlFor="connector-mcp-token-auth">{t("connectors.import.mcp.tokenType")}</label>
          <Select id="connector-mcp-token-auth" value={runtime.tokenAuth} disabled={runtime.submitting}
            options={[{ label: t("connectors.import.mcp.bearer"), value: "bearer" }, { label: t("connectors.import.mcp.apiKey"), value: "header" }, { label: t("connectors.import.mcp.basic"), value: "basic" }]}
            onChange={runtime.setTokenAuth} />
          {runtime.tokenAuth === "header" && <>
            <label htmlFor="connector-mcp-header">{t("connectors.import.mcp.headerName")}</label>
            <Input id="connector-mcp-header" value={runtime.headerName} disabled={runtime.submitting} placeholder={t("connectors.import.mcp.headerPlaceholder")}
              onChange={event => runtime.setHeaderName(event.target.value)} />
          </>}
        </>}
      </> : <>
        <input ref={input} className={styles.fileInput} type="file" accept=".zip,application/zip" aria-label={t("connectors.import.select")}
          disabled={runtime.submitting} onChange={event => {
            runtime.acceptFiles(Array.from(event.target.files || []));
            event.currentTarget.value = "";
          }} />
        <button type="button" className={`${styles.dropZone} ${dragActive ? styles.dragActive : ""}`} disabled={runtime.submitting}
          onClick={() => input.current?.click()}
          onDragEnter={event => { event.preventDefault(); if (!runtime.submitting) setDragActive(true); }}
          onDragOver={event => event.preventDefault()}
          onDragLeave={event => { event.preventDefault(); if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragActive(false); }}
          onDrop={event => { event.preventDefault(); setDragActive(false); runtime.acceptFiles(Array.from(event.dataTransfer.files)); }}>
          <MaterialIcon name="folder_zip" />
          <strong>{runtime.archive?.name || t("connectors.import.drop")}</strong>
          <span className={styles.hint}>{runtime.archive ? formatConnectorArchiveSize(runtime.archive.size) : t("connectors.import.limit")}</span>
        </button>
        <p className={styles.hint}>{t("connectors.import.layout")}</p>
      </>}
      {runtime.overwriteRequired && <div role="alert" className={styles.importConflict}>
        <strong>{t("connectors.import.overwrite.title")}</strong>
        <p>{t("connectors.import.overwrite.description", { file: runtime.archive?.name || "" })}</p>
      </div>}
      {runtime.error && <div role="alert" className={styles.error}>{runtime.error}{runtime.errorDetails && <details><summary>{t("connectors.error.details")}</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{runtime.errorDetails}</pre></details>}</div>}
      {runtime.submitting && <p role="status" className={styles.hint}>{t(runtime.mode === "mcp" ? "connectors.import.mcp.importing" : "connectors.import.uploading")}</p>}
    </div>
  </Modal>;
}
