import type { DictationCapabilities } from "../dto/dictation";
import { dataEndpoints } from "../endpoints";
import { requestJson } from "../http";

export async function getDictationCapabilities(signal?: AbortSignal): Promise<DictationCapabilities> {
  return (await requestJson<DictationCapabilities>(dataEndpoints.dictationCapabilities.path, { signal, suppressAuthRedirect: true })).data;
}
