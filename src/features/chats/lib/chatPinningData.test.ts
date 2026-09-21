import { readChatPinningSnapshot } from './chatPinningData';
import { getChatOrder, getChats } from '@/shared/data';
jest.mock('@/shared/data', () => ({ getChatOrder: jest.fn(), getChats: jest.fn() }));
const order = jest.mocked(getChatOrder);
const list = jest.mocked(getChats);
const ok = <T>(data: T) => ({ data, status: 200, code: 0, msg: 'success' });
beforeEach(() => jest.resetAllMocks());
it('loads the full ordered cross-owner snapshot in one request', async () => {
  const chats = Array.from({ length: 30 }, (_, i) => ({
    chatId: `chat-${i}`, pinned: true,
    ...(i % 2 ? { agentKey: 'coder' } : { teamId: 'team' }),
    read: { isRead: false }, activeRun: { runId: `run-${i}` },
  }));
  order.mockResolvedValue(ok({ sortMode: 'recent', pinnedOrder: ['ignored-legacy-projection'], pinnedChats: chats }));
  expect(await readChatPinningSnapshot()).toEqual({ order: chats.map(c => c.chatId), chats });
  expect(order).toHaveBeenCalledTimes(1);
  expect(list).not.toHaveBeenCalled();
});
it('accepts an empty snapshot without another list request', async () => {
  order.mockResolvedValue(ok({ sortMode: 'manual', pinnedOrder: [], pinnedChats: [] }));
  expect(await readChatPinningSnapshot()).toEqual({ order: [], chats: [] });
  expect(list).not.toHaveBeenCalled();
});
it('rejects a missing snapshot instead of clearing pins or probing another endpoint', async () => {
  order.mockResolvedValue(ok({ sortMode: 'recent', pinnedOrder: [] }) as Awaited<ReturnType<typeof getChatOrder>>);
  await expect(readChatPinningSnapshot()).rejects.toThrow('pinnedChats must be an array');
  expect(list).not.toHaveBeenCalled();
});
it.each([401, 404, 501, 503])('propagates status %s without converting it into empty pins', async status => {
  order.mockRejectedValue({ status });
  await expect(readChatPinningSnapshot()).rejects.toEqual({ status });
  expect(list).not.toHaveBeenCalled();
});
