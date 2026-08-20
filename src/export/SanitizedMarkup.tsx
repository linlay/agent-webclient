import React, { useMemo } from "react";
import DOMPurify from "dompurify";

export type SanitizedMarkupProps = {
  as: "code" | "div";
  className?: string;
  html: string;
  profile: "highlight" | "mermaid";
};

// This is the sole raw-markup boundary in the export runtime. Highlight.js is
// restricted to span/class, while Mermaid receives the SVG profile with all
// active or externally loading elements and attributes removed.
export const SanitizedMarkup: React.FC<SanitizedMarkupProps> = ({
  as,
  className,
  html,
  profile,
}) => {
  const sanitized = useMemo(
    () =>
      profile === "highlight"
        ? DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ["span"],
            ALLOWED_ATTR: ["class"],
          })
        : DOMPurify.sanitize(html, {
            USE_PROFILES: { svg: true, svgFilters: true },
            FORBID_TAGS: [
              "script",
              "foreignObject",
              "iframe",
              "object",
              "embed",
              "image",
              "a",
            ],
            FORBID_ATTR: ["href", "xlink:href", "onload", "onclick"],
          }),
    [html, profile],
  );
  const Tag = as;
  return (
    <Tag
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
};
