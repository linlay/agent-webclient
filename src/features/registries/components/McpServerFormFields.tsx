import type { ReactNode } from "react";
import { Input, Select, Switch } from "antd";
import type { McpServerFormState } from "@/features/registries/lib/mcpServerForm";
import { useI18n } from "@/shared/i18n";
import {
  MaterialIcon,
  type MaterialIconName,
} from "@/shared/ui/MaterialIcon";

export const MCP_SERVER_FORM_SECTION_IDS = [
  "mcp-server-section-basic",
  "mcp-server-section-connection",
  "mcp-server-section-sync",
  "mcp-server-section-status",
  "mcp-server-section-tools",
] as const;

export type McpServerFormSectionId =
  (typeof MCP_SERVER_FORM_SECTION_IDS)[number];

export function resolveActiveMcpServerFormSection(
  sectionTops: number[],
  activationLine: number,
  atBottom: boolean,
): McpServerFormSectionId {
  if (atBottom) {
    return MCP_SERVER_FORM_SECTION_IDS[MCP_SERVER_FORM_SECTION_IDS.length - 1];
  }
  let activeSection: McpServerFormSectionId = MCP_SERVER_FORM_SECTION_IDS[0];
  MCP_SERVER_FORM_SECTION_IDS.forEach((sectionId, index) => {
    if (sectionTops[index] <= activationLine) activeSection = sectionId;
  });
  return activeSection;
}

export function McpFormSection({
  active = false,
  children,
  icon,
  id,
  title,
}: {
  active?: boolean;
  children: ReactNode;
  icon: MaterialIconName;
  id: McpServerFormSectionId;
  title: string;
}) {
  const titleId = `${id}-title`;
  return (
    <section
      id={id}
      className={`automation-form-section mcp-form-section ${active ? "is-active" : ""}`}
      aria-labelledby={titleId}
    >
      <div className="automation-form-section-heading tw:flex tw:items-center tw:gap-1.5">
        <MaterialIcon name={icon} />
        <h3 id={titleId}>{title}</h3>
      </div>
      {children}
    </section>
  );
}

const GRID_CLASS_NAME =
  "automation-form-grid mcp-form-grid tw:grid tw:grid-cols-3 tw:gap-3 tw:max-[860px]:grid-cols-1 tw:[&_.field-group]:mb-0";
const FULL_WIDTH_CLASS_NAME =
  "field-group automation-form-full-width tw:col-span-3 tw:max-[860px]:col-span-1";

export function McpServerFormFields({
  activeSectionId,
  form,
  newDraft,
  resolvedEndpoint,
  saving,
  onChange,
}: {
  activeSectionId: McpServerFormSectionId;
  form: McpServerFormState;
  newDraft: boolean;
  resolvedEndpoint: string;
  saving: boolean;
  onChange: (patch: Partial<McpServerFormState>) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <McpFormSection
        active={activeSectionId === MCP_SERVER_FORM_SECTION_IDS[0]}
        id={MCP_SERVER_FORM_SECTION_IDS[0]}
        icon="settings"
        title={t("mcpServers.section.basic")}
      >
        <div className={GRID_CLASS_NAME}>
          <div className="field-group">
            <label htmlFor="mcp-server-key-input">
              {t("mcpServers.field.serverKey")}
            </label>
            <Input
              id="mcp-server-key-input"
              value={form.serverKey}
              disabled={!newDraft || saving}
              onChange={(event) => onChange({ serverKey: event.target.value })}
            />
          </div>
          <div className="field-group">
            <label htmlFor="mcp-server-name-input">
              {t("mcpServers.field.name")}
            </label>
            <Input
              id="mcp-server-name-input"
              value={form.name}
              disabled={saving}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </div>
          <div className="field-group">
            <label htmlFor="mcp-server-transport-select">
              {t("mcpServers.field.transport")}
            </label>
            <Select
              id="mcp-server-transport-select"
              value={form.transport}
              disabled={saving}
              options={[
                { value: "streamable-http", label: "streamable-http" },
                { value: "stdio", label: "stdio" },
              ]}
              onChange={(transport) => onChange({ transport })}
            />
          </div>
          <div className="field-group">
            <label htmlFor="mcp-server-enabled-switch">
              {t("mcpServers.field.enabled")}
            </label>
            <div className="tw:flex tw:min-h-8 tw:items-center tw:gap-2">
              <Switch
                id="mcp-server-enabled-switch"
                checked={form.enabled}
                disabled={saving}
                onChange={(enabled) => onChange({ enabled })}
              />
              <span className="tw:text-xs tw:text-ink-muted">
                {form.enabled
                  ? t("mcpServers.value.enabled")
                  : t("mcpServers.value.disabled")}
              </span>
            </div>
          </div>
          <div className="field-group">
            <label htmlFor="mcp-server-prefix-input">
              {t("mcpServers.field.toolPrefix")}
            </label>
            <Input
              id="mcp-server-prefix-input"
              value={form.toolPrefix}
              disabled={saving}
              onChange={(event) => onChange({ toolPrefix: event.target.value })}
            />
          </div>
          <div className="field-group">
            <label htmlFor="mcp-server-protocol-input">
              {t("mcpServers.field.protocolVersion")}
            </label>
            <Input
              id="mcp-server-protocol-input"
              value="2025-11-25"
              disabled
            />
          </div>
        </div>
      </McpFormSection>

      <McpFormSection
        active={activeSectionId === MCP_SERVER_FORM_SECTION_IDS[1]}
        id={MCP_SERVER_FORM_SECTION_IDS[1]}
        icon="hub"
        title={t("mcpServers.section.connection")}
      >
        <div className={GRID_CLASS_NAME}>
          {form.transport === "streamable-http" ? (
            <>
              <div className={FULL_WIDTH_CLASS_NAME}>
                <label htmlFor="mcp-server-base-url-input">
                  {t("mcpServers.field.baseUrl")}
                </label>
                <Input
                  id="mcp-server-base-url-input"
                  value={form.baseUrl}
                  disabled={saving}
                  placeholder="https://mcp.example.com"
                  onChange={(event) => onChange({ baseUrl: event.target.value })}
                />
                <span className="tw:text-[11px] tw:text-ink-muted">
                  {t("mcpServers.hint.baseUrl")}
                </span>
              </div>
              <div className="field-group">
                <label htmlFor="mcp-server-endpoint-path-input">
                  {t("mcpServers.field.endpointPath")}
                </label>
                <Input
                  id="mcp-server-endpoint-path-input"
                  value={form.endpointPath}
                  disabled={saving}
                  placeholder="/mcp"
                  onChange={(event) =>
                    onChange({ endpointPath: event.target.value })
                  }
                />
              </div>
              <div className="field-group tw:col-span-2 tw:max-[860px]:col-span-1">
                <label htmlFor="mcp-server-resolved-url-input">
                  {t("mcpServers.field.resolvedUrl")}
                </label>
                <Input
                  id="mcp-server-resolved-url-input"
                  value={resolvedEndpoint}
                  disabled
                />
              </div>
              <div className={FULL_WIDTH_CLASS_NAME}>
                <label htmlFor="mcp-server-auth-token-input">
                  {t("mcpServers.field.authToken")}
                </label>
                <Input
                  id="mcp-server-auth-token-input"
                  type="password"
                  autoComplete="off"
                  value={form.authToken}
                  disabled={saving}
                  onChange={(event) => onChange({ authToken: event.target.value })}
                />
              </div>
              <KeyValueEditor
                id="mcp-server-headers-input"
                label={t("mcpServers.field.headers")}
                hint={t("mcpServers.hint.keyValueLines")}
                value={form.headersText}
                disabled={saving}
                placeholder={t("mcpServers.placeholder.header")}
                onChange={(headersText) => onChange({ headersText })}
              />
            </>
          ) : (
            <>
              <div className={FULL_WIDTH_CLASS_NAME}>
                <label htmlFor="mcp-server-command-input">
                  {t("mcpServers.field.command")}
                </label>
                <Input
                  id="mcp-server-command-input"
                  value={form.command}
                  disabled={saving}
                  onChange={(event) => onChange({ command: event.target.value })}
                />
              </div>
              <div className={FULL_WIDTH_CLASS_NAME}>
                <label htmlFor="mcp-server-working-dir-input">
                  {t("mcpServers.field.workingDirectory")}
                </label>
                <Input
                  id="mcp-server-working-dir-input"
                  value={form.workingDirectory}
                  disabled={saving}
                  onChange={(event) =>
                    onChange({ workingDirectory: event.target.value })
                  }
                />
              </div>
              <KeyValueEditor
                id="mcp-server-args-input"
                label={t("mcpServers.field.args")}
                hint={t("mcpServers.hint.onePerLine")}
                value={form.argsText}
                disabled={saving}
                onChange={(argsText) => onChange({ argsText })}
              />
              <KeyValueEditor
                id="mcp-server-env-input"
                label={t("mcpServers.field.env")}
                hint={t("mcpServers.hint.keyValueLines")}
                value={form.envText}
                disabled={saving}
                onChange={(envText) => onChange({ envText })}
              />
            </>
          )}
        </div>
      </McpFormSection>

      <McpFormSection
        active={activeSectionId === MCP_SERVER_FORM_SECTION_IDS[2]}
        id={MCP_SERVER_FORM_SECTION_IDS[2]}
        icon="tune"
        title={t("mcpServers.section.syncPolicy")}
      >
        <div className={GRID_CLASS_NAME}>
          {(
            [
              ["connectTimeout", "connect-timeout"],
              ["startupTimeout", "startup-timeout"],
              ["readTimeout", "read-timeout"],
              ["retry", "retry"],
            ] as const
          ).map(([field, label]) => (
            <div className="field-group" key={field}>
              <label htmlFor={`mcp-server-${field}-input`}>{label}</label>
              <Input
                id={`mcp-server-${field}-input`}
                type="number"
                min={0}
                value={form[field]}
                disabled={saving}
                onChange={(event) => onChange({ [field]: event.target.value })}
              />
            </div>
          ))}
          <KeyValueEditor
            id="mcp-server-alias-map-input"
            label={t("mcpServers.field.aliasMap")}
            hint={t("mcpServers.hint.aliasMap")}
            value={form.aliasMapText}
            disabled={saving}
            onChange={(aliasMapText) => onChange({ aliasMapText })}
          />
          <p className="tw:col-span-3 tw:m-0 tw:text-[11px] tw:text-ink-muted tw:max-[860px]:col-span-1">
            {t("mcpServers.hint.advancedPreserved")}
          </p>
        </div>
      </McpFormSection>
    </>
  );
}

function KeyValueEditor({
  disabled,
  hint,
  id,
  label,
  onChange,
  placeholder,
  value,
}: {
  disabled: boolean;
  hint: string;
  id: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <div className={FULL_WIDTH_CLASS_NAME}>
      <label htmlFor={id}>{label}</label>
      <Input.TextArea
        id={id}
        className="settings-textarea automation-mono-textarea tw:font-code"
        rows={4}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="tw:text-[11px] tw:text-ink-muted">{hint}</span>
    </div>
  );
}
