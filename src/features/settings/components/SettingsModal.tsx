import React from "react";
import { SettingsPanel, type SettingsSurfaceProps } from "./SettingsPanel";

export const SettingsModal: React.FC<SettingsSurfaceProps> = (props) => (
  <SettingsPanel {...props} surface="modal" />
);
