import { supportsPrimaryChat, shouldCreatePrimaryChat } from "./primaryChatIntent";
it("uses only BOT for dispatch navigation",()=>{expect(supportsPrimaryChat("bot")).toBe(true);for(const mode of ["GENERAL","CODER","KBASE","TEAM",undefined])expect(supportsPrimaryChat(mode)).toBe(false);});
it("leaves atomic main-chat creation to send",()=>{expect(shouldCreatePrimaryChat({desktop:true,pathname:"/agent/a",search:"?newChat=1793000000000&primaryNewChat=true",agentKey:"a",agentMode:"BOT",isNewChatQuery:true,primaryNavigation:true,hasPrimary:false})).toBe(false);});
