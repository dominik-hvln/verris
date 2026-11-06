import { formatPrice } from "./format-price";

describe("formatPrice — stawka autoskalowania w tabeli admina", () => {
  it("wszystkie cyfry z API (do 6 miejsc), bez zer na końcu", () => {
    expect(formatPrice("0.123456")).toBe("0.123456");
    expect(formatPrice("0.001283")).toBe("0.001283");
    expect(formatPrice("0.088200")).toBe("0.0882");
    expect(formatPrice("0.000800")).toBe("0.0008");
    expect(formatPrice("0.000000")).toBe("0");
    expect(formatPrice("x")).toBe("x");
  });
});
