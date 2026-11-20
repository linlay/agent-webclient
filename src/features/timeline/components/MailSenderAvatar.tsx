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
          width: 14,
          height: 14,
          style: { alignSelf: "center", flexShrink: 0, verticalAlign: "middle" },
        },
      }}
    />
  );
}
