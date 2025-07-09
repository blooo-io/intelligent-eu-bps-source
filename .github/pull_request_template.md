## INT-xxx — <summary>

**Jira:** https://blooo-io.atlassian.net/browse/INT-xxx
**Module(s):** <!-- e.g. services/invoicing (AC-06) -->

### Covers
- Requirements: <!-- REQ-054, REQ-055 -->
- UAT: <!-- UAT-071 (Pass), UAT-072 (Pass) -->
- Business rules: <!-- BR-04, BR-05 -->

### Changes
- Contract: <!-- contracts/openapi/... (non-breaking / new version) -->
- Code:
- Docs:

### Spec gaps or proposed changes
<!-- Anything in docs/ that is missing or contradictory; "none" otherwise -->

### Checklist (Definition of Done)
- [ ] Contract first, lint green, oasdiff green
- [ ] GitHub Actions runs every test script and each module stays at or above 80% statements, branches, functions and lines
- [ ] Unit + contract + UAT tests green
- [ ] UAT status updated in `docs/requirements/items/uat/`
- [ ] No personal data in logs/events, no secrets (gitleaks)
- [ ] Dependencies MIT / Apache-2.0 only
- [ ] Smoke-tested on `dev` after merge
