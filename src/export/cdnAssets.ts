export type ConversationExportCdnAsset = Readonly<{
  version: string;
  url: string;
  integrity: string;
}>;

export const ECHARTS_CDN_ASSET: ConversationExportCdnAsset = {
  version: "6.0.0",
  url: "echarts.min.js",
  integrity:
    "sha384-F07Cpw5v8spSU0H113F33m2NQQ/o6GqPTnTjf45ssG4Q6q58ZwhxBiQtIaqvnSpR",
};

export const MERMAID_CDN_ASSET: ConversationExportCdnAsset = {
  version: "11.16.0",
  url: "mermaid.min.js",
  integrity:
    "sha384-T/0lMUdJpd2S1ZHtRiofG3htU3xPCrFVeAQ1UUE2TJwlEJSV5NUwn30kP28n238E",
};
