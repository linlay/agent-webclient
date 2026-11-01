import React, { useEffect, useRef, useState } from "react";
import { Alert, Button, Checkbox, Descriptions, Empty, Form, Input, InputNumber, Modal, Select, Space, Spin, Switch, Table, Tabs, Tag, Typography, Upload } from "antd";
import { getAdminAgents, getAdminConnectors, getAdminSkills } from "@/shared/data";
import type { WebappConfiguration, WebappEntry, WebappField, WebappPolicyInput } from "@/shared/data";
import { useI18n } from "@/shared/i18n";
import { useWebapps } from "../hooks/useWebapps";
import { AppLogs } from "./AppLogs";
import styles from "./WebappsConsole.module.css";
import { getDataSessionRevision } from "@/shared/data/auth/dataSession";

type Options = { agents: { label: string; value: string }[]; skills: { label: string; value: string }[]; connectors: { label: string; value: string }[] };

export function WebappsConsole({ initialId = "" }: { initialId?: string }) {
  const { t } = useI18n(); const runtime = useWebapps(initialId); const session = getDataSessionRevision(); const optionsSession = useRef(session); const [catalogRevision, setCatalogRevision] = useState(0);
  const [remove, setRemove] = useState<WebappEntry>(); const [purge, setPurge] = useState(false);
  const removeSession = useRef(session); const visibleRemove = removeSession.current === session ? remove : undefined;
  useEffect(() => { setRemove(undefined); setPurge(false); }, [session]);
  const [optionData, setOptions] = useState<Options>({ agents: [], skills: [], connectors: [] });
  const options = optionsSession.current === session ? optionData : { agents: [], skills: [], connectors: [] };
  const [optionsError, setOptionsError] = useState("");
  useEffect(() => {
    let active = true;
    setOptionsError("");
    Promise.all([getAdminAgents(), getAdminSkills(), getAdminConnectors()]).then(([agents, skills, connectors]) => {
      if (!active || session !== getDataSessionRevision()) return;
      optionsSession.current = session;
      setOptions({ agents: agents.data.filter(agent => agent.status === "ready").map(agent => ({ label: agent.name || agent.key, value: agent.key })),
        skills: Array.from(new Map([...skills.data.skills.filter(skill => skill.status === "ready"), ...(skills.data.packages || []).filter(pkg => pkg.status !== "incomplete").flatMap(pkg => pkg.skills)].map(skill => [skill.id, { label: skill.displayName || skill.name || skill.id, value: skill.id }])).values()),
        connectors: connectors.data.connectors.filter(connector => connector.status !== "invalid" && connector.authMode !== "oneid").flatMap(connector => ([...(connector.hasCli ? ["cli"] : []), ...(connector.hasMcp ? ["mcp"] : [])]).map(adapter => ({ label: `${connector.name || connector.id} · ${adapter.toUpperCase()}`, value: `${connector.id}/${adapter}` }))) });
    }).catch(e => { if (active && session === getDataSessionRevision()) setOptionsError(e instanceof Error ? e.message : String(e)); });
    return () => { active = false; };
  }, [session, catalogRevision]);
  const error = runtime.error === "webapp_request_cancelled_inspect_state" ? t("webapps.cancelled") : runtime.error;
  const stateText = (state: string) => t(`webapps.state.${state}`);
  if (runtime.loading) return <div className={styles.loading}><Spin /></div>;
  return <section className={styles.console}>
    <header className={styles.header}>
      <div><Typography.Title level={3}>{t("webapps.title")}</Typography.Title><Typography.Text type="secondary">{t("webapps.subtitle")}</Typography.Text></div>
      <Space><Button onClick={runtime.retry} loading={runtime.busy}>{t("webapps.refresh")}</Button>
        <Upload accept=".zip" maxCount={1} showUploadList={false} disabled={runtime.busy || !runtime.host?.staticAvailable} beforeUpload={file => { void runtime.preflight(file); return Upload.LIST_IGNORE; }}>
          <Button type="primary" disabled={runtime.busy || !runtime.host?.staticAvailable}>{t("webapps.import")}</Button>
        </Upload>
        {runtime.busy && <Button onClick={runtime.cancel}>{t("webapps.cancel")}</Button>}
      </Space>
    </header>
    <Alert type="info" message={t("webapps.localAccess")} />
    {error && <Alert type="error" showIcon message={error} action={<Button onClick={runtime.retry}>{t("webapps.refresh")}</Button>} />}
    {!runtime.host?.staticAvailable && <Alert type="warning" showIcon message={t("webapps.unavailable")} />}
    {!!runtime.host?.warnings.length && <Alert type="info" message={runtime.host.warnings.map(item => item.code).join(" · ")} />}
    <div className={styles.workspace}>
      <div className={styles.catalog}><Table<WebappEntry> size="small" rowKey="id" dataSource={runtime.items} pagination={false}
        rowClassName={item => item.id === runtime.detail?.entry.id ? styles.selected : ""}
        onRow={item => ({ tabIndex: 0, "aria-selected": item.id === runtime.detail?.entry.id, onClick: () => { if (!runtime.busy) void runtime.select(item.id); }, onKeyDown: event => { if (!runtime.busy && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); void runtime.select(item.id); } } })}
        locale={{ emptyText: <Empty description={t("webapps.empty")} /> }} columns={[
          { title: t("webapps.name"), dataIndex: "label", render: (label: string, item) => <div><strong>{label}</strong><div className={styles.meta}>{item.version}</div></div> },
          { title: t("webapps.status"), dataIndex: "observedState", render: (state: string) => <Tag color={state === "running" ? "green" : state === "failed" || state === "blocked" ? "red" : "default"}>{stateText(state)}</Tag> },
        ]} /></div>
      <div className={styles.detail}>{runtime.detail ? <>
        <div className={styles.detailHeader}><div><Typography.Title level={4}>{runtime.detail.entry.label}</Typography.Title><Typography.Text type="secondary" copyable>{runtime.detail.entry.id}</Typography.Text></div>
          <Space wrap>
            <Button disabled={runtime.busy || runtime.detail.entry.observedState !== "running"} onClick={() => void runtime.open(runtime.detail!.entry)}>{t("webapps.open")}</Button>
            <Button disabled={runtime.busy || runtime.detail.entry.observedState === "running"} onClick={() => void runtime.state(runtime.detail!.entry, "start")}>{t("webapps.start")}</Button>
            <Button disabled={runtime.busy || runtime.detail.entry.observedState === "stopped"} onClick={() => void runtime.state(runtime.detail!.entry, "stop")}>{t("webapps.stop")}</Button>
            <Button disabled={runtime.busy || runtime.detail.entry.observedState !== "running"} onClick={() => void runtime.state(runtime.detail!.entry, "restart")}>{t("webapps.restart")}</Button>
            <Button danger disabled={runtime.busy || runtime.detail.entry.observedState !== "stopped"} onClick={() => { removeSession.current = session; setPurge(false); setRemove(runtime.detail!.entry); }}>{t("webapps.uninstall")}</Button>
          </Space>
        </div>
        {!!runtime.detail.entry.lastError && <Alert type="error" message={runtime.detail.entry.lastError} />}
        <Descriptions size="small" column={2} items={[
          { key: "version", label: t("webapps.version"), children: runtime.detail.entry.version },
          { key: "backend", label: t("webapps.backend"), children: runtime.detail.entry.backend ? "Node.js" : t("webapps.static") },
          { key: "status", label: t("webapps.status"), children: stateText(runtime.detail.entry.observedState) },
          { key: "desired", label: t("webapps.desired"), children: stateText(runtime.detail.entry.desiredState) },
        ]} />
        <Alert type="info" message={t("webapps.configurationRestartHint")} />
        <Tabs items={[
          { key: "config", label: t("webapps.configuration"), children: <AppConfiguration key={runtime.detail.entry.id + runtime.detail.configRevision} detail={runtime.detail} agents={options.agents} disabled={runtime.busy || ["starting","stopping","updating"].includes(runtime.detail.entry.observedState)} onSave={runtime.saveConfig} /> },
          ...(runtime.detail.entry.backend ? [{ key: "logs", label: t("webapps.logs"), children: <AppLogs id={runtime.detail.entry.id} /> }] : []),
          { key: "policy", label: t("webapps.authorization"), children: <><Alert type="info" message={t("webapps.authorizationHint")} />{optionsError && <Alert type="error" message={optionsError} action={<Button onClick={() => setCatalogRevision(value => value + 1)}>{t("webapps.refresh")}</Button>} />}<AppPolicy key={runtime.detail.entry.id + runtime.detail.policy.revision} detail={runtime.detail} options={options} disabled={runtime.busy || ["starting","stopping","updating"].includes(runtime.detail.entry.observedState)} onSave={runtime.savePolicy} /></> },
        ]} />
      </> : <Empty description={t("webapps.select")} />}</div>
    </div>
    <Modal open={!!runtime.review} title={runtime.review?.expectedRevision ? t("webapps.reviewUpdate") : t("webapps.reviewInstall")} okText={t("webapps.install")} cancelText={t("webapps.cancel")} confirmLoading={runtime.busy} onCancel={() => { if (!runtime.busy) runtime.setReview(undefined); }} onOk={runtime.install}>
      {runtime.review && <Space direction="vertical" className={styles.full}>
        <Descriptions column={1} size="small" items={[
          { key: "name", label: t("webapps.name"), children: runtime.review.manifest.label },
          { key: "version", label: t("webapps.version"), children: runtime.review.manifest.version },
          { key: "target", label: t("webapps.target"), children: runtime.review.manifest.target },
          { key: "backend", label: t("webapps.backend"), children: runtime.review.manifest.backend ? "Node.js" : t("webapps.static") },
          { key: "size", label: t("webapps.size"), children: `${(runtime.review.expandedBytes / 1024 / 1024).toFixed(2)} MiB · ${runtime.review.fileCount}` },
        ]} /><Alert type="info" message={runtime.review.expectedRevision ? t("webapps.updateHint") : t("webapps.installHint")} />
      </Space>}
    </Modal>
    <Modal open={!!visibleRemove} title={t("webapps.uninstallTitle", { name: visibleRemove?.label || "" })} okText={t("webapps.uninstall")} okButtonProps={{ danger: true }} cancelText={t("webapps.cancel")} confirmLoading={runtime.busy} onCancel={() => setRemove(undefined)} onOk={async () => { if (visibleRemove) await runtime.remove(visibleRemove, purge); setRemove(undefined); }}>
      <Typography.Paragraph>{t("webapps.uninstallHint")}</Typography.Paragraph><Checkbox checked={purge} onChange={e => setPurge(e.target.checked)}>{t("webapps.purge")}</Checkbox>
    </Modal>
  </section>;
}

function AppConfiguration({ detail, agents, disabled, onSave }: { detail: WebappConfiguration; agents: Options["agents"]; disabled: boolean; onSave: (values: WebappConfiguration["userConfig"]) => Promise<void> }) {
  const { t } = useI18n(); const fields = detail.manifest.userConfig?.fields || [];
  if (!fields.length) return <Empty description={t("webapps.noConfiguration")} />;
  const control = (field: WebappField) => {
    switch (field.type) {
      case "boolean": return <Switch />;
      case "number": return <InputNumber min={field.min} max={field.max} step={field.step || 1} />;
      case "select": return <Select showSearch optionFilterProp="label" options={field.source ? agents : field.options?.map(option => ({ label: option.label, value: option.value }))} />;
      case "textarea": return <Input.TextArea rows={field.rows || 4} maxLength={field.maxLength} placeholder={field.placeholder} />;
      default: return <Input maxLength={field.maxLength} placeholder={field.placeholder} />;
    }
  };
  return <Form layout="vertical" initialValues={detail.userConfig} disabled={disabled} onFinish={onSave}>
    {fields.map(field => <Form.Item key={field.name} name={field.name} label={field.label} extra={field.description} valuePropName={field.type === "boolean" ? "checked" : "value"} rules={field.required && field.type !== "boolean" ? [{ required: true, message: t("webapps.required") }] : []}>{control(field)}</Form.Item>)}
    <Button type="primary" htmlType="submit">{t("webapps.save")}</Button>
  </Form>;
}
function AppPolicy({ detail, options, disabled, onSave }: { detail: WebappConfiguration; options: Options; disabled: boolean; onSave: (values: WebappPolicyInput) => Promise<void> }) {
  const { t } = useI18n();
  const agentField = detail.manifest.userConfig?.fields.find(field => field.type === "select" && field.source === "desktop.agents");
  const configuredAgent = agentField && typeof detail.userConfig[agentField.name] === "string" ? String(detail.userConfig[agentField.name]) : "";
  const fixedAgent = configuredAgent || detail.manifest.copilot?.agentKey;
  return <Form layout="vertical" disabled={disabled} initialValues={{ agentKey: fixedAgent || detail.policy.agentKey, skills: detail.policy.skills, connectors: detail.policy.connectors.map(c => `${c.connectorId}/${c.adapter}`), assistant: detail.policy.assistant, artifacts: detail.policy.artifacts, ports: detail.policy.connectPorts.join(", ") }} onFinish={values => onSave({ expectedRevision: detail.policy.revision, agentKey: values.agentKey || "", skills: values.skills || [], connectors: (values.connectors || []).map((value: string) => { const [connectorId, adapter] = value.split("/"); return { connectorId, adapter: adapter as "cli" | "mcp" }; }), assistant: values.assistant === true, artifacts: values.artifacts === true, connectPorts: String(values.ports || "").split(",").map(value => value.trim()).filter(Boolean).map(Number) })}>
    <Form.Item name="agentKey" label={t("webapps.agent")}><Select allowClear showSearch optionFilterProp="label" disabled={disabled || !!fixedAgent} options={options.agents} /></Form.Item>
    <Form.Item name="assistant" label={t("webapps.assistant")} valuePropName="checked"><Switch /></Form.Item>
    <Form.Item name="skills" label={t("webapps.skills")}><Select mode="multiple" optionFilterProp="label" options={options.skills} /></Form.Item>
    <Form.Item name="connectors" label={t("webapps.connectors")}><Select mode="multiple" optionFilterProp="label" options={options.connectors} /></Form.Item>
    <Form.Item name="artifacts" label={t("webapps.artifacts")} valuePropName="checked"><Switch /></Form.Item>
    <Form.Item name="ports" label={t("webapps.ports")} extra={t("webapps.portsHint")} rules={[{ validator: (_, value: string) => !String(value || "").split(",").map(v => v.trim()).filter(Boolean).some(v => !/^\d+$/.test(v) || Number(v) < 1 || Number(v) > 65535) ? Promise.resolve() : Promise.reject(new Error(t("webapps.portsInvalid"))) }]}><Input placeholder="443, 8443" /></Form.Item>
    <Button type="primary" htmlType="submit">{t("webapps.saveAuthorization")}</Button>
  </Form>;
}
