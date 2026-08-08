import React, {
  useMemo,
  useCallback,
  useState,
} from "react";
import { XMarkdown as Markdown } from "@ant-design/x-markdown";
import Latex from "@ant-design/x-markdown/plugins/Latex";
import {
  classifyResourceUrl,
  downloadResource,
} from "@/shared/data";
import { MarkdownCode } from "./markdown-code";
import { useI18n } from "@/shared/i18n";
import { removeEmptyMarkdownTables } from "./markdownPreprocess";
import {
  parseWorkspaceFileHref,
  type WorkspaceFileLink,
} from "./markdownWorkspaceLinks";
import {
  getMarkdownWebLinkFallbackTitle,
  parseMarkdownWebHref,
  shouldOpenWebLinkInSidebar,
  type MarkdownWebLink,
} from "./markdownWebLinks";
import {
  sanitizeMarkdownImageProps,
  type MarkdownImageProps,
} from "./markdownImageProps";
import { useAuthenticatedResourceUrl } from "./useAuthenticatedResourceUrl";
import { useDesktopContextMenuTarget } from "@/shared/data/desktop/desktopContextMenu";
import { copyText } from "@/shared/utils/copy";

export type { WorkspaceFileLink } from "./markdownWorkspaceLinks";
export type { MarkdownWebLink } from "./markdownWebLinks";

interface MarkdownContentProps {
  content: string;
  chatId: string;
  teamChat?: boolean;
  onWorkspaceFileLinkClick?: (link: WorkspaceFileLink) => void;
  onWebLinkClick?: (link: MarkdownWebLink) => void;
}

type MarkdownPreProps = React.HTMLAttributes<HTMLPreElement> & {
  domNode?: unknown;
};


/**
 * Extracts the filename from a supported ChatScope or absolute resource path.
 */
function extractFilenameFromResourceUrl(href: string): string {
  try {
    const segments = href.split("/");
    return decodeURIComponent(segments[segments.length - 1] || "download");
  } catch {
    return "download";
  }
}

function getSafeResourceDisplayName(href: string): string {
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
  return kind === "chat" || kind === "absolute";
}

/**
 * Custom anchor component that intercepts ChatScope and absolute resource links and
 * downloads them via fetch with auth headers (Bearer token) instead
 * of letting the browser navigate directly (which causes 401).
 */
type AuthAnchorProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  chatId: string;
  teamChat: boolean;
  onWorkspaceFileLinkClick?: (link: WorkspaceFileLink) => void;
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
    href,
    children,
    chatId,
    teamChat,
    onWorkspaceFileLinkClick,
    onWebLinkClick,
    ...rest
  } = props;
  const [downloading, setDownloading] = useState(false);
  const contextTargetId = React.useId();
  const classified = useMemo(
    () => classifyResourceUrl(href || "", chatId, { teamChat }),
    [chatId, href, teamChat],
  );
  const fetchedResource = isFetchedResourceKind(classified.kind);
  const downloadFilename = href && fetchedResource
    ? extractFilenameFromResourceUrl(href)
    : undefined;
  const workspaceFileLink = useMemo(
    () => classified.kind === "absolute" && !String(href || "").startsWith("/tmp/")
      ? parseWorkspaceFileHref(href)
      : null,
    [classified.kind, href],
  );
  const webLink = useMemo(() => parseMarkdownWebHref(href), [href]);
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
          "copy-workspace-path": () => copyText(workspaceFileLink.filePath),
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
    if (href && fetchedResource) {
      return {
        targetId: `resource:${contextTargetId}`,
        kind: "chat-resource" as const,
        name: getSafeResourceDisplayName(href),
        mediaType: "file" as const,
        handlers: { "download-resource": downloadAuthenticatedResource },
      };
    }
    return null;
  }, [contextTargetId, downloadAuthenticatedResource, fetchedResource, href, onWebLinkClick, onWorkspaceFileLinkClick, webLink, webLinkTitle, workspaceFileLink]);
  const contextTargetRef = useDesktopContextMenuTarget<HTMLAnchorElement>(contextTarget);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (
        href
        && fetchedResource
        && (!workspaceFileLink || !onWorkspaceFileLinkClick)
      ) {
        e.preventDefault();
        if (downloading) {
          return;
        }
        void downloadAuthenticatedResource();
        return;
      }

      if (classified.kind === "invalid") {
        e.preventDefault();
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
      downloading,
      href,
      chatId,
      teamChat,
      classified.kind,
      fetchedResource,
      onWebLinkClick,
      onWorkspaceFileLinkClick,
      webLink,
      webLinkTitle,
      workspaceFileLink,
      downloadAuthenticatedResource,
    ],
  );

  return (
    <a
      ref={contextTargetRef}
      {...rest}
      href={classified.kind === "invalid" ? undefined : href}
      download={downloadFilename || rest.download}
      onClick={handleClick}
    >
      {downloading ? t("markdown.downloading") : children}
    </a>
  );
};

type AuthImageProps = MarkdownImageProps & {
  chatId: string;
  teamChat: boolean;
};

const AuthImage: React.FC<AuthImageProps> = (props) => {
  const { src, chatId, teamChat, alt, ...rendererProps } = props;
  const { t } = useI18n();
  const resolved = useAuthenticatedResourceUrl(src, chatId, { teamChat });
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
  const contextTargetRef = useDesktopContextMenuTarget<HTMLImageElement>(contextTarget);
  if (resolved.error) {
    const fallback = t("rightSidebar.preview.error.image");
    return <span role="img" aria-label={alt || fallback}>{alt || fallback}</span>;
  }
  if (!resolved.url) {
    return <span aria-busy={resolved.loading}>{alt || ""}</span>;
  }
  const imageProps = sanitizeMarkdownImageProps(rendererProps);
  return <img ref={contextTargetRef} {...imageProps} src={resolved.url} alt={alt || ""} />;
};

const MarkdownPre: React.FC<MarkdownPreProps> = ({
  children,
  domNode: _domNode,
  ...rest
}) => {
  const childArray = React.Children.toArray(children);
  const onlyChild = childArray.length === 1 ? childArray[0] : null;
  if (
    React.isValidElement(onlyChild) 
		&&
    onlyChild.type === MarkdownCode
  ) {
    return <>{onlyChild}</>;
  }

  return <pre {...rest}>{children}</pre>;
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
 * - Authenticated resource downloads (via custom anchor component)
 */
export const MarkdownContent: React.FC<MarkdownContentProps> = ({
  content,
  chatId,
  teamChat = false,
  onWorkspaceFileLinkClick,
  onWebLinkClick,
}) => {
  const markdownConfig = useMemo(
    () => ({
      gfm: true,
      breaks: true,
      extensions: Latex(),
    }),
    [],
  );

  const markdownComponents = useMemo(
    () =>
      ({
        a: (anchorProps: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
          <AuthAnchor
            {...anchorProps}
            chatId={chatId}
            teamChat={teamChat}
            onWorkspaceFileLinkClick={onWorkspaceFileLinkClick}
            onWebLinkClick={onWebLinkClick}
          />
        ),
        code: MarkdownCode,
        pre: MarkdownPre,
        img: (imageProps: React.ImgHTMLAttributes<HTMLImageElement>) => (
          <AuthImage {...imageProps} chatId={chatId} teamChat={teamChat} />
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    [chatId, onWebLinkClick, onWorkspaceFileLinkClick, teamChat],
  );

  const processedContent = useMemo(() => {
    if (!content) return "";

    return removeEmptyMarkdownTables(content);
  }, [content]);

  if (!processedContent) {
    return null;
  }

  return (
    <Markdown config={markdownConfig} components={markdownComponents} style={{fontSize: 14}}>
      {processedContent}
    </Markdown>
  );
};
