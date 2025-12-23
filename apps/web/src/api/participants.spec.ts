import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./me";
import {
  importParticipants,
  listParticipants,
  offboardParticipant,
  parseParticipantCsv,
  patchParticipant,
} from "./participants";

const communityId = "22222222-2222-2222-2222-222222222222";
const participantId = "11111111-1111-1111-1111-111111111111";

describe("participants API (REQ-008 / REQ-012 / REQ-058)", () => {
  it("parses CSV with optional header", () => {
    const rows = parseParticipantCsv(
      "email,marketActorId,meterId,role\nada@example.com,actor-1,meter-1,consumer\nbob@example.com,actor-2,meter-2,producer\n",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].role).toBe("consumer");
  });

  it("rejects invalid CSV role", () => {
    expect(() =>
      parseParticipantCsv("x@y.z,a,m,admin"),
    ).toThrow(/Invalid role/);
  });

  it("rejects short or empty CSV", () => {
    expect(() => parseParticipantCsv("only,two")).toThrow(/Invalid CSV row/);
    expect(() => parseParticipantCsv("email,marketActorId,meterId,role\n")).toThrow(
      /no participant rows/,
    );
  });

  it("lists participants", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          participantId,
          communityId,
          role: "consumer",
          status: "Invited",
          marketActorId: "a1",
          meterId: "m1",
        },
      ],
    });
    const rows = await listParticipants(
      "https://api.example/",
      "tok",
      communityId,
      fetchImpl as unknown as typeof fetch,
    );
    expect(rows).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.example/v1/communities/${communityId}/participants`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      }),
    );
  });

  it("imports, patches and offboards", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            participantId,
            communityId,
            role: "consumer",
            status: "Invited",
          },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          participantId,
          communityId,
          role: "prosumer",
          status: "Invited",
          marketActorId: "a2",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          participantId,
          communityId,
          role: "prosumer",
          status: "Offboarded",
        }),
      });

    await importParticipants(
      "https://api.example",
      "tok",
      communityId,
      [{ email: "a@b.c", marketActorId: "a1", meterId: "m1", role: "consumer" }],
      fetchImpl as unknown as typeof fetch,
    );
    expect(fetchImpl.mock.calls[0][0]).toContain("participants:import");

    const patched = await patchParticipant(
      "https://api.example",
      "tok",
      participantId,
      { role: "prosumer", marketActorId: "a2" },
      fetchImpl as unknown as typeof fetch,
    );
    expect(patched.role).toBe("prosumer");

    const off = await offboardParticipant(
      "https://api.example",
      "tok",
      participantId,
      fetchImpl as unknown as typeof fetch,
    );
    expect(off.status).toBe("Offboarded");
  });

  it("throws ApiError on list, import, patch and offboard failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(
      listParticipants(
        "https://api.example",
        "tok",
        communityId,
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      importParticipants(
        "https://api.example",
        "tok",
        communityId,
        [{ email: "a@b.c", marketActorId: "a", meterId: "m", role: "consumer" }],
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      patchParticipant(
        "https://api.example",
        "tok",
        participantId,
        { role: "producer" },
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      offboardParticipant(
        "https://api.example",
        "tok",
        participantId,
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
