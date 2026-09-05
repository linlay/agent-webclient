import { useMemo, useState } from "react";
import { Dropdown, Input, Select, Tooltip } from "antd";
import type { MenuProps } from "antd";
import type { Agent } from "@/features/agents/lib/agentState";
import {
  AUTOMATION_CRON_PRESETS,
  automationOptionalFieldHasValue,
  splitAutomationCronExpression,
  type AutomationChatMode,
  type AutomationFormState,
  type AutomationOptionalField,
} from "@/features/automations/lib/automationForm";
import { AgentIcon } from "@/shared/icons/agent";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import "./AutomationFormFields.module.css";

const BASIC_FORM_GRID_CLASS_NAME =
  "automation-basic-form-grid tw:grid tw:grid-cols-2 tw:gap-3 tw:max-[860px]:grid-cols-1 tw:[&_.field-group]:mb-0";
const FULL_WIDTH_CLASS_NAME =
  "field-group automation-form-full-width automation-basic-form-full-width tw:col-span-2 tw:max-[860px]:col-span-1";
const CRON_CONTROL_CLASS_NAME =
  "automation-cron-control tw:grid tw:grid-cols-5 tw:gap-1.5";
const MONO_TEXTAREA_CLASS_NAME =
  "settings-textarea automation-mono-textarea tw:font-code";

const COMMON_ZONE_OPTIONS = [
  "Asia/Shanghai",
  "UTC",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Bangkok",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Australia/Sydney",
];

const AUTOMATION_ROLE_OPTIONS = ["automation", "user", "assistant", "system"];
const AUTOMATION_OPTIONAL_FIELDS: AutomationOptionalField[] = [
  "description",
  "zoneId",
  "role",
  "hidden",
  "paramsText",
];

function AutomationAgentOption({
  agent,
  fallbackKey = "",
  compact = false,
}: {
  agent?: Agent | null;
  fallbackKey?: string;
  compact?: boolean;
}) {
  const name = agent?.name?.trim() || agent?.key || fallbackKey || "";
  const role = agent?.role?.trim() || "";
  const iconSize = compact ? 16 : 20;
  return (
    <span className={`automation-agent-option${compact ? " is-compact" : ""}`}>
      <AgentIcon
        icon={agent?.icon}
        type="agent"
        props={{
          icon: {
            className: "automation-agent-option-icon",
            width: iconSize,
            height: iconSize,
          },
          avatar: {
            className: "automation-agent-option-icon",
            size: iconSize,
            icon: <MaterialIcon name="smart_toy" />,
          },
        }}
      />
      {compact ? (
        <span className="automation-agent-option-name">{name}</span>
      ) : (
        <span className="automation-agent-option-text">
          <span className="automation-agent-option-name">{name}</span>
          {role ? <span className="automation-agent-option-role">{role}</span> : null}
        </span>
      )}
    </span>
  );
}

export interface AutomationFormFieldsProps {
  agents: Agent[];
  form: AutomationFormState;
  onChange: (patch: Partial<AutomationFormState>) => void;
}

export function AutomationFormFields({
  agents,
  form,
  onChange,
}: AutomationFormFieldsProps) {
  const { locale, t } = useI18n();
  const [revealedOptionalFields, setRevealedOptionalFields] = useState<
    AutomationOptionalField[]
  >([]);

  const agentByKey = useMemo(() => {
    const values = new Map<string, Agent>();
    for (const agent of agents) {
      const key = String(agent?.key || "").trim();
      if (key) values.set(key, agent);
    }
    return values;
  }, [agents]);

  const agentOptions = useMemo(() => {
    const options = new Map<string, { label: string; agent: Agent | null }>();
    for (const agent of agents) {
      const key = String(agent?.key || "").trim();
      if (!key) continue;
      const name = String(agent?.name || key).trim() || key;
      const role = String(agent?.role || "").trim();
      options.set(key, { label: role ? `${name} · ${role}` : name, agent });
    }
    const currentAgentKey = form.agentKey.trim();
    if (currentAgentKey && !options.has(currentAgentKey)) {
      options.set(currentAgentKey, { label: currentAgentKey, agent: null });
    }
    return Array.from(options.entries()).map(([value, item]) => ({
      value,
      label: item.label,
      agent: item.agent,
    }));
  }, [agents, form.agentKey]);

  const cronFields = useMemo(
    () => splitAutomationCronExpression(form.cron),
    [form.cron],
  );
  const cronFieldLabels = useMemo(
    () => [
      t("automationConsole.cronField.minute"),
      t("automationConsole.cronField.hour"),
      t("automationConsole.cronField.dayOfMonth"),
      t("automationConsole.cronField.month"),
      t("automationConsole.cronField.dayOfWeek"),
    ],
    [t],
  );
  const cronPresetOptions = useMemo(
    () =>
      AUTOMATION_CRON_PRESETS.map((preset) => ({
        value: preset.value,
        label: t(preset.labelKey),
      })),
    [t],
  );
  const zoneOptions = useMemo(() => {
    const values = new Set(COMMON_ZONE_OPTIONS);
    if (form.zoneId.trim()) values.add(form.zoneId.trim());
    return Array.from(values).sort((left, right) => {
      if (left === "Asia/Shanghai") return -1;
      if (right === "Asia/Shanghai") return 1;
      if (left === "UTC") return -1;
      if (right === "UTC") return 1;
      return left.localeCompare(right, locale);
    });
  }, [form.zoneId, locale]);
  const optionalFieldLabels = useMemo<Record<AutomationOptionalField, string>>(
    () => ({
      description: t("automationConsole.field.description"),
      zoneId: t("automationConsole.field.timezone"),
      role: t("automationConsole.field.role"),
      hidden: t("automationConsole.field.hidden"),
      paramsText: t("automationConsole.field.params"),
    }),
    [t],
  );
  const visibleOptionalFields = useMemo(() => {
    const values = new Set<AutomationOptionalField>(revealedOptionalFields);
    for (const field of AUTOMATION_OPTIONAL_FIELDS) {
      if (automationOptionalFieldHasValue(form, field)) values.add(field);
    }
    return values;
  }, [form, revealedOptionalFields]);
  const additionalFieldMenu: MenuProps = useMemo(
    () => ({
      items: AUTOMATION_OPTIONAL_FIELDS.filter(
        (field) => !visibleOptionalFields.has(field),
      ).map((field) => ({ key: field, label: optionalFieldLabels[field] })),
      onClick: ({ key }) => {
        const field = key as AutomationOptionalField;
        setRevealedOptionalFields((current) =>
          current.includes(field) ? current : [...current, field],
        );
      },
    }),
    [optionalFieldLabels, visibleOptionalFields],
  );

  return (
    <section
      id="automation-section-basic"
      className="automation-form-section is-active"
      aria-labelledby="automation-section-basic-title"
    >
      <div className="automation-form-section-heading tw:flex tw:items-center tw:gap-1.5">
        <MaterialIcon name="settings" />
        <h3 id="automation-section-basic-title">
          {t("automationConsole.section.basic")}
        </h3>
      </div>
      <div className={BASIC_FORM_GRID_CLASS_NAME}>
        <div className={FULL_WIDTH_CLASS_NAME}>
          <label htmlFor="automation-name-input">{t("automationConsole.field.name")}</label>
          <Input
            id="automation-name-input"
            value={form.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </div>
        <div className={FULL_WIDTH_CLASS_NAME}>
          <label htmlFor="automation-message-input">
            {t("automationConsole.field.message")}
          </label>
          <Input.TextArea
            id="automation-message-input"
            rows={4}
            value={form.message}
            onChange={(event) => onChange({ message: event.target.value })}
          />
        </div>
        <div className={`automation-chat-row ${form.chatMode === "existing" ? "is-existing" : ""}`}>
          <div className="field-group">
            <label htmlFor="automation-chat-mode-input">
              {t("automationConsole.field.chatMode")}
            </label>
            <Select
              id="automation-chat-mode-input"
              value={form.chatMode}
              onChange={(value: AutomationChatMode) =>
                onChange({
                  chatMode: value,
                  ...(value === "new" ? { chatId: "" } : {}),
                })
              }
              options={[
                { value: "new", label: t("automationConsole.chatMode.new") },
                { value: "existing", label: t("automationConsole.chatMode.existing") },
              ]}
            />
          </div>
          {form.chatMode === "existing" ? (
            <div className="field-group">
              <label htmlFor="automation-chat-input">
                {t("automationConsole.field.chatId")}
              </label>
              <Input
                id="automation-chat-input"
                value={form.chatId}
                onChange={(event) => onChange({ chatId: event.target.value })}
              />
            </div>
          ) : null}
        </div>
        <div className={FULL_WIDTH_CLASS_NAME}>
          <label htmlFor="automation-agent-input">{t("automationConsole.field.agent")}</label>
          <Select
            id="automation-agent-input"
            showSearch
            optionFilterProp="label"
            value={form.agentKey}
            onChange={(value) => onChange({ agentKey: value })}
            options={[
              { value: "", label: t("automationConsole.field.agentPlaceholder") },
              ...agentOptions,
            ]}
            optionRender={(option) => {
              const data = option.data as
                | { value: string; label: string; agent?: Agent | null }
                | undefined;
              if (!data?.value) return data?.label ?? "";
              return <AutomationAgentOption agent={data.agent ?? null} fallbackKey={data.value} />;
            }}
            labelRender={(option) => {
              const value = String(option?.value ?? "");
              if (!value) return option?.label ?? "";
              const agent = agentByKey.get(value);
              return agent ? (
                <AutomationAgentOption agent={agent} fallbackKey={value} compact />
              ) : (
                option?.label ?? value
              );
            }}
          />
        </div>
        <div className="field-group automation-cron-field">
          <div className="automation-cron-title-row">
            <span>{t("automationConsole.field.cron")}</span>
            <Dropdown
              menu={{
                items: cronPresetOptions.map((option) => ({
                  key: option.value,
                  label: option.label,
                })),
                onClick: ({ key }) => {
                  const preset = AUTOMATION_CRON_PRESETS.find((item) => item.value === key);
                  if (!preset) return;
                  onChange({
                    cron: preset.value,
                    ...(preset.remainingRuns ? { remainingRuns: preset.remainingRuns } : {}),
                  });
                },
              }}
              trigger={["click"]}
              placement="bottomRight"
            >
              <UiButton
                className="automation-cron-preset-trigger"
                size="sm"
                variant="ghost"
                aria-label={t("automationConsole.cronPreset.ariaLabel")}
              >
                <MaterialIcon name="bolt" />
                <span>{t("automationConsole.cronPreset.placeholder")}</span>
              </UiButton>
            </Dropdown>
          </div>
          <div className={CRON_CONTROL_CLASS_NAME}>
            {cronFields.map((value, index) => (
              <div className="automation-cron-part" key={index}>
                <Input
                  id={`automation-cron-field-${index}`}
                  aria-label={`${t("automationConsole.field.cron")} · ${cronFieldLabels[index]}`}
                  value={value}
                  onChange={(event) => {
                    const nextFields = [...cronFields];
                    nextFields[index] = event.target.value.replace(/\s+/g, "");
                    onChange({ cron: nextFields.join(" ") });
                  }}
                />
                <span>{cronFieldLabels[index]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="field-group automation-runs-field">
          <label htmlFor="automation-runs-input">
            {t("automationConsole.field.remainingRuns")}
          </label>
          <Input
            id="automation-runs-input"
            type="number"
            min="1"
            placeholder={t("automationConsole.field.remainingRunsPlaceholder")}
            value={form.remainingRuns}
            onChange={(event) => onChange({ remainingRuns: event.target.value })}
          />
        </div>
        {visibleOptionalFields.has("description") ? (
          <div className={FULL_WIDTH_CLASS_NAME}>
            <label htmlFor="automation-description-input">
              {t("automationConsole.field.description")}
            </label>
            <Input.TextArea
              id="automation-description-input"
              className="settings-textarea"
              rows={2}
              value={form.description}
              onChange={(event) => onChange({ description: event.target.value })}
            />
          </div>
        ) : null}
        {visibleOptionalFields.has("zoneId") ? (
          <div className="field-group">
            <label htmlFor="automation-zone-input">{t("automationConsole.field.timezone")}</label>
            <Select
              id="automation-zone-input"
              value={form.zoneId}
              onChange={(value) => onChange({ zoneId: value })}
              options={[
                { value: "", label: t("automationConsole.field.defaultTimezone") },
                ...zoneOptions.map((zoneId) => ({ value: zoneId, label: zoneId })),
              ]}
            />
          </div>
        ) : null}
        {visibleOptionalFields.has("role") ? (
          <div className="field-group">
            <label htmlFor="automation-role-input">{t("automationConsole.field.role")}</label>
            <Select
              id="automation-role-input"
              value={form.role}
              onChange={(value) => onChange({ role: value })}
              options={[
                { value: "", label: t("automationConsole.field.rolePlaceholder") },
                ...AUTOMATION_ROLE_OPTIONS.map((role) => ({ value: role, label: role })),
              ]}
            />
          </div>
        ) : null}
        {visibleOptionalFields.has("hidden") ? (
          <div className="field-group">
            <label htmlFor="automation-hidden-select">{t("automationConsole.field.hidden")}</label>
            <Select
              id="automation-hidden-select"
              value={form.hidden}
              onChange={(value) => onChange({ hidden: value })}
              options={[
                { value: "", label: t("automationConsole.hidden.unset") },
                { value: "true", label: t("automationConsole.hidden.true") },
                { value: "false", label: t("automationConsole.hidden.false") },
              ]}
            />
          </div>
        ) : null}
        {visibleOptionalFields.has("paramsText") ? (
          <div className={FULL_WIDTH_CLASS_NAME}>
            <label htmlFor="automation-params-input">
              <span>{t("automationConsole.field.params")}</span>
              <Tooltip title={t("automationConsole.field.paramsTooltip")} arrow={false}>
                <MaterialIcon name="help" />
              </Tooltip>
            </label>
            <Input.TextArea
              id="automation-params-input"
              className={MONO_TEXTAREA_CLASS_NAME}
              rows={3}
              placeholder={t("automationConsole.field.paramsPlaceholder")}
              value={form.paramsText}
              onChange={(event) => onChange({ paramsText: event.target.value })}
            />
          </div>
        ) : null}
        {additionalFieldMenu.items?.length ? (
          <div className="automation-additional-fields tw:col-span-2 tw:max-[860px]:col-span-1">
            <Dropdown menu={additionalFieldMenu} trigger={["click"]} placement="bottomLeft">
              <UiButton size="sm" variant="ghost">
                <MaterialIcon name="add" />
                <span>{t("automationConsole.action.addOption")}</span>
              </UiButton>
            </Dropdown>
          </div>
        ) : null}
      </div>
    </section>
  );
}
