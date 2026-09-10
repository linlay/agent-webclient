import React, { createContext, useContext, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import { App as AntdApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import { useI18n } from "@/shared/i18n";
import { createAppearanceController, type AppearanceController } from "../lib/controller";
import { readDocumentAntAppearanceTheme } from "../lib/antdTheme";

const Context = createContext<AppearanceController | null>(null);
export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [controller] = useState(createAppearanceController);
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const { locale } = useI18n();
  useLayoutEffect(() => controller.start(), [controller]);
  // Applying the document precedes store publication. Keep the same provider
  // and business children across every appearance update.
  const palette = JSON.stringify(snapshot.skin.tokens[snapshot.resolvedTheme]);
  const componentTheme = useMemo(() => readDocumentAntAppearanceTheme(snapshot.resolvedTheme), [snapshot.resolvedTheme, palette]);
  return <Context.Provider value={controller}>
    <ConfigProvider locale={locale === "en-US" ? enUS : zhCN} theme={componentTheme}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  </Context.Provider>;
}
export function useAppearance() {
  const controller = useContext(Context);
  if (!controller) throw new Error("AppearanceProvider is required");
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return { ...snapshot, controller };
}
