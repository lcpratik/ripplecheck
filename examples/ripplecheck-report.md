# RippleCheck Report

## Change Requested
**Rename** `sightings.upvote_count` → `sightings.vote_count`

---

## Files Changed Per Layer

### Database
| File | Edited Lines |
|---|---|
| `server/db/schema.sql` | 14 (column definition), 47 (trigger INSERT branch), 50 (trigger DELETE branch) |

### Backend
| File | Edited Lines |
|---|---|
| `server/routes/sightings.js` | 12 (SORTS.corroborated ORDER BY), 45 (SELECT column list), 207 (upvote refresh SELECT), 211 (JSON response key) |

### Frontend
| File | Edited Lines |
|---|---|
| `client/src/components/SightingCard.jsx` | 38 (`sighting.upvote_count` → `sighting.vote_count`) |
| `client/src/pages/Read.jsx` | 56 (`result.upvote_count` → `result.vote_count` in state update) |
| `client/src/pages/SightingDetail.jsx` | 84 (`sighting.upvote_count` → `sighting.vote_count`), 86 (`result.upvote_count` → `result.vote_count`) |

---

## False Positives Discarded
None. All scan hits were genuine references to the `sightings.upvote_count` database column.

---

## Manual Check Items (Indirect References)

| File | Coupling | Action |
|---|---|---|
| `client/src/context/AlertsContext.jsx:16` | Spreads `{ ...data }` from SSE `sighting-added` event. The emitted sighting object is built at POST time via `RETURNING *` + `comment_count: 0` and does **not** include `upvote_count`, so this spread is not affected. If the SSE payload were ever extended to include the count field, this file would need updating. | **No edit required.** |

---

## Migration File
`server/db/migrations/202609261216_rename_sightings_upvote_count.sql`

---

## Warnings from generate_migration
> PostgreSQL does not update PL/pgSQL function bodies when a column is renamed or dropped. Every function or trigger function that references this column must be recreated with `CREATE OR REPLACE FUNCTION` in the same migration.  
> **Affected functions/triggers:** `update_sighting_upvote_count`

The migration file includes a full `CREATE OR REPLACE FUNCTION update_sighting_upvote_count()` block with `upvote_count` replaced by `vote_count` throughout the function body.

---

## Zero Remaining References Confirmation

**Search command:**
```
grep -r --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" --include="*.sql" \
  -e "\bupvote_count\b" -e "\bupvoteCount\b" \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  --exclude="202609261216_rename_sightings_upvote_count.sql" \
  --exclude="ripplecheck-report.md" \
  .
```

**Result:**
```
./client/src/components/UpvoteButton.jsx:export default function UpvoteButton({ uuid, upvoted, upvoteCount, onChange }) {
./client/src/components/UpvoteButton.jsx:            👻 {upvoteCount}
./client/src/components/SightingCard.jsx:                    upvoteCount={sighting.vote_count}
./client/src/pages/SightingDetail.jsx:                        upvoteCount={sighting.vote_count}
```

All remaining `upvoteCount` occurrences refer exclusively to the **`UpvoteButton` React component's own prop name** — a UI API contract that does not map to the database column. The callers already pass `vote_count` data into this prop (`upvoteCount={sighting.vote_count}`). **Zero references to the old DB column name remain in source files.**

**Additional checks:**
- `node --check server/routes/sightings.js` → OK
- `node --check server/index.js` → OK
- `cd client && npm run build` → ✓ built in 1.22s (no errors)

---

## Total Time Taken
- **Start:** Sat Sep 26 12:16:35 CDT 2026
- **End:**   Sat Sep 26 12:18:26 CDT 2026
- **Duration:** ~1 minute 51 seconds
