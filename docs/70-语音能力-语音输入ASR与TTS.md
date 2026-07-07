# 语音输入ASR与TTS

## 当前状态
语音能力由 `src/features/voice/` 提供，包含浏览器音频采集、ASR WebSocket、TTS 播放、语音聊天运行时和调试入口。语音入口由 `VOICE_BASE_URL` 与 `VOICE_ENABLED` 控制。

## 核心职责
- 管理麦克风采集、PCM 编码、下采样和客户端门限过滤。
- 通过 `/api/voice/ws` 建立 ASR/TTS 相关 WebSocket 会话。
- 播放后端返回的 PCM 音频和 ready cue。
- 与 Composer 输入、TTS voice block 和 Settings 语音调试面板联动。

## 核心流程
启用语音后，Composer 可进入语音模式。Voice runtime 初始化音频上下文和 socket，采集音频帧并发送 ASR append/stop 帧。后端返回识别文本或 TTS 音频后，前端更新输入或播放音频。

## 边界与非目标
- 语音依赖浏览器能力和后端语音服务，前端不能保证所有浏览器可用。
- `VOICE_BASE_URL` 为空时不展示语音能力。
- TTS voice markdown block 是内容展示能力，不等同于语音聊天 ASR。

## 相关文件
- `../src/features/voice/lib/voiceRuntime.ts`
- `../src/features/voice/lib/voiceRuntimeCore.ts`
- `../src/features/voice/lib/voiceAudioCapture.ts`
- `../src/features/voice/lib/voiceSocket.ts`
- `../src/features/voice/hooks/useVoiceChatRuntime.ts`
- `../src/features/settings/components/SettingsAsrDebug.tsx`

