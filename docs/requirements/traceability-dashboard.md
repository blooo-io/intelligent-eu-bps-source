# Traceability dashboard — Billing & Payment Service (T5.6 / D5.5)

**Source of truth for traceability**: the item notes in `items/` — one note per persona (`items/personas/`), user story (`items/user-stories/`), requirement (`items/requirements/`) and UAT test case (`items/uat/`), with their properties. UAT status is updated in the UAT notes (property `status`: Not Run / Pass / Fail / Blocked), ideally from the editable Bases view below.

- Editable matrix views: [[traceability.base]] (Obsidian Bases, Obsidian ≥ 1.9).
- The checks below need the **Dataview** community plugin.
- On GitHub (where Bases and Dataview do not render), read the static tables in `requirements.md`, `user-stories.md` and `uat-test-cases.md`, regenerated from the item notes, plus the **INT-81 snapshot** below.
- Full validation narrative: [`../testing/v1-validation-summary.md`](../testing/v1-validation-summary.md).
- `traceability-matrix.xlsx` is an export, not the source of truth.

![[traceability.base]]

## INT-81 snapshot (GitHub-readable)

**As of 2026-10-18** (INT-204): **62** in-scope UATs (`scope_d55: in`).

| UAT status | Count |
|---|---|
| Pass | 62 |
| Blocked | 0 |
| Fail | 0 |
| Not Run | 0 |

No in-scope Blocked rows. Partner optimisations deferred (not Blocked): NFR-008 SLA number, NFR-016 step-count. REQ-034 / REQ-037 and UAT-044 / UAT-047 remain **out of D5.5 scope** (INT-192). See [`../testing/v1-validation-summary.md`](../testing/v1-validation-summary.md).

## Counts

```dataview
TABLE WITHOUT ID type AS "Type", length(rows) AS "Count"
FROM "docs/requirements/items"
GROUP BY type
```

```dataview
TABLE WITHOUT ID priority AS "Priority", length(rows) AS "Requirements", length(filter(rows, (r) => r.scope_d55 = "in")) AS "In D5.5 scope"
FROM "docs/requirements/items/requirements"
GROUP BY priority
```

```dataview
TABLE WITHOUT ID status AS "UAT status (D5.5 scope)", length(rows) AS "Count"
FROM "docs/requirements/items/uat"
WHERE scope_d55 = "in"
GROUP BY status
```

## Traceability matrix (requirement → stories → UAT → status)

```dataview
TABLE WITHOUT ID file.link AS "ID", category AS "Cat.", priority AS "Prio", scope_d55 AS "D5.5", statement AS "Requirement", stories AS "Stories", uat AS "UAT", map(uat, (u) => u.status) AS "UAT status"
FROM "docs/requirements/items/requirements"
SORT file.name ASC
```

## Coverage checks (each list should be empty)

**Requirements without UAT**
```dataview
LIST FROM "docs/requirements/items/requirements"
WHERE length(uat) = 0
```

**Requirements without a user story or other source**
```dataview
LIST FROM "docs/requirements/items/requirements"
WHERE length(stories) = 0 AND !source_other
```

**User stories not covered by any requirement**
```dataview
LIST FROM "docs/requirements/items/user-stories"
WHERE length(requirements) = 0
```

**UAT pointing to a missing requirement**
```dataview
LIST FROM "docs/requirements/items/uat"
WHERE !requirement OR !requirement.id
```

**Inconsistent links (UAT listed on a requirement but pointing elsewhere)**
```dataview
TABLE WITHOUT ID file.link AS "Requirement", u AS "UAT", u.requirement AS "UAT points to"
FROM "docs/requirements/items/requirements"
FLATTEN uat AS u
WHERE u.requirement != file.link
```

**In-scope requirements depending only on out-of-scope stories**
```dataview
LIST FROM "docs/requirements/items/requirements"
WHERE scope_d55 = "in" AND length(stories) > 0 AND all(map(stories, (s) => s.scope_d55 = "out"))
```

## Open review points

```dataview
TABLE WITHOUT ID file.link AS "Item", review_note AS "Review point"
FROM "docs/requirements/items"
WHERE review_note
SORT file.name ASC
```
