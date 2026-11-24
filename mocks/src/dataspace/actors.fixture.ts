/**
 * AC-15 — EWDS Actor intake fixtures for P-ACTOR-SRC mock (REQ-008 / UAT-008).
 * Identifiers are stable UUIDs; personal data is synthetic (.invalid).
 */

export type ActorFixtureAddress = {
  street: string;
  postalCode: string;
  city: string;
  country: string;
};

export type ActorFixture = {
  actorId: string;
  communityId: string;
  gsyActorId: string;
  meterId: string;
  role: "consumer" | "producer" | "prosumer";
  name: string;
  address: ActorFixtureAddress;
  contact: { email: string; phone?: string };
  version: string;
};

/** Default community — matches AC-03 SEED_COMMUNITY_ID. */
export const ACTOR_FIXTURE_COMMUNITY_ID =
  "a1000000-0000-4000-8000-000000000001";

const ACTOR_IDS = [
  "a1111111-0000-4000-8000-000000000001",
  "a2222222-0000-4000-8000-000000000002",
  "a3333333-0000-4000-8000-000000000003",
] as const;

/**
 * Three EWDS actors for a community. Used by MockActorSourceAdapter and UATs.
 */
export function ewdsActorFixtures(
  communityId: string = ACTOR_FIXTURE_COMMUNITY_ID,
): ActorFixture[] {
  return [
    {
      actorId: ACTOR_IDS[0],
      communityId,
      gsyActorId: "gsy-ewds-consumer-1",
      meterId: "m-ewds-1",
      role: "consumer",
      name: "Elena Costa",
      address: {
        street: "Via Roma 10",
        postalCode: "00100",
        city: "Roma",
        country: "IT",
      },
      contact: { email: "elena.costa@example.invalid", phone: "+39061111111" },
      version: "1",
    },
    {
      actorId: ACTOR_IDS[1],
      communityId,
      gsyActorId: "gsy-ewds-producer-1",
      meterId: "m-ewds-2",
      role: "producer",
      name: "Marco Rossi",
      address: {
        street: "Via Milano 5",
        postalCode: "20100",
        city: "Milano",
        country: "IT",
      },
      contact: { email: "marco.rossi@example.invalid" },
      version: "1",
    },
    {
      actorId: ACTOR_IDS[2],
      communityId,
      gsyActorId: "gsy-ewds-prosumer-1",
      meterId: "m-ewds-3",
      role: "prosumer",
      name: "Giulia Bianchi",
      address: {
        street: "Via Napoli 2",
        postalCode: "80100",
        city: "Napoli",
        country: "IT",
      },
      contact: {
        email: "giulia.bianchi@example.invalid",
        phone: "+39081111111",
      },
      version: "1",
    },
  ];
}
