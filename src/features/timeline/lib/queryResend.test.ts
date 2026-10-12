import {queryResendSnapshot,referencesForNewChat} from "./queryResend";
it("snapshots all typed references and never reconstructs legacy selections", () => {
 const refs = [{type:"skill",id:"docs"},{type:"kbase",id:"docs"},{type:"chat",id:"source"}];
 const copy = queryResendSnapshot({references:refs}); refs[0].id="changed";
 expect(copy.references).toEqual([{type:"skill",id:"docs"},{type:"kbase",id:"docs"},{type:"chat",id:"source"}]);
 expect(queryResendSnapshot({mustUseKbases:["old"]} as never).references).toEqual([]);
});

it("keeps file pointers bound to their source Chat when resending to a new Chat", () => {
 const refs = [{type:"file",url:"@chat/report.pdf",path:"/old/path",name:"report.pdf"},{type:"chat",id:"other"},{type:"file",url:"@workspace/docs.md"}];
 const next = referencesForNewChat(refs,"source");
 expect(next).toEqual([{type:"file",url:"/api/resource?file=source%2Freport.pdf",name:"report.pdf"},{type:"chat",id:"other"},{type:"file",url:"@workspace/docs.md"}]);
 expect(refs[0].url).toBe("@chat/report.pdf");
});
