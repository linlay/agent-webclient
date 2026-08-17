import React from "react";
import { ChatSurfacePage } from "@/app/pages/surfaces";

/** @deprecated Use the canonical agent-scoped Surface routes. */
export const ReadonlyRunSurfacePage: React.FC<{
  kind: "overview" | "debug";
}> = ({ kind }) => <ChatSurfacePage kind={kind} />;
