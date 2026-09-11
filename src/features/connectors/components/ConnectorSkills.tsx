import { useState } from "react";
import { Spin } from "antd";
import { XMarkdown } from "@ant-design/x-markdown";
import type { ConnectorSummary } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { UiButton } from "@/shared/ui/UiButton";
import { useConnectorSkills } from "../hooks/useConnectorSkills";
import styles from "./ConnectorsConsole.module.css";

export function ConnectorSkills({ item }: { item: ConnectorSummary }) {
  const { t, locale } = useI18n();
  const runtime = useConnectorSkills(item.id, JSON.stringify([item.version, item.skills]));
  const [source, setSource] = useState(false);
  const detail = runtime.detail;
  return <section className={styles.skills} aria-label={t("connectors.skills.label")}>
    {runtime.listError && <div role="alert" className={styles.error}>{runtime.listError}<UiButton size="sm" variant="ghost" onClick={runtime.reload}>{t("connectors.action.retry")}</UiButton></div>}
    <Spin spinning={runtime.listLoading} wrapperClassName={styles.skillsLoading}>
      {!runtime.listLoading && !runtime.listError && !runtime.skills.length && <p className={styles.empty}>{t("connectors.skills.empty")}</p>}
      {!!runtime.skills.length && <div className={styles.skillsLayout}>
        <nav className={styles.skillList} aria-label={t("connectors.skills.list")}>
          {runtime.skills.map(skill => <button type="button" key={skill.name} className={styles.skillItem} aria-current={runtime.name === skill.name ? "true" : undefined} onClick={() => runtime.select(skill.name)}>
            <strong>{skill.name}</strong>
            <span className={styles.description}>{skill.description}</span>
          </button>)}
        </nav>
        <article key={runtime.name} className={styles.skillDetail} tabIndex={0} aria-label={runtime.name}>
          {runtime.detailError && <div role="alert" className={styles.error}>{runtime.detailError}<UiButton size="sm" variant="ghost" onClick={runtime.reload}>{t("connectors.action.retry")}</UiButton></div>}
          <Spin spinning={runtime.detailLoading}>
            {detail && <div className={styles.stack}>
              <div className={styles.itemHeading}><h3>{detail.skill.name}</h3>{detail.skill.version && <span className={styles.version}>{t("connectors.version", { version: detail.skill.version })}</span>}</div>
              <p className={styles.skillDescription}>{detail.skill.description}</p>
              <dl className={styles.metadata}>
                <dt>{t("connectors.skills.path")}</dt><dd><code>{detail.skill.path}</code></dd>
                <dt>{t("connectors.skills.size")}</dt><dd>{t("connectors.skills.kib", { size: (detail.skill.size / 1024).toLocaleString(locale, { maximumFractionDigits: 1 }) })}</dd>
                {!!detail.skill.updatedAt && <><dt>{t("connectors.skills.updatedAt")}</dt><dd>{new Date(detail.skill.updatedAt).toLocaleString(locale)}</dd></>}
                {!!detail.skill.triggers?.length && <><dt>{t("connectors.skills.triggers")}</dt><dd>{detail.skill.triggers.join(" · ")}</dd></>}
              </dl>
              <div className={styles.documentHeader}>
                <strong>{t("connectors.skills.document")}</strong>
                <UiButton size="sm" variant="ghost" onClick={() => setSource(value => !value)}>{t(source ? "connectors.skills.preview" : "connectors.skills.source")}</UiButton>
              </div>
              {source ? <pre className={styles.skillSource}>{detail.content}</pre> : <XMarkdown className={styles.skillMarkdown} escapeRawHtml>{detail.content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")}</XMarkdown>}
            </div>}
          </Spin>
        </article>
      </div>}
    </Spin>
  </section>;
}
