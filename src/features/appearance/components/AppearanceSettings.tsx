import React, { useRef } from "react";
import { Button, Select } from "antd";
import { useI18n } from "@/shared/i18n";
import { DESKTOP_SKINS } from "../lib/skins";
import { useAppearance } from "./AppearanceProvider";
import type { ThemePreference } from "@/shared/styles/appearance/bootstrap";
import styles from "./AppearanceSettings.module.css";

export function AppearanceSettings() {
  const appearance = useAppearance();
  const { controller } = appearance;
  const { t } = useI18n();
  const imageInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  if (appearance.desktop) return null;
  const disabled = appearance.busy || appearance.assetsLoading;
  const options = [
    ...DESKTOP_SKINS.map((skin) => ({ value: skin.id, label: t(`appearance.skin.${skin.id}`) })),
    ...appearance.installedSkins.map((skin) => ({ value: skin.id, label: skin.name })),
  ];
  return <section className={styles.settings} aria-label={t("appearance.title")}>
    <label htmlFor="appearance-theme">{t("settings.theme.label")}</label>
    <Select id="appearance-theme" value={appearance.preference} onChange={(value: ThemePreference) => controller.setThemePreference(value)}
      options={["light", "dark", "system"].map((value) => ({ value, label: t(`settings.theme.${value}`) }))} />
    <label htmlFor="appearance-skin">{t("appearance.skin.label")}</label>
    <Select id="appearance-skin" value={appearance.selectedSkinId} options={options} disabled={disabled} onChange={controller.setSkinId} />
    <div className={styles.actions}>
      <Button disabled={disabled} onClick={() => zipInput.current?.click()}>{t("appearance.package.import")}</Button>
      {appearance.selectedSkinId.startsWith("pack:") && <Button danger disabled={disabled} onClick={() => void controller.removePackage(appearance.selectedSkinId)}>{t("appearance.package.remove")}</Button>}
    </div>
    <input ref={zipInput} type="file" accept=".zip,application/zip" hidden onChange={(event) => {
      const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
      if (file) void controller.importPackage(file);
    }} />
    <div className={styles.preview} style={appearance.imageUrl ? { backgroundImage: `url(${JSON.stringify(appearance.imageUrl)})` } : undefined}>
      <span>{appearance.backgroundName || t("appearance.background.builtin")}</span>
    </div>
    <div className={styles.actions}>
      <Button disabled={disabled} onClick={() => imageInput.current?.click()}>{t("appearance.background.import")}</Button>
      {appearance.backgroundName && <Button disabled={disabled} onClick={() => void controller.resetBackground()}>{t("appearance.background.reset")}</Button>}
    </div>
    <input ref={imageInput} type="file" accept="image/png,image/jpeg" hidden onChange={(event) => {
      const file = event.currentTarget.files?.[0]; event.currentTarget.value = "";
      if (file) void controller.importBackground(file);
    }} />
    <p>{t("appearance.hint")}</p>
    {appearance.error && <p role="alert">{t(`appearance.error.${appearance.error}`)}</p>}
    {appearance.assetsLoading && <p role="status">{t("appearance.loading")}</p>}
  </section>;
}
