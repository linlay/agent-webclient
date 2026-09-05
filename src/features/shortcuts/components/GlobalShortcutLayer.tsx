import React from "react";
import { useGlobalShortcuts } from "@/features/shortcuts/hooks/useGlobalShortcuts";

/** 挂载跨 Search、Settings、Command 的全局快捷键。 */
export const GlobalShortcutLayer: React.FC = () => {
  useGlobalShortcuts();
  return null;
};
