import { describe, expect, it } from "vitest";
import { ApiError, toApiError } from "./api";

describe("toApiError", () => {
  it("maps backend errors to an ApiError with code and message", () => {
    const e = toApiError({ code: "ProviderBlocked", message: "Locked to local AI" });
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe("ProviderBlocked");
    expect(e.message).toBe("Locked to local AI");
  });
  it("handles plain errors and strings", () => {
    expect(toApiError(new Error("boom")).message).toBe("boom");
    expect(toApiError("text").message).toBe("text");
    expect(toApiError(42).code).toBe("Unknown");
  });
  it("passes ApiError through", () => {
    const e = new ApiError("Io", "x");
    expect(toApiError(e)).toBe(e);
  });
});
