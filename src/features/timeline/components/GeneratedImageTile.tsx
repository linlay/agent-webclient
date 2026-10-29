import React, { useMemo, useState } from "react";
import type { GeneratedImage } from "@/features/timeline/lib/imageGenerationDisplay";
import { useAuthenticatedResourceUrl } from "@/shared/ui/useAuthenticatedResourceUrl";
import { useDesktopContextMenuTarget } from "@/shared/data/desktop/desktopContextMenu";
import { buildResourceViewerTarget } from "@/features/viewers/lib/viewerTarget";
import { downloadArtifactResource } from "@/features/artifacts/lib/artifactResourceRuntime";
import {
  decodeNativeResourceRelativePath,
  type OpenTargetIntent,
} from "@/features/surfaces/lib/openTarget";
import { useOpenTarget } from "@/features/surfaces/hooks/useOpenTarget";
import { classifyResourceUrl } from "@/shared/data";
import { useAppMessage } from "@/shared/ui/useAppMessage";
import { useI18n } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import styles from "@/features/timeline/components/ImageGenerationCard.module.css";

type Surface = { chatId: string; agentKey?: string; teamChat?: boolean };

export function GeneratedImageTile({
  image,
  surface,
}: {
  image: GeneratedImage;
  surface: Surface;
}) {
  const { t } = useI18n();
  const message = useAppMessage();
  const openTarget = useOpenTarget();
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadedUrl, setLoadedUrl] = useState("");
  const [failedUrl, setFailedUrl] = useState("");
  const source = useAuthenticatedResourceUrl(image.url, surface.chatId, {
    teamChat: surface.teamChat,
    refreshKey,
  });
  const failed = Boolean(
    source.error || (source.url && failedUrl === source.url),
  );
  const loaded = Boolean(source.url && loadedUrl === source.url && !failed);
  const target = useMemo(
    () => buildResourceViewerTarget({ ...image, contentKind: "image" }),
    [image],
  );
  const open = () => {
    if (!target) return;
    const common = {
      version: 1 as const,
      chatId: surface.chatId,
      agentKey: surface.agentKey,
      resourceTarget: target,
    };
    const resource = classifyResourceUrl(target.url, surface.chatId);
    if (image.artifactId && resource.kind === "chat") {
      // Generated images can be flat Chat resources; use the same editor as
      // artifacts while retaining reference semantics (save as a new artifact).
      for (const intent of [
        { ...common, kind: "artifact", artifactId: image.artifactId },
        { ...common, kind: "reference", referenceId: image.artifactId },
      ] satisfies OpenTargetIntent[]) {
        if (
          decodeNativeResourceRelativePath(resource.resourceKey, intent.kind)
        ) {
          openTarget(intent);
          return;
        }
      }
    }
    openTarget({ ...common, kind: "resource", file: target.url });
  };
  const targetId = React.useId();
  const contextTarget = {
    targetId: `generated-image:${targetId}`,
    kind: "chat-resource" as const,
    name: image.name,
    mediaType: "image" as const,
    handlers: {
      ...(target ? { "preview-resource": open } : {}),
      "download-resource": () => {
        void downloadArtifactResource(
          image.url,
          image.name,
          surface.chatId,
          undefined,
          surface.teamChat,
        ).catch(() => {
          void message.error(t("timeline.image.downloadFailed"));
        });
      },
    },
  };
  const contextRef = useDesktopContextMenuTarget<HTMLDivElement>(contextTarget);
  return (
    <div ref={contextRef} className={styles.image}>
      <button
        type="button"
        className={styles.open}
        onClick={open}
        disabled={!target || !loaded}
        aria-label={t("attachments.action.view") + " " + image.name}
      >
        {source.url && (
          <img
            key={`${source.url}:${refreshKey}`}
            src={source.url}
            alt={image.name}
            className={loaded ? styles.loaded : styles.loadingImage}
            onLoad={() => setLoadedUrl(source.url)}
            onError={() => setFailedUrl(source.url)}
          />
        )}
      </button>
      {!loaded && (
        <div className={styles.overlay} role="status">
          <MaterialIcon name="image" />
          <span>
            {t(failed ? "timeline.image.loadFailed" : "timeline.image.loading")}
          </span>
          {failed && (
            <button
              type="button"
              className={styles.retry}
              onClick={() => {
                setFailedUrl("");
                setLoadedUrl("");
                setRefreshKey((value) => value + 1);
              }}
            >
              {t("timeline.image.reload")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
