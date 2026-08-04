import React, {
  useMemo,
  useCallback,
  useState,
} from "react";
import { XMarkdown as Markdown } from "@ant-design/x-markdown";
import Latex from "@ant-design/x-markdown/plugins/Latex";
import {
  downloadResource,
  isLegacyResourceUrl,
  isLogicalResourceRef,
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
import { useAuthenticatedResourceUrl } from "./useAuthenticatedResourceUrl";

export type { WorkspaceFileLink } from "./markdownWorkspaceLinks";
export type { MarkdownWebLink } from "./markdownWebLinks";

interface MarkdownContentProps {
  content: string;
  chatId?: string;
  onWorkspaceFileLinkClick?: (link: WorkspaceFileLink) => void;
  onWebLinkClick?: (link: MarkdownWebLink) => void;
}

type MarkdownPreProps = React.HTMLAttributes<HTMLPreElement> & {
  domNode?: unknown;
};


/**
 * Extracts the filename from a resource URL query string.
 * e.g. "/api/resource?file=chat_123%2Fjoke_01.md&download=true" → "joke_01.md"
 */
function extractFilenameFromResourceUrl(href: string): string {
  try {
    const url = new URL(href, window.location.origin);
    const file = isLegacyResourceUrl(href)
      ? url.searchParams.get("file") || ""
      : href.split(/[?#]/, 1)[0];
    const segments = file.split("/");
    return decodeURIComponent(segments[segments.length - 1] || "download");
  } catch {
    return "download";
  }
}

/**
 * Returns true when the href points to the local resource API endpoint.
 */
function isResourceUrl(href: string, chatId: string): boolean {
  return isLegacyResourceUrl(href) || isLogicalResourceRef(href, chatId);
}

/**
 * Custom anchor component that intercepts `/api/resource` links and
 * downloads them via fetch with auth headers (Bearer token) instead
 * of letting the browser navigate directly (which causes 401).
 */
type AuthAnchorProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  chatId: string;
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
    onWorkspaceFileLinkClick,
    onWebLinkClick,
    ...rest
  } = props;
  const [downloading, setDownloading] = useState(false);
  const downloadFilename = href && isResourceUrl(href, chatId)
    ? extractFilenameFromResourceUrl(href)
    : undefined;
  const workspaceFileLink = useMemo(
    () => parseWorkspaceFileHref(href),
    [href],
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

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (href && isResourceUrl(href, chatId)) {
        e.preventDefault();
        if (downloading) {
          return;
        }
        setDownloading(true);

        const filename = extractFilenameFromResourceUrl(href);
        void downloadResource(href, { filename, chatId })
          .catch((error: unknown) => {
            console.error("Resource download failed:", error);
          })
          .finally(() => {
            setDownloading(false);
          });
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
      onWebLinkClick,
      onWorkspaceFileLinkClick,
      webLink,
      webLinkTitle,
      workspaceFileLink,
    ],
  );

  return (
    <a
      {...rest}
      href={href}
      download={downloadFilename || rest.download}
      onClick={handleClick}
    >
      {downloading ? t("markdown.downloading") : children}
    </a>
  );
};

type AuthImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  chatId: string;
};

const AuthImage: React.FC<AuthImageProps> = ({ src, chatId, alt, ...rest }) => {
  const { t } = useI18n();
  const resolved = useAuthenticatedResourceUrl(src, chatId);
  if (resolved.error) {
    const fallback = t("rightSidebar.preview.error.image");
    return <span role="img" aria-label={alt || fallback}>{alt || fallback}</span>;
  }
  if (!resolved.url) {
    return <span aria-busy={resolved.loading}>{alt || ""}</span>;
  }
  return <img {...rest} src={resolved.url} alt={alt || ""} />;
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
 * - Image auth-src rewriting (data-auth-src → blob URL)
 * - Link safety filtering
 * - Authenticated resource downloads (via custom anchor component)
 */
export const MarkdownContent: React.FC<MarkdownContentProps> = ({
  content,
  chatId = "",
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
            onWorkspaceFileLinkClick={onWorkspaceFileLinkClick}
            onWebLinkClick={onWebLinkClick}
          />
        ),
        code: MarkdownCode,
        pre: MarkdownPre,
        img: (imageProps: React.ImgHTMLAttributes<HTMLImageElement>) => (
          <AuthImage {...imageProps} chatId={chatId} />
        ),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    [chatId, onWebLinkClick, onWorkspaceFileLinkClick],
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
