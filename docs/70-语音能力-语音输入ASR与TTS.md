# 实时语音

## 状态与入口

WebClient 已切换 Platform 实时语音 v1，并通过隔离协议、音频与 Chrome 合成输入验证。真人 ASR、真实供应商、目标 Agent、长时间运行及 ESP32 尚未验收；部署开关 `VOICE_ENABLED` 默认关闭。只有 Platform 模式、部署开关开启且 `/api/voice/capabilities` 返回 `enabled:true` 才展示入口。Gateway 当前不开放。

capabilities 通过现有认证 HTTP 客户端读取标准 `{code,msg,data}`，包含声音列表；不请求独立 voices 端点，不兼容旧裸响应。HTTP 与 `/api/voice/ws` 都指向同一 `BASE_URL`。请求失败后在主连接恢复或浏览器 online 时重试，合并在途请求并忽略旧身份响应；明确的 `enabled:false` 不重试。能力刷新保留仍有效的音色选择，不自动开启媒体。

## 唯一职责

浏览器只负责采集、必要重采样、PCM 播放及当前媒体控制。`useVoiceChatRuntime` 装配一个 `VoiceSession`；它只发送 hello/listen/abort 和二进制 PCM，不调用 Query、TTS append/commit，不生成时间线节点。Platform 完成 ASR→普通 Query→已持久化完整最终正文→TTS，权限和编辑状态沿用 Agent 默认，不从 Composer 覆盖。

首次用户点击直接准备音频上下文和麦克风权限；采集上下文先请求 16kHz，浏览器拒绝把麦克风接入该采样率（Firefox）时改用默认采样率。输入按实际 `AudioContext.sampleRate` 重采样到 16kHz，跨回调保留采样余量，发送 20ms/640 字节帧，manual stop 先发送对齐的短尾帧。输出按 hello 的 16/24kHz 播放，起始本地余量 140ms，调度窗口 1.5 秒。短暂设备中断保留原 AudioContext 和未播 PCM，暂停时尝试 resume；同时检查时钟进度，覆盖没有 devicechange 的耳机插孔切换。总待播音频最多 10 秒，连续 10 秒无播放进度结束本轮本地播放并提示，保留媒体连接，不重发 Query 或重播全文。慢发送超 64KB 仍结束媒体连接。

每轮开始前检查采集 Context 与音轨，恢复挂起 Context 或重新获取已结束的音轨，恢复最多等待 10 秒，就绪后才发送 listen 并显示收音。采集中设备失效结束媒体连接并提示重连，不取消 Run。关闭或打断使在途恢复操作失效，迟到权限结果释放设备；复用原重采样和尾帧逻辑。

## 控制与会话

- 已有 Chat 通过 hello.chatId 续聊；空白新对话显式发送 `newChat:true`，是否附带 `primary:true` 与文字发送共用 `features/chats/lib/primaryChatIntent`。后端握手只预分配 ID，首条有效识别经普通 Query 创建，后续轮次续用同一 Chat。默认不传新字段的客户端仍使用主要聊天；WebClient 不以该默认语义代替新建。前后端须配套发布，旧后端拒绝新字段时直接提示，禁止去掉新建意图重试。
- auto 首句结束由后端停听；manual 累计多句，用户点击“结束并发送”后只发送一次 listen(stop)。切换收音模式或声音会建立新的媒体会话，只允许在收音/空闲/错误时选择。
- run.start 的真实 Chat/Run ID 进入既有 `agent:attach-run` 链，复用主聊天的订阅、事件 reducer、HITL 与历史；文字 Query 保留原入口。新 Chat 在实际 Query 后才出现，并用既有 `agent:new-chat-created` 提升地址；普通历史回放补齐已有 primary 的历史。同一 Chat 回放保留媒体连接，刷新后只恢复历史，不重连媒体或重发 Query。
- 成功 Run 结束、最终回答的 tts.stop(done)、该回答的所有 source 播完且非 awaiting，才自动再 listen。提示与最终回答分别记录播放用途；即使提示的排空回调晚于 run.end，也不能开启下一轮。固定 awaiting 提示播完仍等待已有界面 Submit。
- 播报时不上传麦克风数据；下一轮等待期间保留上一轮文字，收到新识别文字后再替换。空定稿沿用当前连接继续听，不创建 Chat/Run、不报链路异常。语聊 ASR 不再设置 10 秒无文字超时，保留单轮 60 秒期限和有界收尾。
- 打断立即停采集和所有已调度 source，确认前丢弃媒体；后端 abort 确认后按确认 turn 校准下一轮才重新收音；确认只代表媒体隔离。Run 取消及排他仍归 Platform，中断失败后允许再次显式打断。
- 挂断、切换 Chat/Agent、隐藏或离开页面只关闭语音连接/采集/播放，不关闭共享主聊天连接，不取消已受理 Run。断线显示错误；用户重连执行全新 hello，不补播、不补录音、不重发 Query。hello 之后的 error 按 turn 隔离，旧轮错误与播放阶段迟到的识别结果、识别错误忽略；实际识别失败保留连接并提示。TTS 失败允许已收到的音频播完，只有尾部排空后才能再次 listen。hello 前的 error、断线、设备失效和 turn_busy 结束媒体会话；turn_busy 携带的可能是服务端上一轮，不能被新轮过滤。错误后紧接断线时显示该错误。Platform 与 WebClient 的 turn 错误契约需一起部署。

Platform 仅在 ASR/TTS 结束和错误边界记录 sessionId、轮次、耗时、音频时长、文本字符数及结果；不记录录音、识别正文或凭据。

## 鉴权与宿主

普通浏览器复用既有凭据，WS 用 bearer 子协议或同源 cookie，URL 不带 token。Desktop guest 不取得 token，宿主只对精确媒体路径注入认证，并先检查浏览器同源 Origin，再向同一 Platform 转发。主 `/ws`、Query/attach 和 Run 控制继续使用 Frame Port。

旧 asr.*/tts.* 协议、浏览器 Query/TTS 编排、ASR/TTS 调试面板及本地门限设置已删除。tts-voice 不再是专用 segment；历史围栏按普通代码文本显示与搜索，无播放状态、回放按钮或隐藏解析器。VIEW 和普通音频文件保持各自原链。

## 验证范围

2026-11-05 故障收尾修复：区分提示与最终回答播放、处理拒绝轮次与 abort 校准、恢复采集设备并限制恢复等待、恢复失败的 capabilities 请求。后端补齐存储错误的轮次收尾、注册失败订阅回滚及中断失败后的显式重试。前端全量 500 组/4465 条通过，最终增加恢复超时用例后的语聊及主要聊天定向回归 7 组/71 条通过；类型、feature 边界、Desktop 契约、i18n 和生产构建通过。Runtime、voice、Server 全量测试以及定向 race 通过，CGO_ENABLED=0 构建通过。新增故障用例在修改前快照可复现原缺陷；采集/播放组合测试只替换浏览器设备和网络边界。真人、耳机插拔、供应商及目标部署验收仍未完成。

2026-11-04 稳定性修复：20 个播放/会话用例通过，覆盖 2 秒暂停与时钟停滞恢复、PCM 顺序和尾包、恢复上限、旧轮错误、空轮续听及清理。Go ASR、语聊（含实际 60 秒静音后同连接问答）和架构检查通过；类型、边界及生产构建通过。全量前端 497 组通过，另 5 组的 34 个失败在修改前快照中同样复现。真实耳机插拔、环境声和真人连续语聊复测尚未完成。

单元测试覆盖 44.1/48kHz 连续采样、短尾帧、迟到权限释放、真实播放排空、awaiting、abort 旧回调、断线、Chat 切换和主 Run attach。Chrome 156.0.8078.76 使用真实 AudioContext、合成输入和静音输出通过 auto/manual/打断/挂断，正常续听相对服务端 tts.stop 延后 143/145/144ms；这不是供应商或真人延迟结论。

完整生产构建另接入隔离 Server/Runtime/原生 Agent 与本地 ASR/TTS/模型替身，验证短答、多轮、manual、question/form/approval 原界面 Submit、410 字落库正文与 TTS 输入一致、primary 历史及刷新恢复。修复了全局终态 Push 抢先截断 attach 回放和首轮地址未提升的问题；适用回归 496 suites/4243 tests 通过。替身输入不能替代真人、供应商或设备验收。

本批命令、基线失败复现、代码增减、清理与真实验收缺项见 workspace `plan/2026-11-02-realtime-voice/T03-webclient-cutover-and-removal.md` 与 T05。
