import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { Input, Popconfirm, Spin } from "antd";
import {
  McpServerFormFields,
  MCP_SERVER_FORM_SECTION_IDS,
  resolveActiveMcpServerFormSection,
  type McpServerFormSectionId,
} from "@/features/registries/components/McpServerFormFields";
import { McpServerStatusOverview } from "@/features/registries/components/McpServerStatusOverview";
import { McpUnassignedToolsPanel } from "@/features/registries/components/McpToolOwnershipPanel";
import type { McpServerEditorRuntime } from "@/features/registries/hooks/useMcpServerEditorRuntime";
import {
  isMcpServerSaveDisabled,
  readMcpToolSyncStatus,
  resolveMcpServerDisplayStatus,
  statusTone,
  syncStatusTone,
} from "@/features/registries/lib/mcpServerConsole";
import { mcpServerKey } from "@/features/registries/lib/mcpRegistry";
import { resolvedMcpServerUrl } from "@/features/registries/lib/mcpServerForm";
import type { AdminToolSummary } from "@/shared/data";
import type { UnassignedMcpTool } from "@/features/registries/lib/mcpRegistry";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { UiButton } from "@/shared/ui/UiButton";
import { UiTag } from "@/shared/ui/UiTag";

const DETAIL_CLASS_NAME =
  "automation-console-detail registry-console-detail mcp-server-detail tw:min-h-0 tw:min-w-0 tw:overflow-auto";
const DETAIL_HEAD_CLASS_NAME =
  "automation-detail-head tw:mb-3.5 tw:flex tw:items-start tw:justify-between tw:gap-3 tw:[&>div:first-child]:flex tw:[&>div:first-child]:min-w-0 tw:[&>div:first-child]:flex-col tw:[&>div:first-child]:gap-1 tw:[&_strong]:text-sm tw:[&_span]:[overflow-wrap:anywhere] tw:[&_span]:text-[11px] tw:[&_span]:text-ink-muted";
const SOURCE_EDITOR_CLASS_NAME =
  "settings-textarea automation-source-editor registry-yaml-editor tw:min-h-0 tw:flex-1 tw:resize-none tw:font-code tw:leading-[1.5] tw:[tab-size:2] tw:max-[860px]:min-h-80 tw:max-[860px]:flex-none tw:max-[860px]:resize-y";

export interface McpServerEditorPaneProps {
  routeServerKey: string;
  runtime: McpServerEditorRuntime;
  selectedTools: AdminToolSummary[];
  unassignedTools: UnassignedMcpTool[];
  visibleSelectedTools: AdminToolSummary[];
  visibleUnassignedTools: UnassignedMcpTool[];
}

export function McpServerEditorPane({
  routeServerKey,
  runtime,
  selectedTools,
  unassignedTools,
  visibleSelectedTools,
  visibleUnassignedTools,
}: McpServerEditorPaneProps) {
  const { t } = useI18n();
  const detailScrollRef = useRef<HTMLElement | null>(null);
  const sectionNavLinksRef = useRef<HTMLDivElement | null>(null);
  const [activeSectionId, setActiveSectionId] =
    useState<McpServerFormSectionId>(MCP_SERVER_FORM_SECTION_IDS[0]);
  const selectedServerKey = runtime.detail ? mcpServerKey(runtime.detail) : "";
  const resolvedEndpoint = useMemo(
    () => resolvedMcpServerUrl(runtime.form),
    [runtime.form],
  );
  const selectedDisplayStatus = runtime.detail
    ? resolveMcpServerDisplayStatus(
        runtime.detail.status,
        readMcpToolSyncStatus(runtime.detail.summary),
      )
    : null;
  const saveDisabled = isMcpServerSaveDisabled({
    hasDetail: Boolean(runtime.detail),
    detailLoading: runtime.detailLoading,
    saving: runtime.saving,
    validating: runtime.validating,
  });
  const formSections = useMemo(
    () => [
      t("mcpServers.section.basic"),
      t("mcpServers.section.connection"),
      t("mcpServers.section.syncPolicy"),
      t("mcpServers.section.overview"),
      t("mcpServers.section.tools"),
    ],
    [t],
  );

  useEffect(() => {
    setActiveSectionId(MCP_SERVER_FORM_SECTION_IDS[0]);
  }, [runtime.editorMode, runtime.selectedItemKey]);

  useEffect(() => {
    if (
      runtime.editorMode !== "structured" ||
      !runtime.structuredAvailable
    ) {
      return undefined;
    }
    const scrollContainer = detailScrollRef.current;
    if (!scrollContainer) return undefined;
    let animationFrame = 0;
    const updateActiveSection = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const nav = scrollContainer.querySelector<HTMLElement>(
          ".mcp-section-nav",
        );
        const activationLine =
          (nav?.getBoundingClientRect().bottom ??
            scrollContainer.getBoundingClientRect().top) + 8;
        const sectionTops = MCP_SERVER_FORM_SECTION_IDS.map(
          (sectionId) =>
            scrollContainer
              .querySelector<HTMLElement>(`#${sectionId}`)
              ?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY,
        );
        const atBottom =
          scrollContainer.scrollTop + scrollContainer.clientHeight >=
          scrollContainer.scrollHeight - 2;
        setActiveSectionId(
          resolveActiveMcpServerFormSection(
            sectionTops,
            activationLine,
            atBottom,
          ),
        );
      });
    };
    updateActiveSection();
    scrollContainer.addEventListener("scroll", updateActiveSection, {
      passive: true,
    });
    window.addEventListener("resize", updateActiveSection);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      scrollContainer.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, [
    runtime.editorMode,
    runtime.form.transport,
    runtime.selectedItemKey,
    runtime.structuredAvailable,
  ]);

  useEffect(() => {
    const links = sectionNavLinksRef.current;
    const activeLink = links?.querySelector<HTMLElement>(
      `a[href="#${activeSectionId}"]`,
    );
    if (!links || !activeLink) return;
    const linkLeft = activeLink.offsetLeft;
    const linkRight = linkLeft + activeLink.offsetWidth;
    if (linkLeft < links.scrollLeft) {
      links.scrollTo({ left: linkLeft, behavior: "smooth" });
    } else if (linkRight > links.scrollLeft + links.clientWidth) {
      links.scrollTo({
        left: linkRight - links.clientWidth,
        behavior: "smooth",
      });
    }
  }, [activeSectionId]);

  const handleSectionNavigate = useCallback(
    (
      event: MouseEvent<HTMLAnchorElement>,
      sectionId: McpServerFormSectionId,
    ) => {
      event.preventDefault();
      const section = detailScrollRef.current?.querySelector<HTMLElement>(
        `#${sectionId}`,
      );
      if (!section) return;
      setActiveSectionId(sectionId);
      section.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    },
    [],
  );

  return (
    <section
      ref={detailScrollRef}
      className={`${DETAIL_CLASS_NAME} ${runtime.editorMode === "source" ? "is-source-editor" : ""}`}
      aria-live="polite"
    >
      <Spin spinning={runtime.detailLoading}>
        {runtime.showUnassigned ? (
          <McpUnassignedToolsPanel
            items={visibleUnassignedTools}
            searchText={runtime.toolSearchText}
            total={unassignedTools.length}
            onSearchChange={runtime.setToolSearchText}
          />
        ) : runtime.routeNotFound ? (
          <div className="command-empty-state">
            {t("mcpServers.detail.notFound", { serverKey: routeServerKey })}
          </div>
        ) : !runtime.detail ? (
          <div className="command-empty-state">
            {t("mcpServers.detail.empty")}
          </div>
        ) : (
          <>
            <div className={DETAIL_HEAD_CLASS_NAME}>
              <div>
                <strong>
                  {runtime.newDraft
                    ? t("mcpServers.detail.newTitle")
                    : runtime.detail.name ||
                      runtime.detail.key ||
                      selectedServerKey}
                </strong>
                <span>{selectedServerKey}</span>
              </div>
              <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-2">
                {selectedDisplayStatus ? (
                  <UiTag
                    tone={
                      selectedDisplayStatus.kind === "sync"
                        ? syncStatusTone(selectedDisplayStatus.status)
                        : statusTone(selectedDisplayStatus.status)
                    }
                  >
                    {selectedDisplayStatus.kind === "sync"
                      ? t(
                          `mcpServers.syncStatus.${selectedDisplayStatus.status}`,
                        )
                      : t(
                          `registryConsole.status.${selectedDisplayStatus.status}`,
                        )}
                  </UiTag>
                ) : null}
                <UiButton
                  size="sm"
                  variant="ghost"
                  disabled={
                    runtime.detailLoading || runtime.saving || runtime.deleting
                  }
                  onClick={runtime.toggleEditorMode}
                >
                  <MaterialIcon
                    name={runtime.editorMode === "source" ? "tune" : "code"}
                  />
                  <span>
                    {runtime.editorMode === "source"
                      ? t("mcpServers.action.structuredEdit")
                      : t("mcpServers.action.sourceEdit")}
                  </span>
                </UiButton>
                {!runtime.newDraft ? (
                  <Popconfirm
                    title={t("mcpServers.confirm.deleteTitle")}
                    description={t("mcpServers.confirm.deleteDescription", {
                      name:
                        runtime.detail.name ||
                        selectedServerKey ||
                        runtime.detail.file,
                    })}
                    okText={t("mcpServers.confirm.deleteOk")}
                    cancelText={t("mcpServers.confirm.deleteCancel")}
                    okButtonProps={{ danger: true }}
                    onConfirm={() => void runtime.confirmDelete()}
                    disabled={
                      runtime.saving || runtime.validating || runtime.deleting
                    }
                  >
                    <UiButton
                      size="sm"
                      variant="danger"
                      loading={runtime.deleting}
                      disabled={
                        runtime.saving || runtime.validating || runtime.deleting
                      }
                    >
                      <MaterialIcon name="delete" />
                      <span>{t("mcpServers.action.delete")}</span>
                    </UiButton>
                  </Popconfirm>
                ) : null}
              </div>
            </div>

            {runtime.editorMode === "structured" &&
            runtime.structuredAvailable ? (
              <nav
                className="automation-section-nav mcp-section-nav tw:sticky tw:top-0 tw:flex tw:items-center"
                aria-label={t("mcpServers.sectionNav.ariaLabel")}
              >
                <div
                  ref={sectionNavLinksRef}
                  className="automation-section-nav-links tw:flex tw:min-w-0 tw:flex-1 tw:overflow-x-auto"
                >
                  {MCP_SERVER_FORM_SECTION_IDS.map((sectionId, index) => (
                    <a
                      className="automation-section-nav-link tw:flex-none tw:whitespace-nowrap"
                      href={`#${sectionId}`}
                      aria-current={
                        activeSectionId === sectionId ? "location" : undefined
                      }
                      key={sectionId}
                      onClick={(event) =>
                        handleSectionNavigate(event, sectionId)
                      }
                    >
                      {formSections[index]}
                    </a>
                  ))}
                </div>
                <EditorActions
                  deleting={runtime.deleting}
                  detailLoading={runtime.detailLoading}
                  newDraft={runtime.newDraft}
                  saveDisabled={saveDisabled}
                  saving={runtime.saving}
                  validating={runtime.validating}
                  onRefresh={runtime.refreshPage}
                  onSave={runtime.saveDraft}
                  onValidate={runtime.validateDraft}
                />
              </nav>
            ) : null}

            {runtime.formError ? (
              <div className="settings-error">{runtime.formError}</div>
            ) : null}

            {runtime.editorMode === "source" ? (
              <div className="automation-source-workspace mcp-source-workspace tw:flex tw:min-h-0 tw:flex-1 tw:flex-col">
                <div className="field-group automation-source-field registry-editor-field">
                  <label htmlFor="mcp-server-yaml-editor">
                    {t("mcpServers.config.label")}
                  </label>
                  <p
                    id="mcp-server-config-hint"
                    className="tw:mb-3 tw:text-xs tw:leading-[1.45] tw:text-ink-muted"
                  >
                    {t("mcpServers.config.sourceHint")}
                  </p>
                  <Input.TextArea
                    id="mcp-server-yaml-editor"
                    aria-describedby="mcp-server-config-hint"
                    className={SOURCE_EDITOR_CLASS_NAME}
                    value={runtime.draft}
                    disabled={runtime.saving}
                    onChange={(event) =>
                      runtime.updateDraft(event.target.value)
                    }
                  />
                </div>
                <div className="automation-save-actions tw:mt-3 tw:flex tw:flex-wrap tw:items-center tw:gap-2">
                  <EditorActions
                    deleting={runtime.deleting}
                    detailLoading={runtime.detailLoading}
                    newDraft={runtime.newDraft}
                    saveDisabled={saveDisabled}
                    saving={runtime.saving}
                    source
                    validating={runtime.validating}
                    onRefresh={runtime.refreshPage}
                    onSave={runtime.saveDraft}
                    onValidate={runtime.validateDraft}
                  />
                  <span className="tw:text-xs tw:text-ink-muted">
                    {runtime.dirty
                      ? t("mcpServers.config.dirty")
                      : t("mcpServers.config.readyToEdit")}
                  </span>
                </div>
              </div>
            ) : (
              <>
                <McpServerFormFields
                  activeSectionId={activeSectionId}
                  form={runtime.form}
                  newDraft={runtime.newDraft}
                  resolvedEndpoint={resolvedEndpoint}
                  saving={runtime.saving}
                  onChange={runtime.updateForm}
                />
                <McpServerStatusOverview
                  activeSectionId={activeSectionId}
                  detail={runtime.detail}
                  resolvedEndpoint={resolvedEndpoint}
                  selectedTools={selectedTools}
                  toolSearchText={runtime.toolSearchText}
                  visibleSelectedTools={visibleSelectedTools}
                  onToolSearchChange={runtime.setToolSearchText}
                />
              </>
            )}
          </>
        )}
      </Spin>
    </section>
  );
}

function EditorActions({
  deleting,
  detailLoading,
  newDraft,
  saveDisabled,
  saving,
  source = false,
  validating,
  onRefresh,
  onSave,
  onValidate,
}: {
  deleting: boolean;
  detailLoading: boolean;
  newDraft: boolean;
  saveDisabled: boolean;
  saving: boolean;
  source?: boolean;
  validating: boolean;
  onRefresh: () => void;
  onSave: () => Promise<void>;
  onValidate: () => Promise<void>;
}) {
  const { t } = useI18n();
  const className = source
    ? undefined
    : "automation-section-nav-actions tw:ml-auto tw:flex tw:flex-none tw:items-center tw:gap-2";
  const content = (
    <>
      <UiButton
        size="sm"
        variant="ghost"
        disabled={newDraft || detailLoading || deleting}
        onClick={onRefresh}
      >
        <MaterialIcon name="refresh" />
        <span>{t("mcpServers.action.refresh")}</span>
      </UiButton>
      <UiButton
        size="sm"
        variant="secondary"
        loading={validating}
        disabled={saving || detailLoading || deleting}
        onClick={() => void onValidate()}
      >
        <MaterialIcon name="rule" />
        <span>{t("mcpServers.action.validate")}</span>
      </UiButton>
      <UiButton
        size="sm"
        variant="primary"
        loading={saving}
        disabled={saveDisabled || deleting}
        onClick={() => void onSave()}
      >
        <MaterialIcon name="save" />
        <span>
          {t(
            source
              ? "mcpServers.action.saveSource"
              : "mcpServers.action.save",
          )}
        </span>
      </UiButton>
    </>
  );
  return className ? <div className={className}>{content}</div> : content;
}
