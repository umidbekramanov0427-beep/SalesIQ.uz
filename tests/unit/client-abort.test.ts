import { isClientAbort } from "@/lib/client-abort";

function nodeAbort(): Error {
  // What Node's http server raises when the caller closes the socket mid-request.
  return Object.assign(new Error("aborted"), { code: "ECONNRESET" });
}

describe("isClientAbort", () => {
  it("recognises Node's aborted request error", () => {
    expect(isClientAbort(nodeAbort())).toBe(true);
    expect(isClientAbort(new Error("aborted"))).toBe(true);
  });

  it("finds it behind a wrapping error (h3 HTTPError cause)", () => {
    const wrapped = new Error("HTTPError", { cause: nodeAbort() });
    expect(isClientAbort(wrapped)).toBe(true);
  });

  it("leaves real failures alone", () => {
    expect(isClientAbort(undefined)).toBe(false);
    expect(isClientAbort("aborted")).toBe(false);
    expect(isClientAbort(new Error("fetch failed"))).toBe(false);
    expect(isClientAbort(new Error("Request aborted by the database"))).toBe(false);
    expect(isClientAbort(Object.assign(new Error("aborted"), { code: "EPIPE" }))).toBe(false);
  });
});
