import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ComposerContextBar } from "@/features/composer/components/ComposerContextBar";
import { MaterialIcon } from "@/shared/icons/material";
import { I18nProvider } from "@/shared/i18n";
import "@/shared/styles/globals.css";

const agents = [
  { key: "assistant", name: "通用助手", mode: "GENERAL" },
  { key: "coder", name: "编程助手", mode: "CODER" },
  { key: "long", name: "一个名称非常长的项目代码审查智能体", mode: "CODER" },
];
function Preview() {
  const [key, setKey] = useState("coder");
  const [dark, setDark] = useState(false);
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);
  const agent = agents.find(a => a.key === key)!;
  return <main data-theme={dark ? "dark" : "light"} style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-main)", padding: "48px 24px" }}>
    <div style={{ maxWidth: 800, margin: "auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>输入框上下文栏</h1>
      <p style={{ color: "var(--text-muted)", marginBottom: 32 }}>可切换智能体，检查 CODER 分支显示与长名称。</p>
      <button onClick={() => setDark(!dark)} style={{ marginBottom: 32 }}>切换{dark ? "浅色" : "深色"}</button>
      <ComposerContextBar agents={agents} currentAgentKey={key} currentWorkerName={agent.name} isCoder={agent.mode === "CODER"} onSelectAgent={setKey} />
      <div className="composer-pill tw:bg-[var(--control-input-bg)] tw:rounded-[var(--control-radius-lg)] tw:relative tw:flex tw:flex-col tw:border tw:border-border tw:p-1.5">
        <textarea aria-label="消息" placeholder="输入消息，开始对话…" style={{ background: "transparent", color: "inherit", border: 0, outline: 0, resize: "none", padding: 6, height: 100, fontSize: 13 }} />
        <div style={{ display: "flex", justifyContent: "space-between", padding: 6, color: "var(--text-muted)", fontSize: 12 }}>
          <span style={{ display: "flex", gap: 12, alignItems: "center" }}><MaterialIcon name="add" /><MaterialIcon name="verified_user" />默认权限</span>
          <span style={{ display: "flex", gap: 8, alignItems: "center" }}>默认模型<MaterialIcon name="expand_more" /><MaterialIcon name="arrow_upward" /></span>
        </div>
      </div>

    </div>
  </main>;
}
createRoot(document.getElementById("root")!).render(<I18nProvider locale="zh-CN" persistLocale={false}><Preview /></I18nProvider>);
