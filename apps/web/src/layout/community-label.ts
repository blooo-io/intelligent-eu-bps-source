/**
 * INT-250 — human community label for the shell.
 * Never surface raw UUIDs in the UI. Known demo tenancy maps to a display name;
 * unknown ids stay hidden until the public API exposes a name field.
 */
export const S1_COMMUNITY_ID = "c0ffee00-1234-4abc-8def-0123456789ab";

const KNOWN: Record<string, string> = {
  [S1_COMMUNITY_ID]: "Demo community S1",
};

export function communityDisplayName(communityId?: string | null): string | null {
  if (!communityId?.trim()) return null;
  return KNOWN[communityId] ?? null;
}
