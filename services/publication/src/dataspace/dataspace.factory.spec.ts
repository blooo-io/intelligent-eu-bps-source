import { describe, expect, it } from "vitest";
import { createDataspacePort } from "./dataspace.factory.js";
import { EwdsDataspaceAdapter } from "./ewds-dataspace.adapter.js";
import { MockDataspaceAdapter } from "./mock-dataspace.adapter.js";

describe("createDataspacePort (A8 / Task 4.11)", () => {
  it("A8: DATASPACE_ADAPTER default -> MockDataspaceAdapter", () => {
    expect(createDataspacePort({})).toBeInstanceOf(MockDataspaceAdapter);
  });

  it("A8: DATASPACE_ADAPTER=ewds -> EwdsDataspaceAdapter", () => {
    expect(
      createDataspacePort({
        DATASPACE_ADAPTER: "ewds",
        CGW_BASE_URL: "http://c",
        CGW_API_KEY: "k",
      }),
    ).toBeInstanceOf(EwdsDataspaceAdapter);
  });
});
