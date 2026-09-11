import type { DocumentPreviewCapabilities, DocumentPreviewRequest, DocumentPreviewResponse } from "@/shared/data/api/dto/resources";
import { dataEndpoints } from "@/shared/data/api/endpoints";
import { requestJson } from "@/shared/data/api/http";

export function getDocumentPreviewCapabilities(signal?: AbortSignal) {
  return requestJson<DocumentPreviewCapabilities>(dataEndpoints.documentPreviewCapabilities.path, { signal });
}

export function prepareDocumentPreview(request: DocumentPreviewRequest, signal?: AbortSignal) {
  return requestJson<DocumentPreviewResponse>(dataEndpoints.documentPreview.path, {
    method: "POST", body: JSON.stringify(request), signal,
  });
}
