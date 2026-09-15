/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "@/shared/i18n";
import { isAppMode } from "@/shared/utils/routing";
import { CONNECTOR_AUTH_BROWSER_GLOBAL } from "@/shared/contracts/generated/agentWebclientBridge";
import { ConnectorAuthBrowser } from "./ConnectorAuthBrowser";
import type { ConnectorAuthRuntime } from "../hooks/useConnectorAuth";
jest.mock("@/shared/utils/routing", () => ({ isAppMode: jest.fn(() => false) }));
jest.mock("antd", () => ({ Modal: ({ open, children, onCancel }: any) => open ? React.createElement("section", {role:"dialog"}, children, React.createElement("button", {onClick:onCancel}, "close")) : null }));
let node: HTMLDivElement, root: Root;
const bridge = {version:1, open:jest.fn(async()=>{}), close:jest.fn(async()=>{}), subscribe:jest.fn(()=>()=>{})};
const runtime = (change: Partial<ConnectorAuthRuntime> = {}): ConnectorAuthRuntime => ({
 identity:"wecom/null/false", browserSessionId:"first", browserRequestRevision:1,
 session:{connectorId:"wecom",sessionId:"first",status:"pending",authBrowser:"embedded",authorizationUrl:"https://work.weixin.qq.com/login",expiresAt:new Date(Date.now()+60000).toISOString()},
 status:"pending",checking:false,operation:null,error:null,start:jest.fn(async()=>{}),cancel:jest.fn(async()=>{}),logout:jest.fn(async()=>{}),refresh:jest.fn(async()=>{}),openBrowser:jest.fn(async()=>{}),...change,
});
const render = async(auth:ConnectorAuthRuntime) => { await act(async()=>root.render(React.createElement(I18nProvider, { locale: "zh-CN", persistLocale: false }, React.createElement(ConnectorAuthBrowser, { auth })))); };
beforeEach(()=>{ (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true; node=document.createElement("div");document.body.append(node);root=createRoot(node);jest.clearAllMocks();jest.mocked(isAppMode).mockReturnValue(false);(window as any)[CONNECTOR_AUTH_BROWSER_GLOBAL]=bridge; });
afterEach(async()=>{await act(async()=>root.unmount());node.remove();delete (window as any)[CONNECTOR_AUTH_BROWSER_GLOBAL];});
it("embeds only an explicitly requested session and closes on server success", async()=>{
 const auth=runtime(); await render({...auth,browserSessionId:null});expect(node.querySelector("iframe")).toBeNull();
 await render(auth);const frame=node.querySelector("iframe")!;expect(frame.src).toBe(auth.session!.authorizationUrl);expect(frame.sandbox?.toString() || frame.getAttribute("sandbox")).toBe("allow-scripts allow-forms allow-same-origin");
 expect(node.querySelector("a")).toBeNull();expect(bridge.open).not.toHaveBeenCalled();
 await render({...auth,status:"authorized"});expect(node.querySelector("iframe")).toBeNull();
});
it("uses the Desktop bridge without sending an arbitrary URL, ignores stale close events, and does not reopen on polling", async()=>{
 jest.mocked(isAppMode).mockReturnValue(true);const auth=runtime();await render(auth);
 expect(bridge.open).toHaveBeenCalledWith({connectorId:"wecom",sessionId:"first"});expect(node.querySelector("iframe")).toBeNull();
 await render({...auth,checking:true});expect(bridge.open).toHaveBeenCalledTimes(1);
 const closed=(bridge.subscribe.mock.calls[0] as any)[0];closed({connectorId:"wecom",sessionId:"old"});expect(auth.cancel).not.toHaveBeenCalled();
 closed({connectorId:"wecom",sessionId:"first"});expect(auth.cancel).toHaveBeenCalledTimes(1);
 await render({...auth,browserRequestRevision:2});expect(bridge.open).toHaveBeenCalledTimes(2);
 await render({...auth,status:"authorized"});expect(bridge.close).toHaveBeenCalledWith({connectorId:"wecom",sessionId:"first"});
});
it("does not fall back to iframe or external browser when the Desktop bridge is missing",async()=>{
 jest.mocked(isAppMode).mockReturnValue(true);delete (window as any)[CONNECTOR_AUTH_BROWSER_GLOBAL];await render(runtime());
 expect(node.querySelector('[role="alert"]')).not.toBeNull();expect(node.querySelector("iframe,a")).toBeNull();
});
it("closes only through cancellation and does not declare success on iframe load",async()=>{
 const auth=runtime();await render(auth);await act(async()=>node.querySelector("iframe")!.dispatchEvent(new Event("load")));
 expect(auth.refresh).not.toHaveBeenCalled();expect(node.querySelector('[role="dialog"]')).not.toBeNull();
 await act(async()=>Array.from(node.querySelectorAll("button")).find(x=>x.textContent==="close")!.click());expect(auth.cancel).toHaveBeenCalledTimes(1);
});
