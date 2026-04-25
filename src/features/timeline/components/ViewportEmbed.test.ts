import {
  bindViewportInitListener,
  shouldPostViewportUpdate,
} from '@/features/timeline/components/ViewportEmbed';

describe('ViewportEmbed helpers', () => {
  it('binds iframe load and sends init immediately', () => {
    const addEventListener = jest.fn();
    const removeEventListener = jest.fn();
    const sendInit = jest.fn();

    const cleanup = bindViewportInitListener(
      {
        addEventListener,
        removeEventListener,
      },
      sendInit,
    );

    expect(addEventListener).toHaveBeenCalledWith('load', sendInit);
    expect(sendInit).toHaveBeenCalledTimes(1);

    cleanup();

    expect(removeEventListener).toHaveBeenCalledWith('load', sendInit);
  });

  it('posts viewport updates only when the active frame is current and the signature changed', () => {
    expect(shouldPostViewportUpdate({
      html: '<html></html>',
      currentFrameKey: 'leave_form::<html></html>',
      expectedFrameKey: 'leave_form::<html></html>',
      lastPostedSignature: 'sig-1',
      signature: 'sig-2',
    })).toBe(true);

    expect(shouldPostViewportUpdate({
      html: '<html></html>',
      currentFrameKey: 'leave_form::<html></html>',
      expectedFrameKey: 'leave_form::<html></html>',
      lastPostedSignature: 'sig-2',
      signature: 'sig-2',
    })).toBe(false);

    expect(shouldPostViewportUpdate({
      html: '<html></html>',
      currentFrameKey: 'other::<html></html>',
      expectedFrameKey: 'leave_form::<html></html>',
      lastPostedSignature: 'sig-1',
      signature: 'sig-2',
    })).toBe(false);
  });
});
