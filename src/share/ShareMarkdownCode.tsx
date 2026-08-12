import React, { lazy, Suspense } from "react";
import type { ConversationMarkdownCodeProps } from "@/shared/ui/markdown-code/ConversationMarkdownCode";

const LazyConversationMarkdownCode = lazy(async () => {
  const module = await import(
    "@/shared/ui/markdown-code/ConversationMarkdownCode"
  );
  return { default: module.ConversationMarkdownCode };
});

export const ShareMarkdownCode: React.FC<ConversationMarkdownCodeProps> = (props) => {
  const {
    block,
    children,
    domNode: _domNode,
    lang: _lang,
    streamStatus: _streamStatus,
    copyCode: _copyCode,
    extraActions: _extraActions,
    ...rest
  } = props;

  if (!block) {
    return <code {...rest}>{children}</code>;
  }

  return (
    <Suspense
      fallback={(
        <pre aria-busy="true">
          <code>{children}</code>
        </pre>
      )}
    >
      <LazyConversationMarkdownCode {...props} />
    </Suspense>
  );
};
