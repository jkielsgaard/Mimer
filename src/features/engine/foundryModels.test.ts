import { describe, expect, it } from "vitest";
import type { FoundryModel } from "@/bindings/FoundryModel";
import { filterModels, goodFor, NO_FILTER, readsLabel, sizeOf } from "./foundryModels";

const m = (alias: string, over: Partial<FoundryModel> = {}): FoundryModel => ({
  alias,
  id: alias,
  name: alias,
  sizeMb: 1000,
  tools: true,
  device: "GPU",
  license: null,
  cached: false,
  publisher: null,
  task: "chat-completion",
  contextTokens: null,
  ...over,
});

describe("Foundry model list", () => {
  it("says what a family is good for, and is honest about unknown ones", () => {
    expect(goodFor(m("phi-4-mini-reasoning")).kind).toBe("reasoning");
    expect(goodFor(m("deepseek-r1-14b")).kind).toBe("reasoning");
    expect(goodFor(m("qwen2.5-coder-1.5b")).kind).toBe("code");
    expect(goodFor(m("phi-4-mini")).text).toMatch(/Microsoft's small model/);
    expect(goodFor(m("something-new")).text).toBe("General text model.");
  });

  it("puts sizes in buckets and turns tokens into words", () => {
    expect(sizeOf(0)).toBeNull();
    expect(sizeOf(1500)).toBe("small");
    expect(sizeOf(6000)).toBe("medium");
    expect(sizeOf(9000)).toBe("large");
    expect(readsLabel(128000)).toBe("reads about 96k words");
    expect(readsLabel(null)).toBeNull();
  });

  it("recommends tools first, then NPU over GPU over CPU, then the smallest", () => {
    const list = [
      m("cpu", { device: "CPU", sizeMb: 100 }),
      m("no-tools", { tools: false, device: "NPU" }),
      m("gpu-big", { sizeMb: 5000 }),
      m("npu", { device: "NPU", sizeMb: 3000 }),
      m("gpu-small", { sizeMb: 500 }),
    ];
    const order = (f = NO_FILTER) => filterModels(list, f, new Set()).map((x) => x.alias);
    expect(order()).toEqual(["npu", "gpu-small", "gpu-big", "cpu", "no-tools"]);
    expect(order({ ...NO_FILTER, sort: "smallest" })[0]).toBe("cpu");
    expect(order({ ...NO_FILTER, device: "NPU" })).toEqual(["npu", "no-tools"]);
    expect(order({ ...NO_FILTER, size: "small" })).toEqual(["gpu-small", "cpu", "no-tools"]);
    expect(
      filterModels(list, { ...NO_FILTER, downloaded: true }, new Set(["cpu"])).map((x) => x.alias),
    ).toEqual(["cpu"]);
  });

  it("finds a model by name, alias or maker", () => {
    const list = [m("qwen3-4b", { name: "Qwen 3 4B", publisher: "Alibaba" }), m("phi-4")];
    expect(filterModels(list, { ...NO_FILTER, text: "alibaba" }, new Set())).toHaveLength(1);
    expect(filterModels(list, { ...NO_FILTER, text: "PHI" }, new Set())).toHaveLength(1);
  });
});
