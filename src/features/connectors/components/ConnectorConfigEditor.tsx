import { useState } from "react";
import { Input } from "antd";
import type { ConnectorDefinitionFile } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";
import { jsonRecord, parseConnectorDefinition, updateConnectorField } from "@/features/connectors/lib/connectorDefinition";
import styles from "./ConnectorsConsole.module.css";

interface Props {
  file: ConnectorDefinitionFile;
  draft: string;
  disabled: boolean;
  readOnly?: boolean;
  onChange: (value: string) => void;
}

export function ConnectorConfigEditor({ file, draft, disabled, readOnly = false, onChange }: Props) {
  const { t } = useI18n();
  const [source, setSource] = useState(false);
  let parsed: Record<string, unknown> | null = null;
  try { parsed = parseConnectorDefinition(draft); } catch { /* Invalid drafts remain editable as source. */ }
  const sourceMode = source || !parsed || file === "cli.json";
  const field = (label: string, path: string[], value: unknown, multiline = false) => (
    <label className={styles.field} key={path.join(".")}>
      <span>{label}</span>
      {multiline ? <Input.TextArea disabled={disabled} readOnly={readOnly} value={String(value ?? "")} autoSize={{ minRows: 3, maxRows: 8 }} onChange={event => onChange(updateConnectorField(draft, path, event.target.value))} /> :
        <Input disabled={disabled} readOnly={readOnly} value={String(value ?? "")} onChange={event => onChange(updateConnectorField(draft, path, event.target.value))} />}
    </label>
  );
  return (
    <div className={styles.config}>
      <div className={styles.toolbar}>
        <strong>{file === "connector.json" ? t("connectors.section.basics") : file}</strong>
        {file !== "cli.json" && <UiButton size="sm" variant="ghost" disabled={disabled || !parsed} onClick={() => setSource(value => !value)}>
          {t(sourceMode ? "connectors.action.form" : "connectors.action.source")}
        </UiButton>}
      </div>
      <p className={styles.hint}>{t(file === "cli.json" ? "connectors.hint.cli" : file === "mcp.json" ? "connectors.hint.mcp" : "connectors.hint.manifest")}</p>
      {sourceMode ? <label className={styles.field}>
        <span>{t("connectors.field.json")}</span>
        <Input.TextArea aria-label={t("connectors.field.json")} className={styles.source} spellCheck={false} value={draft} disabled={disabled} readOnly={readOnly} onChange={event => onChange(event.target.value)} />
      </label> : file === "connector.json" ? <div className={styles.formGrid}>
        {field(t("connectors.field.name"), ["name"], parsed?.name)}
        {field(t("connectors.field.version"), ["version"], parsed?.version)}
        {field(t("connectors.field.description"), ["description"], parsed?.description, true)}
        <dl className={styles.metadata}>
          <dt>{t("connectors.field.id")}</dt><dd>{String(parsed?.id || "")}</dd>
          <dt>{t("connectors.field.primaryType")}</dt><dd>{String(parsed?.type || "").toUpperCase()}</dd>
          <dt>{t("connectors.field.auth")}</dt><dd>{String(parsed?.auth_mode || "")}</dd>
        </dl>
      </div> : <div className={styles.stack}>
        {Object.entries(jsonRecord(parsed?.mcpServers)).map(([key, raw]) => {
          const server = jsonRecord(raw);
          const stdio = server.type === "stdio";
          return <section className={styles.group} key={key}>
            <div className={styles.toolbar}><strong>{key}</strong><code>{String(server.type || "")}</code></div>
            <div className={styles.formGrid}>
              {field(t(stdio ? "connectors.field.command" : "connectors.field.url"), ["mcpServers", key, stdio ? "command" : "url"], stdio ? server.command : server.url)}
              <label className={styles.field}>
                <span>{t("connectors.field.timeout")}</span>
                <Input type="number" min={1} step={1} disabled={disabled} readOnly={readOnly} value={typeof server.timeout === "number" ? server.timeout : ""} onChange={event => {
                  const value = event.target.value;
                  onChange(updateConnectorField(draft, ["mcpServers", key, "timeout"], value === "" ? undefined : Number(value)));
                }} />
              </label>
              {stdio && <label className={styles.field}>
                <span>{t("connectors.field.args")}</span>
                <Input.TextArea disabled={disabled} readOnly={readOnly} autoSize={{ minRows: 3 }} value={Array.isArray(server.args) ? server.args.join("\n") : ""} onChange={event => onChange(updateConnectorField(draft, ["mcpServers", key, "args"], event.target.value ? event.target.value.split("\n") : []))} />
              </label>}
            </div>
          </section>;
        })}
      </div>}
    </div>
  );
}
