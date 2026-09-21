/** @jest-environment jsdom */

import {
  applyConversationExportFavicon,
  applyPublicShareFavicon,
  readLocalExportBrandId,
  readPublicShareBrand,
  publicShareBrandIcon,
} from "./publicShareBrand";

jest.mock("./brand-icons/zenmind.svg", () => "zenmind-icon");
jest.mock("./brand-icons/cutej.svg", () => "cutej-icon");
jest.mock("@/shared/icons/agent-icons/default.svg", () => "default-icon");

function setBrandMeta(content: string): void {
  document.head.innerHTML = `<meta name="conversation-export-public-brand">`;
  document.querySelector("meta")!.setAttribute("content", content);
}

describe("public share brand", () => {
  afterEach(() => { document.head.innerHTML = ""; });

  it("keeps a local HTML export free of the public app entry", () => {
    setBrandMeta("");
    expect(readPublicShareBrand()).toBeNull();
  });

  it("reads a validated local export brand independently from the public brand", () => {
    document.head.innerHTML = '<meta name="conversation-export-local-brand" content="cutej">';
    expect(readLocalExportBrandId()).toBe("cutej");
    expect(readPublicShareBrand()).toBeNull();

    document.querySelector("meta")!.setAttribute("content", "javascript");
    expect(readLocalExportBrandId()).toBeNull();
  });

  it("accepts validated brand metadata and maps both packaged icons", () => {
    setBrandMeta(JSON.stringify({ id: "zenmind", productName: "ZenMind", openScheme: "zenmind" }));
    expect(readPublicShareBrand()).toEqual({ id: "zenmind", productName: "ZenMind", openUrl: "zenmind://open" });
    expect(publicShareBrandIcon("zenmind")).toBeTruthy();
    expect(publicShareBrandIcon("cutej")).toBeTruthy();
    expect(publicShareBrandIcon("unknown")).toBeTruthy();
  });

  it("applies the matching brand favicon and removes it for local exports", () => {
    applyPublicShareFavicon({ id: "zenmind", productName: "ZenMind", openUrl: "zenmind://open" });
    let favicon = document.head.querySelector<HTMLLinkElement>("link[data-conversation-export-brand-favicon]");
    expect(favicon?.rel).toBe("icon");
    expect(favicon?.type).toBe("image/svg+xml");
    expect(favicon?.getAttribute("href")).toBe(publicShareBrandIcon("zenmind"));
    expect(favicon?.dataset.conversationExportBrandFavicon).toBe("zenmind");

    applyPublicShareFavicon({ id: "cutej", productName: "CuteJ", openUrl: "cutej://open" });
    favicon = document.head.querySelector<HTMLLinkElement>("link[data-conversation-export-brand-favicon]");
    expect(favicon?.getAttribute("href")).toBe(publicShareBrandIcon("cutej"));
    expect(favicon?.dataset.conversationExportBrandFavicon).toBe("cutej");
    expect(document.head.querySelectorAll("link[data-conversation-export-brand-favicon]")).toHaveLength(1);

    applyPublicShareFavicon(null);
    expect(document.head.querySelector("link[data-conversation-export-brand-favicon]")).toBeNull();
  });

  it("applies a favicon to a local branded export without public metadata", () => {
    applyConversationExportFavicon("cutej");
    const favicon = document.head.querySelector<HTMLLinkElement>("link[data-conversation-export-brand-favicon]");
    expect(favicon?.getAttribute("href")).toBe(publicShareBrandIcon("cutej"));
    expect(readPublicShareBrand()).toBeNull();
  });

  it.each([
    "not-json",
    JSON.stringify({ id: "zenmind", productName: "ZenMind", openScheme: "javascript" + ":alert" }),
    JSON.stringify({ id: "javascript", productName: "Name", openScheme: "javascript" }),
    JSON.stringify({ id: "zenmind", productName: "Name", openScheme: "other" }),
    JSON.stringify({ id: "bad/id", productName: "Name", openScheme: "safe" }),
    JSON.stringify({ id: "safe", productName: "", openScheme: "safe" }),
  ])("rejects malformed or unsafe metadata", (value) => {
    setBrandMeta(value);
    expect(readPublicShareBrand()).toBeNull();
  });
});
