import { describeCronExpression } from "@/features/automations/lib/cronDescription";
import {
  buildI18nRuntimeConfig,
  translateMessage,
  type Locale,
} from "@/shared/i18n";

function describeCron(cron: string, locale: Locale): string {
  const config = buildI18nRuntimeConfig({ locale });
  return describeCronExpression(cron, (key, params) =>
    translateMessage(key, params, config),
  );
}

describe("describeCronExpression", () => {
  it.each([
    ["* * * * *", "每分钟"],
    ["*/2 * * * *", "每 2 分钟"],
    ["0 */2 * * *", "每 2 小时"],
    ["30 * * * *", "每小时第 30 分钟"],
    ["0 15 * * *", "每天 15:00"],
    ["0 9 * * 1-5", "工作日 09:00"],
    ["30 9 * * 1,3,5", "每周一、周三、周五 09:30"],
    ["0 9 1 * *", "每月 1 日 09:00"],
    ["0 9 1 1 *", "每年 1 月 1 日 09:00"],
    ["*/15 9-17 * * 1-5", "工作日 09:00–17:59，每 15 分钟"],
  ])("describes %s in Chinese", (cron, expected) => {
    expect(describeCron(cron, "zh-CN")).toBe(expected);
  });

  it.each([
    ["*/2 * * * *", "Every 2 minutes"],
    ["0 */2 * * *", "Every 2 hours"],
    ["0 9 * * *", "Every day 09:00"],
    ["0 18 * * 1-5", "Weekdays 18:00"],
    ["0 9 * * MON", "Every Monday 09:00"],
    ["0 9 1 * *", "Monthly on day 1 at 09:00"],
  ])("describes %s in English", (cron, expected) => {
    expect(describeCron(cron, "en-US")).toBe(expected);
  });

  it("keeps uncommon or invalid expressions inspectable", () => {
    expect(describeCron("0 9 1 * 1", "zh-CN")).toBe("0 9 1 * 1");
    expect(describeCron("0 9 * *", "zh-CN")).toBe("0 9 * *");
    expect(describeCron("", "zh-CN")).toBe("--");
  });
});
