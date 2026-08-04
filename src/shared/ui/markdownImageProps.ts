import type React from "react";

export type MarkdownImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  domNode?: unknown;
  streamStatus?: unknown;
  class?: string;
  classname?: string;
};

/**
 * XMarkdown adds renderer-only props to every custom component, including
 * void elements. React rejects children and dangerouslySetInnerHTML on img,
 * while the parser metadata must not leak to the DOM either.
 */
export function sanitizeMarkdownImageProps(
  props: MarkdownImageProps,
): React.ImgHTMLAttributes<HTMLImageElement> {
  const {
    children: _children,
    dangerouslySetInnerHTML: _dangerouslySetInnerHTML,
    domNode: _domNode,
    streamStatus: _streamStatus,
    class: _class,
    classname: _classname,
    ...imageProps
  } = props;

  return imageProps;
}
