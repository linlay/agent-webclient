import React from "react";
import { Dropdown, Input, Popover, Select, Tooltip, type MenuProps } from "antd";
import { AgentCapabilitiesEditor } from "@/features/agents/components/AgentCapabilitiesEditor";
import {
  BUDGET_PLACEHOLDER,
  SIMPLE_BUDGET_TEMPLATE,
  contextOptionPresentation,
  modePresentation,
  promptEntriesToJson,
  toolFilterForOption,
  toolSourceLabel,
  visibilityPresentation,
  type AgentFormState,
  type AgentToolFilter,
  type IconKind,
} from "@/features/agents/lib/agentDefinition";
import type { AgentSkillOption, AgentToolOption } from "@/features/agents/lib/agentOptions";
import { AGENT_ICON_NAMES, AgentIcon } from "@/shared/icons/agent";
import type { I18nContextValue } from "@/shared/i18n";
import { MaterialIcon, type MaterialIconName } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";

const AGENT_FORM_GRID_CLASS_NAME =
  "agent-form-grid tw:grid tw:grid-cols-3 tw:max-[860px]:grid-cols-1 tw:[&_.field-group]:mb-0";
const AGENT_FORM_FULL_WIDTH_CLASS_NAME =
  "field-group agent-form-full-width tw:col-span-3 tw:max-[860px]:col-span-1";
const AGENT_FORM_SECTION_CLASS_NAME = "agent-form-section";
const AGENT_FORM_SECTION_HEADING_CLASS_NAME =
  "agent-form-section-heading tw:flex tw:items-center tw:gap-1.5";
const AGENT_MONO_TEXTAREA_CLASS_NAME =
  "settings-textarea agent-mono-textarea tw:font-code";
const AGENT_PROMPT_TEXTAREA_CLASS_NAME =
  "settings-textarea agent-prompt-textarea tw:min-h-[120px]";

export const AGENT_FORM_SECTION_IDS = [
  "agent-section-basic",
  "agent-section-model",
  "agent-section-prompts",
  "agent-section-context-capabilities",
  "agent-section-advanced",
] as const;

export type AgentFormSectionId = (typeof AGENT_FORM_SECTION_IDS)[number];

interface AgentFormSectionProps {
  children: React.ReactNode;
  icon: MaterialIconName;
  id: AgentFormSectionId;
  title: string;
}

const AgentFormSection: React.FC<AgentFormSectionProps> = ({ children, icon, id, title }) => {
  const titleId = `${id}-title`;
  return (
    <section id={id} className={AGENT_FORM_SECTION_CLASS_NAME} aria-labelledby={titleId} tabIndex={-1}>
      <div className={AGENT_FORM_SECTION_HEADING_CLASS_NAME}>
        <MaterialIcon name={icon} />
        <h3 id={titleId}>{title}</h3>
      </div>
      {children}
    </section>
  );
};

export interface AgentEditorProps {
  isReadOnly: boolean;
  t: I18nContextValue["t"];
  form: AgentFormState;
  formError: string;
  selectedIconValue: unknown;
  iconEditorOpen: boolean;
  setIconEditorOpen: (open: boolean) => void;
  updateForm: (patch: Partial<AgentFormState>) => void;
  modeOptions: Array<{ value: string; label: string }>;
  setMode: (mode: string) => void;
  loadingOptions: boolean;
  visibilityScopeOptions: Array<{ value: string; label: string }>;
  greetingEntries: string[];
  wonderEntries: string[];
  modelItems: MenuProps["items"];
  onModelMenuClick: NonNullable<MenuProps["onClick"]>;
  onModelMenuOpenChange: (open: boolean) => void;
  queryModelButtonStateClass: string;
  showFastBadge: boolean;
  selectedModelLabel: string;
  selectedReasoningLabel: string;
  contextTagOptions: Array<{ value: string; label: string }>;
  filteredToolOptions: AgentToolOption[];
  selectedTools: AgentToolOption[];
  filteredSkillOptions: AgentSkillOption[];
  selectedSkills: AgentSkillOption[];
  toolFilter: AgentToolFilter;
  toolSearchText: string;
  skillSearchText: string;
  toolsExpanded: boolean;
  skillsExpanded: boolean;
  canImportPrivateSkill: boolean;
  setToolFilter: (filter: AgentToolFilter) => void;
  setToolSearchText: (value: string) => void;
  setSkillSearchText: (value: string) => void;
  setToolsExpanded: (expanded: boolean) => void;
  setSkillsExpanded: (expanded: boolean) => void;
  openPrivateSkillImport: () => void;
}

export const AgentEditor: React.FC<AgentEditorProps> = (props) => {
  const {
    isReadOnly, t, form, formError, selectedIconValue, iconEditorOpen, setIconEditorOpen,
    updateForm, modeOptions, setMode, loadingOptions, visibilityScopeOptions,
    greetingEntries, wonderEntries, modelItems, onModelMenuClick,
    onModelMenuOpenChange, queryModelButtonStateClass, showFastBadge,
    selectedModelLabel, selectedReasoningLabel, contextTagOptions,
    filteredToolOptions, selectedTools, filteredSkillOptions, selectedSkills,
    toolFilter, toolSearchText, skillSearchText, toolsExpanded, skillsExpanded,
    canImportPrivateSkill, setToolFilter, setToolSearchText, setSkillSearchText,
    setToolsExpanded, setSkillsExpanded, openPrivateSkillImport,
  } = props;
  return (
    <div className={`agent-editor-fieldset ${isReadOnly ? "is-readonly" : ""}`} aria-readonly={isReadOnly}>
                <AgentFormSection
                  id={AGENT_FORM_SECTION_IDS[0]}
                  icon="person"
                  title={t("agentConsole.basic.identityTitle")}
                >
                  <div className="agent-basic-identity">
                    <div className="agent-identity-avatar-column">
                      <div className="agent-icon-picker">
                        <div className="agent-identity-avatar" aria-hidden="true">
                          <AgentIcon
                            icon={selectedIconValue as any}
                            type="agent"
                            props={{
                              icon: { width: 80, height: 80 },
                              avatar: {
                                size: 80,
                                icon: <MaterialIcon name="smart_toy" />,
                              },
                            }}
                          />
                        </div>
                        <Popover
                          open={iconEditorOpen}
                          onOpenChange={setIconEditorOpen}
                          trigger="click"
                          placement="bottom"
                          arrow={false}
                          destroyOnHidden
                          classNames={{ root: "agent-icon-editor-popover" }}
                          content={
                            <div
                              id="agent-icon-editor"
                              className="agent-icon-editor-panel"
                            >
                              <div className="field-group">
                                <label htmlFor="agent-icon-kind-input">
                                  {t("agentConsole.field.icon")}
                                </label>
                                <Select
                                  id="agent-icon-kind-input"
                                  value={form.iconKind}
                                  options={[
                                    {
                                      value: "none",
                                      label: t("agentConsole.field.iconKind.none"),
                                    },
                                    {
                                      value: "builtin",
                                      label: t("agentConsole.field.iconKind.builtin"),
                                    },
                                    {
                                      value: "image",
                                      label: t("agentConsole.field.iconKind.image"),
                                    },
                                  ]}
                                  onChange={(value: IconKind) =>
                                    updateForm({ iconKind: value })
                                  }
                                />
                              </div>
                              {form.iconKind === "builtin" && (
                                <div className="field-group">
                                  <label htmlFor="agent-icon-name-input">
                                    {t("agentConsole.field.iconName")}
                                  </label>
                                  <Select
                                    id="agent-icon-name-input"
                                    showSearch
                                    allowClear
                                    value={form.iconName || undefined}
                                    options={AGENT_ICON_NAMES.map((name) => ({
                                      value: name,
                                      label: name,
                                    }))}
                                    onChange={(value) =>
                                      updateForm({ iconName: value || "" })
                                    }
                                  />
                                </div>
                              )}
                              {form.iconKind === "image" && (
                                <div className="field-group">
                                  <label htmlFor="agent-icon-image-input">
                                    {t("agentConsole.field.iconImage")}
                                  </label>
                                  <Input
                                    id="agent-icon-image-input"
                                    placeholder={t("agentConsole.placeholder.iconImage")}
                                    value={form.iconImage}
                                    onChange={(event) =>
                                      updateForm({ iconImage: event.target.value })
                                    }
                                  />
                                </div>
                              )}
                            </div>
                          }
                        >
                          <UiButton
                            size="sm"
                            variant="ghost"
                            className="agent-icon-picker-action"
                            aria-expanded={iconEditorOpen}
                            aria-controls="agent-icon-editor"
                          >
                            <MaterialIcon name="image" />
                            {t("agentConsole.basic.changeIcon")}
                          </UiButton>
                        </Popover>
                      </div>
                    </div>
                    <div className="agent-identity-fields">
                      <div className="field-group">
                        <label htmlFor="agent-name-input">
                          {t("agentConsole.field.name")}
                        </label>
                        <Input
                          id="agent-name-input"
                          value={form.name}
                          onChange={(event) =>
                            updateForm({ name: event.target.value })
                          }
                        />
                      </div>
                      <div className="field-group">
                        <label htmlFor="agent-role-input">
                          {t("agentConsole.field.role")}
                        </label>
                        <Input
                          id="agent-role-input"
                          value={form.role}
                          onChange={(event) =>
                            updateForm({ role: event.target.value })
                          }
                        />
                      </div>
                    </div>
                    <div className="field-group agent-identity-description">
                      <label htmlFor="agent-description-input">
                        {t("agentConsole.field.description")}
                      </label>
                      <Input.TextArea
                        id="agent-description-input"
                        className="agent-description-textarea"
                        rows={4}
                        value={form.description}
                        onChange={(event) =>
                          updateForm({ description: event.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div className="agent-basic-runtime">
                    <div className="agent-subsection-heading">
                      <MaterialIcon name="play_circle" />
                      <h3>{t("agentConsole.basic.runtimeTitle")}</h3>
                    </div>
                    <div className="field-group">
                      <span id="agent-mode-label" className="field-label">
                        {t("agentConsole.field.mode")}
                      </span>
                      <div
                        id="agent-mode-options"
                        className="agent-choice-grid agent-mode-choice-grid"
                        role="radiogroup"
                        aria-labelledby="agent-mode-label"
                      >
                        {modeOptions.map((option) => {
                          const presentation = modePresentation(option.value, option.label, t);
                          return <label
                            key={option.value}
                            className={`agent-choice-card ${form.mode === option.value ? "is-selected" : ""}`}
                          >
                            <input
                              type="radio"
                              name="agent-mode"
                              value={option.value}
                              checked={form.mode === option.value}
                              onChange={() => setMode(option.value)}
                            />
                            <MaterialIcon name={presentation.icon} />
                            <span className="agent-choice-card-copy">
                              <span className="agent-choice-card-title">{presentation.label}</span>
                              <span className="agent-choice-card-description">{presentation.description}</span>
                            </span>
                          </label>
                        })}
                      </div>
                    </div>
                    <div className="field-group">
                      <span id="agent-visibility-label" className="field-label">
                        {t("agentConsole.field.visibility")}
                      </span>
                      <div
                        id="agent-visibility-options"
                        className="agent-choice-grid agent-visibility-choice-grid"
                        role="group"
                        aria-labelledby="agent-visibility-label"
                        aria-busy={loadingOptions}
                      >
                        {visibilityScopeOptions.map((option) => {
                          const checked = form.visibilityScopes.includes(
                            option.value,
                          );
                          const presentation = visibilityPresentation(option.value, option.label, t);
                          return (
                            <label
                              key={option.value}
                              className={`agent-choice-card ${checked ? "is-selected" : ""}`}
                            >
                              <input
                                type="checkbox"
                                value={option.value}
                                checked={checked}
                                onChange={() =>
                                  updateForm({
                                    visibilityScopes: checked
                                      ? form.visibilityScopes.filter(
                                          (scope) => scope !== option.value,
                                        )
                                      : [...form.visibilityScopes, option.value],
                                  })
                                }
                              />
                              <MaterialIcon name={presentation.icon} />
                              <span className="agent-choice-card-copy">
                                <span className="agent-choice-card-title">{presentation.label}</span>
                                <span className="agent-choice-card-description">{presentation.description}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </AgentFormSection>


                <AgentFormSection
                  id={AGENT_FORM_SECTION_IDS[2]}
                  icon="subject"
                  title={t("agentConsole.section.prompts")}
                >
                  <div className={AGENT_FORM_GRID_CLASS_NAME}>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <div className="agent-prompt-field-heading">
                        <label htmlFor="agent-soul-input">
                          {t("agentConsole.prompt.soul.label")}
                          <span>SOUL.md</span>
                        </label>
                        <Tooltip title={t("agentConsole.prompt.soul.description")}>
                          <button type="button" className="agent-prompt-help" aria-label={t("agentConsole.prompt.soul.description")}><MaterialIcon name="info" /></button>
                        </Tooltip>
                      </div>
                      <Input.TextArea
                        id="agent-soul-input"
                        className={AGENT_PROMPT_TEXTAREA_CLASS_NAME}
                        rows={10}
                        value={form.soulPrompt}
                        onChange={(event) => updateForm({ soulPrompt: event.target.value })}
                      />
                    </div>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <div className="agent-prompt-field-heading">
                        <label htmlFor="agent-agents-input">
                          {t("agentConsole.prompt.agents.label")}
                          <span>AGENTS.md</span>
                        </label>
                        <Tooltip title={t("agentConsole.prompt.agents.description")}>
                          <button type="button" className="agent-prompt-help" aria-label={t("agentConsole.prompt.agents.description")}><MaterialIcon name="info" /></button>
                        </Tooltip>
                      </div>
                      <Input.TextArea
                        id="agent-agents-input"
                        className={AGENT_PROMPT_TEXTAREA_CLASS_NAME}
                        rows={10}
                        value={form.agentsPrompt}
                        onChange={(event) => updateForm({ agentsPrompt: event.target.value })}
                      />
                    </div>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <div className="agent-prompt-field-heading">
                        <span id="agent-greetings-label" className="agent-prompt-field-label">{t("agentConsole.field.greetings")}</span>
                        <Tooltip title={t("agentConsole.prompt.greetings.description")}>
                          <button type="button" className="agent-prompt-help" aria-label={t("agentConsole.prompt.greetings.description")}><MaterialIcon name="info" /></button>
                        </Tooltip>
                        {!isReadOnly && <UiButton className="agent-prompt-heading-action" size="sm" variant="ghost" onClick={() => updateForm({ greetingsText: promptEntriesToJson([...greetingEntries, ""]) })}><MaterialIcon name="add" />{t("agentConsole.prompt.addGreeting")}</UiButton>}
                      </div>
                      <div className="agent-prompt-entry-list" role="group" aria-labelledby="agent-greetings-label">
                        {(greetingEntries.length ? greetingEntries : [""]).map((entry, index) => (
                          <div className="agent-prompt-entry" key={`greeting-${index}`}>
                            <Input
                              id={index === 0 ? "agent-greetings-input" : undefined}
                              aria-label={t("agentConsole.prompt.greetings.item", { index: index + 1 })}
                              placeholder={t("agentConsole.prompt.greetings.placeholder")}
                              value={entry}
                              onChange={(event) => {
                                const next = [...(greetingEntries.length ? greetingEntries : [""])];
                                next[index] = event.target.value;
                                updateForm({ greetingsText: promptEntriesToJson(next) });
                              }}
                            />
                            {!isReadOnly && <UiButton size="mini" variant="ghost" aria-label={t("agentConsole.prompt.removeItem", { index: index + 1 })} onClick={() => updateForm({ greetingsText: promptEntriesToJson(greetingEntries.filter((_, entryIndex) => entryIndex !== index)) })}><MaterialIcon name="delete" /></UiButton>}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <div className="agent-prompt-field-heading">
                        <span id="agent-wonders-label" className="agent-prompt-field-label">{t("agentConsole.field.wonders")}</span>
                        <Tooltip title={t("agentConsole.prompt.wonders.description")}>
                          <button type="button" className="agent-prompt-help" aria-label={t("agentConsole.prompt.wonders.description")}><MaterialIcon name="info" /></button>
                        </Tooltip>
                        {!isReadOnly && <UiButton className="agent-prompt-heading-action" size="sm" variant="ghost" onClick={() => updateForm({ wondersText: promptEntriesToJson([...wonderEntries, ""]) })}><MaterialIcon name="add" />{t("agentConsole.prompt.addWonder")}</UiButton>}
                      </div>
                      <div className="agent-prompt-entry-list" role="group" aria-labelledby="agent-wonders-label">
                        {(wonderEntries.length ? wonderEntries : [""]).map((entry, index) => (
                          <div className="agent-prompt-entry" key={`wonder-${index}`}>
                            <Input
                              id={index === 0 ? "agent-wonders-input" : undefined}
                              aria-label={t("agentConsole.prompt.wonders.item", { index: index + 1 })}
                              placeholder={t("agentConsole.prompt.wonders.placeholder")}
                              value={entry}
                              onChange={(event) => {
                                const next = [...(wonderEntries.length ? wonderEntries : [""])];
                                next[index] = event.target.value;
                                updateForm({ wondersText: promptEntriesToJson(next) });
                              }}
                            />
                            {!isReadOnly && <UiButton size="mini" variant="ghost" aria-label={t("agentConsole.prompt.removeItem", { index: index + 1 })} onClick={() => updateForm({ wondersText: promptEntriesToJson(wonderEntries.filter((_, entryIndex) => entryIndex !== index)) })}><MaterialIcon name="delete" /></UiButton>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </AgentFormSection>
                <AgentFormSection
                  id={AGENT_FORM_SECTION_IDS[1]}
                  icon="psychology"
                  title={t("agentConsole.section.model")}
                >
                  <div className="agent-model-selector-card">
                    <div className="agent-model-dropdown">
                      <Dropdown
                        menu={{
                          className: "query-settings-menu",
                          items: modelItems,
                          onClick: onModelMenuClick,
                        }}
                        onOpenChange={onModelMenuOpenChange}
                        placement="topRight"
                        trigger={["click"]}
                      >
                        <UiButton
                          className={`query-settings-btn tw:!min-h-8 tw:!rounded-lg tw:!px-2 tw:!text-[13px] tw:text-text-muted tw:[&_.material-icon]:flex-none tw:[&_.material-icon]:text-sm tw:[&_.ui-btn-label]:inline-flex tw:[&_.ui-btn-label]:min-w-0 tw:[&_.ui-btn-label]:items-center tw:[&_.ui-btn-label]:gap-1 tw:[&_.ui-btn-label>span:not(.material-icon)]:min-w-0 tw:[&_.ui-btn-label>span:not(.material-icon)]:overflow-hidden tw:[&_.ui-btn-label>span:not(.material-icon)]:text-ellipsis tw:[&_.ui-btn-label>span:not(.material-icon)]:whitespace-nowrap query-model-btn tw:overflow-hidden ${queryModelButtonStateClass}`.trim()}
                          variant="ghost"
                          size="sm"
                          disabled={isReadOnly || loadingOptions}
                          title={formError || t("composer.query.model.title")}
                          onClick={(event) => event.preventDefault()}
                        >
                          {showFastBadge ? <MaterialIcon name="bolt" /> : null}
                          <span className="query-model-label tw:text-text-main">
                            {selectedModelLabel}
                          </span>
                          <span>{selectedReasoningLabel}</span>
                          <MaterialIcon name="expand_more" />
                        </UiButton>
                      </Dropdown>
                    </div>
                  </div>
                </AgentFormSection>

                <AgentFormSection
                  id={AGENT_FORM_SECTION_IDS[3]}
                  icon="hub"
                  title={t("agentConsole.section.capabilities")}
                >
                  <AgentCapabilitiesEditor
                    readOnly={isReadOnly}
                    contextOptions={contextTagOptions.map((option) => {
                      const presentation = contextOptionPresentation(option.value);
                      return {
                        value: option.value,
                        label: option.label,
                        icon: presentation.icon,
                        description: t(presentation.descriptionKey),
                      };
                    })}
                    contextTags={form.contextTags}
                    tools={form.tools}
                    skills={form.skills}
                    filteredTools={filteredToolOptions}
                    selectedTools={selectedTools}
                    filteredSkills={filteredSkillOptions}
                    selectedSkills={selectedSkills}
                    toolFilter={toolFilter}
                    toolSearchText={toolSearchText}
                    skillSearchText={skillSearchText}
                    toolsExpanded={toolsExpanded}
                    skillsExpanded={skillsExpanded}
                    canImportPrivateSkill={canImportPrivateSkill}
                    t={t}
                    getToolCategory={toolFilterForOption}
                    getToolSourceLabel={(tool) => toolSourceLabel(tool.sourceCategory, t) || tool.kind}
                    onContextTagsChange={(contextTags) => updateForm({ contextTags })}
                    onToolsChange={(tools) => updateForm({ tools })}
                    onSkillsChange={(skills) => updateForm({ skills })}
                    onToolFilterChange={setToolFilter}
                    onToolSearchTextChange={setToolSearchText}
                    onSkillSearchTextChange={setSkillSearchText}
                    onToolsExpandedChange={setToolsExpanded}
                    onSkillsExpandedChange={setSkillsExpanded}
                    onImportPrivateSkill={openPrivateSkillImport}
                  />
                </AgentFormSection>

                <AgentFormSection
                  id={AGENT_FORM_SECTION_IDS[4]}
                  icon="tune"
                  title={t("agentConsole.section.advancedConfig")}
                >
                  <div className={AGENT_FORM_GRID_CLASS_NAME}>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <label htmlFor="agent-controls-input">
                        {t("agentConsole.field.controls")}
                      </label>
                      <Input.TextArea
                        id="agent-controls-input"
                        className={AGENT_MONO_TEXTAREA_CLASS_NAME}
                        rows={5}
                        value={form.controlsText}
                        onChange={(event) =>
                          updateForm({ controlsText: event.target.value })
                        }
                      />
                    </div>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <label htmlFor="agent-runtime-input">
                        {t("agentConsole.field.runtimeConfig")}
                      </label>
                      <Input.TextArea
                        id="agent-runtime-input"
                        className={AGENT_MONO_TEXTAREA_CLASS_NAME}
                        rows={5}
                        placeholder='{"environmentId":"shell","level":"RUN"}'
                        value={form.runtimeConfigText}
                        onChange={(event) =>
                          updateForm({ runtimeConfigText: event.target.value })
                        }
                      />
                    </div>
                    <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                      <div className="agent-advanced-field-heading">
                        <label htmlFor="agent-budget-input">
                          {t("agentConsole.field.budget")}
                        </label>
                        {!isReadOnly && (
                          <Dropdown
                            menu={{
                              items: [
                                {
                                  key: "simple",
                                  label: t("agentConsole.budget.template.simple"),
                                },
                                {
                                  key: "advanced",
                                  label: t("agentConsole.budget.template.advanced"),
                                },
                              ],
                              onClick: ({ key }) =>
                                updateForm({
                                  budgetText:
                                    key === "simple"
                                      ? SIMPLE_BUDGET_TEMPLATE
                                      : BUDGET_PLACEHOLDER,
                                }),
                            }}
                            placement="bottomRight"
                            trigger={["click"]}
                          >
                            <UiButton
                              className="agent-budget-template-trigger"
                              size="mini"
                              variant="ghost"
                            >
                              <MaterialIcon name="content_copy" />
                              <span>{t("agentConsole.budget.template")}</span>
                              <MaterialIcon name="expand_more" />
                            </UiButton>
                          </Dropdown>
                        )}
                      </div>
                      <Input.TextArea
                        id="agent-budget-input"
                        className={AGENT_MONO_TEXTAREA_CLASS_NAME}
                        rows={7}
                        placeholder={BUDGET_PLACEHOLDER}
                        value={form.budgetText}
                        onChange={(event) =>
                          updateForm({ budgetText: event.target.value })
                        }
                      />
                    </div>
                    {form.mode === "PROXY" && (
                      <div className={AGENT_FORM_FULL_WIDTH_CLASS_NAME}>
                        <label htmlFor="agent-proxy-input">
                          {t("agentConsole.field.acpProxyConfig")}
                        </label>
                        <Input.TextArea
                          id="agent-proxy-input"
                          className={AGENT_MONO_TEXTAREA_CLASS_NAME}
                          rows={5}
                          placeholder='{"baseUrl":"http://127.0.0.1:3210","timeoutMs":300000}'
                          value={form.proxyConfigText}
                          onChange={(event) =>
                            updateForm({ proxyConfigText: event.target.value })
                          }
                        />
                      </div>
                    )}
                  </div>
                </AgentFormSection>
    </div>
  );
};
