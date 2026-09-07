import React from "react";
import { SettingsPanel, type SettingsSurfaceProps } from "./SettingsPanel";

export const SettingsDrawer: React.FC<SettingsSurfaceProps> = (props) => (
  <SettingsPanel {...props} surface="drawer" />
);
