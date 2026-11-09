# 实时语音

## 状态与入口

WebClient 已统一切到 Platform 实时语音 v2；当前协议／媒体隔离验证见文末，历史 Chrome 合成输入验证只适用于当时版本。真人 ASR、真实供应商、目标 Agent、长时间运行及 ESP32 尚未验收；部署开关 `VOICE_ENABLED` 默认关闭。只有 Platform 模式、部署开关开启且 `/api/voice/capabilities` 返回 `enabled:true` 才展示入口。Gateway 当前不开放。

capabilities 通过现有认证 HTTP 客户端读取标准 `{code,msg,data}`，包含声音列表；不请求独立 voices 端点，不兼容旧裸响应。HTTP 与 `/api/voice/ws` 都指向同一 `BASE_URL`。请求失败后在主连接恢复或浏览器 online 时重试，合并在途请求并忽略旧身份响应；明确的 `enabled:false` 不重试。能力刷新保留仍有效的音色选择，不自动开启媒体。

## 唯一职责

浏览器只负责采集、必要重采样、PCM 播放及当前媒体控制。`useVoiceChatRuntime` 装配一个 `VoiceSession`；它只发送 hello/listen/abort 和二进制 PCM，不调用 Query、TTS append/commit，不生成时间线节点。Platform 完成 ASR→普通 Query→已持久化完整最终正文→TTS，权限和编辑状态沿用 Agent 默认，不从 Composer 覆盖。

首次用户点击直接准备音频上下文和麦克风权限；采集上下文先请求 16kHz，浏览器拒绝把麦克风接入该采样率（Firefox）时改用默认采样率。输入按实际 `AudioContext.sampleRate` 重采样到 16kHz，跨回调保留采样余量，发送 20ms/640 字节帧，manual stop 先发送对齐的短尾帧。输出按 hello 的 16/24kHz 播放，起始本地余量 140ms，调度窗口 1.5 秒。短暂设备中断保留原 AudioContext 和未播 PCM，暂停时尝试 resume；同时检查时钟进度，覆盖没有 devicechange 的耳机插孔切换。总待播音频最多 10 秒，连续 10 秒无播放进度结束本轮本地播放并提示，保留媒体连接，不重发 Query 或重播全文。慢发送超 64KB 仍结束媒体连接。

每轮开始前检查采集 Context 与音轨，恢复挂起 Context 或重新获取已结束的音轨，恢复最多等待 10 秒，就绪后才发送 listen 并显示收音。采集中设备失效结束媒体连接并提示重连，不取消 Run。关闭或打断使在途恢复操作失效，迟到权限结果释放设备；复用原重采样和尾帧逻辑。

## 控制与会话

- 已有 Chat 通过 hello.chatId 续聊；空白新对话显式发送 `newChat:true`，是否附带 `primary:true` 与文字发送共用 `features/chats/lib/primaryChatIntent`。后端握手只预分配 ID，首条有效识别经普通 Query 创建，后续轮次续用同一 Chat。默认不传新字段的客户端仍使用主要聊天；WebClient 不以该默认语义代替新建。前后端须配套发布，旧后端拒绝新字段时直接提示，禁止去掉新建意图重试。
- 首句结束由后端自动停听；“结束并发送”仍可提前结束本次收音。旧 auto/manual 模式字段、选择器及服务端分支已移除。音色切换仍建立新媒体会话；按键／全双工偏好已按后端和身份隔离保存；切换不重建会话，仅改变播报期间的插话触发来源。
- run.start 的真实 Chat/Run ID 进入既有 `agent:attach-run` 链，复用主聊天的订阅、事件 reducer、HITL 与历史；文字 Query 保留原入口。新 Chat 在实际 Query 后才出现，并用既有 `agent:new-chat-created` 提升地址；普通历史回放补齐已有 primary 的历史。同一 Chat 回放保留媒体连接，刷新后只恢复历史，不重连媒体或重发 Query。
- 成功 Run 结束、最终回答的 tts.stop(done)、该回答的所有 source 播完且非 awaiting，才自动开启下一轮普通 listen。question 提问排空后仅收取带 runId／awaitingId／questionId 的当前答案；notice 排空不自动收音。即使提示的排空回调晚于 run.end，也不能开启普通新一轮。
- 播报时不上传麦克风数据；下一轮等待期间保留上一轮文字，收到新识别文字后再替换。空定稿沿用当前连接继续听，不创建 Chat/Run、不报链路异常；pendingResult:true 时等待服务端保留的最终结果，避免抢先换轮。语聊 ASR 不再设置 10 秒无文字超时，保留单轮 60 秒期限和有界收尾。
- “开始说话”与一个可自定义的页面快捷键共用 listen（Mac 默认 ⌘+Shift+Space，其他平台默认 Ctrl+Shift+Space）：立即本地停播，发送 requestId／递增 turn；普通输入用 conversation intent，当前普通题用 question intent 和三重身份绑定。收到 listen.ready 前只保留最多 500ms 本连接 PCM，之后保序发送。确认 5 秒超时、短缓冲超限或不匹配确认关闭媒体；不重发。快捷键只在页面聚焦时生效；未进入语聊时按既有准入启动，连接中与已经收音时重复输入不重建会话。排除文本／密码编辑、无关弹层、长按与输入法组合，语聊模式／音色下拉框和普通问题的非编辑选项允许使用。成功处理的事件不再交给问题选项。

普通 question 的口语转换、逐题顺序和最终 Submit 均由 Platform 完成。浏览器仅根据当前题通知开始收音；密码交接、approval、planning 和 form 不收音。UI 抢先提交时 awaiting.resolved 停止旧问题采集和播放，忽略晚识别，不产生新的 Query。原 QuestionDialog 从 Chat 当前 awaiting.questionDraft 预填普通答案，按 revision 接受更新；同一等待项不重置全表单、不覆盖用户编辑的字段，密码保持空白。刷新只读仍有效的草稿，语音断线不清草稿，也不恢复或重发媒体。
- “停止任务”单独调用 abort；确认后停在空闲，不自动再次收音。挂断／开始说话不取消 Run。Run 事件按 runId、awaiting 事件按 runId＋awaitingId 处理，均不受媒体 turn 过滤；TTS 使用服务端显式 speechId／purpose，旧 stop 不结束新 speech。
- 挂断、切换 Chat/Agent、身份切换或真正离开页面只关闭语音连接/采集/播放，不关闭共享主聊天连接，不取消已受理 Run。断线显示错误；用户重连执行全新 hello，不补播、不补录音、不重发 Query。hello 之后的 error 按 turn 隔离，旧轮错误与播放阶段迟到的识别结果、识别错误忽略；实际识别失败保留连接并提示。TTS 失败允许已收到的音频播完，用户仍可显式开始新收音。hello 前的 error、断线、设备失效和 invalid_request 结束媒体会话；协议错误不能被媒体轮过滤。错误后紧接断线时显示该错误。Platform 与 WebClient 的 turn 错误契约需一起部署。

Platform 仅在 ASR/TTS 结束和错误边界记录 sessionId、轮次、耗时、音频时长、文本字符数及结果；不记录录音、识别正文或凭据。

## 快捷键偏好与页面可见性

语聊控制区的“语音快捷键”和设置面板复用同一配置组件。支持录制、保存、停用、恢复默认与试按；宏设备只需发送一次普通键盘按下／松开，F13～F24 可独立绑定。试按只显示接收／匹配结果，不启动麦克风。单独文本键、修饰键及已知冲突组合拒绝保存；系统截获的按键须实际试按判断。没有新增快捷键环境变量，VOICE_ENABLED 仍是部署能力开关。

偏好沿用后端／身份作用域在当前浏览器本地保存；缺省取平台默认，显式停用保持停用，损坏或不可读时暂时停用并提示恢复。写入失败只在当前页面生效并提示。改键只更新现有 AppContext 中的偏好，不重建媒体。原按键／全双工模式存储键保留，偏好函数统一在 voicePreferences.ts；页面仅 useVoiceChatRuntime 监听语音键盘。

截图遮挡、切窗口及 visibilitychange(hidden) 不再主动挂断或切回文字。现有会话继续运行，页面可见时不重连、不重发；真正 pagehide／卸载仍关闭媒体。短暂音频中断沿用同连接的有界恢复，真实断线保留错误面板并等待显式重连。浏览器冻结／休眠的实际表现须实测，不放宽缓存和超时。全局 Escape 挂断已移除；挂断使用明确按钮，Escape 留给弹层和录制取消。

## 鉴权与宿主

普通浏览器复用既有凭据，WS 用 bearer 子协议或同源 cookie，URL 不带 token。Desktop guest 不取得 token，宿主只对精确媒体路径注入认证，并先检查浏览器同源 Origin，再向同一 Platform 转发。主 `/ws`、Query/attach 和 Run 控制继续使用 Frame Port。

旧 asr.*/tts.* 协议、浏览器 Query/TTS 编排、ASR/TTS 调试面板及本地门限设置已删除。tts-voice 不再是专用 segment；历史围栏按普通代码文本显示与搜索，无播放状态、回放按钮或隐藏解析器。VIEW 和普通音频文件保持各自原链。

## 验证范围

2026-11-05 故障收尾修复：区分提示与最终回答播放、处理拒绝轮次与 abort 校准、恢复采集设备并限制恢复等待、恢复失败的 capabilities 请求。后端补齐存储错误的轮次收尾、注册失败订阅回滚及中断失败后的显式重试。前端全量 500 组/4465 条通过，最终增加恢复超时用例后的语聊及主要聊天定向回归 7 组/71 条通过；类型、feature 边界、Desktop 契约、i18n 和生产构建通过。Runtime、voice、Server 全量测试以及定向 race 通过，CGO_ENABLED=0 构建通过。新增故障用例在修改前快照可复现原缺陷；采集/播放组合测试只替换浏览器设备和网络边界。真人、耳机插拔、供应商及目标部署验收仍未完成。

2026-11-04 稳定性修复：20 个播放/会话用例通过，覆盖 2 秒暂停与时钟停滞恢复、PCM 顺序和尾包、恢复上限、旧轮错误、空轮续听及清理。Go ASR、语聊（含实际 60 秒静音后同连接问答）和架构检查通过；类型、边界及生产构建通过。全量前端 497 组通过，另 5 组的 34 个失败在修改前快照中同样复现。真实耳机插拔、环境声和真人连续语聊复测尚未完成。

单元测试覆盖 44.1/48kHz 连续采样、短尾帧、迟到权限释放、真实播放排空、awaiting、abort 旧回调、断线、Chat 切换和主 Run attach。Chrome 156.0.8078.76 使用真实 AudioContext、合成输入和静音输出通过 auto/manual/打断/挂断，正常续听相对服务端 tts.stop 延后 143/145/144ms；这不是供应商或真人延迟结论。

完整生产构建另接入隔离 Server/Runtime/原生 Agent 与本地 ASR/TTS/模型替身，验证短答、多轮、manual、question/form/approval 原界面 Submit、410 字落库正文与 TTS 输入一致、primary 历史及刷新恢复。修复了全局终态 Push 抢先截断 attach 回放和首轮地址未提升的问题；适用回归 496 suites/4243 tests 通过。替身输入不能替代真人、供应商或设备验收。

本批命令、基线失败复现、代码增减、清理与真实验收缺项见 workspace `plan/2026-11-02-realtime-voice/T03-webclient-cutover-and-removal.md` 与 T05。

2026-11-06 v2 子项：版本 2＋有效 IANA timeZone、listen.ready 保序、500ms 短预录与 5 秒确认上限、独立 speechId/purpose、按 Run／awaiting 身份更新、页面按键与显式停止任务已接入。前端定向 7 suites／64 tests、typecheck、边界、Desktop 合同、i18n 与隔离输出路径的生产构建通过。该批验证时执行中 Steer 与完整语音答题尚未接入；Steer 最新实现见下条记录。Question 定稿不会被当普通 Query，审批与密码始终回原界面。新版本真人、真实供应商、Desktop、蓝牙遥控器与硬件未验收。

2026-11-06 输入分流子项：本地任务执行中补充由 Platform 复用 Steer；前端按当前 turn／requestId／steerId 显示“已接收补充”，开始新输入、播放或报错时清除提示。未知结果不自动重发，新等待项引起拒绝时保留原界面提示。原 Run 收尾后才允许下一次 Query；远端 Proxy 缺少原子等待项检查时明确拒绝语音补充。此子项的验证与清理记录见 workspace T01，完整 question 与真实环境验收继续保留未完成。


## v2 计时采样（T02）

播放器在音频时钟越过首帧起点后才记录 playStart，优先使用 getOutputTimestamp 映射到 performance 时钟；不支持该接口时标为 context_clock 估计。排队、tts.start、提前停播、静音均不能代替首声；扬声器实际出声仍须回环／外部录音验证。短音频或异常音频时钟未取到证据时保留缺测，不编造时间。播放排空后的自动续听不算插话。

voiceSession 发出 agent:voice-timing 元数据事件，包含同页 timeOrigin、构建、宿主、模式和 codec，不保存缓冲、不上传、不记录正文、答案、录音或凭据。runStartReceived／runEndReceived／asrFinalReceived 只是收到通知的时刻，不能冒充服务端原始阶段时间。每轮记录 complete／empty／error／aborted／superseded／closed，未结束的采样保留 incomplete。

复用 Platform 的 voice-probe 离线入口：

```sh
# 在 agent-platform 仓库运行；这两个入口不读取供应商凭据或调用供应商。
go run ./scripts/voice-probe -browser-script
go run ./scripts/voice-probe -timings /absolute/path/voice-timing.jsonl
```

将第一条打印的脚本显式装入已确认的目标语聊页面，然后开始样本。脚本不打开麦克风；只收集白名单元数据，最多 10000 点。标注音源的最后有效语音采样须先映射到该页面 performance 时钟，再调用 voiceTimingProbe.speechEnd({sessionId, turn, atMs})；不能传文件总时长、Date.now() 或 ASR 定稿时间。以 voiceTimingProbe.jsonl() 导出 JSONL，结束后调用 voiceTimingProbe.dispose() 移除监听与内存缓冲。

统计输出保留所有已开始轮次及结果，错误率分母为所有已开始轮次；同时逐项报告空输入、中断、关闭和未完成，不能把错误率等同最终问答成功率。只有完成且证据有效的样本进入延迟分位数，使用 nearest-rank P50/P95；speechEnd 与 manualStop 指标分开，缺测不会填零。混合构建／宿主／模式／codec 要拆分采样，缓冲溢出拒绝统计。可以拼入 Platform voice.timing 日志，服务端只汇总阶段与冷／热连接、重试次数，不混用两端时间。原始 JSONL 保留关联 ID 供阶段定位。

本次只完成软件采样能力；100 次短问答、1000 次竞态、30 分钟连续运行、Firefox／Desktop／真人／供应商／硬件／部署以及 T08 性能对照仍须真实采样。


### 聊天语音费用

Platform 将供应商实报的 ASR 秒数与 TTS 累计计费字符保存在现有 Chat JSONL，不增加主模型 token、调用次数或上下文。Chat／Run／归档费用来自服务端统一投影；voice 汇总区分未知数量、处理中和未配置价格，已知且有价的部分才计入估算总额。语音用量缺失不等于零。未形成 Chat 的识别仅留服务端运行日志，不生成空聊天或账号账本。

主 WS 的 chat.updated 带 usageChanged:true 时，当前 Chat 重读费用；不重新回放正文或切换 Run。响应按请求顺序和当前 Chat 校验，保留正在发生的 Run／上下文状态。普通 Runtime 费用快照仍是模型／工具基值，现有 usage reducer 只保留服务端给出的语音金额、合并一次，不在客户端估价。界面标注未知数量／价格和刷新失败；不同币种不能直接相加。

归档／删除遇到语音计量仍在途会失败并要求稍后重试。断线只结束媒体，已收到的供应商用量仍记录；写入失败会报告并阻止归档，不伪装成完整费用。进程内在途计数不能补回崩溃前未收到的供应商数量。


## 全双工软件范围（2026-11-07）

默认按键。全双工复用 VoiceAudioCapture 的唯一麦克风／采集 AudioContext，动态加载本地 Silero v5；播放 final／当前普通 question 时只做本地检测，不上传扬声器回声。确认起声后共用 listen()，先停本地播放器，再发送绑定的 listen.start，仍由 Runtime 仲裁 Query／Steer／Submit。notice、审批、密码交接不启用自动答题。

本地预录最多 480ms／15360 bytes，推理积压最多 256ms／4096 samples；加载 20 秒超时或推理失败明确显示不可用，按键入口保留。候选与确认时刻分别发出 speechCandidate／speechDetected，probe 的 candidateToDetection 是模型帧估计，不是声学真值。预录加原 listen.ready 500ms 缓冲总上限 31360 bytes，旧连接／旧推理结果均丢弃。

生产资源固定 vad-web 0.0.31／onnxruntime-web 1.22.0，模型、单线程 WASM、mjs 及许可证由既有 PublicAssetPlugin 打包到同源 assets/voice-vad/0.0.31-1.22.0/，约 12.9 MiB，按钮模式不加载。直接复用包内 Silero／FrameProcessor 接点，不使用自行获取麦克风的 MicVAD，不新增 Worker 或 Desktop 音频引擎；升级依赖时须一起更新资源路径和重新验证这个具体接点。

20 suites／378 tests、1000 次模拟竞态、类型／边界／Desktop 合同／i18n、生产构建通过。真实模型加速处理 1800 秒合成静音零误触发、零失败；这不等于浏览器实际 30 分钟稳定性，也不代表外放／耳机／噪声／首字或 ESP32 已通过。完整状态见工作区计划 T06。


2026-11-08 集成状态：当前浏览器仍协商 PCM；Platform 仅对已验证的 ASR 模型额外公布 Opus 上行，下行保持 PCM。Desktop 的现有静态宿主补齐 wasm MIME，并通过流式编译／mjs／onnx 及原认证代理测试。前端全量首次 4537/4540 通过，3 项失败均在隔离复验中通过；保留超时／时序不稳定记录，不称全量一次全绿。T08 本地完成收尾窗口仅毫秒量级，未新增预合成实现；完整真人／目标部署／ESP32 验收仍未完成，见工作区 T07～T11。
