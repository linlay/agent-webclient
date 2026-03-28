export type BackgroundCommandType = "remember" | "learn";

const BACKGROUND_COMMAND_PROMPTS: Record<BackgroundCommandType, string> = {
	remember:
		"请基于当前 chatId 对应的完整对话，提炼其中值得长期保留的用户偏好、事实、约束、约定与背景信息，写入记忆。若没有明确可记忆内容，请返回空结果，不要编造。",
	learn:
		"请基于当前 chatId 对应的完整对话，提炼本轮可复用的经验、规则、做法、模式与教训，写入学习沉淀。若没有明确可学习内容，请返回空结果，不要编造。",
};

export function getBackgroundCommandPrompt(
	commandType: BackgroundCommandType,
): string {
	return BACKGROUND_COMMAND_PROMPTS[commandType];
}
