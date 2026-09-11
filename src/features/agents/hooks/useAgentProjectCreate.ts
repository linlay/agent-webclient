import { useState } from "react";
import { message } from "antd";
import {
  ACP_PROXY_OPTIONS,
  buildCoderAgentCreateRequest,
  buildKbaseAgentCreateRequest,
  type AgentProjectType,
  workspaceNameFromPath,
} from "@/features/agents/lib/agentCreate";
import { createAgent } from "@/shared/data";
import { useI18n } from "@/shared/i18n";

export function useAgentProjectCreate(options: {
  onCreated?: (agentKey: string) => Promise<void> | void;
  onError?: (error: unknown) => void;
} = {}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [workspaceDir, setWorkspaceDir] = useState("");
  const [projectType, setProjectType] = useState<AgentProjectType>("coder");
  const [useAcp, setUseAcp] = useState(false);
  const [selectedAcpBridgeId, setSelectedAcpBridgeId] = useState("");
  const [projectNameTouched, setProjectNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const begin = () => {
    if (open) return;
    setWorkspaceDir("");
    setProjectName("");
    setProjectType("coder");
    setUseAcp(false);
    setSelectedAcpBridgeId(ACP_PROXY_OPTIONS[0]?.value || "");
    setProjectNameTouched(false);
    setOpen(true);
  };

  const submit = async () => {
    const trimmedDir = workspaceDir.trim();
    if (!trimmedDir) {
      void message.warning(t("leftSidebar.createProject.directoryRequired"));
      return;
    }
    const name = projectName.trim() || workspaceNameFromPath(trimmedDir);
    if (projectType === "coder" && useAcp && !selectedAcpBridgeId) {
      void message.warning(t("leftSidebar.createProject.acpRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const definition = projectType === "kbase"
        ? buildKbaseAgentCreateRequest(trimmedDir, { name })
        : buildCoderAgentCreateRequest(trimmedDir, {
            name,
            acpBridgeId: useAcp ? selectedAcpBridgeId : undefined,
          });
      const response = await createAgent(definition);
      const createdKey = String(response.data?.key || "").trim();
      setOpen(false);
      await options.onCreated?.(createdKey);
    } catch (error) {
      options.onError?.(error);
    } finally {
      setSubmitting(false);
    }
  };

  return {
    open,
    projectName,
    workspaceDir,
    projectType,
    useAcp,
    selectedAcpBridgeId,
    projectNameTouched,
    submitting,
    begin,
    close: () => setOpen(false),
    submit,
    setProjectName,
    setWorkspaceDir,
    setProjectType,
    setUseAcp,
    setSelectedAcpBridgeId,
    setProjectNameTouched,
  };
}

export type AgentProjectCreateRuntime = ReturnType<typeof useAgentProjectCreate>;
