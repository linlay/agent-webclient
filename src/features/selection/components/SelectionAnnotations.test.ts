/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { SelectionAnnotations } from "./SelectionAnnotations";
import { rememberSelectedTextAnchor } from "@/shared/data/desktop/selectedTextAnchors";
import { createSelectedTextFragment } from "@/shared/contracts/selectedTextReference";

jest.mock("@/shared/i18n",()=>({useI18n:()=>({t:(key:string,params?:{index:number})=>`${key} ${params?.index || ""}`})}));

it("opens an anchored editor, saves a comment, and reopens the same annotation from its badge", () => {
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
  const render=()=>root.render(React.createElement(SelectionAnnotations,{fragments:[fragment],onAnnotationChange:change}));
  try {
    act(render);
    let input=document.querySelector("textarea")!;
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
    const badge=document.querySelector<HTMLButtonElement>("[data-selection-marker]")!;
    expect(badge.textContent).toBe("7");
    expect(document.querySelector('[data-material-icon="mic"]')).toBeNull();
    act(()=>{input.value="comment";Simulate.change(input);});
    expect(change).toHaveBeenCalledWith(fragment.reference.id,"comment");
    fragment.reference.annotation="comment";
    act(render);
    act(()=>Simulate.keyDown(input,{key:"Enter"}));
    expect(document.querySelector("textarea")).toBeNull();
    act(()=>badge.click());
    input=document.querySelector("textarea")!;
    expect(input.value).toBe("comment");
    expect(badge.textContent).toBe("7");
    act(()=>{input.value="";Simulate.change(input);});
    expect(change).toHaveBeenLastCalledWith(fragment.reference.id,"");
  } finally {
    act(()=>root.unmount()); text.remove();
    if(previous) Object.defineProperty(Range.prototype,"getClientRects",previous);
    else delete (Range.prototype as any).getClientRects;
    delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
  }
});
