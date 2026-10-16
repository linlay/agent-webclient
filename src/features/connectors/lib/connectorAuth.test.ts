import { connectorAuthDeadline, connectorAuthViewStatus, readConnectorAuthSession, safeConnectorAuthorizationUrl, supportsConnectorAuthCheck, supportsConnectorLogin } from "./connectorAuth";
import type { ConnectorAuthSession } from "@/shared/data";

const session: ConnectorAuthSession = { connectorId: "demo", sessionId: "", status: "unauthorized", expiresAt: "0001-01-01T00:00:00Z" };
it("uses auth modes instead of provider identifiers", () => {
  expect(["self", "mcp", "none", "token", "oneid"].map(mode => supportsConnectorLogin(mode as "self"))).toEqual([true, true, false, false, false]);
});
it("checks canonical delegated and Desktop identity modes while keeping Desktop login external", () => {
  expect(supportsConnectorAuthCheck("self")).toBe(true);
  expect(supportsConnectorLogin("self")).toBe(true);
  expect(supportsConnectorAuthCheck("oneid")).toBe(true);
  expect(supportsConnectorLogin("oneid")).toBe(false);
  expect(readConnectorAuthSession({ ...session, status: "delegated" }, "demo").status).toBe("delegated");
});
it.each(["javascript:alert(1)", "data:text/html,test", "file:///tmp/login", "//example.test/login", "https://user:password@example.test", "https://example.test/\nlogin", "https://", "https:\\example.test"])("rejects an unsafe authorization URL: %s", url => {
  expect(safeConnectorAuthorizationUrl(url)).toBeNull();
});
it("allows only explicit HTTP(S) links without user information", () => {
  expect(safeConnectorAuthorizationUrl("https://example.test/authorize?state=opaque")).toBe("https://example.test/authorize?state=opaque");
  expect(safeConnectorAuthorizationUrl("http://127.0.0.1:1234/callback")).toBe("http://127.0.0.1:1234/callback");
});
it("ignores zero deadlines and never infers successful authorization from a deadline", () => {
  expect(connectorAuthDeadline(session)).toBeNull();
  expect(connectorAuthViewStatus(session)).toBe("unauthorized");
  const expired = { ...session, status: "pending" as const, expiresAt: "2026-01-01T00:00:00Z" };
  expect(connectorAuthViewStatus(expired, Date.parse("2026-01-02"))).toBe("expired");
  expect(connectorAuthViewStatus({ ...expired, status: "authorized" }, Date.parse("2026-01-02"))).toBe("authorized");
});
it("rejects a mismatched connector or unknown protocol state", () => {
  expect(() => readConnectorAuthSession(session, "other")).toThrow();
  expect(() => readConnectorAuthSession({ ...session, status: "success" } as unknown as ConnectorAuthSession, "demo")).toThrow();
  expect(readConnectorAuthSession(session, "demo")).toBe(session);
});

it("accepts no_auth as a terminal state without login or authentication checks",()=>{
 expect(supportsConnectorAuthCheck("none")).toBe(false);
 expect(supportsConnectorLogin("none")).toBe(false);
 expect(readConnectorAuthSession({...session,status:"no_auth"},"demo").status).toBe("no_auth");
});
