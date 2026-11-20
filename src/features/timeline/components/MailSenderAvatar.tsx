import React from "react";
import type { Agent } from "@/features/agents/lib/agentState";
import { AgentIcon } from "@/shared/icons/agent";

export function MailSenderAvatar({ agent, className }: { agent: Agent; className?: string }) {
  return (
    <AgentIcon
      type="agent"
      icon={agent.icon}
      mode={agent.mode}
      interactive={false}
      props={{
        icon: {
          className,
          width: "1em",
          height: "1em",
          style: { alignSelf: "center", flexShrink: 0, verticalAlign: "middle" },
        },
      }}
    />
  );
}
