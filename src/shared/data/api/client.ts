// Compatibility entry point. Request implementations and DTOs are owned by the modules below.
import type {
  VoiceCapabilities,
} from "@/shared/data/api/dto/voice";
import {
  isObjectRecord,
  ApiError,
  createPlatformApiError,
  isApiResponseShape,
  requestWithAuth,
} from "@/shared/data/api/http";
import {
  dataEndpoints,
} from "@/shared/data/api/endpoints";

function isVoiceCapabilitiesShape(value: unknown): value is VoiceCapabilities {
  return (
    isObjectRecord(value) &&
    ("websocketPath" in value || "asr" in value || "tts" in value)
  );
}

function isVoiceVoicesPayloadShape(
  value: unknown,
): value is { voices?: unknown[]; defaultVoice?: unknown } {
  return (
    isObjectRecord(value) && ("voices" in value || "defaultVoice" in value)
  );
}

async function readVoiceCapabilitiesResponse(
  response: Response,
): Promise<VoiceCapabilities | null> {
  const rawText = await response.text();
  let json: unknown;

  try {
    json = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    throw new ApiError(`Invalid JSON response: ${(error as Error).message}`, {
      status: response.status,
      data: rawText,
    });
  }

  if (!response.ok) {
    const apiJson = isObjectRecord(json) ? json : null;
    throw createPlatformApiError(apiJson ?? json, {
      status: response.status,
      code: apiJson?.code as number | undefined,
      data: apiJson?.data ?? json,
      fallbackMessage: `HTTP ${response.status}`,
    });
  }

  if (isApiResponseShape(json)) {
    if (json.code !== 0) {
      throw createPlatformApiError(json, {
        status: response.status,
        code: json.code as number,
        data: json.data,
        fallbackMessage: "API returned non-zero code",
      });
    }
    if (json.data == null) {
      return null;
    }
    if (!isVoiceCapabilitiesShape(json.data)) {
      throw new ApiError("Response is not VoiceCapabilities shape", {
        status: response.status,
        data: json.data,
      });
    }
    return json.data as VoiceCapabilities;
  }

  if (json == null) {
    return null;
  }

  if (!isVoiceCapabilitiesShape(json)) {
    throw new ApiError("Response is not VoiceCapabilities shape", {
      status: response.status,
      data: json,
    });
  }

  return json;
}

async function readVoiceVoicesResponse(
  response: Response,
): Promise<{ voices?: unknown[]; defaultVoice?: unknown } | null> {
  const rawText = await response.text();
  let json: unknown;

  try {
    json = rawText ? JSON.parse(rawText) : null;
  } catch (error) {
    throw new ApiError(`Invalid JSON response: ${(error as Error).message}`, {
      status: response.status,
      data: rawText,
    });
  }

  if (!response.ok) {
    const apiJson = isObjectRecord(json) ? json : null;
    throw createPlatformApiError(apiJson ?? json, {
      status: response.status,
      code: apiJson?.code as number | undefined,
      data: apiJson?.data ?? json,
      fallbackMessage: `HTTP ${response.status}`,
    });
  }

  if (isApiResponseShape(json)) {
    if (json.code !== 0) {
      throw createPlatformApiError(json, {
        status: response.status,
        code: json.code as number,
        data: json.data,
        fallbackMessage: "API returned non-zero code",
      });
    }
    if (json.data == null) {
      return null;
    }
    if (!isVoiceVoicesPayloadShape(json.data)) {
      throw new ApiError("voice voices response is invalid", {
        status: response.status,
        data: json.data,
      });
    }
    return json.data as { voices?: unknown[]; defaultVoice?: unknown };
  }

  if (json == null) {
    return null;
  }

  if (!isVoiceVoicesPayloadShape(json)) {
    throw new ApiError("voice voices response is invalid", {
      status: response.status,
      data: json,
    });
  }

  return json;
}

export async function getVoiceCapabilitiesFlexible(): Promise<VoiceCapabilities | null> {
  const response = await requestWithAuth(dataEndpoints.voiceCapabilities.path);
  return readVoiceCapabilitiesResponse(response);
}

export async function getVoiceVoicesFlexible(path = dataEndpoints.voiceVoices.path): Promise<{ voices?: unknown[]; defaultVoice?: unknown } | null> {
  const response = await requestWithAuth(path);
  return readVoiceVoicesResponse(response);
}

export {
  ApiError,
  setAccessToken,
  getCurrentAccessToken,
  ensureAccessToken,
  createRequestId,
} from "@/shared/data/api/http";
export type * from "@/shared/data/api/dto/common";
export type * from "@/shared/data/api/dto/commands";
export type * from "@/shared/data/api/dto/resources";
export type * from "@/shared/data/api/dto/agents";
export type * from "@/shared/data/api/dto/chats";
export type * from "@/shared/data/api/dto/automations";
export type * from "@/shared/data/api/dto/admin";
export type * from "@/shared/data/api/dto/skills";
export type * from "@/shared/data/api/dto/models";
export type * from "@/shared/data/api/dto/archives";
export * from "@/shared/data/api/requests/chats";
export {
  buildResourceUrl,
  isLegacyResourceUrl,
  isChatScopeResourceRef,
  classifyResourceUrl,
} from "@/shared/data/api/resources/urls";
export * from "@/shared/data/api/requests/projects";
export * from "@/shared/data/api/resources";

export * from "@/shared/data/api/requests/uploads";
export * from "@/shared/data/api/requests/agents";
export * from "@/shared/data/api/requests/admin";

export * from "@/shared/data/api/requests/skills";

export * from "@/shared/data/api/requests/archives";
export * from "@/shared/data/api/requests/automations";
export type {
  GetMemoryRecordsParams,
} from "@/shared/data/memory/memoryTypes";
export * from "@/shared/data/api/requests/memory";

export * from "@/shared/data/api/reasoningEffort";
