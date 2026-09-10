import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { App as AntdApp, Button, Dropdown, Input, Modal, Select, Switch, Tooltip } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { AppearanceProvider, useAppearance } from "@/features/appearance/components/AppearanceProvider";
import { AppearanceSettings } from "@/features/appearance/components/AppearanceSettings";
import { DESKTOP_SKINS } from "@/features/appearance/lib/skins";
import { AGENT_WEBCLIENT_APPEARANCE_COLOR_TOKENS, type AgentWebclientAppearanceSnapshot } from "@/shared/contracts/generated/agentWebclientBridge";
import { I18nProvider } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";
import { UserBubble } from "@/features/timeline/components/UserBubble";
import { ComposerInput } from "@/features/composer/components/ComposerInput";
import { IndependentSurfaceFrame } from "@/features/surfaces/components/IndependentSurfaceFrame";
import { applyBootAppearance } from "@/shared/styles/appearance/bootstrap";
import "@/shared/styles/globals.css";
import "@/features/timeline/components/Timeline.module.css";
import styles from "./appearance-preview.module.css";

const params = new URLSearchParams(location.search);
const desktop = params.get("mode") === "desktop";
const surface = params.get("surface") || "main";
globalThis.__AGENT_WEBCLIENT_RUNTIME_CONFIG__ = { DESKTOP_APP: desktop };
applyBootAppearance();
let hostSnapshot: AgentWebclientAppearanceSnapshot | null = null;
let revision = 0;
const listeners = new Set<(value: AgentWebclientAppearanceSnapshot | null) => void>();
function host(mode: "light" | "dark", skinId = "mist", transparent = true) {
  const skin = DESKTOP_SKINS.find((entry) => entry.id === skinId)!;
  const tokens = Object.fromEntries(Object.entries(skin.tokens[mode]).filter(([key]) => (AGENT_WEBCLIENT_APPEARANCE_COLOR_TOKENS as readonly string[]).includes(key)));
  hostSnapshot = { schemaVersion: 1, revision: ++revision, resolvedTheme: mode, skinId, tokens, background: { mode: transparent ? "host" : "opaque" } };
  listeners.forEach((listener) => listener(hostSnapshot));
}
if (desktop && !params.has("oldHost") && !(window as any).__AGENT_WEBCLIENT_APPEARANCE__) {
  Object.defineProperty(window, "__AGENT_WEBCLIENT_APPEARANCE__", { value: { version: 1, getSnapshot: async () => hostSnapshot, subscribe: (listener: (value: AgentWebclientAppearanceSnapshot | null) => void) => { listeners.add(listener); return () => listeners.delete(listener); } } });
  host("light", "mist", surface === "main");
}
// Test controls exist only in this separate QA entry, never in the product bundle.
(window as any).__appearanceQA = { host, revoke: () => { hostSnapshot = null; listeners.forEach((listener) => listener(null)); } };

function Preview() {
  const appearance = useAppearance();
  const [settings, setSettings] = useState(false);
  const [draft, setDraft] = useState("请检查皮肤切换后，这份草稿、附件和审批是否还在。");
  const [modalOpen, setModalOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [chunks, setChunks] = useState(0);
  const [approved, setApproved] = useState(false);
  const identity = useRef(`mount-${Math.random().toString(36).slice(2)}`);
  const inputRef = useRef<TextAreaRef>(null);
  const { modal } = AntdApp.useApp();
  useEffect(() => {
    if (!streaming) return;
    const timer = setInterval(() => setChunks((value) => value + 1), 200);
    return () => clearInterval(timer);
  }, [streaming]);
  (window as any).__appearanceQA.controller = appearance.controller;
  (window as any).__appearanceQA.state = { draft, chunks, identity: identity.current, approved };
  const content = <>
    <div className={styles.toolbar}>
      <strong>{desktop ? "Desktop" : "Standalone"} · {surface === "main" ? "主聊天" : surface === "copilot" ? "Copilot" : "Overview / Debug"}</strong>
      <div className={styles.actions}>
        {desktop ? <>
          <Button onClick={() => host(appearance.resolvedTheme === "light" ? "dark" : "light", appearance.skin.id, surface === "main")}>宿主明暗</Button>
          <Button onClick={() => host(appearance.resolvedTheme, appearance.skin.id === "mist" ? "default" : "mist", surface === "main")}>宿主皮肤</Button>
          <Button onClick={() => (window as any).__appearanceQA.revoke()}>能力失效</Button>
        </> : <Button onClick={() => setSettings(true)}>外观设置</Button>}
        <Tooltip title="浮层使用独立阅读表面"><Button onClick={() => setModalOpen(true)}>审批弹窗</Button></Tooltip>
        <Dropdown menu={{ items: [{ key: "one", label: "打开详情" }, { key: "two", label: "复制链接" }, { key: "disabled", label: "不可用操作", disabled: true }] }} trigger={["click"]}><Button>菜单</Button></Dropdown>
      </div>
    </div>
    <main className={styles.messages} data-testid="messages" data-mount={identity.current}>
      <div className={styles.column}>
        <UserBubble text="我们一起检查浅色、深色和图片皮肤的阅读效果。" />
        <article className={styles.reading}>
          <p className={styles.eyebrow}>AGENT · APPEARANCE LAB</p>
          <h1>让背景留在背景里</h1>
          <p>文字、代码、输入和审批拥有清晰的表面。切换外观时，正在进行的工作持续保留。</p>
          <pre>const appearance = await host.getSnapshot();<br />// 独立订阅，不导航、不重新加载页面</pre>
          <div className={styles.actions}>
            <UiButton variant="primary">主要按钮</UiButton><UiButton>普通按钮</UiButton><UiButton disabled>不可用</UiButton>
            <Button type="primary">Ant Design</Button><Select defaultValue="balanced" options={[{ value: "balanced", label: "标准模式" }, { value: "fast", label: "快速模式" }]} />
          </div>
        </article>
        <article className={styles.reading}>
          <strong>待处理审批</strong><p>{approved ? "已批准" : "允许继续处理这份演示文件？"}</p>
          <Input placeholder="补充说明" data-testid="approval-input" />
          <div className={styles.actions}><Button type="primary" onClick={() => setApproved(true)}>批准</Button><Button onClick={() => modal.confirm({ title: "确认拒绝", content: "此对话框挂载在 body，仍继承当前皮肤。" })}>确认对话框</Button></div>
        </article>
        <article className={styles.reading}>
          <Switch checked={streaming} onChange={setStreaming} /> 流式输出 <span data-testid="chunks">{chunks}</span>
          {Array.from({ length: 12 }, (_, index) => <p key={index}>事件 {index + 1} · 已接收工具输出，保持消息阅读区和滚动位置。</p>)}
        </article>
      </div>
    </main>
    <footer className={styles.composer}>
      <div className={styles.attachment} data-testid="attachment">reference.png · 演示附件</div>
      <ComposerInput isVoiceMode={false} isFrontendActive={false} isTimelineEmpty={false} inputValue={draft} onInputChange={setDraft}
        currentWorkerName="演示 Agent" voiceStatus="idle" voiceError="" partialUserText="" partialAssistantText=""
        onKeyDown={() => {}} onPaste={() => {}} onDragOver={() => {}} onDrop={() => {}} onCompositionStart={() => {}} onCompositionEnd={() => {}} textareaRef={inputRef} />
      <div className={styles.actions}><span data-testid="status">{appearance.resolvedTheme} · {appearance.skin.id} · {appearance.backgroundMode}</span><Button type="primary">发送</Button></div>
    </footer>
  </>;
  return <>
    <nav className={styles.scenarios}>
      <span>隔离外观演示 · 无业务服务</span>
      <a href="/">Standalone</a><a href="/?mode=desktop">Desktop 主聊天</a><a href="/?mode=desktop&surface=copilot">Copilot</a><a href="/?mode=desktop&surface=panel">WorkPanel</a><a href="/?mode=desktop&oldHost&hostTheme=dark">旧宿主回退</a>
    </nav>
    <div className={`${styles.shell} ${surface !== "main" ? styles.dense : ""}`}>
      {surface === "panel" ? <IndependentSurfaceFrame kind="overview">{content}</IndependentSurfaceFrame> : content}
    </div>
    <Modal title="外观与皮肤" open={settings} onCancel={() => setSettings(false)} footer={null}><AppearanceSettings /></Modal>
    <Modal title="审批 · 皮肤更新不会关闭此窗口" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => setModalOpen(false)}><Input placeholder="输入待保留的内容" /></Modal>
  </>;
}
createRoot(document.getElementById("root")!).render(<I18nProvider locale="zh-CN"><AppearanceProvider><Preview /></AppearanceProvider></I18nProvider>);
