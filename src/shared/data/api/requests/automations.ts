import type {
  AutomationListRequest,
  AutomationListResponse,
  AutomationDetailResponse,
  CreateAutomationRequest,
  UpdateAutomationRequest,
  DeleteAutomationRequest,
  ToggleAutomationRequest,
  TriggerAutomationRequest,
  TriggerAutomationResponse,
  AutomationExecutionsRequest,
  AutomationExecutionListResponse,
  AutomationExecutionRequest,
  AutomationExecutionDetailResponse,
} from "@/shared/data/api/dto/automations";
import type {
  ApiResponse,
} from "@/shared/data/api/dto/common";
import {
  postJson,
} from "@/shared/data/api/http";
import {
  dataEndpoints,
} from "@/shared/data/api/endpoints";

export function getAutomations(
  params: AutomationListRequest = {},
): Promise<ApiResponse<AutomationListResponse>> {
  return postJson<AutomationListResponse>(dataEndpoints.automations.path, params);
}

export function getAutomation(
  id: string,
): Promise<ApiResponse<AutomationDetailResponse>> {
  return postJson<AutomationDetailResponse>(dataEndpoints.automation.path, { id });
}

export function createAutomation(
  params: CreateAutomationRequest,
): Promise<ApiResponse<AutomationDetailResponse>> {
  return postJson<AutomationDetailResponse>(dataEndpoints.automationCreate.path, params);
}

export function updateAutomation(
  params: UpdateAutomationRequest,
): Promise<ApiResponse<AutomationDetailResponse>> {
  return postJson<AutomationDetailResponse>(dataEndpoints.automationUpdate.path, params);
}

export function deleteAutomation(
  params: DeleteAutomationRequest,
): Promise<ApiResponse<{ id: string; deleted: boolean }>> {
  return postJson<{ id: string; deleted: boolean }>(dataEndpoints.automationDelete.path, params);
}

export function toggleAutomation(
  params: ToggleAutomationRequest,
): Promise<ApiResponse<AutomationDetailResponse>> {
  return postJson<AutomationDetailResponse>(dataEndpoints.automationToggle.path, params);
}

export function triggerAutomation(
  params: TriggerAutomationRequest,
): Promise<ApiResponse<TriggerAutomationResponse>> {
  return postJson<TriggerAutomationResponse>(dataEndpoints.automationTrigger.path, params);
}

export function getAutomationExecutions(
  params: AutomationExecutionsRequest,
): Promise<ApiResponse<AutomationExecutionListResponse>> {
  return postJson<AutomationExecutionListResponse>(dataEndpoints.automationExecutions.path, params);
}

export function getAutomationExecution(
  params: AutomationExecutionRequest,
): Promise<ApiResponse<AutomationExecutionDetailResponse>> {
  return postJson<AutomationExecutionDetailResponse>(
    dataEndpoints.automationExecution.path,
    params,
  );
}
