import { useDesktopArtifactDrag } from "@/shared/ui/useDesktopArtifactDrag";
import React, {
  useMemo,
  useCallback,
  useState,
} from "react";
import {
  WORKSPACE_FILE_ALIAS,
  classifyResourceUrl,
  downloadResource,
  formatWorkspaceFileAddress,
  hasFileAlias,
  type ResourceUrlClassification,
} from "@/shared/data";
import { MarkdownCode, type ConversationMarkdownCodeProps } from "@/features/viewers/components/MarkdownCode";
import {
  ConversationMarkdown,
  type ConversationMarkdownComponents,
} from "@/shared/ui/ConversationMarkdown";
import { useI18n } from "@/shared/i18n";
import {
  parseWorkspaceFileHref,
  type WorkspaceFileLink,
} from "@/shared/ui/markdownWorkspaceLinks";
import {
  getMarkdownWebLinkFallbackTitle,
  parseMarkdownWebHref,
  shouldOpenWebLinkInSidebar,
  type MarkdownWebLink,
} from "@/shared/ui/markdownWebLinks";
import {
  sanitizeMarkdownImageProps,
  type MarkdownImageProps,
} from "@/shared/ui/markdownImageProps";
import {
  getMarkdownAudioMimeType,
  getMarkdownVideoMimeType,
  isMarkdownAudioSource,
  isMarkdownVideoSource,
} from "@/shared/ui/markdownMedia";
import { useAuthenticatedResourceUrl } from "@/shared/ui/useAuthenticatedResourceUrl";
import { useDesktopContextMenuTarget } from "@/shared/data/desktop/desktopContextMenu";
import { copyText } from "@/shared/utils/copy";
import { useAppMessage } from "@/shared/ui/useAppMessage";
import { Image } from "antd";

import { HtmlDraftPreviewContext } from "./HtmlDraftPreviewContext";

export type { WorkspaceFileLink } from "@/shared/ui/markdownWorkspaceLinks";
export type { MarkdownWebLink } from "@/shared/ui/markdownWebLinks";

export interface MarkdownContentProps {
  content: string;
  isStreaming?: boolean;
  htmlPreview?: boolean;
  chatId: string;
  agentKey?: string;
  teamChat?: boolean;
  onWorkspaceFileLinkClick?: (link: WorkspaceFileLink) => void;
  onResourceFileLinkClick?: (link: ResourceFileLink) => void;
  onWebLinkClick?: (link: MarkdownWebLink) => void;
}

export interface ResourceFileLink {
  href: string;
  name: string;
  classification: ResourceUrlClassification;
}

// Keep the renderer identity stable as later Markdown deltas arrive.
const InlineHtmlMarkdownCode = (props: ConversationMarkdownCodeProps) => <MarkdownCode {...props} htmlPreview />;

/**
 * Extracts the filename from a Chat file address.
 */
function extractFilenameFromResourceUrl(href: string): string {
  // An @chat/ reference is a literal path: nothing in it is URL syntax.
  if (/^@chat\//iu.test(href)) return href.split("/").pop() || "download";
  try {
    const segments = href.split("/");
    return decodeURIComponent(segments[segments.length - 1] || "download");
  } catch {
    return "download";
  }
}

function getSafeResourceDisplayName(href: string): string {
  if (/^@chat\//iu.test(href)) return extractFilenameFromResourceUrl(href).slice(0, 256);
  try {
    const parsed = new URL(
      href,
      typeof window === "undefined" ? "http://localhost/" : window.location.href,
    );
    const segment = parsed.pathname.split("/").filter(Boolean).pop() || "download";
    return decodeURIComponent(segment).slice(0, 256);
  } catch {
    return extractFilenameFromResourceUrl(href.split(/[?#]/u)[0] || "download").slice(0, 256);
  }
}

/**
 * Returns true when the href needs an authenticated Platform resource fetch.
 */
function isFetchedResourceKind(kind: ReturnType<typeof classifyResourceUrl>["kind"]): boolean {
  return kind === "chat";
}

/** Page anchors and system links keep the browser's default behavior. */
function isPassthroughHref(href: string): boolean {
  return /^(?:#|mailto:|tel:)/iu.test(href);
}

function workspaceFileAddress(link: WorkspaceFileLink): string {
  return hasFileAlias(link.href, WORKSPACE_FILE_ALIAS)
    ? formatWorkspaceFileAddress(link.filePath, link.line)
    : link.href;
}

/**
 * Custom anchor component that opens Chat and Workspace file links in the
 * current surface instead of letting the browser navigate to an address that
 * is not a URL. A file link that cannot open here explains why on click.
 */
type AuthAnchorProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  chatId: string;
  teamChat: boolean;
  onWorkspaceFileLinkClick?: (link: WorkspaceFileLink) => void;
  onResourceFileLinkClick?: (link: ResourceFileLink) => void;
  onWebLinkClick?: (link: MarkdownWebLink) => void;
};

function getAnchorText(children: React.ReactNode): string {
  const parts: string[] = [];

  const visit = (node: React.ReactNode): void => {
    if (typeof node === "string" || typeof node === "number") {
      parts.push(String(node));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
      visit(node.props.children);
    }
  };

  visit(children);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

const AuthAnchor: React.FC<AuthAnchorProps> = (props) => {
  const { t } = useI18n();
  const {
    href: markdownHref,
    children,
    chatId,
    teamChat,
    onWorkspaceFileLinkClick,
    onResourceFileLinkClick,
    onWebLinkClick,
    download: _download,
    ...rest
  } = props;
  const message = useAppMessage();
  // The Markdown renderer passes file targets literally.
  const href = String(markdownHref || "").trim();
  const artifactDrag = useDesktopArtifactDrag(chatId, undefined, href, true, status => { void message.info(t(`attachments.exportDrag.${status}`)); });
  const [downloading, setDownloading] = useState(false);
  const contextTargetId = React.useId();
  const classified = useMemo(
    () => classifyResourceUrl(href, chatId, { teamChat }),
    [chatId, href, teamChat],
  );
  const fetchedResource = isFetchedResourceKind(classified.kind);
  const workspaceFileLink = useMemo(
    () => classified.kind === "workspace" ? parseWorkspaceFileHref(href) : null,
    [classified.kind, href],
  );
  const resourceFileLink = useMemo<ResourceFileLink | null>(
    () => href && fetchedResource && !workspaceFileLink
      ? {
          href,
          name: getSafeResourceDisplayName(href),
          classification: classified,
        }
      : null,
    [classified, fetchedResource, href, workspaceFileLink],
  );
  const webLink = useMemo(() => parseMarkdownWebHref(href), [href]);
  const passthrough = isPassthroughHref(href);
  // A link that cannot open here says why instead of ignoring the click.
  const unavailableReason = useMemo(() => {
    if (workspaceFileLink) return onWorkspaceFileLinkClick ? "" : t("markdown.link.workspaceUnavailable");
    if (resourceFileLink) return onResourceFileLinkClick ? "" : t("markdown.link.chatFileUnavailable");
    if (webLink || passthrough) return "";
    switch (classified.invalidReason) {
      case "unscoped":
        return t("markdown.link.scopeRequired");
      case "unsupported_path":
        return t("markdown.link.unsupportedPath");
      case "chat_context_required":
        return t("markdown.link.chatContextRequired");
      default:
        return t("markdown.link.unsupported");
    }
  }, [classified.invalidReason, onResourceFileLinkClick, onWorkspaceFileLinkClick, passthrough, resourceFileLink, t, webLink, workspaceFileLink]);
  const webLinkTitle = useMemo(
    () =>
      webLink
        ? getAnchorText(children) ||
          getMarkdownWebLinkFallbackTitle(webLink.url)
        : "",
    [children, webLink],
  );

  const downloadAuthenticatedResource = useCallback(() => {
    if (!href || !fetchedResource || downloading) return;
    setDownloading(true);
    const filename = extractFilenameFromResourceUrl(href);
    return downloadResource(href, { filename, chatId, teamChat })
      .catch((error: unknown) => {
        console.error("Resource download failed:", error);
      })
      .finally(() => {
        setDownloading(false);
      });
  }, [chatId, downloading, fetchedResource, href, teamChat]);

  const contextTarget = useMemo(() => {
    if (workspaceFileLink) {
      return {
        targetId: `workspace:${contextTargetId}`,
        kind: "workspace-file" as const,
        name: workspaceFileLink.filePath.split(/[\\/]/u).pop() || workspaceFileLink.filePath,
        handlers: {
          ...(onWorkspaceFileLinkClick
            ? { "preview-workspace": () => onWorkspaceFileLinkClick(workspaceFileLink) }
            : {}),
          "copy-workspace-path": () => copyText(workspaceFileAddress(workspaceFileLink)),
        },
      };
    }
    if (webLink) {
      return {
        targetId: `web-link:${contextTargetId}`,
        kind: "web-link" as const,
        url: webLink.url,
        title: webLinkTitle,
        handlers: onWebLinkClick
          ? { "preview-link": () => onWebLinkClick({ ...webLink, title: webLinkTitle }) }
          : {},
      };
    }
    if (resourceFileLink) {
      return {
        targetId: `resource:${contextTargetId}`,
        kind: "chat-resource" as const,
        name: resourceFileLink.name,
        mediaType: "file" as const,
        handlers: {
          ...(onResourceFileLinkClick
            ? { "preview-resource": () => onResourceFileLinkClick(resourceFileLink) }
            : {}),
          "download-resource": downloadAuthenticatedResource,
        },
      };
    }
    return null;
  }, [contextTargetId, downloadAuthenticatedResource, onResourceFileLinkClick, onWebLinkClick, onWorkspaceFileLinkClick, resourceFileLink, webLink, webLinkTitle, workspaceFileLink]);
  const contextTargetRef = useDesktopContextMenuTarget<HTMLAnchorElement>(contextTarget);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (unavailableReason) {
        e.preventDefault();
        void message.warning(unavailableReason);
        return;
      }
      if (resourceFileLink && onResourceFileLinkClick) {
        e.preventDefault();
        onResourceFileLinkClick(resourceFileLink);
        return;
      }
      if (workspaceFileLink && onWorkspaceFileLinkClick) {
        e.preventDefault();
        onWorkspaceFileLinkClick(workspaceFileLink);
        return;
      }
      if (
        webLink &&
        onWebLinkClick &&
        shouldOpenWebLinkInSidebar(e)
      ) {
        e.preventDefault();
        onWebLinkClick({
          ...webLink,
          title: webLinkTitle,
        });
      }
    },
    [
      message,
      onWebLinkClick,
      onResourceFileLinkClick,
      onWorkspaceFileLinkClick,
      resourceFileLink,
      unavailableReason,
      webLink,
      webLinkTitle,
      workspaceFileLink,
    ],
  );

  return (
    <a
      ref={contextTargetRef}
      {...rest}
      {...artifactDrag.props}
      href={unavailableReason ? undefined : href}
      {...(unavailableReason ? { title: unavailableReason, "aria-disabled": true } : {})}
      onClick={handleClick}
    >
      {downloading ? t("markdown.downloading") : children}
    </a>
  );
};

type AuthImageProps = MarkdownImageProps & {
  chatId: string;
  agentKey?: string;
  teamChat: boolean;
};

const AuthImage: React.FC<AuthImageProps> = (props) => {
  const { src, chatId, agentKey, teamChat, alt, ...rendererProps } = props;
  const { t } = useI18n();
  const message = useAppMessage();
  const artifactDrag = useDesktopArtifactDrag(chatId, undefined, src || "", true, status => { void message.info(t(`attachments.exportDrag.${status}`)); });
  const resolved = useAuthenticatedResourceUrl(src, chatId, { teamChat, ...(agentKey ? { agentKey } : {}) });
  const contextTargetId = React.useId();
  const authenticatedResource = useMemo(
    () => isFetchedResourceKind(classifyResourceUrl(src || "", chatId, { teamChat }).kind),
    [chatId, src, teamChat],
  );
  const contextTarget = useMemo(() => authenticatedResource && src ? ({
      targetId: `resource-image:${contextTargetId}`,
      kind: "chat-resource" as const,
      name: alt || getSafeResourceDisplayName(src),
      mediaType: "image" as const,
      handlers: {
        "download-resource": () => downloadResource(src, {
          filename: extractFilenameFromResourceUrl(src),
          chatId,
          teamChat,
        }),
      },
    }) : null,
    [alt, authenticatedResource, chatId, contextTargetId, src, teamChat],
  );
  // antd Image 不转发 ref，宿主右键菜单目标登记在外层包裹元素上。
  const contextTargetRef = useDesktopContextMenuTarget<HTMLSpanElement>(contextTarget);
  if (resolved.error) {
    const fallback = t("contentViewer.error.image");
    return <span role="img" aria-label={alt || fallback}>{alt || fallback}</span>;
  }
  if (!resolved.url) {
    return <span aria-busy={resolved.loading}>{alt || ""}</span>;
  }
  // antd Image 把点击收在包裹层用于打开预览，markdown 透传的 img onClick 不再适用。
  const { onClick: _rendererOnClick, ...imageProps } = sanitizeMarkdownImageProps(rendererProps);
  return (
    <div {...artifactDrag.props} ref={contextTargetRef} className="tw:inline-block">
      <Image
        {...imageProps}
        draggable={artifactDrag.available ? false : undefined}
        src={resolved.url}
        alt={alt || ""}
        // 预览必须用鉴权后的 Blob URL，直接用 markdown src 会 401。
        preview={{ src: resolved.url }}
      />
    </div>
  );
};

type MarkdownMediaKind = "video" | "audio";

const markdownMediaConfig = {
  video: {
    getMimeType: getMarkdownVideoMimeType,
    errorKey: "contentViewer.error.video",
  },
  audio: {
    getMimeType: getMarkdownAudioMimeType,
    errorKey: "contentViewer.error.audio",
  },
} as const;

type AuthMediaProps = MarkdownImageProps & {
  kind: MarkdownMediaKind;
  chatId: string;
  agentKey?: string;
  teamChat: boolean;
};

const AuthMedia: React.FC<AuthMediaProps> = (props) => {
  const { kind, src, chatId, agentKey, teamChat, alt, title } = props;
  const { t } = useI18n();
  const config = markdownMediaConfig[kind];
  const resolved = useAuthenticatedResourceUrl(src, chatId, {
    teamChat,
    ...(agentKey ? { agentKey } : {}),
    blobMimeTypeFallback: config.getMimeType(src),
  });
  const [playbackFailed, setPlaybackFailed] = useState(false);
  React.useEffect(() => setPlaybackFailed(false), [resolved.url]);
  const contextTargetId = React.useId();
  const authenticatedResource = useMemo(
    () => isFetchedResourceKind(classifyResourceUrl(src || "", chatId, { teamChat }).kind),
    [chatId, src, teamChat],
  );
  const contextTarget = useMemo(() => authenticatedResource && src ? ({
      targetId: `resource-${kind}:${contextTargetId}`,
      kind: "chat-resource" as const,
      name: alt || getSafeResourceDisplayName(src),
      mediaType: kind,
      handlers: {
        "download-resource": () => downloadResource(src, {
          filename: extractFilenameFromResourceUrl(src),
          chatId,
          teamChat,
        }),
      },
    }) : null,
    [alt, authenticatedResource, chatId, contextTargetId, kind, src, teamChat],
  );
  const contextTargetRef = useDesktopContextMenuTarget<HTMLMediaElement>(contextTarget);
  if (resolved.error || playbackFailed) {
    const fallback = t(config.errorKey);
    return <span role="status">{alt ? `${alt} · ${fallback}` : fallback}</span>;
  }
  if (!resolved.url) {
    return <span aria-busy={resolved.loading}>{alt || ""}</span>;
  }

  const mediaProps = {
    src: resolved.url,
    controls: true,
    preload: "metadata",
    "aria-label": alt || title || undefined,
    title,
    onError: () => setPlaybackFailed(true),
  };
  return kind === "video" ? (
    <video
      ref={contextTargetRef}
      className="markdown-video"
      playsInline
      {...mediaProps}
    />
  ) : (
    <audio
      ref={contextTargetRef}
      className="markdown-audio"
      {...mediaProps}
    />
  );
};

/**
 * MarkdownContent wraps @ant-design/x-markdown Markdown component
 * for streaming-compatible Markdown rendering.
 *
 * Preserves:
 * - Code block rendering with syntax highlighting
 * - KaTeX math formula support (via CSS import)
 * - Authenticated image resources rendered through short-lived Blob URLs
 * - Link safety filtering
 * - Authenticated resource previews with explicit context-menu downloads
 */
export const MarkdownContent: React.FC<MarkdownContentProps> = ({
  content,
  isStreaming,
  htmlPreview = false,
  chatId,
  agentKey,
  teamChat = false,
  onWorkspaceFileLinkClick,
  onResourceFileLinkClick,
  onWebLinkClick,
}) => {
  const markdownComponents = useMemo<ConversationMarkdownComponents>(
    () => ({
        a: (anchorProps: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
          <AuthAnchor
            {...anchorProps}
            chatId={chatId}
            teamChat={teamChat}
            onWorkspaceFileLinkClick={onWorkspaceFileLinkClick}
            onResourceFileLinkClick={onResourceFileLinkClick}
            onWebLinkClick={onWebLinkClick}
          />
        ),
        img: (imageProps: React.ImgHTMLAttributes<HTMLImageElement>) =>
          isMarkdownVideoSource(imageProps.src) ? (
            <AuthMedia kind="video" {...imageProps} chatId={chatId} agentKey={agentKey} teamChat={teamChat} />
          ) : isMarkdownAudioSource(imageProps.src) ? (
            <AuthMedia kind="audio" {...imageProps} chatId={chatId} agentKey={agentKey} teamChat={teamChat} />
          ) : (
            <AuthImage {...imageProps} chatId={chatId} agentKey={agentKey} teamChat={teamChat} />
          ),
      }),
    [agentKey, chatId, onResourceFileLinkClick, onWebLinkClick, onWorkspaceFileLinkClick, teamChat],
  );

  const previewContext = useMemo(() => ({ agentKey: agentKey || "", chatId }), [agentKey, chatId]);
  return (
    <HtmlDraftPreviewContext.Provider value={previewContext}>
      <ConversationMarkdown
        content={content}
        isStreaming={isStreaming}
        components={markdownComponents}
        codeComponent={htmlPreview ? InlineHtmlMarkdownCode : MarkdownCode}
      />
    </HtmlDraftPreviewContext.Provider>
  );
};
