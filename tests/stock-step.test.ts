import { describe, expect, it } from "vitest";

import { stepStockInput } from "../src/lib/shopping/stock-step";

describe("stepStockInput (stock-check −/+ buttons)", () => {
  it("starts an empty field at 1 on +, leaves it empty on −", () => {
    expect(stepStockInput("", 1)).toBe("1");
    expect(stepStockInput("  ", 1)).toBe("1");
    expect(stepStockInput("", -1)).toBe("");
  });

  it("steps whole numbers", () => {
    expect(stepStockInput("2", 1)).toBe("3");
    expect(stepStockInput("3", -1)).toBe("2");
  });

  it("clears instead of going to zero or below", () => {
    expect(stepStockInput("1", -1)).toBe("");
    expect(stepStockInput("0,5", -1)).toBe("");
    expect(stepStockInput("0", -1)).toBe("");
  });

  it("keeps fractions and the typed decimal separator", () => {
    expect(stepStockInput("0,5", 1)).toBe("1,5");
    expect(stepStockInput("0.5", 1)).toBe("1.5");
    expect(stepStockInput("1,5", -1)).toBe("0,5");
    expect(stepStockInput("0,1", 1)).toBe("1,1");
  });

  it("rounds float noise away", () => {
    expect(stepStockInput("0.7", 1)).toBe("1.7");
    expect(stepStockInput("2.2", -1)).toBe("1.2");
  });

  it("treats garbage like an empty field", () => {
    expect(stepStockInput("abc", 1)).toBe("1");
    expect(stepStockInput("abc", -1)).toBe("");
  });
});
