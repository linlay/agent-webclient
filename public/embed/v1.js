/* Zenmind Embed SDK v1. No dependencies. Tokens are never placed in URLs or browser storage. */
(function (global) {
  'use strict';
  var scriptOrigin = document.currentScript && new URL(document.currentScript.src).origin;
  function mount(target, options) {
    options = options || {};
    var container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!container || !options.agentKey || typeof options.getToken !== 'function') throw new Error('Invalid embed configuration');
    var base = new URL(options.origin || scriptOrigin);
    if (base.origin === location.origin) throw new Error('Embed requires a separate origin');
    if (base.protocol !== 'https:' && !(['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) && base.protocol === 'http:')) throw new Error('HTTPS required');
    var instanceId = crypto.randomUUID();
    var iframe = document.createElement('iframe');
    var url = new URL('/embed/' + encodeURIComponent(options.agentKey), base.origin);
    url.searchParams.set('embedId', instanceId);
    url.searchParams.set('parentOrigin', location.origin);
    iframe.src = url.href;
    iframe.title = options.title || 'Agent chat';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads');
    iframe.referrerPolicy = 'no-referrer';
    iframe.style.cssText = 'display:block;width:100%;height:100%;min-width:320px;border:0';
    var port, sessionId, destroyed = false, initialized = false;
    var listeners = new Map(), requests = new Map();
    var resolveReady, rejectReady;
    var ready = new Promise(function (resolve, reject) { resolveReady = resolve; rejectReady = reject; });
    ready.catch(function () {});
    var readyTimer = setTimeout(function () { rejectReady(new Error('embed_timeout')); }, 35000);
    function emit(type, payload) { (listeners.get(type) || new Set()).forEach(function (fn) { fn(payload); }); }
    function post(type, payload, requestId) {
      if (destroyed || !port) throw new Error('embed_closed');
      port.postMessage({ version: 1, instanceId: instanceId, sessionId: sessionId, type: type, payload: payload, requestId: requestId });
    }
    function request(type, payload) {
      return new Promise(function (resolve, reject) {
        var id = crypto.randomUUID();
        var timer = setTimeout(function () { requests.delete(id); reject(new Error('command_timeout')); }, 20000);
        requests.set(id, { resolve: resolve, reject: reject, timer: timer });
        try { post(type, payload, id); } catch (error) { clearTimeout(timer); requests.delete(id); reject(error); }
      });
    }
    async function authorize(id) {
      var epoch = sessionId;
      try { var credential = await options.getToken(); if (epoch !== sessionId || destroyed) return; post('auth.token', credential, id); }
      catch (error) { if (epoch !== sessionId || destroyed) return; post('auth.token', null, id); emit('error', { code: 'auth_required' }); }
    }
    function disconnect(reason) {
      initialized = false;
      if (port) { port.close(); port = null; }
      requests.forEach(function (value) { clearTimeout(value.timer); value.reject(new Error(reason)); });
      requests.clear();
    }
    function onMessage(event) {
      var message = event.data;
      if (destroyed || event.source !== iframe.contentWindow || event.origin !== base.origin || !message || message.version !== 1 || message.type !== 'hello' || message.instanceId !== instanceId || typeof message.sessionId !== 'string') return;
      if (port && sessionId === message.sessionId) return;
      disconnect('embed_reloaded');
      sessionId = message.sessionId;
      var channel = new MessageChannel();
      port = channel.port1;
      port.onmessage = async function (event) {
        var msg = event.data;
        if (!msg || msg.version !== 1 || msg.instanceId !== instanceId || msg.sessionId !== sessionId) return;
        if (msg.type === 'connected') {
          try {
            var epoch = sessionId;
            var credential = await options.getToken();
            if (epoch !== sessionId || destroyed) return;
            await request('init', { credential: credential, chatId: options.chatId, theme: options.theme, locale: options.locale, features: options.features, context: options.context });
            initialized = true;
          } catch (error) { if (epoch !== sessionId || destroyed) return; post('auth.failed', {}); rejectReady(error); emit('error', { code: error.message }); }
        } else if (msg.type === 'auth.refresh') { void authorize(msg.requestId); }
        else if (msg.type === 'response') {
          var pending = requests.get(msg.requestId);
          if (!pending) return;
          clearTimeout(pending.timer); requests.delete(msg.requestId);
          if (msg.payload && msg.payload.ok) pending.resolve(msg.payload.result);
          else pending.reject(new Error(msg.payload && msg.payload.code || 'command_failed'));
        } else {
          if (msg.type === 'ready') { clearTimeout(readyTimer); resolveReady(api); }
          emit(msg.type, msg.payload);
        }
      };
      port.start();
      iframe.contentWindow.postMessage({ version: 1, instanceId: instanceId, sessionId: sessionId, type: 'connect' }, base.origin, [channel.port2]);
    }
    window.addEventListener('message', onMessage);
    var api = {
      iframe: iframe, ready: ready,
      on: function (type, handler) { if (!listeners.has(type)) listeners.set(type, new Set()); var handlers = listeners.get(type); handlers.add(handler); return function () { handlers.delete(handler); }; },
      send: function (text) { return command('send', { text: text }); },
      prefill: function (text) { return command('prefill', { text: text }); },
      setContext: function (context) { return command('setContext', context); },
      openChat: function (chatId) { return command('openChat', { chatId: chatId }); },
      newChat: function () { return command('newChat'); },
      interrupt: function () { return command('interrupt'); },
      setTheme: function (theme) { return command('setTheme', { theme: theme }); },
      focus: function () { return command('focus'); },
      destroy: function () {
        if (destroyed) return;
        destroyed = true; clearTimeout(readyTimer); rejectReady(new Error('embed_closed'));
        disconnect('embed_closed'); window.removeEventListener('message', onMessage); iframe.remove(); listeners.clear();
      }
    };
    function command(type, payload) { return ready.then(function () { if (!initialized) throw new Error('not_ready'); return request(type, payload); }); }
    container.appendChild(iframe);
    return api;
  }
  global.ZenmindChat = { mount: mount };
})(window);
