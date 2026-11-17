import { describe, expect, it, vi } from "vitest";
import { callPublicOperation } from "./call-public-operation";
import { operationById } from "./public-operations";

describe("callPublicOperation (INT-387)", () => {
  it("sends the JSON body with the bearer token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => '{"name":"Ada"}',
      blob: async () => new Blob(),
    });
    const result = await callPublicOperation(
      {
        apiBaseUrl: "https://api.example/",
        accessToken: "tok",
        operation: operationById("putMyProfile")!,
        values: {},
        bodyText: '{"name":"Ada","address":"1","email":"a@b.c"}',
      },
      fetchImpl,
    );
    expect(result).toMatchObject({ status: 200, text: '{"name":"Ada"}' });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.example/v1/me/profile",
      expect.objectContaining({
        method: "PUT",
        body: '{"name":"Ada","address":"1","email":"a@b.c"}',
        headers: expect.objectContaining({
          Authorization: "Bearer tok",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("describes a PDF response without parsing it as text", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      headers: { get: () => "application/pdf" },
      blob: async () => new Blob(["%PDF"], { type: "application/pdf" }),
      text: async () => {
        throw new Error("should not read text");
      },
    });
    const result = await callPublicOperation(
      {
        apiBaseUrl: "https://api.example",
        accessToken: "tok",
        operation: operationById("getInvoiceDocument")!,
        values: { id: "inv-1" },
        bodyText: "",
      },
      fetchImpl,
    );
    expect(result).toMatchObject({
      status: 200,
      text: "(binary 4 bytes)",
    });
    if ("blob" in result) expect(result.blob).toBeInstanceOf(Blob);
  });

  it("returns the missing-field error without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const result = await callPublicOperation(
      {
        apiBaseUrl: "https://api.example",
        accessToken: "tok",
        operation: operationById("getInvoice")!,
        values: {},
        bodyText: "",
      },
      fetchImpl,
    );
    expect(result).toEqual({ error: "Missing id" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
