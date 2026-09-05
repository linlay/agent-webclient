import React from "react";

export const AgentEditor: React.FC<{
  readOnly: boolean;
  children: React.ReactNode;
}> = ({ readOnly, children }) => (
  <div
    className={`agent-editor-fieldset ${readOnly ? "is-readonly" : ""}`}
    aria-readonly={readOnly}
  >
    {children}
  </div>
);
