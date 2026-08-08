export interface ObjectUrlApi {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

export interface ObjectUrlLease {
  url: string;
  revoke(): void;
}

/** Preserves a specific response MIME and only repairs missing/generic Blob metadata. */
export function withBlobMimeTypeFallback(blob: Blob, fallbackMimeType: string): Blob {
  const normalizedFallback = String(fallbackMimeType || "").trim().toLowerCase();
  const currentType = String(blob.type || "").trim().toLowerCase();
  if (
    !normalizedFallback
    || (currentType && currentType !== "application/octet-stream")
  ) {
    return blob;
  }
  return blob.slice(0, blob.size, normalizedFallback);
}

/** Creates an idempotent object-URL lease for effect cleanup. */
export function createObjectUrlLease(
  blob: Blob,
  urlApi: ObjectUrlApi = URL,
): ObjectUrlLease {
  const url = urlApi.createObjectURL(blob);
  let revoked = false;

  return {
    url,
    revoke: () => {
      if (revoked) return;
      revoked = true;
      urlApi.revokeObjectURL(url);
    },
  };
}
