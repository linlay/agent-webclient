import React, { useEffect, useState } from "react";
import { MERMAID_CDN_ASSET } from "./cdnAssets";
import { DiagramFallback, DiagramLoading } from "./DiagramPlaceholder";
import { loadCdnScript } from "./loadCdnScript";
import { SanitizedMarkup } from "./SanitizedMarkup";
import styles from "./ConversationExportDocument.module.css";

type MermaidGlobal = {
  initialize(config: Record<string, unknown>): void;
  parse(source: string): boolean | Promise<boolean>;
  render(id: string, source: string): Promise<{ svg: string }>;
};

let mermaidInitialized = false;
let mermaidRenderSequence = 0;

export const StaticMermaid: React.FC<{ source: string }> = ({ source }) => {
  const [svg, setSvg] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void loadCdnScript(MERMAID_CDN_ASSET)
      .then(async () => {
        const mermaid = (globalThis as typeof globalThis & { mermaid?: MermaidGlobal })
          .mermaid;
        if (!mermaid) throw new Error("mermaid_missing");
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            suppressErrorRendering: true,
          });
          mermaidInitialized = true;
        }
        await mermaid.parse(source);
        mermaidRenderSequence += 1;
        return mermaid.render(`conversation-export-mermaid-${mermaidRenderSequence}`, source);
      })
      .then((result) => {
        if (active) setSvg(result.svg);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [source]);

  if (failed) return <DiagramFallback language="mermaid" source={source} />;
  return svg ? (
    <SanitizedMarkup
      as="div"
      className={styles.mermaid}
      html={svg}
      profile="mermaid"
    />
  ) : (
    <DiagramLoading />
  );
};
