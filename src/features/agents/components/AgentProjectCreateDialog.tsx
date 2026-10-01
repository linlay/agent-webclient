import React from "react";
import { Alert, Button, Checkbox, Flex, Input, Modal, Radio, Select, Spin } from "antd";
import type { AgentProjectCreateRuntime } from "@/features/agents/hooks/useAgentProjectCreate";
import {
  findProjectCreationType,
  resolveProjectCreationModel,
} from "@/features/agents/lib/projectCreation";
import type { AgentCreationGroupOption, AgentCreationTypeKey } from "@/shared/data";
import { useI18n } from "@/shared/i18n";

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  fontWeight: 500,
  fontSize: 13,
};
const hintStyle: React.CSSProperties = { fontSize: 12, opacity: 0.7, whiteSpace: "pre-line" };

function groupMembers(group: AgentCreationGroupOption, t: (key: string) => string): string {
  const parts: string[] = [];
  if (group.skills.length > 0) {
    parts.push(`${t("leftSidebar.createProject.members.skills")}: ${group.skills.map((item) => item.name || item.key).join(", ")}`);
  }
  if (group.connectors.length > 0) {
    parts.push(`${t("leftSidebar.createProject.members.connectors")}: ${group.connectors.map((item) => item.name || item.key).join(", ")}`);
  }
  if (group.tools.length > 0) {
    parts.push(`${t("leftSidebar.createProject.members.tools")}: ${group.tools.join(", ")}`);
  }
  return parts.join("\n");
}

/**
 * New Project dialog: type, the capability groups of that type, model and the
 * project directory on one screen. Every option comes from Agent Platform.
 */
export const AgentProjectCreateDialog: React.FC<{
  runtime: AgentProjectCreateRuntime;
}> = ({ runtime }) => {
  const { t } = useI18n();
  const { creationOptions: options, selection } = runtime;
  const type = options && selection ? findProjectCreationType(options, selection.typeKey) : undefined;
  const effectiveModelKey = options && selection ? resolveProjectCreationModel(options, selection) : "";
  const bridges = type?.acpBridges ?? [];

  return (
    <Modal
      title={t("leftSidebar.createProject.title")}
      open={runtime.open}
      width="min(560px, calc(100vw - 32px))"
      centered
      onCancel={runtime.close}
      footer={[
        <Button key="cancel" onClick={runtime.close} disabled={runtime.submitting}>
          {t("leftSidebar.createProject.cancel")}
        </Button>,
        <Button
          key="create"
          type="primary"
          loading={runtime.submitting}
          disabled={!options || !selection || Boolean(runtime.problem)}
          onClick={runtime.submit}
        >
          {runtime.submitting
            ? t("leftSidebar.createProject.creating")
            : t("leftSidebar.createProject.create")}
        </Button>,
      ]}
      destroyOnHidden
    >
      <Flex vertical gap={16} style={{ paddingTop: 8 }}>
        {!options || !selection ? (
          runtime.optionsError ? (
            <Alert
              type="error"
              showIcon
              message={t("leftSidebar.createProject.optionsFailed")}
              description={runtime.optionsError}
              action={
                <Button size="small" onClick={runtime.reloadOptions}>
                  {t("leftSidebar.createProject.optionsRetry")}
                </Button>
              }
            />
          ) : (
            <Flex align="center" gap={8}>
              <Spin size="small" spinning={runtime.optionsLoading} />
              <span>{t("leftSidebar.createProject.optionsLoading")}</span>
            </Flex>
          )
        ) : (
          <>
            <div>
              <label style={{ ...labelStyle, marginBottom: 8 }}>
                {t("leftSidebar.createProject.projectType")}
              </label>
              <Radio.Group
                value={selection.typeKey}
                disabled={runtime.submitting}
                optionType="button"
                buttonStyle="solid"
                onChange={(event) => runtime.setType(event.target.value as AgentCreationTypeKey)}
              >
                {options.types.map((item) => (
                  <Radio.Button
                    key={item.key}
                    value={item.key}
                    disabled={!item.available}
                    title={item.available ? undefined : item.unavailableReason}
                  >
                    {item.label}
                  </Radio.Button>
                ))}
              </Radio.Group>
            </div>

            {type?.supportsGroups ? (
              <div>
                <label style={{ ...labelStyle, marginBottom: 8 }}>
                  {t("leftSidebar.createProject.capabilities")}
                </label>
                {options.groups.length === 0 ? (
                  <div style={hintStyle}>{t("leftSidebar.createProject.capabilitiesEmpty")}</div>
                ) : (
                  <Checkbox.Group
                    value={selection.groups}
                    disabled={runtime.submitting}
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                    onChange={(values) => runtime.setGroups(values.map(String))}
                  >
                    {options.groups.map((group) => (
                      <Checkbox
                        key={group.key}
                        value={group.key}
                        disabled={!group.available}
                        title={group.available ? groupMembers(group, t) : group.unavailableReason}
                      >
                        <span style={{ fontWeight: 500 }}>{group.name}</span>
                        <div style={hintStyle}>
                          {group.available
                            ? group.description || groupMembers(group, t)
                            : t("leftSidebar.createProject.groupUnavailable", {
                                reason: group.unavailableReason ?? "",
                              })}
                        </div>
                      </Checkbox>
                    ))}
                  </Checkbox.Group>
                )}
              </div>
            ) : type?.groupsUnsupportedReason ? (
              <div style={hintStyle}>{type.groupsUnsupportedReason}</div>
            ) : null}

            {type?.key === "acp" ? (
              <div>
                <label style={labelStyle}>{t("leftSidebar.createProject.acpEngine")}</label>
                <Select
                  value={selection.acpBridgeId || undefined}
                  disabled={runtime.submitting || bridges.length === 0}
                  style={{ width: "100%" }}
                  options={bridges.map((bridge) => ({ value: bridge.id, label: bridge.id }))}
                  placeholder={t("leftSidebar.createProject.noAcpProxy")}
                  onChange={runtime.setAcpBridgeId}
                />
              </div>
            ) : null}

            {type?.modelRequired ? (
              <div>
                <label style={labelStyle}>{t("leftSidebar.createProject.model")}</label>
                <Select
                  value={effectiveModelKey || undefined}
                  status={effectiveModelKey ? undefined : "warning"}
                  disabled={runtime.submitting}
                  style={{ width: "100%" }}
                  showSearch
                  options={options.models.map((model) => ({
                    value: model.key,
                    label: model.name || model.key,
                  }))}
                  placeholder={t("leftSidebar.createProject.modelPlaceholder")}
                  onChange={runtime.setModelKey}
                />
                {!type.defaultModelAvailable && !selection.modelKey ? (
                  <div style={hintStyle}>{t("leftSidebar.createProject.modelDefaultMissing")}</div>
                ) : null}
              </div>
            ) : null}

            <div>
              <label style={labelStyle}>{t("leftSidebar.createProject.projectDirectory")}</label>
              <Flex gap={8}>
                <Input
                  value={runtime.workspaceDir}
                  placeholder={t("leftSidebar.createProject.directoryPlaceholder")}
                  disabled={runtime.submitting}
                  onChange={(event) => runtime.setWorkspaceDir(event.target.value)}
                />
                <Button disabled={runtime.submitting} onClick={runtime.openBrowser}>
                  {t("leftSidebar.createProject.browse")}
                </Button>
              </Flex>
              <div style={hintStyle}>{t("leftSidebar.createProject.directoryHostHint")}</div>
              {runtime.browserOpen ? <HostDirectoryBrowser runtime={runtime} /> : null}
            </div>

            <div>
              <label style={labelStyle}>{t("leftSidebar.createProject.projectName")}</label>
              <Input
                value={runtime.projectName}
                placeholder={t("leftSidebar.createProject.projectNamePlaceholder")}
                disabled={runtime.submitting}
                onChange={(event) => {
                  runtime.setProjectName(event.target.value);
                  runtime.setProjectNameTouched(true);
                }}
              />
            </div>
          </>
        )}
        {runtime.error ? <Alert type="error" showIcon message={runtime.error} /> : null}
      </Flex>
    </Modal>
  );
};

/** Lists directories on the Agent Platform host; it never shows files. */
const HostDirectoryBrowser: React.FC<{ runtime: AgentProjectCreateRuntime }> = ({ runtime }) => {
  const { t } = useI18n();
  const listing = runtime.browserListing;
  return (
    <div
      style={{
        marginTop: 8,
        padding: 8,
        border: "1px solid var(--ant-color-border, rgba(128,128,128,0.3))",
        borderRadius: 6,
      }}
    >
      <Flex align="center" gap={8} style={{ marginBottom: 6 }}>
        <Button
          size="small"
          disabled={runtime.browserLoading || !listing?.parent}
          onClick={() => listing?.parent && runtime.browseTo(listing.parent)}
        >
          {t("leftSidebar.createProject.browseUp")}
        </Button>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>
          {listing?.path ?? ""}
        </span>
        <Spin size="small" spinning={runtime.browserLoading} />
      </Flex>
      {runtime.browserError ? (
        <Alert type="error" showIcon message={runtime.browserError} style={{ marginBottom: 6 }} />
      ) : null}
      <div style={{ maxHeight: 180, overflowY: "auto" }}>
        {listing && listing.entries.length === 0 ? (
          <div style={hintStyle}>{t("leftSidebar.createProject.browseEmpty")}</div>
        ) : null}
        {listing?.entries.map((entry) => (
          <Button
            key={entry.path}
            type="text"
            size="small"
            block
            style={{ textAlign: "left", justifyContent: "flex-start" }}
            disabled={runtime.browserLoading}
            onClick={() => runtime.browseTo(entry.path)}
          >
            {entry.name}
          </Button>
        ))}
        {listing?.truncated ? (
          <div style={hintStyle}>{t("leftSidebar.createProject.browseTruncated")}</div>
        ) : null}
      </div>
      <Flex justify="flex-end" gap={8} style={{ marginTop: 6 }}>
        <Button size="small" onClick={runtime.closeBrowser}>
          {t("leftSidebar.createProject.cancel")}
        </Button>
        <Button size="small" type="primary" disabled={!listing} onClick={runtime.chooseBrowsedDirectory}>
          {t("leftSidebar.createProject.browseChoose")}
        </Button>
      </Flex>
    </div>
  );
};
