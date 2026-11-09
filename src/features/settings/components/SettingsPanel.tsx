import { bindCssModuleClasses } from "@/shared/utils/cssModuleClasses";
import settingsPresentation from "@/features/settings/components/SettingsOverlay.module.css";
import React, { useCallback, useEffect, useState } from "react";
import {
  useAppState,
  useAppDispatch,
} from "@/app/state/AppContext";
import { Modal, Drawer } from "antd";
import { MaterialIcon } from "@/shared/icons/material";
import { ACCESS_TOKEN_STORAGE_KEY } from "@/app/state/constants";
import { AppearanceSettings } from "@/features/appearance/components/AppearanceSettings";
import { getCurrentAccessToken, setAccessToken } from "@/shared/data";
import { isAppMode, isDesktopAppMode } from "@/shared/utils/routing";
import { UiButton } from "@/shared/ui/UiButton";
import { useI18n } from "@/shared/i18n";
import type { Locale } from "@/shared/i18n";
import { SettingsToken } from "@/features/settings/components/SettingsToken";
import { VoiceShortcutSettings } from "@/features/voice/components/VoiceShortcutSettings";
import { isVoiceEnabled } from "@/shared/config/featureFlags";
import "./Settings.module.css";
import "./SettingsFields.module.css";
const presentationClasses = bindCssModuleClasses({ ...settingsPresentation });


const SETTINGS_CARD_CLASS_NAME =
  presentationClasses("settings-card tw:max-h-[min(82vh,860px)] tw:w-full tw:overflow-auto");
const SETTINGS_PREFERENCES_GRID_CLASS_NAME =
  "settings-preferences-grid tw:grid tw:grid-cols-[repeat(auto-fit,minmax(240px,1fr))] tw:gap-4 tw:[&_.field-group]:mb-0";

export interface SettingsSurfaceProps {
  open?: boolean;
  onClose?: () => void;
}

// State stays outside the destroyOnHidden shells so controlled close/reopen
// retains token drafts, while unmounting the surface resets them.
export const SettingsPanel: React.FC<SettingsSurfaceProps & {
  surface: "modal" | "drawer";
}> = ({
  surface,
  open = true,
  onClose,
}) => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const { locale, setLocale, t } = useI18n();
  const appMode = isAppMode();
  const isDesktopApp = isDesktopAppMode();
  const [tokenInput, setTokenInput] = useState(
    appMode ? getCurrentAccessToken() || state.accessToken : state.accessToken,
  );
  const [error, setError] = useState("");
  const handleSave = () => {
    if (appMode) {
      onClose?.();
      return;
    }
    const token = tokenInput.trim();
    setAccessToken(token);
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
    dispatch({ type: "SET_ACCESS_TOKEN", token });
    window.dispatchEvent(new CustomEvent("agent:refresh-worker-data"));
    setError("");
    onClose?.();
  };

  const handleLanguageChange = useCallback(
    (nextLocale: Locale) => {
      setLocale(nextLocale);
    },
    [setLocale],
  );

  useEffect(() => {
    setTokenInput(
      appMode
        ? getCurrentAccessToken() || state.accessToken
        : state.accessToken,
    );
  }, [appMode, state.accessToken]);

  const content = (
    <div
      className={surface === "modal" ? SETTINGS_CARD_CLASS_NAME : presentationClasses("settings-card")}
    >
      <div
        className={
          surface === "modal"
            ? SETTINGS_PREFERENCES_GRID_CLASS_NAME
            : "settings-preferences-grid"
        }
      >
        {!isDesktopApp && <AppearanceSettings />}
        {isVoiceEnabled() && <VoiceShortcutSettings />}

        <div className="field-group">
          <label>{t("settings.language.label")}</label>
          <div
            className="settings-segmented"
            role="tablist"
            aria-label={t("settings.language.label")}
          >
            <UiButton
              variant="ghost"
              size="sm"
              className={`settings-segmented-btn ${locale === "zh-CN" ? "is-active" : ""}`}
              role="tab"
              aria-selected={locale === "zh-CN"}
              active={locale === "zh-CN"}
              onClick={() => handleLanguageChange("zh-CN")}
            >
              {t("settings.language.zhCN")}
            </UiButton>
            <UiButton
              variant="ghost"
              size="sm"
              className={`settings-segmented-btn ${locale === "en-US" ? "is-active" : ""}`}
              role="tab"
              aria-selected={locale === "en-US"}
              active={locale === "en-US"}
              onClick={() => handleLanguageChange("en-US")}
            >
              {t("settings.language.enUS")}
            </UiButton>
          </div>
          <p className="settings-hint">{t("settings.language.hint")}</p>
        </div>
      </div>

      <SettingsToken
        appMode={appMode}
        tokenInput={tokenInput}
        error={error}
        onTokenInputChange={setTokenInput}
        onSave={handleSave}
      />

      <div className="settings-grid" style={{ marginTop: "16px" }}>
        <UiButton
          variant="secondary"
          size="sm"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("agent:refresh-agents"))
          }
        >
          {t("settings.actions.refreshAgents")}
        </UiButton>

        <UiButton
          variant="danger"
          size="sm"
          onClick={() => {
            dispatch({ type: "CLEAR_DEBUG" });
            dispatch({ type: "CLEAR_EVENTS" });
          }}
        >
          {t("settings.actions.clearLogs")}
        </UiButton>
      </div>

    </div>
  );

  return surface === "modal" ? (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      getContainer={false}
      width="min(920px, calc(100vw - 32px))"
      className="settings-modal"
      title={t("settings.title")}
    >
      {content}
    </Modal>
  ) : (
    <Drawer
      open={open}
      onClose={onClose}
      closable={{ closeIcon: <MaterialIcon name="keyboard_arrow_right" /> }}
      mask
      maskClosable
      destroyOnHidden
      getContainer={false}
      placement="right"
      width="100%"
      className="settings-drawer copilot-drawer"
      title={t("settings.title")}
      styles={{
        header: {
          borderBottom: 0,
          flex: "unset",
          padding: 10,
        },
      }}
    >
      {content}
    </Drawer>
  );
};
