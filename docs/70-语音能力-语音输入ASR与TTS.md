# 实时语音

## 状态与入口

WebClient 已切换 Platform 实时语音 v1，并通过隔离协议、音频与 Chrome 合成输入验证。真人 ASR、真实供应商、目标 Agent、长时间运行及 ESP32 尚未验收；部署开关 `VOICE_ENABLED` 默认关闭。只有 Platform 模式、部署开关开启且 `/api/voice/capabilities` 返回 `enabled:true` 才展示入口。Gateway 当前不开放。

capabilities 通过现有认证 HTTP 客户端读取标准 `{code,msg,data}`，包含声音列表；不请求独立 voices 端点，不兼容旧裸响应。HTTP 与 `/api/voice/ws` 都指向同一 `BASE_URL`。

## 唯一职责

浏览器只负责采集、必要重采样、PCM 播放及当前媒体控制。`useVoiceChatRuntime` 装配一个 `VoiceSession`；它只发送 hello/listen/abort 和二进制 PCM，不调用 Query、TTS append/commit，不生成时间线节点。Platform 完成 ASR→普通 Query→已持久化完整最终正文→TTS，权限和编辑状态沿用 Agent 默认，不从 Composer 覆盖。

首次用户点击直接准备音频上下文和麦克风权限。输入按实际 `AudioContext.sampleRate` 重采样到 16kHz，跨回调保留采样余量，发送 20ms/640 字节帧，manual stop 先发送对齐的短尾帧。输出按 hello 的 16/24kHz 播放，起始本地余量 140ms，调度音频上限 1 秒。慢发送超 64KB 或播放异常结束媒体连接；无重放队列。

## 控制与会话

- auto 首句结束由后端停听；manual 累计多句，用户点击“结束并发送”后只发送一次 listen(stop)。切换收音模式或声音会建立新的媒体会话，只允许在收音/空闲/错误时选择。
- run.start 的真实 Chat/Run ID 进入既有 `agent:attach-run` 链，复用主聊天的订阅、事件 reducer、HITL 与历史；文字 Query 保留原入口。首次主 Chat 在实际 Query 后才出现，并用既有 `agent:new-chat-created` 提升地址；普通历史回放补齐已有 primary 的历史。同一 Chat 回放保留媒体连接，刷新后只恢复历史，不重连媒体或重发 Query。
- 成功 Run 结束、tts.stop(done)、本地所有 source 播完且非 awaiting，才自动再 listen。固定 awaiting 提示播完仍等待已有界面 Submit。
- 打断立即停采集和所有已调度 source，确认前丢弃媒体；后端 abort 确认后才重新收音。Run 取消及排他仍归 Platform。
- 挂断、切换 Chat/Agent、隐藏或离开页面只关闭语音连接/采集/播放，不关闭共享主聊天连接，不取消已受理 Run。断线显示错误；用户重连执行全新 hello，不补播、不补录音、不重发 Query。

## 鉴权与宿主

普通浏览器复用既有凭据，WS 用 bearer 子协议或同源 cookie，URL 不带 token。Desktop guest 不取得 token，宿主只对精确媒体路径注入认证，并先检查浏览器同源 Origin，再向同一 Platform 转发。主 `/ws`、Query/attach 和 Run 控制继续使用 Frame Port。

旧 asr.*/tts.* 协议、浏览器 Query/TTS 编排、ASR/TTS 调试面板及本地门限设置已删除。tts-voice 不再是专用 segment；历史围栏按普通代码文本显示与搜索，无播放状态、回放按钮或隐藏解析器。VIEW 和普通音频文件保持各自原链。

## 验证范围

单元测试覆盖 44.1/48kHz 连续采样、短尾帧、迟到权限释放、真实播放排空、awaiting、abort 旧回调、断线、Chat 切换和主 Run attach。Chrome 156.0.8078.76 使用真实 AudioContext、合成输入和静音输出通过 auto/manual/打断/挂断，正常续听相对服务端 tts.stop 延后 143/145/144ms；这不是供应商或真人延迟结论。

完整生产构建另接入隔离 Server/Runtime/原生 Agent 与本地 ASR/TTS/模型替身，验证短答、多轮、manual、question/form/approval 原界面 Submit、410 字落库正文与 TTS 输入一致、primary 历史及刷新恢复。修复了全局终态 Push 抢先截断 attach 回放和首轮地址未提升的问题；适用回归 496 suites/4243 tests 通过。替身输入不能替代真人、供应商或设备验收。

本批命令、基线失败复现、代码增减、清理与真实验收缺项见 workspace `plan/2026-11-02-realtime-voice/T03-webclient-cutover-and-removal.md` 与 T05。
