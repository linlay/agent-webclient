import type { VoiceCapabilities } from "@/shared/data/api/dto/voice";
import { requestJson } from "@/shared/data/api/http";
import { dataEndpoints } from "@/shared/data/api/endpoints";

export async function getVoiceCapabilities(signal?: AbortSignal): Promise<VoiceCapabilities> {
  return (await requestJson<VoiceCapabilities>(dataEndpoints.voiceCapabilities.path, { signal })).data;
}
