import type { ConversationExportCdnAsset } from "./cdnAssets";

const SCRIPT_LOADS = new Map<string, Promise<void>>();
const EXPORT_RUNTIME_ELEMENT_ID = "conversation-export-runtime";

function resolveAssetURL(value: string): string {
  const runtime = document.getElementById(
    EXPORT_RUNTIME_ELEMENT_ID,
  ) as HTMLScriptElement | null;
  if (!runtime?.src) {
    throw new Error("export_runtime_missing");
  }
  return new URL(value, runtime.src).toString();
}

export function loadCdnScript(
  asset: ConversationExportCdnAsset,
): Promise<void> {
  let assetURL: string;
  try {
    assetURL = resolveAssetURL(asset.url);
  } catch (error) {
    return Promise.reject(error);
  }
  const cached = SCRIPT_LOADS.get(assetURL);
  if (cached) return cached;

  const load = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = assetURL;
    script.integrity = asset.integrity;
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("cdn_load_failed")), {
      once: true,
    });
    document.head.append(script);
  });
  SCRIPT_LOADS.set(assetURL, load);
  return load;
}
