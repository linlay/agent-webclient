/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useMemoryFiles } from "./useMemoryFiles";
import { ApiError, getMemoryFile, getMemoryDates, saveMemoryFile, deleteMemoryFile } from "@/shared/data";
const blocker={state:"unblocked"};
jest.mock("react-router-dom",()=>({useBlocker:()=>blocker}));
jest.mock("@/shared/i18n",()=>({useI18n:()=>({t:(key:string)=>key})}));
jest.mock("@/shared/data",()=>({ApiError:jest.requireActual("@/shared/data/api/http").ApiError,getMemoryFile:jest.fn(),getMemoryDates:jest.fn(),saveMemoryFile:jest.fn(),deleteMemoryFile:jest.fn(),searchMemoryFiles:jest.fn()}));
let current:ReturnType<typeof useMemoryFiles>;let root:Root;
const original={kind:"memory" as const,content:"Original",revision:"r1",exists:true};
function Harness(){current=useMemoryFiles();return null;}
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();jest.mocked(getMemoryFile).mockResolvedValue({status:200,code:0,msg:"",data:original});jest.mocked(getMemoryDates).mockResolvedValue({status:200,code:0,msg:"",data:{dates:[],today:"2026-10-03",nextBefore:""}});root=createRoot(document.createElement("div"));});
afterEach(async()=>{await act(async()=>root.unmount());jest.restoreAllMocks();});
async function mount(){await act(async()=>root.render(<Harness/>));}
it("preserves a dirty draft and revision on conflict and cancelled navigation",async()=>{
 await mount();await act(async()=>current.setDraft("Mine"));jest.mocked(saveMemoryFile).mockRejectedValue(new ApiError("conflict",{status:409}));await act(async()=>current.save());
 expect(current.draft).toBe("Mine");expect(current.document?.revision).toBe("r1");expect(current.conflict).toBe(true);
 jest.spyOn(window,"confirm").mockReturnValue(false);await act(async()=>current.select("owner"));expect(getMemoryFile).toHaveBeenCalledTimes(1);
});
it("saves OWNER with its own revision and updates the baseline",async()=>{
 await mount();const owner={...original,kind:"owner" as const,revision:"owner-r1"};jest.mocked(getMemoryFile).mockResolvedValue({status:200,code:0,msg:"",data:owner});await act(async()=>current.select("owner"));await act(async()=>current.setDraft("Owner preference"));
 jest.mocked(saveMemoryFile).mockResolvedValue({status:200,code:0,msg:"",data:{...owner,content:"Owner preference",revision:"owner-r2"}});await act(async()=>current.save());
 expect(saveMemoryFile).toHaveBeenCalledWith({...owner,content:"Owner preference"});expect(current.dirty).toBe(false);expect(current.document?.revision).toBe("owner-r2");
});
it("does not reload and lose drafts on ordinary rerenders",async()=>{await mount();await act(async()=>current.setDraft("Mine"));await act(async()=>root.render(<Harness/>));expect(getMemoryFile).toHaveBeenCalledTimes(1);expect(current.draft).toBe("Mine");});
it("requires confirmation before deleting a file",async()=>{await mount();jest.spyOn(window,"confirm").mockReturnValue(false);await act(async()=>current.remove());expect(deleteMemoryFile).not.toHaveBeenCalled();});
