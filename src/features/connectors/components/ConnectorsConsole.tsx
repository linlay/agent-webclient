import { CreateMenuButton } from "@/shared/ui/CreateMenuButton";
import { useResourceAssistant } from "@/features/resource-assistant/hooks/useResourceAssistant";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { message, Spin, Dropdown, Flex, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { useOptionalAppContext } from "@/app/state/AppContext";
import type { ConnectorType } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { useCatalogOrder } from "@/features/catalog-order/hooks/useCatalogOrder";
import { sortPinnedItems } from "@/features/catalog-order/lib/pinnedOrder";
import { UiTag } from "@/shared/ui/UiTag";
import { SearchFilterBar } from "@/shared/ui/SearchFilterBar";
import { useConnectorsRuntime } from "@/features/connectors/hooks/useConnectorsRuntime";
import { usePanelResize } from "@/shared/ui/usePanelResize";
import { useConnectorImport } from "@/features/connectors/hooks/useConnectorImport";
import {
  connectorFiles,
  filterConnectors,
  toolsForConnector,
  unassignedConnectorTools,
} from "@/features/connectors/lib/connectorCatalog";
import { ConnectorConfigEditor } from "./ConnectorConfigEditor";
import { ConnectorIcon } from "./ConnectorIcon";
import { ConnectorComponents, ConnectorTools } from "./ConnectorComponents";
import { ConnectorSkills } from "./ConnectorSkills";
import { ConnectorImportModal } from "./ConnectorImportModal";
import { ConnectorAuthPanel } from "./ConnectorAuthPanel";
import type { ConnectorAuthRuntime } from "../hooks/useConnectorAuth";
import { createConnectorAuthChecks } from "../lib/connectorAuthChecks";
import {
  connectorAuthIdentity,
  ConnectorAuthObserver,
} from "./ConnectorAuthObserver";
import styles from "./ConnectorsConsole.module.css";

export interface ConnectorsConsoleProps {
  routeId: string;
  onRouteIdChange: (id: string) => void;
}

export function ConnectorsConsole({
  routeId,
  onRouteIdChange,
}: ConnectorsConsoleProps) {
  const { t } = useI18n();
  const assistant = useResourceAssistant();
  const editorRegion = useRef<HTMLDivElement>(null);
  const [messageApi, messageContextHolder] = message.useMessage();
  const appContext = useOptionalAppContext();
  const runtime = useConnectorsRuntime(routeId, onRouteIdChange);
  const { deletingId } = runtime;
  const { pinnedKeys, togglePin, pinsDisabled, pinError, refreshPins } =
    useCatalogOrder("connectors", true);
  const [listWidth, setListWidth] = useState(240);
  const listStartWidthRef = useRef(240);
  const { handlePointerDown: handleListResize } = usePanelResize({
    axis: "horizontal",
    onResizeStart: () => {
      listStartWidthRef.current = listWidth;
    },
    onResize: (delta) =>
      setListWidth(
        Math.max(180, Math.min(480, listStartWidthRef.current + delta)),
      ),
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ConnectorType | "all">("all");
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [skillsConnectorId, setSkillsConnectorId] = useState<string | null>(
    null,
  );
  const [authRuntimes, setAuthRuntimes] = useState<
    Record<string, ConnectorAuthRuntime>
  >({});
  const [authChecks] = useState(createConnectorAuthChecks);
  const onAuthChange = useCallback(
    (identity: string, auth: ConnectorAuthRuntime | null) => {
      setAuthRuntimes((previous) => {
        if (previous[identity] === auth || (!auth && !previous[identity]))
          return previous;
        const next = { ...previous };
        if (auth) next[identity] = auth;
        else delete next[identity];
        return next;
      });
    },
    [],
  );
  useEffect(() => () => authChecks.cancelAll(), [authChecks]);
  useEffect(
    () => authChecks.prioritize(runtime.selected?.id || ""),
    [authChecks, runtime.selected?.id],
  );
  const onCredentialsChange = useCallback(() => {
    void runtime.refreshCatalog(true);
  }, [runtime.refreshCatalog]);
  const importer = useConnectorImport({
    onImport: runtime.importArchive,
    onImported: (id) => {
      void messageApi.success({
        key: "connector-import",
        content: t("connectors.import.success", { id }),
        duration: 3,
      });
      setSearch("");
      setFilter("all");
      setShowUnassigned(false);
      setSkillsConnectorId(null);
    },
  });
  const busy = runtime.saving || runtime.importing || runtime.deleting;
  const items = sortPinnedItems(
    filterConnectors(runtime.items, search, filter),
    pinnedKeys,
    (item) => item.id,
  );
  const selected = runtime.selected;
  const selectedAuth = selected
    ? authRuntimes[connectorAuthIdentity(selected)]
    : undefined;
  const refreshStatuses = () => {
    Object.values(authRuntimes).forEach((auth) => void auth.refresh());
  };
  const view =
    selected && skillsConnectorId === selected.id
      ? "skills"
      : runtime.file === "connector.json"
        ? "overview"
        : "config";
  const showingSkills = !showUnassigned && view === "skills";
  const componentFiles = selected
    ? connectorFiles(selected).filter((file) => file !== "connector.json")
    : [];
  const selectConfig = () => {
    const next =
      componentFiles.find((file) => file === runtime.file) || componentFiles[0];
    if (next && runtime.selectFile(next)) setSkillsConnectorId(null);
  };
  const tools = selected ? toolsForConnector(runtime.tools, selected) : [];
  const unassigned = unassignedConnectorTools(runtime.tools, runtime.items);

  const renderItem = (item: (typeof items)[number]) => {
    const auth = authRuntimes[connectorAuthIdentity(item)];
    const authStatus = auth?.operation === "start" ? "preparing" : auth?.status;
    const knownStatus =
      authStatus && authStatus !== "unknown"
        ? t(`connectors.auth.status.${authStatus}`)
        : "";
    const authLabel =
      item.auth_mode === "none"
        ? t("connectors.auth.status.not_required")
        : item.auth_mode === "token"
          ? t("connectors.auth.configuredCredentials")
          : auth?.error
            ? knownStatus
              ? t("connectors.auth.checkFailedWithStatus", {
                  status: knownStatus,
                })
              : t("connectors.auth.checkFailed")
            : knownStatus || t("connectors.auth.checking");
    const itemPinned = pinnedKeys.includes(item.id.trim().toLowerCase());
    const itemDeletable =
      item.canDelete !== false &&
      item.readOnly !== true &&
      item.builtin !== true;
    const itemEditable = item.readOnly !== true && item.builtin !== true;
    const moreLabel = t("connectors.action.more", { name: item.name });
    const menuItems: MenuProps["items"] = [
      {
        key: "pin",
        icon: <MaterialIcon name="push_pin" />,
        label: t(itemPinned ? "connectors.unpin" : "connectors.pin"),
        disabled: pinsDisabled,
      },
      {
        key: "conversation-edit",
        icon: <MaterialIcon name="question_answer" />,
        label: t("resourceAssistant.conversationEdit"),
        disabled: busy || !itemEditable || assistant.opening,
      },
      { type: "divider" },
      {
        key: "delete",
        icon: <MaterialIcon name="delete" />,
        label: t("connectors.delete.action"),
        danger: true,
        disabled: busy || !itemDeletable || deletingId === item.id,
      },
    ];
    const onMenuClick: MenuProps["onClick"] = ({ domEvent, key }) => {
      domEvent.stopPropagation();
      if (key === "pin") {
        void togglePin(item.id);
      } else if (key === "conversation-edit") {
        if (
          runtime.selected?.id === item.id &&
          runtime.dirty &&
          !window.confirm(t("connectors.confirm.discard"))
        )
          return;
        void assistant.open({
          kind: "connector",
          target: { id: item.id, name: item.name },
        });
      } else if (key === "delete") {
        void (async () => {
          const id = await runtime.remove(item.id);
          if (!id) return;
          setSkillsConnectorId(null);
          setShowUnassigned(false);
          void refreshPins().catch(() => undefined);
          void messageApi.success({
            key: "connector-delete",
            content: t("connectors.delete.success", { id }),
            duration: 3,
          });
        })();
      }
    };
    return (
      <div key={item.id} className={styles.itemWrap}>
        <button
          type="button"
          className={styles.listItem}
          aria-current={
            !showUnassigned && selected?.id === item.id ? "true" : undefined
          }
          disabled={busy}
          onClick={() => {
            authChecks.prioritize(item.id);
            void auth?.refresh();
            setShowUnassigned(false);
            setSkillsConnectorId(null);
            runtime.selectConnector(item.id);
          }}
        >
          <span className={styles.itemHeading}>
            <ConnectorIcon item={item} />
            <strong>{item.name}</strong>
            {itemPinned && (
              <MaterialIcon
                name="push_pin"
                className={styles.pinBadge}
                title={t("connectors.pin")}
                aria-label={t("connectors.pin")}
              />
            )}
            <span className={styles.version}>
              {t("connectors.version", { version: item.version })}
            </span>
          </span>
          {item.description && (
            <span className={styles.description}>{item.description}</span>
          )}
          <span className={styles.itemFooter}>
            <span className={styles.itemStatus}>
              {(item.mcp || []).some(
                (server) => server.status === "unavailable",
              ) ? (
                <UiTag tone="danger" title={t("connectors.sync.unavailable")}>
                  {t("connectors.sync.unavailable")}
                </UiTag>
              ) : (
                <UiTag
                  title={authLabel}
                  tone={
                    auth?.error
                      ? "danger"
                      : authStatus === "authorized"
                        ? "accent"
                        : "muted"
                  }
                >
                  {authLabel}
                </UiTag>
              )}
            </span>
            <span className={styles.badges}>
              {item.hasView && <UiTag tone="accent">VIEW</UiTag>}
              {item.hasCli && <UiTag>{t("connectors.type.cli")}</UiTag>}
              {item.hasMcp && (
                <UiTag tone="accent">{t("connectors.type.mcp")}</UiTag>
              )}
            </span>
          </span>
        </button>
        <Dropdown
          trigger={["click"]}
          menu={{ items: menuItems, onClick: onMenuClick }}
          getPopupContainer={(trigger) => trigger.parentElement || trigger}
        >
          <button
            type="button"
            className={styles.itemMore}
            aria-label={moreLabel}
            title={moreLabel}
            aria-haspopup="menu"
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => event.stopPropagation()}
          >
            <MaterialIcon name="more_horiz" />
          </button>
        </Dropdown>
      </div>
    );
  };

  return (
    <div className={`management-page-console ${styles.console}`}>
      {runtime.items.map((item) => (
        <ConnectorAuthObserver
          key={connectorAuthIdentity(item)}
          item={item}
          checks={authChecks}
          onChange={onAuthChange}
          onCredentialsChange={onCredentialsChange}
        />
      ))}
      <ConnectorImportModal runtime={importer} />
      {messageContextHolder}
      {runtime.catalogError && (
        <div role="alert" className={styles.error}>
          {runtime.catalogErrorStatus === 401
            ? t("connectors.auth.error.401")
            : runtime.catalogError}
          <UiButton
            size="sm"
            variant="ghost"
            onClick={() => void runtime.refreshCatalog()}
          >
            {t("connectors.action.retry")}
          </UiButton>
        </div>
      )}
      <div
        className={`${styles.body} ${showingSkills ? styles.bodySkills : ""}`}
        style={
          { "--connector-list-col": `${listWidth}px` } as React.CSSProperties
        }
      >
        <aside className={styles.list} aria-label={t("connectors.list.label")}>
          <div className={styles.listToolbar}>
            <SearchFilterBar
              searchText={search}
              onSearchChange={setSearch}
              searchPlaceholder={t("connectors.search")}
              filters={[
                {
                  key: "type",
                  label: t("connectors.filter.label"),
                  active: filter !== "all",
                  menu: {
                    selectedKeys: [filter],
                    onClick: ({ key }) =>
                      setFilter(key as ConnectorType | "all"),
                    items: (["all", "mcp", "cli", "view"] as const).map(
                      (type) => ({
                        key: type,
                        label:
                          type === "all"
                            ? t("connectors.filter.all")
                            : type.toUpperCase(),
                      }),
                    ),
                  },
                },
              ]}
            />
            <UiButton
              size="sm"
              variant="ghost"
              iconOnly
              aria-label={t("connectors.action.refresh")}
              disabled={runtime.loading || busy}
              onClick={() => {
                void runtime.refreshCatalog();
                refreshStatuses();
                void refreshPins().catch(() => undefined);
              }}
            >
              <MaterialIcon name="refresh" />
            </UiButton>
            <CreateMenuButton
              label={t("resourceAssistant.new")}
              manualLabel={t("resourceAssistant.import")}
              disabled={busy || runtime.detailLoading || assistant.opening}
              onManual={importer.show}
              onConversation={() => {
                if (
                  !runtime.dirty ||
                  window.confirm(t("connectors.confirm.discard"))
                )
                  void assistant.open({ kind: "connector" });
              }}
            />
          </div>
          <p className={`${styles.hint} tw:px-[10px]`}>
            {runtime.catalogError && !runtime.items.length
              ? t("connectors.list.unavailable")
              : items.length > 0
                ? t("connectors.list.count", { count: items.length })
                : null}
          </p>
          {pinError && (
            <div role="alert" className={styles.error}>
              {t("connectors.pinFailed")}
              <UiButton
                size="sm"
                variant="ghost"
                onClick={() => {
                  void refreshPins().catch(() => undefined);
                }}
              >
                {t("connectors.action.retry")}
              </UiButton>
            </div>
          )}
          <div className={styles.listScroll}>
            <Spin spinning={runtime.loading}>
              <div className={styles.listItems}>{items.map(renderItem)}</div>
              {!items.length && !runtime.loading && !runtime.catalogError && (
                <p className={styles.empty}>{t("connectors.list.empty")}</p>
              )}
            </Spin>
          </div>
          {unassigned.length > 0 && (
            <button
              type="button"
              className={styles.listItem}
              aria-current={showUnassigned ? "true" : undefined}
              onClick={() => setShowUnassigned(true)}
            >
              {t("connectors.tools.unassigned", { count: unassigned.length })}
            </button>
          )}
          <button
            type="button"
            role="separator"
            aria-orientation="vertical"
            aria-label={t("connectors.resize.listAriaLabel")}
            title={t("connectors.resize.listTitle")}
            className={styles.resizeHandle}
            onPointerDown={handleListResize}
          />
        </aside>
        <section className={styles.detail}>
          {showUnassigned ? (
            <>
              <h2>
                {t("connectors.tools.unassigned", { count: unassigned.length })}
              </h2>
              <p className={styles.hint}>
                {runtime.catalogError
                  ? t("connectors.list.unavailable")
                  : t("connectors.tools.unassignedHint")}
              </p>
              <ConnectorTools tools={unassigned} />
            </>
          ) : !selected ? (
            <p className={styles.empty}>
              {runtime.catalogError
                ? t("connectors.list.unavailable")
                : routeId && !runtime.loading
                  ? t("connectors.detail.notFound", { id: routeId })
                  : t("connectors.detail.empty")}
            </p>
          ) : (
            <>
              <nav
                className={styles.tabs}
                aria-label={t("connectors.section.label")}
              >
                <ConnectorIcon item={selected} size={24} />
                <button
                  type="button"
                  aria-current={view === "overview" ? "page" : undefined}
                  disabled={busy}
                  onClick={() => {
                    if (runtime.selectFile("connector.json"))
                      setSkillsConnectorId(null);
                  }}
                >
                  {t("connectors.section.overview")}
                  {runtime.file === "connector.json" && runtime.dirty
                    ? " •"
                    : ""}
                </button>
                {componentFiles.length > 0 && (
                  <button
                    type="button"
                    aria-current={view === "config" ? "page" : undefined}
                    disabled={busy}
                    onClick={selectConfig}
                  >
                    {t("connectors.section.config")}
                    {runtime.file !== "connector.json" && runtime.dirty
                      ? " •"
                      : ""}
                  </button>
                )}
                <button
                  type="button"
                  aria-current={view === "skills" ? "page" : undefined}
                  disabled={busy}
                  onClick={() => setSkillsConnectorId(selected.id)}
                >
                  {t("connectors.skills.tab")}
                  <span className={styles.tabCount}>
                    {selected.skills?.length || 0}
                  </span>
                </button>
                <div className={styles.tabActions}>
                  {runtime.dirty && (
                    <span className={styles.hint}>
                      {t("connectors.config.dirty")}
                    </span>
                  )}
                  {!runtime.readOnly && (
                    <UiButton
                      variant="primary"
                      size="sm"
                      loading={runtime.saving}
                      disabled={
                        busy ||
                        !runtime.dirty ||
                        runtime.detailLoading ||
                        !runtime.detail?.sha256
                      }
                      onClick={() => void runtime.save()}
                    >
                      <Flex gap={4}>
                        <MaterialIcon name="save" />
                        <span>{t("connectors.action.save")}</span>
                      </Flex>
                    </UiButton>
                  )}
                  <Tooltip title={t("connectors.action.reload")}>
                    <UiButton
                      variant="ghost"
                      size="sm"
                      disabled={busy || runtime.detailLoading}
                      onClick={runtime.reload}
                    >
                      <MaterialIcon name="refresh" />
                    </UiButton>
                  </Tooltip>
                </div>
              </nav>
              {view === "skills" ? (
                <ConnectorSkills key={selected.id} item={selected} />
              ) : (
                <>
                  {view === "overview" && selectedAuth && (
                    <ConnectorAuthPanel
                      key={connectorAuthIdentity(selected)}
                      item={selected}
                      disabled={busy}
                      onConfigure={selectConfig}
                      auth={selectedAuth}
                    />
                  )}
                  <section
                    className={
                      view === "overview" ? styles.group : styles.stack
                    }
                    aria-label={t(
                      view === "overview"
                        ? "connectors.section.basics"
                        : "connectors.section.config",
                    )}
                  >
                    {runtime.readOnly && view === "config" && (
                      <p className={styles.notice}>
                        {t("connectors.hint.readOnly")}
                      </p>
                    )}
                    {view === "config" && componentFiles.length > 1 && (
                      <div
                        className={styles.files}
                        aria-label={t("connectors.field.file")}
                      >
                        {componentFiles.map((file) => (
                          <button
                            type="button"
                            key={file}
                            disabled={busy}
                            aria-pressed={runtime.file === file}
                            onClick={() => runtime.selectFile(file)}
                          >
                            {file}
                          </button>
                        ))}
                      </div>
                    )}
                    {runtime.error && (
                      <div className={styles.error} role="alert">
                        {runtime.error}
                        {runtime.errorDetails && (
                          <details>
                            <summary>{t("connectors.error.details")}</summary>
                            <pre
                              style={{
                                whiteSpace: "pre-wrap",
                                overflowWrap: "anywhere",
                              }}
                            >
                              {runtime.errorDetails}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                    {runtime.message && (
                      <p className={styles.notice} role="status">
                        {runtime.message}
                      </p>
                    )}
                    <div ref={editorRegion}>
                      <Spin spinning={runtime.detailLoading}>
                        {runtime.detail &&
                          runtime.detail.id === selected.id &&
                          runtime.detail.file === runtime.file && (
                            <ConnectorConfigEditor
                              key={`${selected.id}/${runtime.file}`}
                              connectorId={selected.id}
                              file={runtime.file}
                              theme={appContext?.state.themeMode ?? "light"}
                              draft={runtime.draft}
                              disabled={busy}
                              readOnly={runtime.readOnly}
                              onChange={runtime.updateDraft}
                            />
                          )}
                      </Spin>
                    </div>
                  </section>
                  {view === "config" && (
                    <ConnectorComponents item={selected} tools={tools} />
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
