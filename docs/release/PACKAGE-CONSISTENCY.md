# Package consistency review (INT-96)

Internal check that the tagged source, `docs/` and UAT statuses describe the same V1 before freeze (INT-97).

**Review date:** 2026-10-18  
**Reviewed tip:** `develop` carrying INT-92 `v1.0.0` packaging  
**Reviewer role:** Blooo engineering (agent)

## Checklist

| # | Check | Result |
|---|---|---|
| 1 | Git tag `v1.0.0` matches root `package.json` version `1.0.0` | **Not published.** INT-92 named the tag; it was never pushed. INT-359 publishes `v1.0.1` against package version `1.0.1`. Current package on `develop` is `1.1.6` (INT-421); v6.1 tag cut is separate (INT-430) |
| 2 | [`SOURCE-RELEASE.md`](SOURCE-RELEASE.md) lists the same doc/code roots as the repo map | Pass |
| 3 | [`RELEASE-NOTES.md`](RELEASE-NOTES.md) limitations align with in-scope UAT statuses | Pass at freeze (**62 Pass / 0 Blocked**, INT-204). v6.1 counts and gaps are refreshed in the release notes and [`../testing/v6.1-rerun.md`](../testing/v6.1-rerun.md) under INT-430 |
| 4 | [`../testing/v1-validation-summary.md`](../testing/v1-validation-summary.md) counts match UAT notes | Pass at freeze (INT-204). Re-run campaign updates the summary + `v6.1-rerun.md` |
| 5 | INT-81 snapshot on [`../requirements/traceability-dashboard.md`](../requirements/traceability-dashboard.md) matches those counts | Pass (after INT-81 merge). Re-check after the v6.1 re-run |
| 6 | INT-93 deployment + INT-94 integration API + INT-95 notes linked from [`README.md`](README.md) | Pass |
| 7 | Licence Apache-2.0 (`LICENSE` / `NOTICE`); no secrets in tree | Pass |
| 8 | Stripe test mode default; GSY / EWDS / ECB mocked unless adapters selected (A32 / A8) — stated in release notes; live per community where enabled | Pass |
| 9 | INT-90 (Blooo D5.5 report owner) D5.5 narrative integration of build/validation | **Open** — out of Blooo agent scope; does not block source tag |
| 10 | INT-91 (Blooo D5.5 report owner) finalise D5.5 deliverable report | **Open** — gates partner-facing freeze wording on INT-97 |

## Internal approval

Blooo engineering: **approved for source freeze** (`v1.0.0`) with in-scope UAT acceptance at **62 Pass / 0 Blocked** (INT-204).

Partner-facing D5.5 report freeze remains contingent on INT-90 / INT-91 (Blooo D5.5 report owner).
