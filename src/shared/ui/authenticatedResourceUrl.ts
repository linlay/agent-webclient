export interface ObjectUrlApi {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

export interface ObjectUrlLease {
  url: string;
  revoke(): void;
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
