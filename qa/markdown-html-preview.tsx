import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from "antd";
import { I18nProvider } from "../src/shared/i18n";
import { ConversationMarkdown } from "../src/shared/ui/ConversationMarkdown";
import { ConversationMarkdownCode, type ConversationMarkdownCodeProps } from "../src/shared/ui/markdown-code/ConversationMarkdownCode";
import "../src/shared/styles/globals.css";

const Code = (props: ConversationMarkdownCodeProps) => <ConversationMarkdownCode {...props} htmlPreview />;
const fence = (html: string) => `\`\`\`html\n${html}\n\`\`\``;

function Preview() {
  const [html, setHtml] = useState("");
  const [tail, setTail] = useState("");
  const [streaming, setStreaming] = useState(false);
  useEffect(() => {
    fetch("/assets/visualization/example.html").then(response => response.text()).then(setHtml);
    (window as any).setHtmlPreviewFixture = (source: string, isStreaming = false) => { setHtml(source); setTail(""); setStreaming(isStreaming); };
  }, []);
  return <ConfigProvider><I18nProvider locale="zh-CN" persistLocale={false}>
    <main style={{ maxWidth: 920, margin: "24px auto", padding: 16 }}>
      <h1>HTML 消息预览验证</h1>
      <button id="append" onClick={() => setTail(current => `${current}\n\n正文继续输出。`)}>追加正文</button>
      <button id="many" onClick={() => setHtml([html, html.replace("本地图表运行时", "第二张图表"), html.replace("本地图表运行时", "第三张图表")].map(fence).join("\n\n"))}>显示多个预览</button>
      <ConversationMarkdown content={`${html.startsWith("```") ? html : fence(html)}${tail}`} isStreaming={streaming} codeComponent={Code} />
    </main>
  </I18nProvider></ConfigProvider>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
