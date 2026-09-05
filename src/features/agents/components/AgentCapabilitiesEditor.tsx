import React from "react";
import { Input, Popover, Tooltip } from "antd";
import type { MaterialIconName } from "@/shared/ui/MaterialIcon";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import type {
  AgentSkillOption,
  AgentToolOption,
} from "@/features/agents/lib/agentOptions";

export type AgentToolFilter = "all" | "file" | "desktop" | "system";

export interface AgentCapabilitiesEditorProps {
  readOnly: boolean;
  contextOptions: Array<{
    value: string;
    label: string;
    icon: MaterialIconName;
    description: string;
  }>;
  contextTags: string[];
  tools: string[];
  skills: string[];
  filteredTools: AgentToolOption[];
  selectedTools: AgentToolOption[];
  filteredSkills: AgentSkillOption[];
  selectedSkills: AgentSkillOption[];
  toolFilter: AgentToolFilter;
  toolSearchText: string;
  skillSearchText: string;
  toolsExpanded: boolean;
  skillsExpanded: boolean;
  canImportPrivateSkill: boolean;
  t: (key: string, vars?: Record<string, unknown>) => string;
  getToolCategory: (tool: AgentToolOption) => Exclude<AgentToolFilter, "all">;
  getToolSourceLabel: (tool: AgentToolOption) => string;
  onContextTagsChange: (value: string[]) => void;
  onToolsChange: (value: string[]) => void;
  onSkillsChange: (value: string[]) => void;
  onToolFilterChange: (value: AgentToolFilter) => void;
  onToolSearchTextChange: (value: string) => void;
  onSkillSearchTextChange: (value: string) => void;
  onToolsExpandedChange: (value: boolean) => void;
  onSkillsExpandedChange: (value: boolean) => void;
  onImportPrivateSkill: () => void;
}

function toolIcon(category: Exclude<AgentToolFilter, "all">): MaterialIconName {
  if (category === "file") return "description";
  if (category === "desktop") return "terminal";
  return "settings";
}

export const AgentCapabilitiesEditor: React.FC<AgentCapabilitiesEditorProps> = (props) => (
  <div className="agent-context-capabilities">
    <section className="agent-context-block" aria-labelledby="agent-context-heading">
      <h4 id="agent-context-heading">{props.t("agentConsole.context.title")}</h4>
      <div className="agent-context-tag-list" role="group" aria-labelledby="agent-context-heading">
        {props.contextOptions.map((option) => {
          const checked = props.contextTags.includes(option.value);
          return (
            <label key={option.value} className={`agent-context-tag ${checked ? "is-selected" : ""}`} title={option.description}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => props.onContextTagsChange(
                  checked
                    ? props.contextTags.filter((key) => key !== option.value)
                    : [...props.contextTags, option.value],
                )}
              />
              <MaterialIcon name={option.icon} />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </section>

    <section className="agent-context-block" aria-labelledby="agent-tools-heading">
      <div className="agent-context-block-heading">
        <h4 id="agent-tools-heading">{props.t("agentConsole.field.tools")}</h4>
        {!props.readOnly ? (
          <Popover
            content={(
              <div id="agent-tools-manager" className="agent-capability-manager agent-capability-popover agent-capability-popover--compact">
                <div className="agent-tool-list-toolbar">
                  <Input aria-label={props.t("agentConsole.context.searchTools")} prefix={<MaterialIcon name="search" />} placeholder={props.t("agentConsole.context.searchTools")} value={props.toolSearchText} onChange={(event) => props.onToolSearchTextChange(event.target.value)} />
                  <div className="agent-tool-filter" role="group" aria-label={props.t("agentConsole.context.filterTools")}>
                    {(["all", "file", "desktop", "system"] as const).map((filter) => (
                      <button key={filter} type="button" className={props.toolFilter === filter ? "is-active" : ""} onClick={() => props.onToolFilterChange(filter)}>{props.t(`agentConsole.context.toolFilter.${filter}`)}</button>
                    ))}
                  </div>
                </div>
                <div className="agent-selectable-list agent-capability-scroll" role="group" aria-label={props.t("agentConsole.field.tools")}>
                  {props.filteredTools.map((tool) => (
                    <label key={tool.key} className="agent-selectable-row">
                      <input type="checkbox" checked={props.tools.includes(tool.key)} onChange={(event) => props.onToolsChange(event.target.checked ? [...props.tools, tool.key] : props.tools.filter((key) => key !== tool.key))} />
                      <MaterialIcon name={toolIcon(props.getToolCategory(tool))} />
                      <span className="agent-selectable-row-copy"><strong>{tool.label}</strong>{tool.label !== tool.key ? <span>· {tool.key}</span> : null}</span>
                      <span className="agent-selectable-row-meta">{props.getToolSourceLabel(tool) || tool.kind}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            open={props.toolsExpanded}
            onOpenChange={props.onToolsExpandedChange}
            placement="bottomRight"
            trigger={["click"]}
          >
            <UiButton size="sm" variant="ghost" aria-expanded={props.toolsExpanded} aria-controls="agent-tools-manager"><MaterialIcon name="tune" />{props.t("agentConsole.context.manageTools")}</UiButton>
          </Popover>
        ) : null}
      </div>
      <div className="agent-tool-tag-list" aria-live="polite">
        <strong>{props.t("agentConsole.context.selectedCount", { count: props.tools.length })}</strong>
        {props.selectedTools.map((tool) => (
          <span key={tool.key} className="agent-tool-tag">
            <MaterialIcon name={toolIcon(props.getToolCategory(tool))} />
            <span>{tool.label}</span>
            {!props.readOnly ? <button type="button" aria-label={props.t("agentConsole.prompt.removeItem", { index: tool.label })} onClick={() => props.onToolsChange(props.tools.filter((key) => key !== tool.key))}><MaterialIcon name="close" /></button> : null}
          </span>
        ))}
      </div>
    </section>

    <section className="agent-context-block" aria-labelledby="agent-skills-heading">
      <div className="agent-context-block-heading">
        <h4 id="agent-skills-heading">{props.t("agentConsole.field.skills")}</h4>
        {!props.readOnly ? (
          <span className="agent-context-heading-actions">
            <UiButton size="sm" variant="ghost" onClick={props.onImportPrivateSkill} disabled={!props.canImportPrivateSkill} title={props.canImportPrivateSkill ? props.t("agentConsole.privateSkill.import.title") : props.t("agentConsole.privateSkill.import.disabled")}><MaterialIcon name="folder_zip" />{props.t("agentConsole.privateSkill.import.action")}</UiButton>
            <Popover
              content={(
                <div id="agent-skills-manager" className="agent-capability-manager agent-capability-popover agent-capability-popover--compact agent-skill-manager-popover">
                  <Input className="agent-skill-search" aria-label={props.t("agentConsole.context.searchSkills")} prefix={<MaterialIcon name="search" />} placeholder={props.t("agentConsole.context.searchSkills")} value={props.skillSearchText} onChange={(event) => props.onSkillSearchTextChange(event.target.value)} />
                  <div className="agent-selectable-list agent-capability-scroll agent-skill-single-line-list" role="group" aria-label={props.t("agentConsole.field.skills")}>
                    {props.filteredSkills.map((skill) => {
                      const description = skill.description || props.t(skill.source === "private" ? "agentConsole.privateSkill.source.private" : "agentConsole.privateSkill.source.center");
                      return (
                        <label key={skill.key} className="agent-selectable-row agent-skill-row agent-skill-row--single-line">
                          <input type="checkbox" checked={props.skills.includes(skill.key)} onChange={(event) => props.onSkillsChange(event.target.checked ? [...props.skills, skill.key] : props.skills.filter((key) => key !== skill.key))} />
                          <MaterialIcon name="skills" />
                          <span className="agent-selectable-row-copy"><strong className="agent-skill-title">{skill.label}</strong><Tooltip title={description} placement="right" mouseEnterDelay={0.35} overlayClassName="agent-skill-description-tooltip"><span className="agent-skill-description-help" tabIndex={0} aria-label={description}><MaterialIcon name="info" /></span></Tooltip></span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              open={props.skillsExpanded}
              onOpenChange={props.onSkillsExpandedChange}
              placement="bottomRight"
              trigger={["click"]}
            >
              <UiButton size="sm" variant="ghost" aria-expanded={props.skillsExpanded} aria-controls="agent-skills-manager"><MaterialIcon name="tune" />{props.t("agentConsole.context.manageSkills")}</UiButton>
            </Popover>
          </span>
        ) : null}
      </div>
      <div className="agent-selected-skill-list" aria-live="polite">
        <strong>{props.t("agentConsole.context.selectedCount", { count: props.skills.length })}</strong>
        {props.selectedSkills.map((skill) => {
          const description = skill.description || props.t(skill.source === "private" ? "agentConsole.privateSkill.source.private" : "agentConsole.privateSkill.source.center");
          return (
            <div key={skill.key} className="agent-selected-skill-row">
              <MaterialIcon name="skills" />
              <span className="agent-selected-skill-copy"><strong className="agent-skill-title">{skill.label}</strong><span className="agent-skill-inline-separator" aria-hidden="true">·</span><span className="agent-skill-description" title={description}>{description}</span></span>
              {!props.readOnly ? <button type="button" aria-label={props.t("agentConsole.prompt.removeItem", { index: skill.label })} onClick={() => props.onSkillsChange(props.skills.filter((key) => key !== skill.key))}><MaterialIcon name="close" /></button> : null}
            </div>
          );
        })}
      </div>
    </section>
  </div>
);
