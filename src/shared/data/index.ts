export * from "@/shared/data/auth/accessTokenStorage";
export * from "@/shared/data/auth/appAuth";
export * from "@/shared/data/auth/gatewaySession";
export * from "@/shared/data/auth/authCoordinator";
// DTOs have a single contract owner; routed requests are selected explicitly below.
export type * from "@/shared/data/api/dto/agents";
export type * from "@/shared/data/api/dto/archives";
export type * from "@/shared/data/api/dto/automations";
export type * from "@/shared/data/api/dto/chats";
export type * from "@/shared/data/api/dto/common";
export type * from "@/shared/data/api/dto/commands";
export type * from "@/shared/data/api/dto/models";
export type * from "@/shared/data/api/dto/resources";
export type * from "@/shared/data/api/dto/admin";
export type * from "@/shared/data/api/dto/connectors";
export type * from "@/shared/data/api/dto/skills";

export * from "@/shared/data/api/reasoningEffort";
export {
  ApiError,
  createRequestId,
} from "@/shared/data/api/http";
export {
  buildAdminSkillDownloadUrl,
  buildAdminSkillFileDownloadUrl,
  downloadAdminSkill,
  downloadAdminSkillFile,
  fetchAdminSkillFileBlob,
  fetchAdminSkillIcon,
  fetchSkillIcon,
  fetchConnectorIcon,
  downloadConversationHtmlExport,
  getResourceBlob,
  getResourceDocumentMetadata,
  getResourceDocumentText,
} from "@/shared/data/api/resources";
export {
  classifyResourceUrl,
  isChatScopeResourceRef,
  isLegacyResourceUrl,
} from "@/shared/data/api/resources/urls";
export {
  commitDocument,
  getFileHistory,
  getProjectChanges,
  getProjectDiff,
  getProjectTree,
} from "@/shared/data/api/requests/projects";
export * from "@/shared/data/api/requests/skills";
export {
  deleteAdminAgentPrivateSkill,
  getAdminAgentDetail,
  getAdminAgentEditorOptions,
  getAdminAgents,
  importAdminAgent,
  importAdminAgentPrivateSkill,
  putAdminAgentOrder,
} from "@/shared/data/api/requests/agents";
export * from "@/shared/data/api/requests/admin";
export * from "@/shared/data/api/requests/connectors";

export {
  extractUploadChatId,
  extractUploadReferences,
} from "@/shared/data/api/requests/uploads";

export {
  getVoiceCapabilitiesFlexible,
  getVoiceVoicesFlexible,
} from "@/shared/data/api/client";
export {
  normalizeChatSummariesPayload,
} from "@/shared/data/api/requests/chats";
export * from "@/shared/data/desktop/desktopFileSystem";
export * from "@/shared/data/desktop/desktopHostBridge";
export * from "@/shared/data/desktop/desktopQueryContext";
export * from "@/shared/data/desktop/desktopScreenshot";
export * from "@/shared/data/api/endpointRegistry";
export * from "@/shared/data/api/endpoints";
export * from "@/shared/data/memory/memoryTypes";
export * from "@/shared/data/errors/platformError";
export { useAgentSkillsQuery } from "@/shared/data/query/queries";
export * from "@/shared/data/query/serverState";
export * from "@/shared/data/runOwner";

export * from "@/shared/data/api/routedClient";
export { getSkillOrder, putSkillOrder } from "@/shared/data/api/routedClient";
