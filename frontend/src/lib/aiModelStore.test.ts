import { describe, expect, it, vi } from "vitest";
import { getAiModel, modelIdFor, setAiModel, subscribeAiModel } from "./aiModelStore";

describe("aiModelStore", () => {
  it("defaults to Opus and switches to Haiku, notifying listeners once", () => {
    setAiModel("opus");
    expect(getAiModel()).toBe("opus");
    const listener = vi.fn();
    const stop = subscribeAiModel(listener);
    setAiModel("haiku");
    setAiModel("haiku"); // no change, no second notification
    expect(getAiModel()).toBe("haiku");
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    setAiModel("opus");
  });

  it("records the model id that wrote an answer", () => {
    expect(modelIdFor("opus")).toBe("claude-opus-5-5");
    expect(modelIdFor("haiku")).toBe("claude-haiku-5-5");
  });
});
