# TDS Wiki Verification Bridge

This branch contains a remote GitHub Actions bridge for high-confidence Tower Defense Simulator Fandom verification.

## Strict page-selection policy

The bridge never blindly accepts the first fuzzy search result.

Resolution order:

1. Known safe aliases (for example, `accel -> Accelerator`).
2. Exact page title.
3. Official MediaWiki redirect.
4. Exact title among search results.
5. Otherwise return candidates with `status: needs_selection`.

A fuzzy candidate is **never automatically selected**.

## Request

Edit `tds_bridge/request.json` on `tds-wiki-bridge`.

Example:

```json
{
  "mode": "verify",
  "query": "accel",
  "thread_url": "",
  "limit": 100
}
```

## Modes

- `verify` / `tower_verifier` / `article`
  - Strictly resolves a page.
  - Fetches current raw wikitext.
  - Produces revision proof, revision history and latest diff.
  - Parses Description, tower infobox, regular/PVP Upgrade blocks and statistics tables.
  - Calculates Accelerator-style DPS when the required fields exist.
  - Extracts detections, immunities and placement limits.
  - Finds categories, templates, backlinks and relevant linked pages.
  - Expands templates.
  - Detects conflicting claims.
  - Produces one evidence bundle.

- `search`
  - Returns page candidates and tower-page validation.
  - Never auto-selects a fuzzy result.

- `history`
  - Returns recent revision IDs, timestamps, users, comments, hashes and latest diff.

- `discussion`
  - Reads a Fandom Discussions thread from `thread_url`.

- `discussion_search`
  - Searches the latest Discussions returned by Fandom for the supplied query.
  - This is not claimed to be an unlimited historical full-text index.

- `recent_changes`
  - Fetches recent main-namespace TDS Wiki changes.

- `watch` / `recent_changes_watch`
  - Updates the persistent tracked-tower changelog database.

## Evidence files

Depending on mode, the bridge can create/update:

- `resolution.json`
- `meta.json`
- `result.txt`
- `structured_stats.json`
- `conflicts.json`
- `revision_history.json`
- `revision_diff.json`
- `categories.json`
- `backlinks.json`
- `templates.json`
- `expanded_wikitext.txt`
- `related_pages.json`
- `search_candidates.json`
- `discussion_json.txt`
- `discussion_text.txt`
- `discussion_search.json`
- `recent_changes.json`
- `evidence_bundle.json`
- `tracked_pages.json`
- `changelog.json`
- `changelog_state.json`

## TDS source-priority rule

For current tower-stat disagreements, the configured rule is:

1. `{{Upgrade}}` blocks
2. `==Description==`
3. Summary / infobox / generated statistics table

The bridge does not silently hide disagreements. It writes them to `conflicts.json`.

Example caught during testing: Accelerator Level 3 currently has an Upgrade claim of `0.25 > 0.1 Cooldown` while the generated Statistics table shows `1`. The bridge flags that mismatch.

## Automatic changelog

The default branch contains `.github/workflows/tds-changelog.yml`.

It runs hourly and:
- collects the current `Category:Towers` list,
- checks recent TDS Wiki edits,
- stores page revision metadata,
- stores before/after diff text where available,
- deduplicates revisions,
- pushes the database into `tds-wiki-bridge`.

The first successful scan tracked 83 tower pages and captured 30 recent changes.

## Comment bridge

The authenticated Fandom comment bridge is separate:
`.github/workflows/tds-fandom-comment.yml`.

GitHub credential injection and Fandom login have been verified. Posting is currently blocked by Fandom with `NON_AUTOCONFIRMED` until the bot account satisfies Fandom's autoconfirmed requirement.
