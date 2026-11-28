import React, { useEffect, useRef, useState } from "react";
import { Alert, Drawer, Modal, Popover, Tabs } from "antd";
import { ConversationMarkdown } from "@/shared/ui/ConversationMarkdown";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { SearchFilterBar } from "@/shared/ui/SearchFilterBar";
import { ModalTitleBar } from "@/shared/ui/ModalTitleBar";
import { MobileSwipeDrawer, type MobileSwipeDrawerHandle } from "@/shared/ui/MobileSwipeDrawer";
import { useMobileSwipeGestures } from "@/shared/ui/hooks/useMobileSwipeGestures";
import { useMobilePageHeaderAction, MobilePageHeaderActionSlot } from "@/shared/ui/MobilePageHeaderAction";
import { UiButton } from "@/shared/ui/UiButton";
import { usePanelResize } from "@/shared/ui/usePanelResize";
import { useI18n } from "@/shared/i18n";
import { useMemoryFiles } from "@/features/memory/hooks/useMemoryFiles";
import { MemoryMaintenance } from "./MemoryMaintenance";
import styles from "./MemoryConsole.module.css";

export function MemoryInfoConsole({ surface = "page", open = true, onClose, mobile = false }: {
  surface?: "page" | "modal" | "drawer";
  open?: boolean;
  onClose?: () => void;
  /** 移动端：左侧记忆文件列表改为抽屉。 */
  mobile?: boolean;
}) {
  const { t } = useI18n();
  const m = useMemoryFiles();
  const [preview, setPreview] = useState(true);
  const [help, setHelp] = useState(false);
  const [datePicker, setDatePicker] = useState(false);
  const [listWidth, setListWidth] = useState(260);
  const resizeStart = useRef(listWidth);
  const workbenchRef = useRef<HTMLDivElement>(null);
  const editorRegionRef = useRef<HTMLDivElement>(null);
  const listDrawerRef = useRef<MobileSwipeDrawerHandle>(null);
  const emptyPanelRef = useRef<MobileSwipeDrawerHandle>(null);
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const mobileListLayout = Boolean(mobile);
  const { handlePointerDown } = usePanelResize({
    axis: "horizontal",
    onResizeStart: () => { resizeStart.current = listWidth; },
    onResize: delta => setListWidth(Math.max(220, Math.min(420, resizeStart.current + delta))),
  });
  const close = () => { if (m.canLeave()) onClose?.(); };
  const fileName = m.document?.kind === "daily" ? `${m.document.date}.md`
    : m.document?.kind === "owner" ? "OWNER.md" : "summary.md";

  useEffect(() => {
    if (!mobileListLayout) setMobileListOpen(false);
  }, [mobileListLayout]);
  useEffect(() => {
    const element = editorRegionRef.current;
    if (!element) return;
    element.inert = mobileListOpen;
    return () => { element.inert = false; };
  }, [mobileListOpen]);
  const openMobileList = () => setMobileListOpen(true);
  const closeMobileList = () => setMobileListOpen(false);
  const toggleMobileList = () => setMobileListOpen((open) => !open);
  useMobileSwipeGestures({
    rootRef: workbenchRef,
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
  const currentName = m.document ? fileName : t("memoryFiles.title");
  const memoryIcon = m.document?.kind === "owner"
    ? "person"
    : m.document?.kind === "daily"
      ? "description"
      : "psychology";
  useMobilePageHeaderAction(
    mobileListLayout
      ? {
          label: currentName,
          ariaLabel: t("memoryFiles.mobile.switcherAriaLabel", {
            name: currentName,
          }),
          avatar: (
            <MaterialIcon
              name={memoryIcon}
              style={{ width: 20, height: 20, fontSize: 20 }}
            />
          ),
          icon: "swap_horiz",
          expanded: mobileListOpen,
          onActivate: toggleMobileList,
        }
      : null,
  );
  const selectMemory = (kind: "memory" | "owner" | "daily", date?: string) => {
    if (mobileListLayout) setMobileListOpen(false);
    if (date === undefined) m.select(kind);
    else m.select(kind, date);
  };
  const renderDocument = (showPreview: boolean) => <div className={styles.documentPane}>
    <div className={styles.documentHeading}><strong>{fileName}</strong>{m.dirty && <span>{t("memoryFiles.unsaved")}</span>}</div>
    {m.error && <Alert className={styles.error} type="error" showIcon message={m.error} />}
    {showPreview ? <div className={styles.preview}>
      {m.draft ? <ConversationMarkdown content={m.draft} codeComponent={({ children }) => <code>{children}</code>} /> : <p className={styles.empty}>{t(m.busy ? "memoryFiles.loading" : "memoryFiles.empty")}</p>}
    </div> : <textarea aria-label={t("memoryFiles.content")} spellCheck={false} value={m.draft} disabled={!m.document || m.busy} onChange={e => m.setDraft(e.target.value)} />}
    <footer className={styles.footer}>
      <span role="status">{m.busy ? t("memoryFiles.loading") : m.dirty ? t("memoryFiles.unsaved") : m.message}</span>
      <span className={styles.stats}>{t("memoryFiles.stats", { lines: m.draft ? m.draft.split("\n").length : 0, count: m.draft.length })}</span>
      <UiButton size="mini" variant="ghost" iconOnly className={styles.delete} disabled={!m.document?.exists || m.busy} title={t("memoryFiles.delete")} aria-label={t("memoryFiles.delete")} onClick={() => void m.remove()}><MaterialIcon name="delete" /></UiButton>
    </footer>
  </div>;
  const sidebarPane = (
        <aside className={styles.sidebar}>
          <form className={styles.listToolbar} onSubmit={e => { e.preventDefault(); void m.search(); }}>
            <SearchFilterBar searchText={m.query} onSearchChange={m.setQuery} searchAriaLabel={t("memoryFiles.search")} searchPlaceholder={t("memoryFiles.searchPlaceholder")} filters={[]} />
            <UiButton size="sm" variant="ghost" iconOnly loading={m.busy} onClick={m.reload} title={t("memoryFiles.reload")} aria-label={t("memoryFiles.reload")}><MaterialIcon name="refresh" /></UiButton>
          </form>
          <nav className={styles.documents} aria-label={t("memoryFiles.documents")}>
            <div className={styles.listHeading}>{t("memoryFiles.documents")}</div>
            {(["memory", "owner"] as const).map(kind => (
              <button className={`${styles.fileRow} ${m.document?.kind === kind ? styles.selected : ""}`} key={kind} type="button" aria-pressed={m.document?.kind === kind} disabled={m.busy} onClick={() => selectMemory(kind)}>
                <MaterialIcon className={styles.fileIcon} name={kind === "memory" ? "psychology" : "person"} />
                <span className={styles.fileCopy}><strong>{t(`memoryFiles.${kind}`)}</strong><span>{kind === "memory" ? "summary.md" : "OWNER.md"}</span></span>
              </button>
            ))}
          </nav>
          <div className={styles.list}>
            {m.matches !== null ? <>
              <div className={styles.listHeading}><span>{t("memoryFiles.searchResults", { count: m.matches.length })}</span><UiButton size="mini" variant="ghost" iconOnly disabled={m.busy} onClick={m.clearSearch} title={t("memoryFiles.clearSearch")} aria-label={t("memoryFiles.clearSearch")}><MaterialIcon name="close" /></UiButton></div>
              {m.matches.length === 0 && <p className={styles.listEmpty}>{t("memoryFiles.noMatches")}</p>}
              {m.matches.map((hit, i) => <button type="button" className={styles.result} key={`${hit.kind}:${hit.date}:${hit.line}:${i}`} disabled={m.busy} onClick={() => selectMemory(hit.kind, hit.date)}>
                <strong>{hit.date ? `${hit.date}.md` : `${hit.kind === "owner" ? "OWNER" : "summary"}.md`}<span className={styles.lineNumber}>:{hit.line}</span></strong><span>{hit.text}</span>
              </button>)}
              {m.searchBefore && <UiButton size="sm" variant="ghost" disabled={m.busy} onClick={() => void m.search(m.searchBefore)}>{t("memoryFiles.older")}</UiButton>}
            </> : <>
              <div className={styles.listHeading}><span>{t("memoryFiles.daily")}</span><div className={styles.dateActions}>
                <UiButton size="mini" variant="ghost" disabled={m.busy || !m.today} onClick={() => selectMemory("daily", m.today)}>{t("memoryFiles.today")}</UiButton>
                <Popover trigger="click" open={datePicker} onOpenChange={setDatePicker} content={<label className={styles.datePicker}>{t("memoryFiles.chooseDate")}<input type="date" aria-label={t("memoryFiles.chooseDate")} value={m.document?.kind === "daily" ? m.document.date : ""} disabled={m.busy} onChange={e => {
                  if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { selectMemory("daily", e.target.value); setDatePicker(false); }
                }} /></label>}>
                  <UiButton size="mini" variant="ghost" iconOnly disabled={m.busy} title={t("memoryFiles.chooseDate")} aria-label={t("memoryFiles.chooseDate")}><MaterialIcon name="calendar_month" /></UiButton>
                </Popover>
              </div>
              </div>
              {m.dates.length === 0 && <p className={styles.listEmpty}>{t("memoryFiles.noDates")}</p>}
              {m.dates.map(date => <button type="button" className={`${styles.fileRow} ${styles.date} ${m.document?.kind === "daily" && m.document.date === date ? styles.selected : ""}`} key={date} aria-pressed={m.document?.kind === "daily" && m.document.date === date} disabled={m.busy} onClick={() => selectMemory("daily", date)}><MaterialIcon name="description" /><span>{date}</span></button>)}
              {m.nextBefore && <UiButton size="sm" variant="ghost" disabled={m.busy} onClick={m.moreDates}>{t("memoryFiles.older")}</UiButton>}
            </>}
          </div>
          <div className={styles.resizeHandle} role="separator" tabIndex={0} aria-label={t("memoryFiles.resizeList")} aria-orientation="vertical" aria-valuemin={220} aria-valuemax={420} aria-valuenow={listWidth} onPointerDown={handlePointerDown} onKeyDown={event => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setListWidth(value => Math.max(220, Math.min(420, value + (event.key === "ArrowRight" ? 10 : -10)))); }
          }} />
        </aside>
  );

  const body = (
    <section className={styles.console} aria-label={t("memoryFiles.title")}>
      <div
        ref={workbenchRef}
        className={`${styles.workbench} ${mobileListLayout ? styles.mobileWorkbench : ""}`} style={{ "--memory-list-width": `${listWidth}px` } as React.CSSProperties}>
        {mobileListLayout ? null : sidebarPane}
        <div ref={editorRegionRef} className="memory-editor-region">
          <div className={styles.editor}>
            <Tabs className={styles.viewTabs} destroyOnHidden activeKey={preview ? "preview" : "edit"} onChange={key => setPreview(key === "preview")} items={[
              { key: "preview", label: t("memoryFiles.preview"), disabled: !m.document || m.busy, children: renderDocument(true) },
              { key: "edit", label: t("memoryFiles.edit"), disabled: !m.document || m.busy, children: renderDocument(false) },
            ]} renderTabBar={(props, DefaultTabBar) => <div className={styles.toolbar}>
              <DefaultTabBar {...props} />
              <div className={styles.actions}>
                <MemoryMaintenance today={m.today} onReload={m.reload} mobile={mobileListLayout} />
                {(!preview || m.dirty) && (
                  <UiButton
                    size="sm"
                    variant={mobileListLayout ? "ghost" : "primary"}
                    color={mobileListLayout ? "accent" : "default"}
                    iconOnly={mobileListLayout}
                    aria-label={t("memoryFiles.save")}
                    title={t("memoryFiles.save")}
                    disabled={!m.document || !m.dirty || m.conflict}
                    loading={m.busy}
                    onClick={() => void m.save()}
                  >
                    {mobileListLayout ? <MaterialIcon name="save" /> : t("memoryFiles.save")}
                  </UiButton>
                )}
                <UiButton size="sm" variant="ghost" iconOnly title={t("memoryFiles.principles")} aria-label={t("memoryFiles.principles")} onClick={() => setHelp(true)}><MaterialIcon name="info" /></UiButton>
              </div>
            </div>} />

          </div>
        </div>
        {mobileListLayout ? (
          <MobileSwipeDrawer
            ref={listDrawerRef}
            side="left"
            open={mobileListOpen}
            onClose={closeMobileList}
            ariaLabel={t("memoryFiles.mobile.listTitle")}
            className="memory-mobile-list-drawer"
            fullWidth
          >
            {sidebarPane}
          </MobileSwipeDrawer>
        ) : null}
      </div>
      <Modal open={help} onCancel={() => setHelp(false)} footer={null} title={t("memoryFiles.principles")} width={480}><div><p>{t(`memoryFiles.hint.${m.document?.kind || "memory"}`)}</p><p>{t("memoryFiles.rules")}</p></div></Modal>
    </section>
  );
  if (surface === "drawer") {
    return (
      <Drawer
        open={open}
        onClose={close}
        placement="right"
        width="100%"
        closable={false}
        destroyOnHidden
        getContainer={false}
        push={false}
        rootClassName={styles.drawer}
      >
        <ModalTitleBar className={styles.drawerTitle} title={t("memoryFiles.title")} variant="drawer" onClose={close}>
          {mobile ? <MobilePageHeaderActionSlot /> : null}
        </ModalTitleBar>
        {body}
      </Drawer>
    );
  }
  return surface === "modal" ? (
    <Modal className={styles.modal} centered open={open} onCancel={close} footer={null} closable={false} width="min(1320px, calc(100vw - 32px))">
      <ModalTitleBar className={styles.modalTitle} title={t("memoryFiles.title")} onClose={close} />
      {body}
    </Modal>
  ) : body;
}
