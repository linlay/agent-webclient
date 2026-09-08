import { useState } from "react";
import { Input } from "antd";
import type { ConnectorDefinitionFile } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";
import { CodeEditor } from "@/shared/ui/CodeEditor";
import type { ThemeMode } from "@/shared/styles/theme";
import { jsonRecord, parseConnectorDefinition, updateConnectorField } from "@/features/connectors/lib/connectorDefinition";
import styles from "./ConnectorsConsole.module.css";

interface Props {
  connectorId: string;
  file: ConnectorDefinitionFile;
  theme: ThemeMode;
  draft: string;
  disabled: boolean;
  readOnly?: boolean;
  onChange: (value: string) => void;
}

export function ConnectorConfigEditor({ connectorId, file, theme, draft, disabled, readOnly = false, onChange }: Props) {
  const { t } = useI18n();
  const [source, setSource] = useState(false);
  let parsed: Record<string, unknown> | null = null;
  try { parsed = parseConnectorDefinition(draft); } catch { /* Invalid drafts remain editable as source. */ }
  const manifest = file === "connector.json";
  const sourceMode = source || !parsed || (file === "cli.json" || file === "view.json");
  const readOnlyField = (label: string, value: unknown) => <label className={styles.field}>
    <span>{label}</span>
    <Input readOnly value={String(value || "—")} />
  </label>;
  const metadata = <div className={styles.manifestMetadata}>
    {readOnlyField(t("connectors.field.id"), parsed?.id)}
    {readOnlyField(t("connectors.field.primaryType"), String(parsed?.type || "—").toUpperCase())}
    {readOnlyField(t("connectors.field.auth"), parsed?.auth_mode)}
  </div>;
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
        <strong>{manifest ? t("connectors.section.basics") : file}</strong>
        {manifest && readOnly && <span className={styles.hint}>{t("connectors.value.readOnly")}</span>}
        {file !== "cli.json" && file !== "view.json" && <UiButton size="sm" variant="ghost" disabled={disabled || !parsed} onClick={() => setSource(value => !value)}>
          {t(sourceMode ? manifest && readOnly ? "connectors.action.information" : "connectors.action.form" : "connectors.action.source")}
        </UiButton>}
      </div>
      {!(manifest && readOnly) && <p className={styles.hint}>{file === "view.json" ? "VIEW · HTML / QLC" : t(file === "cli.json" ? "connectors.hint.cli" : file === "mcp.json" ? "connectors.hint.mcp" : "connectors.hint.manifest")}</p>}
      {sourceMode ? <div className={styles.jsonEditor} role="group" aria-label={t("connectors.field.json")}>
        <CodeEditor
          path={`connector:///${encodeURIComponent(connectorId)}/${file}`}
          language="json"
          theme={theme}
          value={draft}
          disabled={disabled || readOnly}
          onChange={value => { if (!disabled && !readOnly) onChange(value); }}
          options={{
            ariaLabel: t("connectors.field.json"),
            lineNumbers: "on",
            lineNumbersMinChars: 3,
            lineHeight: 20,
            folding: true,
            padding: { top: 12, bottom: 12 },
          }}
        />
      </div> : manifest ? <div className={styles.manifest}>
        {metadata}
        <div className={styles.manifestHeading}>
          {field(t("connectors.field.name"), ["name"], parsed?.name)}
          {field(t("connectors.field.version"), ["version"], parsed?.version)}
        </div>
        {field(t("connectors.field.description"), ["description"], parsed?.description, true)}
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
