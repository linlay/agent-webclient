import React, { useEffect, useRef, useState } from "react";
import { Alert, Button, ConfigProvider, Drawer, Empty, Form, Input, InputNumber, Modal, Popconfirm, Space, Spin, Table, Tabs, Tag, Typography } from "antd";
import { t } from "@/shared/i18n";
import { MaterialIcon } from "@/shared/ui/MaterialIcon";
import { useKBases } from "../hooks/useKBases";
import { deleteKBase, filesKBase, readKBase, refreshKBase, saveKBase, searchKBase } from "@/shared/data/api/requests/kbases";
import type { KnowledgeBase, KnowledgeBaseInput, KnowledgeDocument, KnowledgeRead, KnowledgeSearch } from "@/shared/data/api/dto/kbases";
import styles from "./KBasesConsole.module.css";
const message = (e: unknown) => e instanceof Error ? e.message : String(e);
const stateLabel = (state: KnowledgeBase["state"]) => ({ unindexed: t("kbases.unindexed"), indexing: t("kbases.indexing"), ready: t("kbases.ready"), error: t("kbases.failed") })[state];

export function KBasesConsole() {
 const { items, loading, error, reload } = useKBases();
 const [selected, select] = useState("");
 const [filter, setFilter] = useState("");
 const [editor, setEditor] = useState<KnowledgeBase | "new" | null>(null);
 const [busy, setBusy] = useState(false);
 const [actionError, setActionError] = useState("");
 const [form] = Form.useForm<KnowledgeBaseInput>();
 const active = items.find(x => x.id === selected) || items[0];
 const perform = async (fn: () => Promise<unknown>) => { setBusy(true); setActionError(""); try { await fn(); await reload(); } catch(e) { setActionError(message(e)); } finally { setBusy(false); } };
 const edit = (item: KnowledgeBase | "new") => { setEditor(item); form.setFieldsValue(item === "new" ? { name: "", description: "", sourcePath: "" } : item); };
 return <ConfigProvider componentSize="small"><div className={styles.root}>
  {(error || actionError) && <Alert type="error" showIcon message={error || actionError} />}
  <div className={styles.layout}><aside className={styles.sidebar}>
   <header className={styles.listHeader}>
    <h2>{t("settingsMenu.knowledgeBase")}</h2>
    <Space size={2}>
     <Button type="text" title={t("kbases.reload")} aria-label={t("kbases.reload")} icon={<MaterialIcon name="refresh" />} onClick={() => void reload()} />
     <Button type="text" title={t("kbases.create")} aria-label={t("kbases.create")} icon={<MaterialIcon name="add" />} onClick={() => edit("new")} />
    </Space>
   </header>
   <div className={styles.filter}>
   <Input.Search aria-label={t("kbases.filter")} placeholder={t("kbases.filter")} value={filter} onChange={e => setFilter(e.target.value)} />
   </div>
   <div className={styles.listScroll}>
   {loading ? <Spin /> : items.length === 0 ? <p className={styles.empty}>{t("kbases.empty")}</p> : items.filter(x => `${x.name} ${x.description}`.toLowerCase().includes(filter.toLowerCase())).map(item => <button className={`${styles.library} ${active?.id === item.id ? styles.selected : ""}`} key={item.id} aria-pressed={active?.id === item.id} onClick={() => select(item.id)}><div className={styles.itemHeading}><strong>{item.name}</strong><Tag color={item.state === "ready" ? "green" : item.state === "error" ? "red" : "default"}>{stateLabel(item.state)}</Tag></div><span className={styles.itemDescription} title={item.description || item.sourcePath}>{item.description || item.sourcePath}</span></button>)}
   </div>
  </aside><section className={styles.detail}>{active ? <>
   <div className={styles.header}><div className={styles.detailHeading}><h3>{active.name}</h3><Tag>{stateLabel(active.state)}</Tag></div><Space size={6} wrap><Button disabled={busy || active.state === "indexing"} onClick={() => edit(active)}>{t("kbases.edit")}</Button><Button loading={active.state === "indexing"} disabled={busy} onClick={() => void perform(() => refreshKBase(active.id))}>{t("kbases.update")}</Button><Popconfirm title={t("kbases.deleteConfirm")} description={t("kbases.deleteHint")} onConfirm={() => perform(async () => { await deleteKBase(active.id); select(""); })}><Button danger disabled={busy || active.state === "indexing"}>{t("kbases.delete")}</Button></Popconfirm></Space></div>
   <div className={styles.detailBody}>
   {active.description && <p className={styles.description}>{active.description}</p>}
   <Typography.Paragraph type="secondary" className={styles.path}>{t("kbases.source")}: {active.sourcePath}<br />{t("kbases.indexedAt")}: {active.indexedAt ? new Date(active.indexedAt).toLocaleString() : "—"}</Typography.Paragraph>
   {active.error && <Alert type="error" showIcon message={active.error} />}
   {active.state === "indexing" && <Alert type="info" showIcon message={t("kbases.indexingHint")} />}
   {active.indexedAt ? <KnowledgeData key={`${active.id}:${active.indexedAt}`} library={active} /> : <p className={styles.empty}>{t("kbases.buildHint")}</p>}
   </div>
  </> : <div className={styles.empty}><p>{t("kbases.empty")}</p><Button onClick={() => edit("new")}>{t("kbases.create")}</Button></div>}</section></div>
  <Modal title={editor === "new" ? t("kbases.create") : t("kbases.edit")} open={editor !== null} confirmLoading={busy} onCancel={() => setEditor(null)} onOk={() => { void form.validateFields().then(values => perform(async () => { const r = await saveKBase(values, editor && editor !== "new" ? editor.id : undefined); if (r.data) select(r.data.id); setEditor(null); })).catch(() => {}); }}>
   <Form form={form} layout="vertical"><Form.Item name="name" label={t("kbases.name")} rules={[{ required: true, whitespace: true }]}><Input maxLength={100} /></Form.Item><Form.Item name="description" label={t("kbases.description")}><Input.TextArea rows={3} maxLength={1000} /></Form.Item><Form.Item name="sourcePath" label={t("kbases.source")} extra={t("kbases.sourceHint")} rules={[{ required: true, whitespace: true }]}><Input disabled={editor !== "new"} placeholder="/path/to/documents" /></Form.Item></Form>
   {actionError && <Alert type="error" message={actionError} />}
  </Modal>
 </div></ConfigProvider>;
}
function KnowledgeData({ library }: { library: KnowledgeBase }) {
 const [files, setFiles] = useState<KnowledgeDocument[]>([]);
 const [query, setQuery] = useState(""); const [limit, setLimit] = useState(10);
 const [results, setResults] = useState<KnowledgeSearch | null>(null);
 const [error, setError] = useState(""); const [searching, setSearching] = useState(false);
 const [fileLoading, setFileLoading] = useState(true);
 const [document, setDocument] = useState<KnowledgeRead | null>(null);
 const [reading, setReading] = useState(false);
 const [open, setOpen] = useState(false);
 const searchAbort = useRef<AbortController>(); const readAbort = useRef<AbortController>();
 useEffect(() => { const controller = new AbortController(); filesKBase(library.id, controller.signal).then(r => { if (!controller.signal.aborted) { setFiles(r.data?.documents || []); if (r.data && !r.data.complete) setError(t("kbases.incomplete")); } }).catch(e => { if (!controller.signal.aborted) setError(message(e)); }).finally(() => { if (!controller.signal.aborted) setFileLoading(false); }); return () => { controller.abort(); searchAbort.current?.abort(); readAbort.current?.abort(); }; }, [library.id]);
 const search = async () => { searchAbort.current?.abort(); const c = new AbortController(); searchAbort.current = c; setSearching(true); setError(""); setResults(null); try { const r = await searchKBase(library.id, query.trim(), limit, c.signal); if (!c.signal.aborted) setResults(r.data || null); } catch(e) { if (!c.signal.aborted) setError(message(e)); } finally { if (!c.signal.aborted) setSearching(false); } };
 const read = async (ref: string) => { readAbort.current?.abort(); const c = new AbortController(); readAbort.current = c; setOpen(true); setReading(true); setDocument(null); setError(""); try { const r = await readKBase(library.id, ref, c.signal); if (!c.signal.aborted) setDocument(r.data || null); } catch(e) { if (!c.signal.aborted) { setError(message(e)); setOpen(false); } } finally { if (!c.signal.aborted) setReading(false); } };
 return <>{error && <Alert type="error" message={error} />}<Tabs size="small" items={[
 { key: "search", label: t("kbases.recall"), children: <><Typography.Paragraph type="secondary">{t("kbases.recallHint")}</Typography.Paragraph><div className={styles.search}><Input.Search aria-label={t("kbases.query")} placeholder={t("kbases.query")} value={query} maxLength={2000} onChange={e => setQuery(e.target.value)} enterButton={t("kbases.search")} loading={searching} onSearch={() => { if (query.trim()) void search(); }} /><InputNumber aria-label={t("kbases.limit")} min={1} max={50} value={limit} onChange={v => setLimit(v || 10)} /></div>{results && <><Typography.Paragraph>{t("kbases.hitCount", { count: results.results.length })}</Typography.Paragraph>{(results.trace?.degraded || results.trace?.candidateBudgetExhausted) && <Alert type="warning" message={t("kbases.incomplete")} />}{results.results.length === 0 && <Empty description={t("kbases.noHits")} />}{results.results.map(hit => <article key={hit.resultId} className={styles.hit}><Button type="link" onClick={() => void read(hit.file)}>{hit.title || hit.file}</Button><Tag>{t("kbases.score")}: {hit.score.toFixed(4)}</Tag><div className={styles.path}>{hit.file} · {hit.evidence.range.lineStart}–{hit.evidence.range.lineEnd}</div><pre>{hit.evidence.text}</pre></article>)}</>}</> },
 { key: "files", label: `${t("kbases.files")} (${files.length})`, children: <Table<KnowledgeDocument> loading={fileLoading} rowKey="file" dataSource={files} size="small" pagination={{ pageSize: 20, showSizeChanger: false }} columns={[{ title: t("kbases.file"), dataIndex: "file", render: (ref: string) => <Button type="link" onClick={() => void read(ref)}>{ref.replace("kbx://workspace/", "")}</Button> }, { title: t("kbases.bytes"), dataIndex: "bytes", width: 100 }]} /> }
 ]} /><Drawer title={document?.file || t("kbases.preview")} open={open} width={720} onClose={() => { readAbort.current?.abort(); setOpen(false); }}><Spin spinning={reading}><pre className={styles.content}>{document?.evidence?.text || document?.body}</pre>{document?.readRange?.hasMore && <Alert type="info" message={t("kbases.previewLimit")} />}</Spin></Drawer></>;
}
