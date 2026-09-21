import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App as AntdApp } from 'antd';
import { AppProvider } from '@/app/state/provider';
import { I18nProvider } from '@/shared/i18n';
import { ImageGenerationCard } from '@/features/timeline/components/ImageGenerationCard';
import { TimelineInteractionProvider } from '@/features/timeline/components/TimelineInteractionContext';
import type { TimelineNode } from '@/features/timeline/lib/timelineState';
import { buildRunRenderEntries } from '@/features/timeline/lib/timelineDisplay';
import { applyBootAppearance } from '@/shared/styles/appearance/bootstrap';
import '@/shared/styles/globals.css';
applyBootAppearance();
const fixtureImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#bcdec8"/><circle cx="420" cy="120" r="50" fill="#fff3c2"/><path d="M0 400L220 100L460 400M280 400L480 200L600 400" fill="#579176"/><text x="30" y="360" font-size="24" fill="white">Image preview fixture</text></svg>');
const initial: TimelineNode[] = ['a', 'b', 'c'].map(id => ({ id, toolId: id, runId: 'preview', kind: 'tool', toolName: 'image_generate', toolLabel: '图像生成', argsText: '{"prompt":"landscape","n":2}', status: 'running', ts: 1 }));
function Preview() {
  const [nodes, setNodes] = useState(initial);
  const [active, setActive] = useState(true);
  const finish = (id: string, fail = false) => setNodes(current => current.map(node => node.id === id ? { ...node, status: fail ? 'failed' : 'success', result: { isCode: true, text: JSON.stringify(fail ? { ok: false, message: 'Fixture failure' } : { ok: true, images: [0, 1].map(index => ({ index, url: fixtureImage, name: `landscape-${index}.svg`, mimeType: 'image/svg+xml' })) }) } } : node));
  const group = buildRunRenderEntries(nodes)[0];
  return <main style={{ maxWidth: 1000, margin: '40px auto', padding: 24, color: 'var(--ink-1)' }}>
    <h1>图像生成 · 三次并发，每次两张</h1>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '20px 0' }}>
      <button onClick={() => finish('b')}>第二次先完成</button>
      <button onClick={() => finish('a', true)}>第一次失败</button>
      <button onClick={() => setActive(false)}>结束运行 / 历史</button>
      <button onClick={() => { setNodes(initial); setActive(true); }}>重置</button>
      <button onClick={() => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; }}>明暗切换</button>
    </div>
    <TimelineInteractionProvider value={{ conversationActive: active, surfaceContext: { chatId: 'preview' } }}>
      <ImageGenerationCard nodes={group.kind === 'tool-group' ? group.nodes : nodes} />
    </TimelineInteractionProvider>
  </main>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><I18nProvider locale="zh-CN" persistLocale={false}><AppProvider><AntdApp><Preview /></AntdApp></AppProvider></I18nProvider></BrowserRouter>);
