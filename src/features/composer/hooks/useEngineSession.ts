import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthStatus, ConfigSelection, ExternalConfigOption, PreparedSession } from '@/shared/data/api/dto/agentEngine';
import { ApiError } from '@/shared/data/api/http';
import * as api from '@/shared/data/api/requests/agentEngine';
type Input = {
  enabled: boolean;
  active: boolean;
  engineId: string;
  agentKey: string;
  chatId: string;
  draftChatId?: string;
  running: boolean;
};
type State = {
  scope: string;
  preview?: boolean;
  previewLoading?: boolean;
  prepared: PreparedSession | null;
  auth: AuthStatus | null;
  busy: boolean;
  error: string;
  terminal: boolean;
};
function errorCode(error: unknown): string {
  if (error instanceof ApiError) {
    const data = error.data as {
      errorCode?: string;
    } | undefined;
    return data?.errorCode || error.platformError?.code || 'engine_unavailable';
  }
  return 'engine_unavailable';
}
export function useEngineSession(input: Input) {
  const { enabled, active, engineId, agentKey, chatId, draftChatId = '', running } = input;
  const draftScope = `${agentKey}\0${engineId}`;
  const drafts = useRef(new Map<string, string>());
  const draftSelections = useRef(new Map<string, ConfigSelection[]>());
  // Upload, prepare and first Query share one identity, including restored drafts.
  // Clearing upload state on submission must not reserve a different Chat.
  if (enabled && !chatId) {
    if (draftChatId) drafts.current.set(draftScope, draftChatId);
    else if (!drafts.current.has(draftScope)) drafts.current.set(draftScope, `chat_${crypto.randomUUID()}`);
  }
  const effectiveChatId = chatId || drafts.current.get(draftScope) || '';
  const scope = `${draftScope}\0${effectiveChatId}`;
  const current = useRef({ scope, controller: new AbortController(), busy: false, chatId: effectiveChatId, operation: '' });
  const [state, setState] = useState<State>({ scope, prepared: null, auth: null, busy: false, error: '', terminal: false });
  const visible = state.scope === scope ? state : { scope, prepared: null, auth: null, busy: false, error: '', terminal: false };
  const stateRef = useRef(visible);
  stateRef.current = visible;
  const runningRef = useRef(running);
  runningRef.current = running;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const update = useCallback((target: typeof current.current, patch: Partial<State>) => {
    if (current.current === target && scopeRef.current === target.scope && !target.controller.signal.aborted) {
      setState(previous => ({ ...previous, ...patch, scope: target.scope }));
    }
  }, []);
  const prepare = useCallback(async () => {
    const target = current.current;
    if (!enabled || !engineId || running || target.busy || target.scope !== scope)
      return null;
    target.busy = true;
    update(target, { busy: true, error: '' });
    try {
      const signal = target.controller.signal;
      for (let attempt = 0; ; attempt++) {
        if (signal.aborted || runningRef.current || current.current !== target) return null;
        try {
          const { data } = await api.prepareEngineSession({ chatId: target.chatId, ...(!chatId ? { agentKey } : {}) }, signal);
          update(target, { prepared: data, preview: false, auth: null });
          return !signal.aborted && target.scope === scopeRef.current ? data : null;
        } catch (error) {
          // Prepare is repeatable for the same Chat. Only retry explicit lock
          // contention, never login, configuration writes or model requests.
          if (errorCode(error) !== 'engine_busy' || attempt >= 4 || runningRef.current) throw error;
          if (signal.aborted) return null;
          await new Promise<void>(resolve => {
            const finish = () => {
              clearTimeout(timer);
              signal.removeEventListener('abort', finish);
              resolve();
            };
            const timer = setTimeout(finish, 250 * 2 ** attempt);
            signal.addEventListener('abort', finish, {once: true});
          });
        }
      }
    }
    catch (error) {
      const code = errorCode(error);
      // Run hydration can arrive after this request was sent. The occupied
      // session is expected while running; refresh when the Run finishes.
      if (code === 'engine_busy' && runningRef.current) return null;
      update(target, { prepared: null, error: code });
      if (code === 'auth_required') {
        try {
          const { data } = await api.getEngineAuthStatus(engineId, target.controller.signal);
          update(target, { auth: data });
        }
        catch (authError) {
          update(target, { error: errorCode(authError) });
        }
      }
      return null;
    }
    finally {
      target.busy = false;
      update(target, { busy: false });
    }
  }, [enabled, engineId, agentKey, chatId, running, scope, draftScope, update]);
  useEffect(() => {
    const target = { scope, controller: new AbortController(), busy: false,
      chatId: effectiveChatId, operation: '' };
    current.current = target;
    setState(previous => ({ scope, prepared: previous.scope === scope ? previous.prepared : null, preview: previous.scope === scope ? previous.preview : false, auth: null, busy: false, error: '', terminal: false }));

    return () => {
      target.controller.abort();
      // The host also expires abandoned operations after five minutes.
      if (target.operation) void api.cancelEngineAuth(target.operation).catch(() => {});
    };
  }, [scope, enabled]);
  useEffect(() => {
    // First send consumes the draft without resetting the same prepared Chat.
    if (chatId && drafts.current.get(draftScope) === chatId) drafts.current.delete(draftScope);
  }, [chatId, draftScope]);
  useEffect(() => {
    // Navigation reads an existing session before asking the host to acquire a
    // preparation slot. Explicit retry and sending still perform full prepare.
    if (!chatId || !active || !enabled || running || stateRef.current.prepared || stateRef.current.error) return;
    const target = current.current;
    target.busy = true;
    update(target, {busy: true});
    void (async () => {
      let missing = false;
      try {
        const {data} = await api.getEngineSessionConfig(chatId, target.controller.signal);
        update(target, {prepared: data});
      } catch (error) {
        missing = errorCode(error) === 'session_configuration_stale';
        if (!missing) update(target, {error: errorCode(error)});
      } finally {
        target.busy = false;
        update(target, {busy: false});
      }
      if (missing && current.current === target && !target.controller.signal.aborted && !runningRef.current) await prepare();
    })();
  }, [scope, enabled, active]);
  useEffect(() => {
    if (!enabled || chatId || running || !engineId || !agentKey) return;
    const target = current.current;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    update(target, {previewLoading: true});
    const apply = (data: Awaited<ReturnType<typeof api.previewEngineConfig>>['data']) => {
      // Discovery never overwrites a send-time preparation or the user's edits.
      if (disposed || target.busy || current.current !== target || target.controller.signal.aborted
        || (stateRef.current.prepared && !stateRef.current.preview)) return;
      if (!data.configOptions.length) return;
      const selections = draftSelections.current.get(scope) || [];
      const options = data.configOptions.map(option => {
        const selection = selections.find(item => item.configId === option.id);
        return selection ? {...option, currentValue: selection.value} as typeof option : option;
      });
      update(target, {preview: true, error: '', prepared: {chatId: target.chatId, engineId: data.engineId,
        preparationId: '', configRevision: 0, configOptions: options}});
    };
    let retries = 0;
    const refresh = async () => {
      let retryScheduled = false;
      try { apply((await api.previewEngineConfig(agentKey, true, target.controller.signal)).data); }
      catch (error) {
        if (disposed || target.controller.signal.aborted || target.busy || current.current !== target
          || (stateRef.current.prepared && !stateRef.current.preview)) return;
        const code = errorCode(error);
        if (code === 'engine_busy') {
          // Keep cached controls usable; an uncached preview must not spin forever.
          if (retries++ < 2) {
            retryScheduled = true;
            timer = setTimeout(refresh, 5000);
          } else if (!stateRef.current.prepared) {
            update(target, {error: code});
          }
        } else if (code === 'auth_required') {
          update(target, {error: code});
          try { const {data} = await api.getEngineAuthStatus(engineId, target.controller.signal); if (!disposed) update(target, {auth: data}); } catch { /* Sending or explicit retry reports the failure. */ }
        } else if (!stateRef.current.prepared) {
          update(target, {error: code});
        }
      } finally {
        if (!disposed && !retryScheduled) update(target, {previewLoading: false});
      }
    };
    void (async () => {
      try { apply((await api.previewEngineConfig(agentKey, false, target.controller.signal)).data); } catch { /* Cache misses do not block discovery. */ }
      if (!disposed) await refresh();
    })();
    return () => { disposed = true; clearTimeout(timer); update(target, {previewLoading: false}); };
  }, [scope, enabled, chatId, running, engineId, agentKey, update]);
  // Re-read the host's authoritative options after each run, including upstream
  // config_option_update notifications. Never restore a different Chat's menu.
  const wasRunning = useRef(running);
  useEffect(() => {
    const finished = wasRunning.current && !running;
    wasRunning.current = running;
    if (running && stateRef.current.error === 'engine_busy') update(current.current, {error: ''});
    if (finished && enabled && active) void prepare();
  }, [running, enabled, active, prepare]);
  useEffect(() => {
    if (!enabled || !running || !chatId) return;
    const target = current.current;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    // A running Chat may be reopened with no local prepare response. Read the
    // existing host snapshot; never prepare (or acquire a Run slot) for display.
    const read = async () => {
      try {
        const { data } = await api.getEngineSessionConfig(chatId, controller.signal);
        if (!controller.signal.aborted) update(target, { prepared: data });
      } catch (error) {
        // Query can still be starting its session. Wait for its snapshot without
        // showing an error or replacing a confirmed menu with a loading notice.
        if (!controller.signal.aborted && errorCode(error) === 'session_configuration_stale')
          timer = setTimeout(read, 1000);
      }
    };
    void read();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [scope, enabled, running, chatId, update]);
  const configure = useCallback(async (id: string, value: string | boolean) => {
    const target = current.current;
    const prepared = stateRef.current.prepared;
    if (!prepared || target.busy || running)
      return;
    if (stateRef.current.preview) {
      const option = prepared.configOptions.find(item => item.id === id);
      if (!option || (option.type === 'select' && !option.choices.some(choice => choice.value === value))) return;
      const selections = (draftSelections.current.get(scope) || []).filter(item => item.configId !== id);
      draftSelections.current.set(scope, [...selections, {configId: id, value}]);
      update(target, {error: '', prepared: {...prepared, configOptions: prepared.configOptions.map(item => item.id === id ? {...item, currentValue: value} as typeof item : item)}});
      return;
    }
    target.busy = true;
    update(target, { busy: true, error: '' });
    try {
      const { data } = await api.configureEngineSession({ chatId: prepared.chatId, preparationId: prepared.preparationId, configRevision: prepared.configRevision, selections: [{ configId: id, value }] }, target.controller.signal);
      update(target, { prepared: data });
    }
    catch (error) {
      update(target, { prepared: null, error: errorCode(error) });
    }
    finally {
      target.busy = false;
      update(target, { busy: false });
    }
  }, [running, scope, update]);
  const startAuth = useCallback(async (methodId: string) => {
    const target = current.current;
    if (target.busy || target.operation)
      return;
    target.busy = true;
    update(target, { busy: true, error: '' });
    try {
      const { data } = await api.startEngineAuth(engineId, methodId);
      if (target.controller.signal.aborted || target.scope !== scopeRef.current) {
        if (data.authOperationId)
          await api.cancelEngineAuth(data.authOperationId);
        return;
      }
      target.operation = data.authOperationId || '';
      update(target, { auth: data, terminal: data.methods.some(method => method.id === methodId && method.type === 'terminal') });
    }
    catch (error) {
      update(target, { error: errorCode(error) });
    }
    finally {
      target.busy = false;
      update(target, { busy: false });
    }
  }, [engineId, update]);
  const cancelAuth = useCallback(async () => {
    const target = current.current;
    if (!target.operation || target.busy)
      return;
    target.busy = true;
    update(target, { busy: true });
    try {
      await api.cancelEngineAuth(target.operation);
      target.operation = '';
      const auth = stateRef.current.auth;
      update(target, { auth: auth ? { engineId: auth.engineId, methods: auth.methods, state: 'required' } : null, terminal: false, error: 'auth_required' });
    }
    catch (error) {
      update(target, { error: errorCode(error) });
    }
    finally {
      target.busy = false;
      update(target, { busy: false });
    }
  }, [update]);
  useEffect(() => {
    if (visible.auth?.state !== 'authenticating')
      return;
    const target = current.current;
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    const poll = async () => {
      try {
        const { data } = await api.getEngineAuthStatus(engineId, target.controller.signal);
        if (disposed || target.controller.signal.aborted || target.scope !== scopeRef.current)
          return;
        update(target, { auth: data });
        if (data.state !== 'authenticating') {
          target.operation = '';
          update(target, { terminal: false, error: data.state === 'authenticated' ? '' : 'auth_required' });
          if (data.state === 'authenticated')
            await prepare();
          return;
        }
      }
      catch (error) {
        if (disposed || target.controller.signal.aborted)
          return;
        update(target, { error: errorCode(error) });
      }
      if (!disposed && !target.controller.signal.aborted)
        timer = setTimeout(poll, 1000);
    };
    timer = setTimeout(poll, 500);
    return () => { disposed = true; clearTimeout(timer); };
  }, [visible.auth?.state, engineId, prepare, update]);
  const verifyBeforeSend = useCallback(async () => {
    const previous = stateRef.current.prepared;
    const preview = stateRef.current.preview;
    const target = current.current;
    if (!enabled)
      return true;
    if (stateRef.current.error || current.current.busy || stateRef.current.auth?.state === 'authenticating')
      return false;
    let data = await prepare();
    if (!data)
      return false;
    if (preview && previous) {
      target.busy = true;
      update(target, {busy: true});
      try {
        // A removed control must not silently erase an explicit permission/model choice.
        const selections = draftSelections.current.get(target.scope) || [];
        if (selections.some(selection => !data!.configOptions.some(option => option.id === selection.configId))) {
          update(target, {prepared: data, error: 'session_configuration_stale'});
          return false;
        }
        for (const desired of previous.configOptions) {
          if (current.current !== target || target.controller.signal.aborted) return false;
          const option: ExternalConfigOption | undefined = data.configOptions.find(item => item.id === desired.id);
          if (!option || option.type !== desired.type || (option.type === 'select' && !option.choices.some(choice => choice.value === desired.currentValue))) {
            update(target, {prepared: data, error: 'session_configuration_stale'});
            return false;
          }
          if (option.currentValue !== desired.currentValue) {
            data = (await api.configureEngineSession({chatId: data.chatId, preparationId: data.preparationId,
              configRevision: data.configRevision, selections: [{configId: desired.id, value: desired.currentValue}]}, target.controller.signal)).data;
          }
        }
        update(target, {prepared: data, preview: false});
        draftSelections.current.delete(target.scope);
        return !target.controller.signal.aborted && current.current === target;
      } catch (error) {
        update(target, {prepared: data, error: errorCode(error)});
        return false;
      } finally { target.busy = false; update(target, {busy: false}); }
    }
    // Rehydrating an idle session changes its handle, not the user's choices.
    if (previous && JSON.stringify(data.configOptions) !== JSON.stringify(previous.configOptions)) {
      update(current.current, { error: 'session_configuration_stale' });
      return false;
    }
    return true;
  }, [enabled, prepare, update]);
  return { ...visible, prepare, configure, startAuth, cancelAuth, verifyBeforeSend,
    canSend: !enabled || Boolean(!visible.busy && !visible.error && !running && visible.auth?.state !== 'authenticating'),
    pendingChatId: current.current.scope === scope ? current.current.chatId : effectiveChatId };
}
