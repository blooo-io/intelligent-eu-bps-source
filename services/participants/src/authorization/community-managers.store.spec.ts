import { describe, expect, it } from "vitest";
import { CommunityManagersStore } from "./community-managers.store.js";

describe("CommunityManagersStore (REQ-049)", () => {
  it("bind / isManager / list / restore / reset", () => {
    const store = new CommunityManagersStore();
    store.bind({
      actorId: "a1",
      communityId: "c1",
      boundAt: "2026-11-24T00:00:00.000Z",
      boundBy: "op",
    });
    expect(store.isManager("c1", "a1")).toBe(true);
    expect(store.isManager("c1", "a2")).toBe(false);
    expect(store.listByActor("a1")).toHaveLength(1);
    expect(store.listAll()).toHaveLength(1);

    store.restore([
      {
        actorId: "a2",
        communityId: "c2",
        boundAt: "2026-11-24T01:00:00.000Z",
        boundBy: "op",
      },
    ]);
    expect(store.isManager("c1", "a1")).toBe(false);
    expect(store.isManager("c2", "a2")).toBe(true);

    store.reset();
    expect(store.listAll()).toEqual([]);
  });
});
