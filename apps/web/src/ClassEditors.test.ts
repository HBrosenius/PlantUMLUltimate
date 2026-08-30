import { describe, expect, it } from "vitest";
import { parseStructuredClassParameters, serializeStructuredClassParameters } from "./class-parameters";

describe("structured Class parameters", () => {
  it("parses nested generic commas without splitting the type", () => {
    expect(
      parseStructuredClassParameters(
        "order: Order, options: Map<String, List<Option>>, callback: Function<Result<Order>, void>",
      ),
    ).toEqual([
      { name: "order", type: "Order" },
      { name: "options", type: "Map<String, List<Option>>" },
      { name: "callback", type: "Function<Result<Order>, void>" },
    ]);
  });

  it("round trips structured parameters", () => {
    const parameters = [
      { name: "order", type: "Order" },
      { name: "options", type: "Map<String, Option>" },
    ];
    expect(parseStructuredClassParameters(serializeStructuredClassParameters(parameters))).toEqual(parameters);
  });

  it("keeps unsupported syntax in raw mode", () => {
    expect(parseStructuredClassParameters("Order order, Customer customer")).toBeUndefined();
    expect(parseStructuredClassParameters("callback: (Order, Customer) => Result")).toEqual([
      { name: "callback", type: "(Order, Customer) => Result" },
    ]);
  });
});
