import React from "react";
import { Input } from "antd";

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
    <div className="field-group agent-source-field">
      <label htmlFor="agent-source-editor">{t("agentConsole.field.sourceFile")}</label>
      <Input.TextArea
        id="agent-source-editor"
        className="settings-textarea agent-source-editor"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
    {error ? <div className="settings-error">{error}</div> : null}
    {dirty ? (
      <div className="agent-save-actions">
        <span className="agent-source-dirty">{t("agentConsole.message.unsaved")}</span>
      </div>
    ) : null}
  </div>
);
