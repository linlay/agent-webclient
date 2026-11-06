import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {App, Button, ConfigProvider, Segmented, theme} from 'antd';
import type {TextAreaRef} from 'antd/es/input/TextArea';
import {AppProvider} from '@/app/state/AppContext';
import {I18nProvider} from '@/shared/i18n';
import {interactionDefaults} from '@/shared/contracts/interaction';
import {ComposerProvider} from '@/features/composer/components/ComposerContext';
import {ComposerContextBar} from '@/features/composer/components/ComposerContextBar';
import {ComposerInput} from '@/features/composer/components/ComposerInput';
import {ComposerActions} from '@/features/composer/components/ComposerActions';
import {EngineSessionControls} from '@/features/composer/components/EngineSessionControls';
import type {useEngineSession} from '@/features/composer/hooks/useEngineSession';
import {bindCssModuleClasses} from '@/shared/utils/cssModuleClasses';
import composerStyles from '@/features/composer/components/ComposerPresentation.module.css';
import '@/shared/styles/globals.css';
const classes = bindCssModuleClasses({...composerStyles});
const noop = () => {};
const scenarios = ['连接中', '已就绪', '连接失败', '需要登录', '等待登录'];
function Preview() {
  const [scenario, setScenario] = useState('连接中');
  const [dark, setDark] = useState(false);
  const [input, setInput] = useState('');
  const ref = useRef<TextAreaRef>(null);
  useEffect(() => {document.documentElement.dataset.theme = dark ? 'dark' : 'light';}, [dark]);
  const ready = scenario === '已就绪';
  const session: ReturnType<typeof useEngineSession> = {
    scope:'fixture', busy: scenario === '连接中', error: scenario === '连接失败' ? 'engine_busy' : scenario === '需要登录' ? 'auth_required' : '',
    auth: scenario.includes('登录') ? {engineId:'fixture', state: scenario === '需要登录' ? 'required' : 'authenticating',
      authOperationId: scenario === '等待登录' ? 'qa-auth' : undefined,
      methods: [{id:'browser', name:'ChatGPT', type:'terminal', available:true}, {id:'api', name:'API Key', type:'terminal', available:false}]} : null,
    terminal:false, canSend:ready, pendingChatId:'fixture',
    prepare: async () => {setScenario('连接中'); window.setTimeout(() => setScenario('已就绪'), 1500); return null;},
    startAuth:async () => {setScenario('等待登录');}, cancelAuth:async () => {setScenario('需要登录');},
    configure: async () => {}, verifyBeforeSend: async () => true,
    prepared: {chatId:'fixture', engineId:'fixture', preparationId:'qa', configRevision:1, configOptions:[
      {id:'mode', category:'mode', type:'select', name:'Mode', currentValue:'auto', choices:[{value:'auto',name:'Auto review'}]},
      {id:'model', category:'model', type:'select', name:'Model', currentValue:'sol', choices:[{value:'sol',name:'6.1 Sol'}]},
      {id:'effort', category:'thought_level', type:'select', name:'Effort', currentValue:'medium', choices:[{value:'medium',name:'Medium'}]},
    ]},
  };
  return <ConfigProvider theme={{algorithm:dark ? theme.darkAlgorithm : theme.defaultAlgorithm}}><App>
    <main style={{minHeight:'100dvh', background:'var(--bg-base)', color:'var(--text-main)', padding:'48px 20px'}}>
      <div style={{maxWidth:800, margin:'auto'}}>
        <h1 style={{fontSize:22, marginBottom:8}}>会话连接状态</h1>
        <p style={{color:'var(--text-muted)', marginBottom:24}}>实际输入框与工具栏组件 · 隔离预览，不连接引擎</p>
        <div style={{display:'flex', gap:12, flexWrap:'wrap', marginBottom:64}}>
          <Segmented style={{maxWidth:"100%", overflowX:"auto"}} options={scenarios} value={scenario} onChange={setScenario} />
          <Button onClick={() => setDark(!dark)}>切换主题</Button>
        </div>
        <ComposerProvider value={{inputValue:input,setInputValue:setInput,activeSlashIndex:0,setActiveSlashIndex:noop,slashDismissed:false,setSlashDismissed:noop,
          captureDesktopScreenshot:async()=>false,openFilePicker:noop,handleSend:noop,interruptCurrentRun:async()=>{},executeSlashCommand:async()=>{},toggleSpeechInput:noop,applyComposerDraft:setInput}}>
          <ComposerContextBar agents={[{key:'fixture',name:'zenmind-agent-plugins',mode:'CODER'}]} currentAgentKey="fixture" currentWorkerName="zenmind-agent-plugins" isCoder isKbase={false} onSelectAgent={noop}/>
          <div data-preview-composer className={classes('composer-pill tw:bg-[var(--control-input-bg)] tw:rounded-[var(--control-radius-lg)] tw:relative tw:flex tw:flex-col tw:border tw:border-border tw:p-1.5')}>
            <ComposerInput isVoiceMode={false} isFrontendActive={false} isTimelineEmpty inputValue={input} currentWorkerName="zenmind-agent-plugins" voiceStatus="idle" voiceError="" partialUserText="" partialAssistantText="" onInputChange={setInput} onKeyDown={noop} onPaste={noop} onDragOver={noop} onDrop={noop} onCompositionStart={noop} onCompositionEnd={noop} textareaRef={ref}/>
            <ComposerActions currentAgentKey="" interactionConfig={interactionDefaults('CODER')} accessLevel="ask_for_approval" modelOverride={{}} isFrontendActive={false} isVoiceMode={false} isStreaming={false} canCaptureDesktopScreenshot={false} isCapturingDesktopScreenshot={false} planningMode={false} canUsePlanningMode={false} editingMode={false} canUseEditingMode={false} currentChatId="fixture" voiceEnabled={false} hasUploadingAttachments={false} speechListening={false} speechSupported={false} speechStatus="" sendDisabled={!ready || !input} selectedSkillIds={[]} isMainChatRunning={false} onAccessLevelChange={noop} onControlParamsChange={noop} onModelOverrideChange={noop} onTogglePlanningMode={noop} onEditingModeChange={noop} onAddReference={noop} onSelectSkill={noop}
              renderSettings={(compact,disabled) => <EngineSessionControls session={session} engineId="fixture" running={false} themeMode={dark?'dark':'light'} compact={compact} disabled={disabled}/>} />
          </div>
        </ComposerProvider>
      </div>
    </main>
  </App></ConfigProvider>;
}
createRoot(document.getElementById('root')!).render(<I18nProvider locale="zh-CN" persistLocale={false}><AppProvider><Preview/></AppProvider></I18nProvider>);
