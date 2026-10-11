import React, {useCallback, useEffect, useMemo, useState} from "react";
import {createRoot} from "react-dom/client";
import {App, ConfigProvider, theme} from "antd";
import {I18nProvider} from "@/shared/i18n";
import {AddMenuTrigger} from "@/features/composer/components/ComposerAddMenu";
import {KBaseSelectionTags} from "@/features/kbases/components/KBaseSelectionTags";
import type {KBaseCatalog} from "@/features/kbases/hooks/useKBaseOptions";
import type {KBaseOption} from "@/shared/data/api/dto/kbases";
import type {SelectedKBase} from "@/features/kbases/lib/kbasesState";
import {interactionDefaults} from "@/shared/contracts/interaction";
import {buildQueryPayload} from "@/shared/data/api/endpoints";
import "@/shared/styles/globals.css";
const libraries: KBaseOption[] = [
 {id: "product", name: "产品文档", description: "产品能力、使用说明与发布记录", collections: [{name: "产品", description: "产品说明"}], readable: true, indexing: false, degraded: false},
 {id: "engineering", name: "工程规范", description: "架构约定、开发规范与验收标准", collections: [], readable: true, indexing: true, degraded: false},
 {id: "wiki", name: "团队知识", description: "团队流程与常见问题", collections: [], readable: true, indexing: false, degraded: true},
 {id: "support", name: "售后资料", description: "首次索引尚未完成", collections: [], readable: false, indexing: true, degraded: false, unavailableReason: "首次索引尚未完成"},
 {id: "archive", name: "归档参考", description: "历史资料与标准", collections: [], readable: true, indexing: false, degraded: false},
 ...Array.from({length: 5}, (_, i) => ({id: `reference-${i + 1}`, name: `参考资料 ${i + 1}`, description: "用于验证多选数量限制", collections: [], readable: true, indexing: false, degraded: false})),
];
function Preview() {
 const [dark, setDark] = useState(false);
 const [scenario, setScenario] = useState("normal");
 const [chat, setChat] = useState("chat-a");
 const [selectedByChat, setSelectedByChat] = useState<Record<string, SelectedKBase[]>>({"chat-a": libraries.slice(0,2).map(({id,name}) => ({id,name}))});
 const selected = selectedByChat[chat] || [];
 const [status, setStatus] = useState<KBaseCatalog["status"]>("idle");
 const [message, setMessage] = useState("");
 const [payload, setPayload] = useState<Record<string, unknown>>();
 const refresh = useCallback(() => {setStatus("loading"); window.setTimeout(() => setStatus(scenario === "error" ? "error" : scenario === "loading" ? "loading" : "success"), 450);}, [scenario]);
 useEffect(() => {document.documentElement.dataset.theme = dark ? "dark" : "light";}, [dark]);
 const catalog = useMemo<KBaseCatalog>(() => ({status, refresh, error: "kbase.protocolUnavailable", data: status === "success" ? {agentKey: "general", boundLibraryId: "fixed", capability: {available: scenario !== "unavailable", reason: "请先为智能体挂载知识库检索连接器"}, libraries: scenario === "empty" ? [] : libraries} : undefined}), [status, refresh, scenario]);
 return <ConfigProvider theme={{algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm}}><App>
  <main style={{minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-main)", padding: "36px 20px"}}>
   <div style={{maxWidth: 760, margin: "auto"}}>
    <h1 style={{fontSize: 22}}>通用智能体 · 知识库选择</h1>
    <p style={{color: "var(--text-muted)"}}>隔离 fixture，复用实际 ＋菜单、知识库选择器和标签组件。这里的发送仅展示请求快照。</p>
    <div style={{display: "flex", gap: 12, margin: "24px 0", flexWrap: "wrap"}}>
     <button onClick={() => setDark(value => !value)}>切换主题</button>
     <select aria-label="场景" value={scenario} onChange={event => {setScenario(event.target.value); setStatus("idle");}}>{["normal","loading","empty","error","unavailable"].map(item => <option key={item}>{item}</option>)}</select>
     <select aria-label="Chat" value={chat} onChange={event => setChat(event.target.value)}><option>chat-a</option><option>chat-b</option><option>new-chat</option></select>
    </div>
    {payload && <div style={{padding: 16, marginBottom: 20, background: "var(--bg-elev-2)", borderRadius: 12}}><strong>本次请求快照</strong><pre style={{whiteSpace: "pre-wrap", fontSize: 12}}>{JSON.stringify(payload,null,2)}</pre></div>}
    <div style={{background: "var(--control-input-bg)", border: "1px solid var(--line-soft)", borderRadius: 14, padding: 12}}>
     <KBaseSelectionTags selected={selected} boundLibrary={{id: "fixed", name: "固定绑定资料"}} onChange={items => setSelectedByChat(current => ({...current, [chat]: items}))} />
     <textarea aria-label="消息" value={message} onChange={event => setMessage(event.target.value)} placeholder="输入消息，＋菜单选择一个或多个知识库…" style={{display: "block", width: "100%", minHeight: 100, border: 0, background: "transparent", color: "inherit", resize: "vertical", padding: 8}} />
     <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 6}}>
      <AddMenuTrigger disabled={false} loading={false} currentChatId={chat} currentAgentKey="general" interactionConfig={interactionDefaults("GENERAL")} planningMode={false} editingMode={false} canUsePlanningMode={false} canUseEditingMode={false} isMainChatRunning={false} canCaptureDesktopScreenshot={false} isCapturingDesktopScreenshot={false} selectedSkillIds={[]} onOpenFilePicker={() => {}} onCaptureScreenshot={() => {}} onAddReference={() => {}} onTogglePlanningMode={() => {}} onEditingModeChange={() => {}} onSelectSkill={() => {}} kbaseCatalog={catalog} selectedKbases={selected} onSelectKbases={items => setSelectedByChat(current => ({...current,[chat]: items}))} />
      <button onClick={() => {setPayload(buildQueryPayload({requestId: "fixture", message, owner: {kind: "agent", agentKey: "general"}, mustUseKbases: selected.map(item => item.id)})); setMessage("");}}>发送快照</button>
     </div>
    </div>
   </div>
  </main>
 </App></ConfigProvider>;
}
createRoot(document.getElementById("root")!).render(<I18nProvider locale="zh-CN" persistLocale={false}><Preview /></I18nProvider>);
