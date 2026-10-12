# 语音输入ASR与TTS

## 当前状态
语音能力由 `src/features/voice/` 提供，包含浏览器音频采集、ASR WebSocket、TTS 播放、语音聊天运行时和调试入口。当前 isVoiceEnabled() 固定返回 false，语音入口与 TTS 运行时初始化关闭，ASR 生命周期阻止语音启动，页面加载不建立语音连接。语音实现保留，以下流程用于恢复后的能力说明。

## 核心职责
- 管理麦克风采集、PCM 编码、下采样和客户端门限过滤。
- 通过 `/api/voice/ws` 建立 ASR/TTS 相关 WebSocket 对话。
- 播放后端返回的 PCM 音频和 ready cue。
- 与 Composer 输入、TTS voice block 和 Settings 语音调试面板联动。

## 核心流程
启用语音后，Composer 可进入语音模式。Voice runtime 初始化音频上下文和 socket，采集音频帧并发送 ASR append/stop 帧。后端返回识别文本或 TTS 音频后，前端更新输入或播放音频。

## 边界与非目标
- 语音依赖浏览器能力和后端语音服务，前端不能保证所有浏览器可用。
- 恢复统一开关后，语音连接仍需有效上游与浏览器能力。
- TTS voice markdown block 是内容展示能力，不等同于语音聊天 ASR。

## 相关文件
- `../src/features/voice/lib/voiceRuntime.ts`
- `../src/features/voice/lib/voiceRuntimeCore.ts`
- `../src/features/voice/lib/voiceAudioCapture.ts`
- `../src/features/voice/lib/voiceSocket.ts`
- `../src/features/voice/hooks/useVoiceChatRuntime.ts`
- `../src/features/settings/components/SettingsAsrDebug.tsx`

