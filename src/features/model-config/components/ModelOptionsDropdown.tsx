import React, { useEffect, useRef, useState } from "react";
import { Dropdown, type DropdownProps, type MenuProps } from "antd";
import { isMobilePath } from "@/shared/utils/mobileRoutes";
import { useI18n } from "@/shared/i18n";
import { BottomSheet } from "@/shared/ui/BottomSheet";
import { UiButton } from "@/shared/ui/UiButton";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import styles from "./ModelOptionsDropdown.module.css";

type Items = NonNullable<MenuProps["items"]>;
type Item = NonNullable<Items[number]>;
type Branch = Item & { children: Items };
const isGroup = (item: Item) => "type" in item && item.type === "group";
const isBranch = (item: Item): item is Branch => "children" in item && Array.isArray(item.children) && !isGroup(item);
function findItem(items: Items, key: string): Item | undefined {
  for (const item of items) {
    if (!item) continue;
    if (String(item.key) === key) return item;
    if (isGroup(item) && "children" in item) {
      const child = findItem(item.children || [], key);
      if (child) return child;
    }
  }
  return undefined;
}

/** Desktop keeps the existing dropdown; /mobile uses the shared bottom sheet so a submenu never opens sideways. */
export function ModelOptionsDropdown(props: DropdownProps) {
  return isMobilePath(typeof window === "undefined" ? undefined : window.location?.pathname)
    ? <MobileModelOptionsDropdown {...props} /> : <Dropdown {...props} />;
}

function MobileModelOptionsDropdown(props: DropdownProps) {
  const { t } = useI18n();
  const [internalOpen, setInternalOpen] = useState(false);
  const [path, setPath] = useState<string[]>([]);
  const back = useRef<HTMLButtonElement>(null);
  const open = props.open ?? internalOpen;
  useEffect(() => { if (!open) setPath([]); }, [open]);
  useEffect(() => { if (path.length) back.current?.focus(); }, [path]);
  const setOpen: NonNullable<DropdownProps["onOpenChange"]> = (next, info) => {
    setInternalOpen(next);
    props.onOpenChange?.(next, info);
  };
  let current = props.menu?.items || [];
  for (const key of path) {
    const branch = findItem(current, key);
    if (!branch || !isBranch(branch)) break;
    current = branch.children;
  }
  // Native buttons avoid Dropdown's Menu override, which closes even when a
  // navigation row is clicked. Only a leaf selection closes this pane.
  const renderItems = (items: Items): React.ReactNode => items.map((item, index) => {
    if (!item) return null;
    const key = String(item.key ?? index);
    if ("type" in item && item.type === "divider") return <hr key={key} className={styles.divider} />;
    if (isGroup(item) && "children" in item) return <div key={key} role="group" className={styles.group}>
      <div className={styles.groupTitle}>{"label" in item ? item.label : null}</div>
      {renderItems(item.children || [])}
    </div>;
    return <button key={key} type="button" role="menuitem" className={styles.option}
      disabled={Boolean("disabled" in item && item.disabled)}
      aria-haspopup={isBranch(item) ? "menu" : undefined}
      onClick={event => {
        if (isBranch(item)) { setPath(previous => [...previous, key]); return; }
        props.menu?.onClick?.({ key, keyPath: [key, ...path.slice().reverse()], domEvent: event, item: event.currentTarget });
        setOpen(false, { source: "menu" });
      }}>
      <span className={styles.label}>{"label" in item ? item.label : null}</span>
      <span className={styles.extra}>{isBranch(item) ? <MaterialIcon name="chevron_right" /> : "extra" in item ? item.extra as React.ReactNode : null}</span>
    </button>;
  });
  const trigger = React.Children.only(props.children) as React.ReactElement<React.ButtonHTMLAttributes<HTMLButtonElement>>;
  return <>
    {React.cloneElement(trigger, { onClick: event => {
      trigger.props.onClick?.(event);
      if (!props.disabled && !trigger.props.disabled) setOpen(!open, { source: "trigger" });
    } })}
    <BottomSheet open={open} onClose={() => setOpen(false, { source: "trigger" })}
      ariaLabel={t("composer.query.model.title")} getContainer=".layout-mobile">
    <div className={styles.pane} onKeyDown={event => {
      if (path.length && event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); setPath(previous => previous.slice(0, -1));
      }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        const options = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')];
        if (!options.length) return;
        event.preventDefault();
        const index = options.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
        options[next].focus();
      }
    }}>
      {path.length > 0 && <UiButton ref={back} variant="ghost" className={styles.back}
        onClick={() => setPath(previous => previous.slice(0, -1))}>
        <MaterialIcon name="chevron_right" style={{ transform: "rotate(180deg)" }} />{t("composer.addMenu.back")}
      </UiButton>}
      <div role="menu" className={styles.menu}>{renderItems(current)}</div>
    </div>
    </BottomSheet>
  </>;
}
