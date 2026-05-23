import { useEffect, useId, useRef, useState } from "react";

type RenderState =
  | { status: "empty" }
  | { status: "loading" }
  | { status: "ready"; svg: string }
  | { status: "error"; message: string };

export function getMermaidRenderConfig(theme: "default" | "dark") {
  return {
    startOnLoad: false,
    securityLevel: "strict" as const,
    suppressErrorRendering: true,
    flowchart: {
      htmlLabels: true,
      curve: "basis" as const,
    },
    theme,
  };
}

function getMermaidTheme(): "default" | "dark" {
  if (typeof document === "undefined") return "default";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "default";
}

export const MarkdownMermaid: React.FC<{
  code: string;
  streamStatus?: "loading" | "done";
}> = ({ code, streamStatus }) => {
  const reactId = useId();
  const renderBaseId = useRef(
    `markdown-mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
  );
  const renderCount = useRef(0);
  const [state, setState] = useState<RenderState>({ status: "loading" });
  const [theme, setTheme] = useState<"default" | "dark">(getMermaidTheme);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const observer = new MutationObserver(() => {
      setTheme(getMermaidTheme());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const source = code.trim();
    if (!source) {
      setState({ status: "empty" });
      return;
    }

    let disposed = false;
    setState({ status: "loading" });

    void import("mermaid")
      .then(async (module) => {
        if (disposed) return;

        const mermaid = module.default;
        mermaid.initialize(getMermaidRenderConfig(theme));
        const parseResult = await mermaid.parse(source, {
          suppressErrors: true,
        });
        if (!parseResult) {
          throw new Error("Mermaid 语法解析失败。");
        }

        renderCount.current += 1;
        const result = await mermaid.render(
          `${renderBaseId.current}-${renderCount.current}`,
          source,
        );

        if (!disposed) {
          setState({ status: "ready", svg: result.svg });
        }
      })
      .catch((error: unknown) => {
        if (disposed) return;
        setState({
          status: "error",
          message:
            error instanceof Error ? error.message : "Mermaid 图表渲染失败。",
        });
      });

    return () => {
      disposed = true;
    };
  }, [code, theme]);

  if (state.status === "ready") {
    return (
      <div
        className="markdown-mermaid"
        dangerouslySetInnerHTML={{ __html: state.svg }}
      />
    );
  }

  const text =
    state.status === "empty" || streamStatus === "loading"
      ? "Mermaid 图表接收中…"
      : state.status === "error"
        ? `Mermaid 图表渲染失败：${state.message}`
        : "Mermaid 图表渲染中…";

  return <div className="markdown-mermaid markdown-mermaid-status">{text}</div>;
};
