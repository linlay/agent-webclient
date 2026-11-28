import React, { useEffect, useRef, useState } from "react";
import { Empty, Spin } from "antd";
import { t } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { SearchFilterBar } from "@/shared/ui/SearchFilterBar";
import { ModalTitleBar } from "@/shared/ui/ModalTitleBar";
import { UiButton } from "@/shared/ui/UiButton";
import { usePanelResize } from "@/shared/ui/usePanelResize";
import { MobileSwipeDrawer, type MobileSwipeDrawerHandle } from "@/shared/ui/MobileSwipeDrawer";
import { useMobileSwipeGestures } from "@/shared/ui/hooks/useMobileSwipeGestures";
import { useMobilePageHeaderAction, MobilePageHeaderActionProvider, MobilePageHeaderActionSlot } from "@/shared/ui/MobilePageHeaderAction";
import { useAppMessage } from "@/shared/ui/useAppMessage";
import type { KnowledgeBase } from "@/shared/data/api/dto/kbases";
import { useKBases } from "../hooks/useKBases";
import { libraryCollections } from "../lib/documentSource";
import { KnowledgeWorkspace } from "./KnowledgeWorkspace";
import { KBaseEditor } from "./KBaseEditor";
import { KBaseStateTag } from "./KBaseStateTag";
import styles from "./KBasesConsole.module.css";

interface KBasesConsoleProps {
  embedded?: boolean;
  onClose?: () => void;
  titleBarVariant?: "default" | "drawer";
  /** 移动端：列表收进左侧抽屉，详情独占内容区。 */
  mobile?: boolean;
}

export function KBasesConsole(props: KBasesConsoleProps = {}) {
  if (props.embedded && props.mobile) {
    return (
      <MobilePageHeaderActionProvider>
        <KBasesConsoleContent {...props} />
      </MobilePageHeaderActionProvider>
    );
  }
  return <KBasesConsoleContent {...props} />;
}

const KBasesConsoleContent = ({ embedded = false, onClose, titleBarVariant = "default", mobile = false }: KBasesConsoleProps = {}) => {
  const { items, loading, error, reload } = useKBases();
  const message = useAppMessage();
  // The toolbar refresh is the only retry entry, so a failed load is reported
  // as a toast instead of an inline alert.
  useEffect(() => {
    if (error) message.error(error);
  }, [error, message]);
  const [selected, select] = useState("");
  const [filter, setFilter] = useState("");
  const [editor, setEditor] = useState<KnowledgeBase | "new" | null>(null);
  const [listWidth, setListWidth] = useState(260);
  const resizeStart = useRef(listWidth);
  const layoutRef = useRef<HTMLDivElement>(null);
  const detailRegionRef = useRef<HTMLDivElement>(null);
  const listDrawerRef = useRef<MobileSwipeDrawerHandle>(null);
  const emptyPanelRef = useRef<MobileSwipeDrawerHandle>(null);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const mobileListLayout = Boolean(mobile);
  const { handlePointerDown } = usePanelResize({
    axis: "horizontal",
    onResizeStart: () => { resizeStart.current = listWidth; },
    onResize: delta => setListWidth(Math.max(220, Math.min(420, resizeStart.current + delta))),
  });
  const active = items.find(item => item.id === selected) || items[0];
  const search = filter.trim().toLowerCase();
  const visible = items.filter(item => `${item.name} ${item.description} ${libraryCollections(item).map(c => c.name).join(" ")}`.toLowerCase().includes(search));

  const selectedName =
    active?.name || t("kbases.mobile.noSelection");
  useEffect(() => {
    if (!mobileListLayout) setMobileListOpen(false);
  }, [mobileListLayout]);
  useEffect(() => {
    const element = detailRegionRef.current;
    if (!element) return;
    element.inert = mobileListOpen;
    return () => { element.inert = false; };
  }, [mobileListOpen]);
  const openMobileList = () => setMobileListOpen(true);
  const closeMobileList = () => setMobileListOpen(false);
  const toggleMobileList = () => setMobileListOpen((open) => !open);
  useMobileSwipeGestures({
    rootRef: layoutRef,
    left: {
      ref: listDrawerRef,
      open: mobileListOpen,
      onOpen: openMobileList,
      onClose: closeMobileList,
    },
    right: {
      ref: emptyPanelRef,
      open: false,
      onOpen: () => {},
      onClose: () => {},
    },
    disabled: !mobileListLayout,
  });
  useMobilePageHeaderAction(
    mobileListLayout
      ? {
          label: selectedName,
          ariaLabel: t("kbases.mobile.switcherAriaLabel", {
            name: selectedName,
          }),
          avatar: (
            <MaterialIcon
              name="database"
              style={{ width: 20, height: 20, fontSize: 20 }}
            />
          ),
          icon: "swap_horiz",
          expanded: mobileListOpen,
          onActivate: toggleMobileList,
        }
      : null,
  );

  const listPane = (
<aside className={styles.sidebar}>
  <div className={styles.listToolbar}>
    <SearchFilterBar searchText={filter} onSearchChange={setFilter} searchPlaceholder={t("kbases.filter")} searchAriaLabel={t("kbases.filter")} filters={[]} />
    <UiButton size="sm" variant="ghost" iconOnly loading={loading} aria-label={t("kbases.reload")} title={t("kbases.reload")} onClick={() => void reload()}><MaterialIcon name="refresh" /></UiButton>
    <UiButton size="sm" variant="primary" iconOnly aria-label={t("kbases.create")} title={t("kbases.create")} onClick={() => setEditor("new")}><MaterialIcon name="add" /></UiButton>
  </div>
  <div className={styles.listCount}>{t("kbases.libraryCount", { count: visible.length })}</div>
  <div className={styles.listScroll}>
    <Spin spinning={loading}>
      {visible.length === 0 && !loading ? <div className={styles.listEmpty}>{t(items.length ? "kbases.noLibraries" : "kbases.empty")}{!items.length && <UiButton size="sm" variant="primary" onClick={() => setEditor("new")}>{t("kbases.create")}</UiButton>}</div> : visible.map(item => <button type="button" className={`${styles.library} ${active?.id === item.id ? styles.selected : ""}`} key={item.id} aria-pressed={active?.id === item.id} onClick={() => { if (mobileListLayout) setMobileListOpen(false); select(item.id); }}>
        <MaterialIcon name="database" className={styles.libraryIcon} />
        <span className={styles.libraryCopy}>
          <span className={styles.itemHeading}><strong>{item.name}</strong><KBaseStateTag state={item.state} /></span>
          <span className={styles.itemDescription} title={item.description}>{item.description || t("kbases.collectionTotal", { count: libraryCollections(item).length })}</span>
        </span>
      </button>)}
    </Spin>
  </div>
  <div className={styles.resizeHandle} role="separator" tabIndex={0} aria-label={t("kbases.resizeList")} aria-orientation="vertical" aria-valuemin={220} aria-valuemax={420} aria-valuenow={listWidth} onPointerDown={handlePointerDown} onKeyDown={event => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setListWidth(value => Math.max(220, Math.min(420, value + (event.key === "ArrowRight" ? 10 : -10)))); }
  }} />
</aside>
  );

  return <div className={`${styles.root} ${embedded ? styles.embedded : ""} ${mobileListLayout ? styles.mobileRoot : ""}`}>
    {embedded && <ModalTitleBar title={t("settingsMenu.knowledgeBase")} variant={titleBarVariant} className="kbases-console-titlebar" onClose={() => onClose?.()}>{mobile ? <MobilePageHeaderActionSlot /> : null}</ModalTitleBar>}
    <div ref={layoutRef} className={`${styles.layout} ${mobileListLayout ? styles.mobileLayout : ""}`} style={{ "--kbase-list-width": `${listWidth}px` } as React.CSSProperties}>
      {mobileListLayout ? null : listPane}
      <div ref={detailRegionRef} className="kbases-detail-region">
      <section className={styles.detail}>
        {active ? <KnowledgeWorkspace key={`${active.id}:${active.indexedAt}`} library={active} mobile={mobileListLayout} onEdit={() => setEditor(active)} onChanged={reload} onDeleted={() => select("")} /> : !loading && <div className={styles.emptyDetail}><Empty description={t("kbases.select")} /><UiButton size="sm" variant="primary" onClick={() => setEditor("new")}>{t("kbases.create")}</UiButton></div>}
      </section>
      </div>
      {mobileListLayout ? (
        <MobileSwipeDrawer
          ref={listDrawerRef}
          side="left"
          open={mobileListOpen}
          onClose={closeMobileList}
          ariaLabel={t("kbases.mobile.listTitle")}
          className="kbases-mobile-list-drawer"
          fullWidth
        >
          {listPane}
        </MobileSwipeDrawer>
      ) : null}
    </div>
    {editor && <KBaseEditor library={editor} onClose={() => setEditor(null)} onSaved={async item => { select(item.id); await reload(); }} />}
  </div>;
};