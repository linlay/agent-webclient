import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, Dropdown, Flex, Modal, Radio } from "antd";
import { AppearanceProvider, useAppearance } from "@/features/appearance/components/AppearanceProvider";
import { I18nProvider } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";
import { ComposerPopover } from "@/features/composer/components/ComposerPopover";
import { SystemAlert } from "@/features/timeline/components/SystemAlert";
import { hitlDialogClassNames } from "@/features/tools/components/buildin/dialogClassNames";
import { bindCssModuleClasses } from "@/shared/utils/cssModuleClasses";
import composer from "@/features/composer/components/ComposerPresentation.module.css";
import timeline from "@/features/timeline/components/TimelinePresentation.module.css";
import shell from "@/app/layout/ShellPresentation.module.css";
import settings from "@/features/settings/components/SettingsOverlay.module.css";
import model from "@/features/model-config/components/ModelMenu.module.css";
import shared from "@/shared/ui/Presentation.module.css";
import "@/shared/styles/globals.css";
import "@/features/timeline/components/Timeline.module.css";

const classes = bindCssModuleClasses({ ...composer, ...timeline, ...shell, ...settings, ...model, ...shared });

function Preview() {
  const appearance = useAppearance();
  const [narrow, setNarrow] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("allow");
  const [popover, setPopover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const skill = <div style={{ background: "var(--bg-base)", border: "1px solid var(--line-soft)", borderRadius: 15 }} className={classes("composer-add-menu-detail")} data-section="skills">
    <div className={classes("composer-add-menu-scroll")}>
      <div className={classes("composer-add-menu-skill-row")} tabIndex={0}>
        <span className="material-icon">★</span>
        <div className={classes("composer-add-menu-item-copy")}><div className={classes("composer-add-menu-item-title")}>
          <b>示例技能</b><span className={classes("composer-add-menu-skill-actions")}>
            <button className={classes("composer-add-menu-skill-pin")} aria-label="置顶技能" aria-pressed={pinned} onClick={() => setPinned(!pinned)}>★</button>
          </span></div><small>悬停或聚焦显示置顶按钮，内容保持对齐。</small></div>
      </div>
    </div>
  </div>;
  return <main style={{ width: narrow ? "min(390px, 100%)" : "min(920px, 100%)", margin: "0 auto", padding: 20, display: "grid", gap: 16 }}>
    <h2>局部样式回归预览</h2>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Button onClick={() => { appearance.controller.setThemePreference(appearance.resolvedTheme === "dark" ? "light" : "dark"); }}>切换明暗</Button>
      <Button onClick={() => setNarrow(!narrow)}>切换窄宽</Button>
      <Button onClick={() => setOpen(true)}>打开设置容器</Button>
      <Dropdown trigger={["click"]} menu={{ className: classes("query-settings-menu"), items: [{ key: "model", label: <span className={classes("query-model-menu-item")}><span className={classes("query-model-menu-copy")}><b className={classes("query-model-menu-name")}>示例模型</b><small className={classes("query-model-menu-provider")}>Provider</small></span></span> }] }}><Button>模型菜单</Button></Dropdown>
    </div>
    <SystemAlert text="示例错误：回归检查提示布局" level="error" />
    <Radio.Group value={selected} onChange={e => setSelected(e.target.value)} className={hitlDialogClassNames.radioGroup}>
      {[['allow', '允许执行'], ['reject', '拒绝执行']].map(([value, label], i) => <Radio key={value} value={value} className={hitlDialogClassNames.radioOption}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><span className={hitlDialogClassNames.optionIndex}>{i + 1}</span>{label}<span className={hitlDialogClassNames.selectedBadge}>已选择</span></span>
      </Radio>)}
    </Radio.Group>
    <div className={classes("timeline-row")} data-kind="content">
      <div className={classes("timeline-markdown")}><p>时间线段落、表格与代码。</p><pre>const result = await task();</pre><table><thead><tr><th>项目</th><th>状态</th></tr></thead><tbody><tr><td>布局</td><td>待验证</td></tr></tbody></table></div>
    </div>
    <div className={classes("status-line")}>运行状态：等待用户确认</div>
    <ComposerPopover width={320} panels={[{ open: popover, content: skill }]}><Button onClick={() => setPopover(!popover)}>技能浮层</Button></ComposerPopover>
    <Flex align="center" className={classes("composer-skill-chip")}><UiButton variant="ghost" size="sm" className={classes("composer-skill-chip-main")} onClick={() => setPinned(!pinned)}>示例技能标签</UiButton></Flex>
    <Modal title="设置容器" open={open} onCancel={() => setOpen(false)} footer={null}><div className={classes("settings-card")}>{Array.from({length: 24}, (_, i) => <p key={i}>设置项目 {i + 1}</p>)}</div></Modal>
  </main>;
}
createRoot(document.getElementById("root")!).render(<I18nProvider locale="zh-CN"><AppearanceProvider><Preview /></AppearanceProvider></I18nProvider>);
