import React from "react";
import { CodeEditor } from "@/shared/ui/CodeEditor";

export interface AgentSourceEditorProps {
  value: string;
  dirty: boolean;
  error: string;
  t: (key: string) => string;
  onChange: (value: string) => void;
}

export const AgentSourceEditor: React.FC<AgentSourceEditorProps> = ({
  value,
  dirty,
  error,
  t,
  onChange,
}) => (
  <div className="agent-source-workspace">
    <CodeEditor
      value={value}
      language="yaml"
      onChange={onChange}
      options={{ lineNumbers: "off" }}
    />
    {error ? <div className="settings-error">{error}</div> : null}
    {dirty ? (
      <div className="agent-save-actions">
        <span className="agent-source-dirty">
          {t("agentConsole.message.unsaved")}
        </span>
      </div>
    ) : null}
  </div>
);
