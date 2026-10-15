import { describe, expect, it, vi } from "vitest";
import { flushPendingWrites, registerFlusher } from "./flush";

describe("flush registry", () => {
  it("calls every registered flusher and stops after unregistering", async () => {
    const a = vi.fn().mockResolvedValue(undefined);
    const b = vi.fn().mockResolvedValue(undefined);
    const unA = registerFlusher(a);
    registerFlusher(b);
    await flushPendingWrites();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    unA();
    await flushPendingWrites();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });

  it("rejects when a flusher fails", async () => {
    const un = registerFlusher(() => Promise.reject(new Error("disk full")));
    await expect(flushPendingWrites()).rejects.toThrow("disk full");
    un();
  });
});
