import type { AgentDetailResponse } from "@/shared/data";
import {
  compactCopyInfoRows,
  createCopyInfoRow,
  type CopyInfoGroup,
} from "@/shared/ui/copyInfoModel";

export interface AgentCopySummary {
  agentKey: string;
  name: string;
  type?: string;
  role?: string;
  workspaceDir?: string;
  workspaceName?: string;
}

type CopyInfoTranslator = (
  key: string,
  params?: Record<string, unknown>,
) => string;

export function buildAgentCopyInfoGroups(input: {
  summary: AgentCopySummary;
  detail?: Partial<AgentDetailResponse> | null;
  t: CopyInfoTranslator;
}): CopyInfoGroup[] {
  const { summary, detail = null, t } = input;
  const source = detail?.source;

  return [
    {
      key: "basic",
      label: t("copyInfo.group.basic"),
      rows: compactCopyInfoRows([
        createCopyInfoRow("id", t("agentCopy.field.id"), detail?.key || summary.agentKey),
        createCopyInfoRow("name", t("agentCopy.field.name"), detail?.name || summary.name),
        createCopyInfoRow("type", t("agentCopy.field.type"), detail?.type || summary.type),
        createCopyInfoRow("description", t("agentCopy.field.description"), detail?.description),
        createCopyInfoRow("role", t("agentCopy.field.role"), detail?.role || summary.role),
        createCopyInfoRow("workspaceDir", t("agentCopy.field.workspaceDir"), detail?.workspaceDir || summary.workspaceDir),
        createCopyInfoRow("workspaceName", t("agentCopy.field.workspaceName"), detail?.workspaceName || summary.workspaceName),
        createCopyInfoRow("mode", t("agentCopy.field.mode"), detail?.mode),
        createCopyInfoRow("model", t("agentCopy.field.model"), detail?.model),
      ]),
    },
    {
      key: "config",
      label: t("copyInfo.group.config"),
      rows: compactCopyInfoRows([
        createCopyInfoRow("tools", t("agentCopy.field.tools"), detail?.tools),
        createCopyInfoRow("skills", t("agentCopy.field.skills"), detail?.skills),
        createCopyInfoRow("modelConfig", t("agentCopy.field.modelConfig"), detail?.modelConfig),
        createCopyInfoRow("controls", t("agentCopy.field.controls"), detail?.controls),
        createCopyInfoRow("sourceKind", t("agentCopy.field.sourceKind"), source?.kind),
        createCopyInfoRow("sourcePath", t("agentCopy.field.sourcePath"), source?.path),
        createCopyInfoRow("agentDir", t("agentCopy.field.agentDir"), source?.agentDir),
      ]),
    },
  ];
}
