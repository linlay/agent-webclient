/** @jest-environment jsdom */
import { submitWebappLaunch } from "./launch";

it("submits an ephemeral POST with no opener, URL credential or retained DOM secret", () => {
  const submit = jest.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(function (this: HTMLFormElement) {
    expect(this.method).toBe("post"); expect(this.action).toBe("http://127.0.0.1:20200/__desktop/session/exchange");
    expect(this.target).toBe("_blank"); expect(this.rel).toContain("noopener");
    expect((this.elements.namedItem("ticket") as HTMLInputElement).value).toBe("one-time-ticket");
    expect(this.action).not.toContain("one-time-ticket");
  });
  submitWebappLaunch({ action: "http://127.0.0.1:20200/__desktop/session/exchange", ticket: "one-time-ticket", expiresAt: Date.now() + 60_000 });
  expect(submit).toHaveBeenCalledTimes(1); expect(document.querySelector("form")).toBeNull(); expect(document.body.innerHTML).not.toContain("one-time-ticket"); submit.mockRestore();
});
it("rejects unsafe navigation protocols and credentials embedded in the exchange URL", () => {
  for (const action of ["javascript:alert(1)", "http://app.example/__desktop/session/exchange", "https://user:secret@app.example/__desktop/session/exchange", "https://app.example/__desktop/session/exchange?ticket=secret"]) expect(() => submitWebappLaunch({ action, ticket: "secret", expiresAt: Date.now() + 60_000 })).toThrow();
});
