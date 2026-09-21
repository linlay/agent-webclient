/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { SelectionAnnotations } from "./SelectionAnnotations";
import { rememberSelectedTextAnchor } from "@/shared/data/desktop/selectedTextAnchors";
import { SELECTED_TEXT_REFERENCE_FOCUS_EVENT } from "@/shared/data/desktop/selectedTextLocate";
import { createSelectedTextFragment } from "@/shared/contracts/selectedTextReference";

jest.mock("@/shared/i18n",()=>({useI18n:()=>({t:(key:string,params?:{index:number})=>`${key} ${params?.index || ""}`})}));

const mockForceAlignAnchors:string[]=[];

jest.mock("antd",()=>({
  // 透传额外属性：Popover 把 data-popover-open 塞在 Tooltip 元素上，桩必须继续往下传。
  // 同时保持 antd 的可见性语义：title 为空、或 tooltip 被显式关闭时不渲染提示。
  Tooltip:(props:{title?:string;open?:boolean;children:React.ReactElement<Record<string,unknown>>}&Record<string,unknown>)=>{
    const {title,open,children,...rest}=props;
    const hint=open===false||!title?{}:{"data-tooltip":title};
    return React.cloneElement(children,{...hint,...rest});
  },
  // 编辑器用的是 antd 的 TextArea，桩成真 textarea：用例要读 value、焦点和键盘事件。
  Input:{
    TextArea:React.forwardRef(function TextAreaMock(
      props:Record<string,unknown>,
      ref:React.ForwardedRef<HTMLTextAreaElement>,
    ){
      const {autoSize,variant,...rest}=props;
      void autoSize; void variant;
      return React.createElement("textarea",{...rest,ref});
    }),
  },
  Popover:React.forwardRef(function PopoverMock(
    props:{open?:boolean;content?:React.ReactNode;children:React.ReactElement<Record<string,unknown>>},
    ref:React.ForwardedRef<{forceAlign:()=>void}>,
  ){
    React.useImperativeHandle(ref,()=>({
      forceAlign:()=>{mockForceAlignAnchors.push(document.querySelector<HTMLElement>("[data-selection-marker-anchor]")?.style.left || "");},
    }));
    return React.createElement(React.Fragment,null,
      React.cloneElement(props.children,{"data-popover-open":String(!!props.open)}),
      props.open?props.content:null);
  }),
}));

const highlightIds=()=>Array.from(document.querySelectorAll<HTMLElement>("[data-selection-highlight]")).map(node=>node.dataset.selectionHighlight!);
const hoverHint=()=>document.querySelector<HTMLElement>("[data-selection-marker-anchor]")?.dataset.tooltip;
const openPopovers=()=>document.querySelectorAll('[data-popover-open="true"]').length;
const anchorLeft=(right:number)=>`${Math.min(window.innerWidth-30,Math.max(4,right-11))}px`;
const anchorLeftNow=()=>document.querySelector<HTMLElement>("[data-selection-marker-anchor]")!.style.left;

it("opens an anchored editor, commits the comment on Enter, and discards a draft on Escape", () => {
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const text=document.createElement("p"); text.textContent="selected passage"; document.body.append(text);
  const root=createRoot(document.createElement("div"));
  const rect={left:100,top:200,right:260,bottom:224,width:160,height:24};
  const previous=Object.getOwnPropertyDescriptor(Range.prototype,"getClientRects");
  Object.defineProperty(Range.prototype,"getClientRects",{configurable:true,value:()=>[rect]});
  const range=document.createRange(); range.selectNodeContents(text);
  const fragment=createSelectedTextFragment({text:"selected passage",targetId:"m1",sourceKind:"message"})!;
  fragment.reference.annotationIndex=7;
  rememberSelectedTextAnchor(fragment.reference.id,range,fragment.reference.text);
  const change=jest.fn();
  const remove=jest.fn();
  const render=()=>root.render(React.createElement(SelectionAnnotations,{fragments:[fragment],onAnnotationChange:change,onRemove:remove}));
  try {
    act(render);
    let input=document.querySelector("textarea")!;
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
    expect(openPopovers()).toBe(1);
    const badge=document.querySelector<HTMLButtonElement>("[data-selection-marker]")!;
    expect(badge.textContent).toBe("7");
    expect(document.querySelector('[data-material-icon="mic"]')).toBeNull();
    expect(highlightIds()).toEqual([fragment.reference.id]);
    expect(hoverHint()).toBeUndefined();
    // 打字只改本地草稿：引用上的批注要等回车确认才更新。
    act(()=>{input.value="comment";Simulate.change(input);});
    expect(change).not.toHaveBeenCalled();
    expect(input.value).toBe("comment");
    // Escape 等同于放弃，草稿不会被写回。
    act(()=>Simulate.keyDown(input,{key:"Escape"}));
    expect(change).not.toHaveBeenCalled();
    expect(document.querySelector("textarea")).toBeNull();
    expect(openPopovers()).toBe(0);
    expect(hoverHint()).toBeUndefined();
    // 重新打开拿到的是已存批注（空），草稿已经丢掉。
    act(()=>badge.click());
    input=document.querySelector("textarea")!;
    expect(input.value).toBe("");
    act(()=>{input.value="comment";Simulate.change(input);});
    expect(change).not.toHaveBeenCalled();
    act(()=>Simulate.keyDown(input,{key:"Enter"}));
    expect(change).toHaveBeenCalledWith(fragment.reference.id,"comment");
    expect(document.querySelector("textarea")).toBeNull();
    expect(openPopovers()).toBe(0);
    expect(highlightIds()).toEqual([]);
    fragment.reference.annotation="comment";
    act(render);
    expect(hoverHint()).toBe("comment");
    act(()=>badge.click());
    input=document.querySelector("textarea")!;
    expect(input.value).toBe("comment");
    expect(openPopovers()).toBe(1);
    expect(badge.textContent).toBe("7");
    expect(highlightIds()).toEqual([fragment.reference.id]);
    expect(hoverHint()).toBeUndefined();
    act(()=>document.querySelector<HTMLButtonElement>('[aria-label="selection.fragment.confirmAnnotation "]')!.click());
    expect(document.querySelector("textarea")).toBeNull();
    expect(highlightIds()).toEqual([]);
    expect(hoverHint()).toBe("comment");
    act(()=>badge.click());
    input=document.querySelector("textarea")!;
    // 清空同样要回车确认，才会按协议去掉批注。
    act(()=>{input.value="";Simulate.change(input);});
    expect(change).toHaveBeenCalledTimes(1);
    act(()=>Simulate.keyDown(input,{key:"Enter"}));
    expect(change).toHaveBeenLastCalledWith(fragment.reference.id,"");
    act(()=>badge.click());
    input=document.querySelector("textarea")!;
    act(()=>document.querySelector<HTMLButtonElement>('[aria-label="selection.fragment.remove 7"]')!.click());
    expect(remove).toHaveBeenCalledWith(fragment.reference.id);
    expect(document.querySelector("textarea")).toBeNull();
    expect(highlightIds()).toEqual([]);
  } finally {
    act(()=>root.unmount()); text.remove();
    if(previous) Object.defineProperty(Range.prototype,"getClientRects",previous);
    else delete (Range.prototype as any).getClientRects;
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  }
});

it("highlights only the fragment whose marker is open", () => {
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const text=document.createElement("p"); text.textContent="selected passage"; document.body.append(text);
  const root=createRoot(document.createElement("div"));
  const rect={left:100,top:200,right:260,bottom:224,width:160,height:24};
  const previous=Object.getOwnPropertyDescriptor(Range.prototype,"getClientRects");
  Object.defineProperty(Range.prototype,"getClientRects",{configurable:true,value:()=>[rect]});
  const range=document.createRange(); range.selectNodeContents(text);
  const first=createSelectedTextFragment({text:"selected passage",targetId:"m1",sourceKind:"message"})!;
  const second=createSelectedTextFragment({text:"selected passage",targetId:"m1",sourceKind:"message"})!;
  first.reference.annotationIndex=1; second.reference.annotationIndex=2;
  rememberSelectedTextAnchor(first.reference.id,range,first.reference.text);
  rememberSelectedTextAnchor(second.reference.id,range,second.reference.text);
  try {
    act(()=>root.render(React.createElement(SelectionAnnotations,{fragments:[first,second],onAnnotationChange:jest.fn(),onRemove:jest.fn()})));
    expect(document.querySelectorAll("[data-selection-marker]")).toHaveLength(2);
    expect(highlightIds()).toEqual([second.reference.id]);
    act(()=>document.querySelector<HTMLButtonElement>(`[data-selection-marker="${first.reference.id}"]`)!.click());
    expect(highlightIds()).toEqual([first.reference.id]);
  } finally {
    act(()=>root.unmount()); text.remove();
    if(previous) Object.defineProperty(Range.prototype,"getClientRects",previous);
    else delete (Range.prototype as any).getClientRects;
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  }
});

it("re-aligns the open popover after the marker anchor moves", () => {
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const text=document.createElement("p"); text.textContent="selected passage"; document.body.append(text);
  const root=createRoot(document.createElement("div"));
  let rect={left:100,top:200,right:260,bottom:224,width:160,height:24};
  const previous=Object.getOwnPropertyDescriptor(Range.prototype,"getClientRects");
  Object.defineProperty(Range.prototype,"getClientRects",{configurable:true,value:()=>[rect]});
  const range=document.createRange(); range.selectNodeContents(text);
  const fragment=createSelectedTextFragment({text:"selected passage",targetId:"m1",sourceKind:"message"})!;
  fragment.reference.annotationIndex=3;
  rememberSelectedTextAnchor(fragment.reference.id,range,fragment.reference.text);
  mockForceAlignAnchors.length=0;
  const render=()=>root.render(React.createElement(SelectionAnnotations,{fragments:[fragment],onAnnotationChange:jest.fn(),onRemove:jest.fn()}));
  try {
    act(render);
    expect(anchorLeftNow()).toBe(anchorLeft(260));
    expect(mockForceAlignAnchors[mockForceAlignAnchors.length-1]).toBe(anchorLeft(260));
    // 选区位移后 Popover 自己发现不了（锚点挂在 body 下，滚动发生在 .messages-scroll 内部），
    // 必须在 DOM 更新之后把锚点的新位置重新推给它。
    rect={left:200,top:300,right:360,bottom:324,width:160,height:24};
    fragment.reference.annotation="moved";
    act(render);
    expect(anchorLeftNow()).toBe(anchorLeft(360));
    expect(mockForceAlignAnchors[mockForceAlignAnchors.length-1]).toBe(anchorLeft(360));
  } finally {
    act(()=>root.unmount()); text.remove();
    if(previous) Object.defineProperty(Range.prototype,"getClientRects",previous);
    else delete (Range.prototype as any).getClientRects;
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  }
});

it("keeps the marker when the quoted row is unmounted and rendered again by a chat switch", async () => {
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const build=()=>{
    const row=document.createElement("div");
    row.setAttribute("data-node-id","message-1");
    const paragraph=document.createElement("p");
    paragraph.textContent="selected passage";
    row.append(paragraph);
    document.body.append(row);
    return {row,paragraph};
  };
  const first=build();
  const root=createRoot(document.createElement("div"));
  const rect={left:100,top:200,right:260,bottom:224,width:160,height:24};
  const previous=Object.getOwnPropertyDescriptor(Range.prototype,"getClientRects");
  // 只有真正覆盖这段引用的 range 才会报出矩形，标记重现就等同于引用被重新定位到了新节点上。
  Object.defineProperty(Range.prototype,"getClientRects",{configurable:true,value:function(this:Range){return this.toString().trim()==="selected passage"?[rect]:[];}});
  const range=document.createRange(); range.selectNodeContents(first.paragraph);
  const fragment=createSelectedTextFragment({text:"selected passage",targetId:"message:message-1",sourceKind:"message"})!;
  fragment.reference.annotationIndex=2;
  rememberSelectedTextAnchor(fragment.reference.id,range,fragment.reference.text);
  const render=()=>root.render(React.createElement(SelectionAnnotations,{fragments:[fragment],onAnnotationChange:jest.fn(),onRemove:jest.fn()}));
  const badges=()=>document.querySelectorAll("[data-selection-marker]");
  // 标记重算挂在 rAF 上（滚动/变更节流），jsdom 里等一帧。
  const settleFrame=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,50));});
  try {
    act(render);
    expect(badges()).toHaveLength(1);

    // 切走：消息行连同它的 Range 一起被卸载。
    first.row.remove();
    await settleFrame();
    expect(badges()).toHaveLength(0);

    // 切回来：同一 node id，但是一批全新的 DOM 节点。
    build();
    await settleFrame();
    expect(badges()).toHaveLength(1);
    expect(badges()[0].textContent).toBe("2");
  } finally {
    act(()=>root.unmount());
    document.querySelectorAll("[data-node-id]").forEach(node=>node.remove());
    if(previous) Object.defineProperty(Range.prototype,"getClientRects",previous);
    else delete (Range.prototype as any).getClientRects;
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  }
});

it("reveals and highlights a reference when the quote list asks to locate it", () => {
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const text=document.createElement("p"); text.textContent="selected passage"; document.body.append(text);
  const root=createRoot(document.createElement("div"));
  const rect={left:100,top:200,right:260,bottom:224,width:160,height:24};
  const previous=Object.getOwnPropertyDescriptor(Range.prototype,"getClientRects");
  Object.defineProperty(Range.prototype,"getClientRects",{configurable:true,value:()=>[rect]});
  const previousScroll=Object.getOwnPropertyDescriptor(HTMLElement.prototype,"scrollIntoView");
  const scroll=jest.fn();
  HTMLElement.prototype.scrollIntoView=scroll;
  const range=document.createRange(); range.selectNodeContents(text);
  const fragment=createSelectedTextFragment({text:"selected passage",targetId:"m1",sourceKind:"message"})!;
  fragment.reference.annotationIndex=4;
  rememberSelectedTextAnchor(fragment.reference.id,range,fragment.reference.text);
  const render=()=>root.render(React.createElement(SelectionAnnotations,{fragments:[fragment],onAnnotationChange:jest.fn(),onRemove:jest.fn()}));
  const request=(referenceId:string)=>{
    const detail={referenceId,handled:false};
    act(()=>{window.dispatchEvent(new CustomEvent(SELECTED_TEXT_REFERENCE_FOCUS_EVENT,{detail}));});
    return detail.handled;
  };
  try {
    act(render);
    // 先关掉挂载时自动打开的编辑器，确认高亮确实是被定位请求重新点亮的。
    act(()=>document.querySelector<HTMLButtonElement>('[aria-label="selection.fragment.confirmAnnotation "]')!.click());
    expect(highlightIds()).toEqual([]);
    expect(openPopovers()).toBe(0);
    scroll.mockClear();

    expect(request(fragment.reference.id)).toBe(true);
    expect(scroll).toHaveBeenCalledWith({block:"center",inline:"nearest"});
    expect(openPopovers()).toBe(1);
    expect(highlightIds()).toEqual([fragment.reference.id]);

    expect(request("selection-unknown")).toBe(false);
  } finally {
    act(()=>root.unmount()); text.remove();
    if(previous) Object.defineProperty(Range.prototype,"getClientRects",previous);
    else delete (Range.prototype as any).getClientRects;
    if(previousScroll) Object.defineProperty(HTMLElement.prototype,"scrollIntoView",previousScroll);
    else delete (HTMLElement.prototype as any).scrollIntoView;
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  }
});

it("keeps following an expanding panel until its layout settles", async () => {
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const root=createRoot(document.createElement("div"));
  const rect={left:100,top:200,right:260,bottom:224,width:160,height:24};
  const previous=Object.getOwnPropertyDescriptor(Range.prototype,"getClientRects");
  // 展开折叠面板是一段高度过渡：行已经插进来了，但动画期间量不到这段引用。
  let animating=true;
  Object.defineProperty(Range.prototype,"getClientRects",{configurable:true,value:function(this:Range){
    return !animating && this.toString().trim()==="selected passage" ? [rect] : [];
  }});
  const fragment=createSelectedTextFragment({text:"selected passage",targetId:"message:message-9",sourceKind:"message"})!;
  fragment.reference.annotationIndex=5;
  const row=document.createElement("div");
  const render=()=>root.render(React.createElement(SelectionAnnotations,{fragments:[fragment],onAnnotationChange:jest.fn(),onRemove:jest.fn()}));
  const badges=()=>document.querySelectorAll("[data-selection-marker]");
  const settleFrame=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,50));});
  try {
    act(render);
    expect(badges()).toHaveLength(0);

    // 面板展开：内容挂上来了，高度还在长。
    row.setAttribute("data-node-id","message-9");
    const paragraph=document.createElement("p");
    paragraph.textContent="selected passage";
    row.append(paragraph);
    document.body.append(row);
    const range=document.createRange(); range.selectNodeContents(paragraph);
    rememberSelectedTextAnchor(fragment.reference.id,range,fragment.reference.text);

    await settleFrame();
    expect(badges()).toHaveLength(0);

    // 过渡结束、布局落定：此后没有任何 DOM 变化或滚动，标记也必须自己回来。
    animating=false;
    await settleFrame();
    expect(badges()).toHaveLength(1);
    expect(badges()[0].textContent).toBe("5");
  } finally {
    act(()=>root.unmount());
    row.remove();
    if(previous) Object.defineProperty(Range.prototype,"getClientRects",previous);
    else delete (Range.prototype as any).getClientRects;
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  }
});

it("does not claim a quote hidden inside a collapsed panel so the timeline can open it", async () => {
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  const row=document.createElement("div"); row.setAttribute("data-node-id","message-10");
  const paragraph=document.createElement("p"); paragraph.textContent="selected passage";
  row.append(paragraph); document.body.append(row);
  const root=createRoot(document.createElement("div"));
  const rect={left:100,top:200,right:260,bottom:224,width:160,height:24};
  const previous=Object.getOwnPropertyDescriptor(Range.prototype,"getClientRects");
  let collapsed=true;
  // 收起的面板量不到矩形（内容不可见或高度为 0），这时标记画不出来。
  Object.defineProperty(Range.prototype,"getClientRects",{configurable:true,value:function(this:Range){
    return !collapsed && this.toString().trim()==="selected passage" ? [rect] : [];
  }});
  const range=document.createRange(); range.selectNodeContents(paragraph);
  const fragment=createSelectedTextFragment({text:"selected passage",targetId:"message:message-10",sourceKind:"message"})!;
  fragment.reference.annotationIndex=6;
  rememberSelectedTextAnchor(fragment.reference.id,range,fragment.reference.text);
  const request=(referenceId:string)=>{
    const detail={referenceId,handled:false};
    act(()=>{window.dispatchEvent(new CustomEvent(SELECTED_TEXT_REFERENCE_FOCUS_EVENT,{detail}));});
    return detail.handled;
  };
  // 标记重算挂在 rAF 上（认领定位请求时补排一帧），jsdom 里等一帧。
  const settleFrame=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,50));});
  try {
    act(()=>root.render(React.createElement(SelectionAnnotations,{fragments:[fragment],onAnnotationChange:jest.fn(),onRemove:jest.fn()})));

    // 面板收起：不认领，调用方才知道要先去展开面板。
    expect(request(fragment.reference.id)).toBe(false);
    expect(highlightIds()).toEqual([]);
    expect(openPopovers()).toBe(0);

    // 面板展开、布局落定之后，同一次请求才画得出标记。
    collapsed=false;
    expect(request(fragment.reference.id)).toBe(true);
    await settleFrame();
    expect(highlightIds()).toEqual([fragment.reference.id]);
    expect(openPopovers()).toBe(1);
  } finally {
    act(()=>root.unmount()); row.remove();
    if(previous) Object.defineProperty(Range.prototype,"getClientRects",previous);
    else delete (Range.prototype as any).getClientRects;
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  }
});
