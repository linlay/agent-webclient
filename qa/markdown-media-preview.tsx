import React from "react";
import { createRoot } from "react-dom/client";
import { ConfigProvider } from "antd";
import { I18nProvider } from "../src/shared/i18n";
import { MarkdownContent } from "../src/features/viewers/components/MarkdownContent";
import "../src/shared/styles/globals.css";

const samples = [
  ["workspace-image", "Workspace 图片", "![debug-sidebar](@workspace/docs/images/screenshots/debug-sidebar.png)"],
  ["workspace-video", "Workspace 视频（空格路径）", "![期权诞生 短片](@workspace/videos/期权诞生 短片.mp4)"],
  ["workspace-audio", "Workspace 音频", "![音频](@workspace/audio/preview.wav)"],
  ["absolute-video", "绝对路径视频（原始写法）", "![期权诞生 短片.mp4](/media-qa/期权诞生 短片.mp4)"],
  ["tmp-image", "临时目录图片", "![临时图片](/tmp/media-qa.png)"],
];

createRoot(document.getElementById("root")!).render(<ConfigProvider><I18nProvider locale="zh-CN" persistLocale={false}>
  <main style={{ maxWidth: 900, padding: 24, margin: "auto" }}>
    <h1>Markdown 媒体验证</h1>
    {samples.map(([id, title, content]) => <section key={id} id={id}>
      <h2>{title}</h2>
      <MarkdownContent content={content} chatId="media-qa-chat" agentKey="media-qa-owner" />
    </section>)}
  </main>
</I18nProvider></ConfigProvider>);
