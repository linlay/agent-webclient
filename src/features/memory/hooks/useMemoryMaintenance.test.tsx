/** @jest-environment jsdom */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useMemoryMaintenance } from "./useMemoryMaintenance";
import { getMemoryMaintenanceStatus, triggerMemoryMaintenance, cancelMemoryMaintenance } from "@/shared/data";
import type { MemoryMaintenanceStatus } from "@/shared/data";
jest.mock("@/shared/data",()=>({getMemoryMaintenanceStatus:jest.fn(),triggerMemoryMaintenance:jest.fn(),cancelMemoryMaintenance:jest.fn()}));
let current:ReturnType<typeof useMemoryMaintenance>;let root:Root;
const status:MemoryMaintenanceStatus={enabled:true,automatic:false,pollIntervalSeconds:300,modelKey:"configured-model",timezone:"Asia/Shanghai",state:"idle",processedBatches:0};
const response=(data:MemoryMaintenanceStatus)=>({status:200,code:0,msg:"",data});
function Harness(){current=useMemoryMaintenance();return null;}
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;jest.useFakeTimers();jest.clearAllMocks();jest.mocked(getMemoryMaintenanceStatus).mockResolvedValue(response(status));root=createRoot(document.createElement("div"));});
afterEach(async()=>{await act(async()=>root.unmount());jest.useRealTimers();});
it("allows manual processing when the timer is disabled and uses no model override",async()=>{
 await act(async()=>root.render(<Harness/>));
 const range={startDate:"2026-09-01",endDate:"2026-09-30",includeArchived:true};
 const queued={...status,manual:{...range,id:"job",state:"queued" as const,modelKey:status.modelKey,timezone:status.timezone,startedAt:1,scannedChats:0,selectedRuns:0,skippedRuns:0,emptyRuns:0,processedBatches:0,reusedBatches:0}};
 jest.mocked(triggerMemoryMaintenance).mockResolvedValue({status:202,code:0,msg:"",data:{accepted:true,status:queued}});
 await act(async()=>current.start(range));expect(triggerMemoryMaintenance).toHaveBeenCalledWith(range);expect(current.manualActive).toBe(true);
 jest.mocked(cancelMemoryMaintenance).mockResolvedValue(response({...queued,manual:{...queued.manual,state:"canceling"}}));
 await act(async()=>current.cancel());expect(cancelMemoryMaintenance).toHaveBeenCalledWith("job");expect(current.status?.manual?.state).toBe("canceling");
});
it("does not replace a submission result with an older in-flight poll",async()=>{
 let resolve!:(value:ReturnType<typeof response>)=>void;
 jest.mocked(getMemoryMaintenanceStatus).mockReturnValue(new Promise(r=>{resolve=r;}));
 await act(async()=>root.render(<Harness/>));
 const next={...status,state:"queued" as const};jest.mocked(triggerMemoryMaintenance).mockResolvedValue({status:202,code:0,msg:"",data:{accepted:true,status:next}});
 await act(async()=>current.start({startDate:"2026-09-01",endDate:"2026-09-30"}));await act(async()=>resolve(response(status)));expect(current.status?.state).toBe("queued");
});
it("shows request failures and keeps the configured model",async()=>{
 await act(async()=>root.render(<Harness/>));jest.mocked(triggerMemoryMaintenance).mockRejectedValue(new Error("conflict"));
 await act(async()=>current.start({startDate:"2026-09-01",endDate:"2026-09-30"}));expect(current.error).toBe("conflict");expect(current.status?.modelKey).toBe("configured-model");expect(current.submitting).toBe(false);
});
