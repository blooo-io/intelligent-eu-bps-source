import { describe, expect, it, vi } from "vitest";
import {
  accountTokenParams,
  createAccountToken,
  type LoadStripeFn,
} from "./stripe-account-token";

describe("stripe-account-token (INT-191)", () => {
  const fields = {
    businessType: "individual" as const,
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    line1: "1 Rue",
    city: "Paris",
    postalCode: "75001",
    country: "FR",
    tosAccepted: true,
  };

  it("builds account token params with tos_shown_and_accepted", () => {
    expect(accountTokenParams(fields)).toEqual({
      business_type: "individual",
      individual: {
        first_name: "Ada",
        last_name: "Lovelace",
        email: "ada@example.com",
        phone: undefined,
        address: {
          line1: "1 Rue",
          city: "Paris",
          postal_code: "75001",
          country: "FR",
        },
      },
      tos_shown_and_accepted: true,
    });
  });

  it("includes DOB and identity document file tokens (INT-195)", () => {
    expect(
      accountTokenParams({
        ...fields,
        dob: { day: 1, month: 1, year: 1902 },
        line1: "address_full_match",
        identityDocumentFront: "file_identity_document_success",
        identityDocumentAdditionalFront: "file_identity_document_success",
      }),
    ).toEqual({
      business_type: "individual",
      individual: {
        first_name: "Ada",
        last_name: "Lovelace",
        email: "ada@example.com",
        phone: undefined,
        dob: { day: 1, month: 1, year: 1902 },
        address: {
          line1: "address_full_match",
          city: "Paris",
          postal_code: "75001",
          country: "FR",
        },
        verification: {
          document: { front: "file_identity_document_success" },
          additional_document: { front: "file_identity_document_success" },
        },
      },
      tos_shown_and_accepted: true,
    });
  });

  it("refuses non-test publishable keys (BR-12)", async () => {
    await expect(
      createAccountToken("pk_live_nope", fields, vi.fn()),
    ).rejects.toThrow(/pk_test_/);
  });

  it("returns token id from Stripe.js", async () => {
    const loadStripe: LoadStripeFn = vi.fn().mockResolvedValue({
      createToken: vi.fn().mockResolvedValue({ token: { id: "ct_client_1" } }),
    });
    await expect(
      createAccountToken("pk_test_abc", fields, loadStripe),
    ).resolves.toBe("ct_client_1");
    expect(loadStripe).toHaveBeenCalledWith("pk_test_abc");
  });

  it("surfaces Stripe.js errors", async () => {
    const loadStripe: LoadStripeFn = vi.fn().mockResolvedValue({
      createToken: vi
        .fn()
        .mockResolvedValue({ error: { message: "ToS required" } }),
    });
    await expect(
      createAccountToken("pk_test_abc", fields, loadStripe),
    ).rejects.toThrow(/ToS required/);
  });
});
