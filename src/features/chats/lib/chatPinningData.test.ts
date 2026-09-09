import { readChatPinningSnapshot } from './chatPinningData';
import { getChatOrder, getChats } from '@/shared/data';
jest.mock('@/shared/data', () => ({ getChatOrder: jest.fn(), getChats: jest.fn() }));
const order = jest.mocked(getChatOrder);
const list = jest.mocked(getChats);
const ok = <T>(data: T) => ({ data, status: 200, code: 0, msg: 'success' });
beforeEach(() => jest.resetAllMocks());
it('loads all cross-mode pins with no limit or owner filter', async () => {
  const chats = Array.from({ length: 30 }, (_, i) => ({ chatId: `chat-${i}`, pinned: true }));
  order.mockResolvedValue(ok({ sortMode: 'recent', pinnedOrder: ['older-snapshot'] }));
  list.mockResolvedValue(ok(chats));
  expect(await readChatPinningSnapshot()).toEqual({ order: chats.map(c => c.chatId), chats });
  expect(list).toHaveBeenCalledWith({ pinned: true });
});
it('keeps empty pins distinct from unsupported backends', async () => {
  order.mockResolvedValue(ok({ sortMode: 'manual', pinnedOrder: [] }));
  list.mockResolvedValue(ok([]));
  expect(await readChatPinningSnapshot()).toEqual({ order: [], chats: [] });
  order.mockResolvedValue(ok({ sortMode: 'manual' }));
  expect(await readChatPinningSnapshot()).toEqual({ order: null, chats: [] });
  expect(list).toHaveBeenCalledTimes(1);
});
it.each([404, 501])('handles unsupported order status %s', async status => {
  order.mockRejectedValue({ status });
  expect(await readChatPinningSnapshot()).toEqual({ order: null, chats: [] });
  expect(list).not.toHaveBeenCalled();
});
it('does not convert authentication or transient failures into unpinning', async () => {
  order.mockRejectedValue({ status: 401 });
  await expect(readChatPinningSnapshot()).rejects.toEqual({ status: 401 });
  order.mockResolvedValue(ok({ sortMode: 'recent', pinnedOrder: ['a'] }));
  list.mockRejectedValue(new Error('offline'));
  await expect(readChatPinningSnapshot()).rejects.toThrow('offline');
});
