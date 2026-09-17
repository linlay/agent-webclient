import React, { useState, useRef, useMemo, useEffect } from "react";
import { Input, Popover } from "antd";
import type { InputRef } from "antd";
import { AgentIcon } from "@/shared/icons/agent";
import { useI18n } from "@/shared/i18n";
import type { CurrentWorkerSummary } from "../lib/currentWorker";
import { filterTimelineAgentOptions, dispatchTimelineAgentSwitch, type TimelineAgentOption } from "../lib/agentSelection";
import "./AgentSwitcherPopover.module.css";
const TIMELINE_EMPTY_AGENT_SWITCHER_CLASS_NAME =
  "timeline-empty-agent-switcher tw:relative tw:inline-flex tw:align-baseline";
const TIMELINE_AGENT_SWITCHER_TRIGGER_CLASS_NAME =
  "timeline-agent-switcher-trigger tw:m-0 tw:inline-flex tw:max-w-[min(300px,62vw)] tw:items-center tw:rounded-lg tw:border-0 tw:bg-transparent tw:px-[5px] tw:py-px tw:font-[inherit] tw:font-extrabold tw:leading-[1.25] tw:text-ink-1 tw:align-baseline tw:shadow-none tw:hover:bg-[color-mix(in_srgb,var(--accent-soft)_58%,transparent)] tw:hover:text-accent-electric-strong tw:focus-visible:bg-[color-mix(in_srgb,var(--accent-soft)_58%,transparent)] tw:focus-visible:text-accent-electric-strong tw:focus-visible:outline-none tw:active:transform-none";
const TIMELINE_AGENT_SWITCHER_TRIGGER_NAME_CLASS_NAME =
  "timeline-agent-switcher-trigger-name tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap";
const TIMELINE_AGENT_SWITCHER_MENU_CLASS_NAME =
  "timeline-agent-switcher-menu tw:w-[min(340px,calc(100vw-40px))] tw:max-w-[calc(100vw-40px)]";
const TIMELINE_AGENT_SWITCHER_SEARCH_CLASS_NAME =
  "timeline-agent-switcher-search tw:w-full";
const TIMELINE_AGENT_SWITCHER_EMPTY_CLASS_NAME =
  "timeline-agent-switcher-empty tw:px-2.5 tw:pb-2.5 tw:pt-[18px] tw:text-[13px] tw:font-semibold tw:text-ink-muted";
const TIMELINE_AGENT_SWITCHER_LIST_CLASS_NAME =
  "timeline-agent-switcher-list tw:grid tw:max-h-[248px] tw:overflow-y-auto";
const TIMELINE_AGENT_SWITCHER_OPTION_CLASS_NAME =
  "timeline-agent-switcher-option tw:border-0 tw:flex tw:min-h-8 tw:w-full tw:min-w-0 tw:items-center tw:gap-1.5 tw:rounded-none tw:bg-transparent tw:p-[10px] tw:text-left tw:shadow-none tw:hover:bg-[color-mix(in_srgb,var(--accent-soft)_68%,transparent)] tw:focus-visible:bg-[color-mix(in_srgb,var(--accent-soft)_68%,transparent)] tw:focus-visible:outline-none tw:active:transform-none";
const TIMELINE_AGENT_SWITCHER_OPTION_ACTIVE_CLASS_NAME =
  "is-active tw:border-[color-mix(in_srgb,var(--accent-electric)_28%,transparent)] tw:bg-[color-mix(in_srgb,var(--accent-soft)_68%,transparent)]";
const TIMELINE_AGENT_SWITCHER_AVATAR_CLASS_NAME =
  "timeline-agent-switcher-avatar tw:shrink-0";
const TIMELINE_AGENT_SWITCHER_OPTION_COPY_CLASS_NAME =
  "timeline-agent-switcher-option-copy tw:flex tw:min-w-0 tw:items-baseline tw:gap-1.5 tw:leading-[1.2]";
const TIMELINE_AGENT_SWITCHER_OPTION_NAME_CLASS_NAME =
  "tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[13px] tw:font-bold tw:text-ink-1";
const TIMELINE_AGENT_SWITCHER_OPTION_ROLE_CLASS_NAME =
  "tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-xs tw:font-medium tw:text-ink-muted";
export const AgentSwitcherPopover: React.FC<{
  currentWorker: Pick<CurrentWorkerSummary, "type" | "sourceId" | "displayName"> | null;
  options: TimelineAgentOption[];
  disabled?: boolean;
  containerClassName?: string;
  renderTrigger?: (open: boolean) => React.ReactElement;
  onSelectAgent?: (key: string) => void;
  initialOpen?: boolean;
  initialSearchText?: string;
}> = ({
  currentWorker,
  options,
  disabled = false,
  containerClassName,
  renderTrigger,
  onSelectAgent,
  initialOpen = false,
  initialSearchText = "",
}) => {
  const { t } = useI18n();
  const [open, setOpen] = useState(initialOpen);
  const [searchText, setSearchText] = useState(initialSearchText);
  const searchInputRef = useRef<InputRef>(null);
  const currentAgentKey =
    currentWorker?.type === "agent" ? currentWorker.sourceId : "";
  const activeOption =
    options.find((option) => option.key === currentAgentKey) || options[0];
  const displayName =
    currentWorker?.displayName || activeOption?.name || currentAgentKey;
  const filteredOptions = useMemo(
    () => filterTimelineAgentOptions(options, searchText),
    [options, searchText],
  );

  useEffect(() => {
    if (!open) return;
    searchInputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleSelectAgent = (option: TimelineAgentOption) => {
    setOpen(false);
    setSearchText("");
    if (onSelectAgent) onSelectAgent(option.key);
    else dispatchTimelineAgentSwitch(option);
  };

  return (
    <span className={containerClassName || TIMELINE_EMPTY_AGENT_SWITCHER_CLASS_NAME}>
      <Popover
        open={open && !disabled}
        onOpenChange={(next) => { if (!disabled) setOpen(next); }}
        trigger={["click"]}
        placement="topLeft"
        arrow={false}
        styles={{
          body: {
            padding: 0,
            boxShadow: "var(--shadow-soft)",
          },
        }}
        content={
          <div className={TIMELINE_AGENT_SWITCHER_MENU_CLASS_NAME}>
            <Input
              ref={searchInputRef}
              className={TIMELINE_AGENT_SWITCHER_SEARCH_CLASS_NAME}
              variant="borderless"
              value={searchText}
              placeholder={t("timeline.agentSwitcher.searchPlaceholder")}
              onChange={(event) => setSearchText(event.target.value)}
              style={{ padding: "8px 10px" }}
            />
            {filteredOptions.length === 0 ? (
              <div className={TIMELINE_AGENT_SWITCHER_EMPTY_CLASS_NAME}>
                {t("timeline.agentSwitcher.empty")}
              </div>
            ) : (
              <div
                className={TIMELINE_AGENT_SWITCHER_LIST_CLASS_NAME}
                role="listbox"
                aria-label={t("timeline.agentSwitcher.listAriaLabel")}
              >
                {filteredOptions.map((option) => {
                  const selected = option.key === currentAgentKey;
                  return (
                    <button
                      key={option.key}
                      className={[
                        TIMELINE_AGENT_SWITCHER_OPTION_CLASS_NAME,
                        selected
                          ? TIMELINE_AGENT_SWITCHER_OPTION_ACTIVE_CLASS_NAME
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => handleSelectAgent(option)}
                    >
                      <AgentIcon
                        icon={option.icon}
                        type="agent"
                        props={{
                          icon: {
                            className:
                              TIMELINE_AGENT_SWITCHER_AVATAR_CLASS_NAME,
                            width: 20,
                            height: 20,
                          },
                          avatar: {
                            className:
                              TIMELINE_AGENT_SWITCHER_AVATAR_CLASS_NAME,
                            size: 20,
                          },
                        }}
                      />
                      <span
                        className={
                          TIMELINE_AGENT_SWITCHER_OPTION_COPY_CLASS_NAME
                        }
                      >
                        <strong
                          className={
                            TIMELINE_AGENT_SWITCHER_OPTION_NAME_CLASS_NAME
                          }
                        >
                          {option.name}
                        </strong>
                        {!option.hideRole && (
                          <span
                            className={
                              TIMELINE_AGENT_SWITCHER_OPTION_ROLE_CLASS_NAME
                            }
                          >
                            {option.role || "--"}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        }
      >
        {renderTrigger ? renderTrigger(open && !disabled) : <button
          disabled={disabled}
          className={TIMELINE_AGENT_SWITCHER_TRIGGER_CLASS_NAME}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={t("timeline.agentSwitcher.ariaLabel", {
            name: displayName,
          })}
        >
          <span className={TIMELINE_AGENT_SWITCHER_TRIGGER_NAME_CLASS_NAME}>
            {displayName}
          </span>
        </button>}
      </Popover>
    </span>
  );
};
