/** @jest-environment jsdom */
import {referenceIds, queryReferences} from "@/shared/contracts/references";
import {createInitialState} from "@/app/state/state";
it("keeps knowledge library choices in the unified references list", () => {
 const refs = queryReferences([{type:"kbase",id:" library "},{type:"skill",id:"library"},{type:"kbase",id:"library"}]);
 expect(referenceIds(refs,"kbase")).toEqual(["library"]);
 expect(referenceIds(refs,"skill")).toEqual(["library"]);
 expect(createInitialState()).not.toHaveProperty("selectedKbasesByScope");
});
