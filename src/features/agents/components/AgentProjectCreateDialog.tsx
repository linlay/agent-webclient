import React from "react";
import { Button, Checkbox, Flex, Input, Modal, Radio, Select } from "antd";
import type { AgentProjectCreateRuntime } from "@/features/agents/hooks/useAgentProjectCreate";
import {
  ACP_PROXY_OPTIONS,
  workspaceNameFromPath,
} from "@/features/agents/lib/agentCreate";
import { useI18n } from "@/shared/i18n";

export const AgentProjectCreateDialog: React.FC<{
  runtime: AgentProjectCreateRuntime;
}> = ({ runtime }) => {
  const { t } = useI18n();
  return (
    <Modal
      title={t("leftSidebar.createProject.title")}
      open={runtime.open}
      width="min(420px, calc(100vw - 32px))"
      centered
      onCancel={runtime.close}
      footer={[
        <Button key="cancel" onClick={runtime.close} disabled={runtime.submitting}>
          {t("leftSidebar.createProject.cancel")}
        </Button>,
        <Button key="create" type="primary" loading={runtime.submitting} onClick={runtime.submit}>
          {runtime.submitting
            ? t("leftSidebar.createProject.creating")
            : t("leftSidebar.createProject.create")}
        </Button>,
      ]}
      destroyOnHidden
    >
      <Flex vertical gap={16} style={{ paddingTop: 8 }}>
        <div>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 500, fontSize: 13 }}>
            {t("leftSidebar.createProject.projectDirectory")}
          </label>
          <Input
            autoFocus
            value={runtime.workspaceDir}
            placeholder={t("leftSidebar.createProject.directoryPlaceholder")}
            disabled={runtime.submitting}
            onChange={(event) => {
              const value = event.target.value;
              runtime.setWorkspaceDir(value);
              if (!runtime.projectNameTouched) {
                runtime.setProjectName(workspaceNameFromPath(value));
              }
            }}
          />
        </div>
        <div>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 500, fontSize: 13 }}>
            {t("leftSidebar.createProject.projectName")}
          </label>
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
        <div>
          <label style={{ display: "block", marginBottom: 8, fontWeight: 500, fontSize: 13 }}>
            {t("leftSidebar.createProject.projectType")}
          </label>
          <Radio.Group
            value={runtime.projectType}
            disabled={runtime.submitting}
            onChange={(event) => runtime.setProjectType(event.target.value)}
          >
            <Radio value="coder">{t("agentConsole.mode.coder.label")}</Radio>
            <Radio value="kbase">{t("agentConsole.mode.kbase.label")}</Radio>
          </Radio.Group>
        </div>
        {runtime.projectType === "coder" ? (
          <>
            <Checkbox
              checked={runtime.useAcp}
              disabled={runtime.submitting}
              onChange={(event) => runtime.setUseAcp(event.target.checked)}
            >
              {t("leftSidebar.createProject.useAcp")}
            </Checkbox>
            {runtime.useAcp ? (
              <div>
                <label style={{ display: "block", marginBottom: 4, fontWeight: 500, fontSize: 13 }}>
                  {t("leftSidebar.createProject.acpProxy")}
                </label>
                <Select
                  value={runtime.selectedAcpBridgeId || undefined}
                  disabled={runtime.submitting}
                  style={{ width: "100%" }}
                  options={ACP_PROXY_OPTIONS}
                  placeholder={t("leftSidebar.createProject.noAcpProxy")}
                  onChange={runtime.setSelectedAcpBridgeId}
                />
              </div>
            ) : null}
          </>
        ) : null}
      </Flex>
    </Modal>
  );
};
