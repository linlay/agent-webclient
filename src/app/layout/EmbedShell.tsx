import React from "react";
import { useParams } from "react-router-dom";
import { EmbedConversation } from "@/features/embed/components/EmbedConversation";
import { BottomDock } from "./BottomDock";

export function EmbedShell() {
  const { agentKey = "" } = useParams();
  return <EmbedConversation agentKey={agentKey}><BottomDock mode="copilot" /></EmbedConversation>;
}
