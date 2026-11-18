import React, { useState, useRef, useMemo, useEffect } from "react";
import { Drawer, Input, Popover } from "antd";
import type { InputRef } from "antd";
import { AgentIcon } from "@/shared/icons/agent";
import { useI18n } from "@/shared/i18n";
import { isMobilePath } from "@/shared/utils/mobileRoutes";
import type { CurrentWorkerSummary } from "../lib/currentWorker";
import {
  filterTimelineAgentOptions,
  dispatchTimelineAgentSwitch,
  type TimelineAgentOption,
} from "../lib/agentSelection";
import styles from "./AgentSwitcherPopover.module.css";

const TIMELINE_EMPTY_AGENT_SWITCHER_CLASS_NAME =
  "timeline-empty-agent-switcher tw:relative tw:inline-block tw:align-baseline";
const TIMELINE_AGENT_SWITCHER_TRIGGER_CLASS_NAME =
  "timeline-agent-switcher-trigger tw:m-0 tw:inline-flex tw:max-w-[min(300px,62vw)] tw:items-baseline tw:rounded-lg tw:border-0 tw:bg-transparent tw:px-[5px] tw:py-px tw:font-[inherit] tw:font-extrabold tw:leading-[inherit] tw:text-ink-1 tw:align-baseline tw:shadow-none tw:hover:bg-[color-mix(in_srgb,var(--accent-soft)_58%,transparent)] tw:hover:text-accent-electric-strong tw:focus-visible:bg-[color-mix(in_srgb,var(--accent-soft)_58%,transparent)] tw:focus-visible:text-accent-electric-strong tw:focus-visible:outline-none tw:active:transform-none";
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
  currentWorker: Pick<
    CurrentWorkerSummary,
    "type" | "sourceId" | "displayName"
  > | null;
  options: TimelineAgentOption[];
  disabled?: boolean;
  containerClassName?: string;
  renderTrigger?: (open: boolean) => React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>;
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
  const mobile = isMobilePath(typeof window === "undefined" ? undefined : window.location?.pathname);
  const [open, setOpen] = useState(initialOpen);
  const expanded = open && !disabled;
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
    if (mobile || !expanded) return;
    searchInputRef.current?.focus();
  }, [mobile, expanded]);

  useEffect(() => {
    if (mobile || !expanded || typeof document === "undefined") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobile, expanded]);

  const handleSelectAgent = (option: TimelineAgentOption) => {
    setOpen(false);
    setSearchText("");
    if (onSelectAgent) onSelectAgent(option.key);
    else dispatchTimelineAgentSwitch(option);
  };

  const searchLabel = t("timeline.agentSwitcher.searchPlaceholder");
  const menu = (
    <div className={mobile ? styles.sheetMenu : TIMELINE_AGENT_SWITCHER_MENU_CLASS_NAME}>
      <Input
        ref={searchInputRef}
        className={TIMELINE_AGENT_SWITCHER_SEARCH_CLASS_NAME}
        variant="borderless"
        value={searchText}
        aria-label={searchLabel}
        placeholder={searchLabel}
        onChange={(event) => setSearchText(event.target.value)}
        style={mobile ? undefined : { padding: "8px 10px" }}
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
              <button data-agent-identity=""
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
                  interactive={false}
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
                  {!option.hideRole && option.role && (
                    <span
                      className={
                        TIMELINE_AGENT_SWITCHER_OPTION_ROLE_CLASS_NAME
                      }
                    >
                      {option.role}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
  const trigger = renderTrigger?.(expanded) ?? (
    <button data-agent-identity=""
      disabled={disabled}
      className={`${TIMELINE_AGENT_SWITCHER_TRIGGER_CLASS_NAME} tw:gap-2`}
      type="button"
      aria-haspopup="listbox"
      aria-expanded={expanded}
      aria-label={t("timeline.agentSwitcher.ariaLabel", { name: displayName })}
    >
      <span className={TIMELINE_AGENT_SWITCHER_TRIGGER_NAME_CLASS_NAME}>
        {displayName}
      </span>
    </button>
  );

  return (
    <span className={containerClassName || TIMELINE_EMPTY_AGENT_SWITCHER_CLASS_NAME}>
      {mobile ? (
        <>
          {React.cloneElement(trigger, {
            "aria-haspopup": "dialog",
            onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
              trigger.props.onClick?.(event);
              if (!disabled && !event.defaultPrevented) setOpen(!expanded);
            },
          })}
          <Drawer
            open={expanded}
            onClose={() => setOpen(false)}
            placement="bottom"
            height="auto"
            title={t("composer.context.selectAgent")}
            getContainer=".layout-mobile"
            rootClassName={styles.sheet}
            rootStyle={{ position: "absolute" }}
            styles={{ body: { padding: 0, overflow: "hidden" } }}
          >
            {menu}
          </Drawer>
        </>
      ) : (
        <Popover
          open={expanded}
          onOpenChange={(next) => {
            if (!disabled) setOpen(next);
          }}
          trigger={["click"]}
          placement="topLeft"
          arrow={false}
          styles={{
            body: {
              padding: 0,
              border: "1px solid color-mix(in srgb, var(--line-soft) 88%, transparent)",
              borderRadius: 15,
              boxShadow: "var(--shadow-soft)",
              overflow: "hidden",
            },
          }}
          content={menu}
        >
          {trigger}
        </Popover>
      )}
    </span>
  );
};
