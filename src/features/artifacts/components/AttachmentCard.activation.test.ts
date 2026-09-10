/** @jest-environment jsdom */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AttachmentCard } from './AttachmentCard';
import { message } from 'antd';
import { useAuthenticatedResourceUrl } from '@/shared/ui/useAuthenticatedResourceUrl';
const open = jest.fn();
jest.mock('@/features/surfaces/openTarget', () => ({ useOpenTarget: () => open }));
jest.mock('@/app/state/AppContext', () => ({ useAppState: () => ({ chatId: 'chat-1', chats: [] }) }));
jest.mock('@/shared/ui/useAuthenticatedResourceUrl', () => ({ useAuthenticatedResourceUrl: jest.fn(() => ({ url: '', loading: false, error: null })) }));
describe('uploaded attachment activation', () => {
 let root: Root, container: HTMLDivElement;
 beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  container = document.createElement('div');document.body.appendChild(container);root = createRoot(container);
 });
 afterEach(async () => { await act(async () => root.unmount());container.remove();jest.restoreAllMocks();delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT; });
 it('opens the durable reference instead of a thumbnail and never toggles the viewer closed', async () => {
  await act(async () => root.render(React.createElement(AttachmentCard, {
   attachment: { id: 'upload-1', name: '照片.png', url: '照片.png', previewUrl: 'blob:temporary', type: 'image' }, variant: 'timeline',
  })));
  const card=container.querySelector('[role="button"]') as HTMLElement;
  await act(async () => { card.click();card.click(); });
  expect(open).toHaveBeenCalledTimes(2);
  expect(open).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'reference', referenceId: 'upload-1', chatId: 'chat-1', toggle: false, resourceTarget: expect.objectContaining({ url: '照片.png' }) }));
 });
 it('shows a missing address error instead of silently disabling historical cards', async () => {
  const error=jest.spyOn(message,'error').mockImplementation(() => (()=>{}) as never);
  await act(async () => root.render(React.createElement(AttachmentCard, { attachment: { id:'old', name:'notes.txt' }, variant:'timeline' })));
  await act(async () => (container.querySelector('[role="button"]') as HTMLElement).click());
  expect(error).toHaveBeenCalled();expect(open).not.toHaveBeenCalled();
  expect(useAuthenticatedResourceUrl).toHaveBeenLastCalledWith('', 'chat-1', {teamChat:false});
 });
 it('does not open the preview when removing an attachment with the keyboard', async () => {
  const remove=jest.fn();
  await act(async () => root.render(React.createElement(AttachmentCard, { attachment:{id:'r',name:'表单.docx',url:'表单.docx'},variant:'composer',onRemove:remove })));
  const button=container.querySelector('button')!;
  await act(async () => { button.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));button.click(); });
  expect(remove).toHaveBeenCalledTimes(1);expect(open).not.toHaveBeenCalled();
 });
});
