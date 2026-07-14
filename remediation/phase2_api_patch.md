# Phase 2 API patch — symbol resolution via `security_map`

**Status:** DRAFT. Do NOT apply automatically. `backend/api.py` is not edited by the
patch-author agent. A human (or the apply step) copies the Edit blocks below verbatim.

**Goal.** After the fold-plan applier writes a `security_map` table into `financials.db`,
the API should fold alias symbols (preferred/warrant/unit siblings and dotted class
tickers) onto their primary listing so that requesting `GS-PA`, `BRK.B`, `MS-PO`, or
`GOOGL` transparently serves the primary's data (`GS`, `BRK-A`, `MS`, `GOOG`).

**`security_map` shape assumed by this patch** (created by the applier, not here):

| column       | type    | notes                                                  |
|--------------|---------|--------------------------------------------------------|
| `symbol`     | TEXT PK | uppercase, dash-normalized (e.g. `GS-PA`, `BRK-A`)     |
| `cik`        | TEXT    | zero-padded 10-digit, may be NULL                      |
| `is_primary` | INTEGER | `1` for the primary listing of the CIK, else `0`       |
| `kind`       | TEXT    | `common` / `preferred` / `warrant` / `unit`            |

The patch reads only `symbol`, `cik`, `is_primary`. If the table is absent, every
code path behaves exactly as it does today (see "Behavior with `security_map` absent").

---

## 1. New helper — insert immediately before the `/api/tickers/search` endpoint

The helper is split into a **pure core** (`_resolve_symbol_core`, unit-tested in
`backend/test_symbol_resolution.py`) and a **lazily-cached wrapper** (`_resolve_symbol`).
The alias map is built once from the DB and cached for the process lifetime — it is
**never invalidated in-process; a backend restart refreshes it** (documented in the
docstring so operators know the refresh contract). Both the "loaded a map" and the
"table absent → `None`" outcomes are cached, so a missing table costs exactly one probe,
not one query per request.

### Edit block — insert the helper

**old_string**
```python
# ── Ticker search ────────────────────────────────────────────────────────────

@app.get("/api/tickers/search")
```

**new_string**
```python
# ── Symbol resolution (Phase 2 remediation: fold aliases onto primaries) ─────
# After the remediation applier writes `security_map` into financials.db, an
# alias symbol (a preferred/warrant/unit sibling or a dotted share class, e.g.
# GS-PA, BRK.B, MS-PO, GOOGL) is folded onto its CIK's primary listing so the
# API serves the primary's data. The map is built once and cached for the life
# of the process — a backend RESTART is the only thing that refreshes it (there
# is no in-process invalidation). If `security_map` is missing the map is None
# and every resolver call is an identity (uppercase + dot->dash) normalize, so
# behaviour is byte-for-byte what it was pre-remediation.

_symbol_alias_map: dict[str, str] | None = None
_symbol_alias_loaded = False
_symbol_alias_lock = threading.Lock()


def _load_symbol_alias_map() -> dict[str, str] | None:
    """Build {alias_symbol -> primary_symbol} from security_map, or None when the
    table is absent (pre-remediation DB). One JOIN of aliases (is_primary=0, has a
    cik) against their CIK's primary (is_primary=1). Best-effort: any SQL error
    degrades to None (identity resolution)."""
    try:
        with db_conn() as conn:
            exists = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='security_map'"
            ).fetchone()
            if exists is None:
                return None
            rows = conn.execute(
                """
                SELECT a.symbol AS alias, p.symbol AS primary_symbol
                FROM security_map AS a
                JOIN security_map AS p
                  ON p.cik = a.cik AND p.is_primary = 1
                WHERE a.is_primary = 0 AND a.cik IS NOT NULL
                """
            ).fetchall()
    except (sqlite3.OperationalError, sqlite3.DatabaseError, HTTPException):
        return None
    out: dict[str, str] = {}
    for r in rows:
        alias, primary = r["alias"], r["primary_symbol"]
        if alias and primary:
            out[str(alias).strip().upper()] = str(primary).strip().upper()
    return out


def _symbol_aliases() -> dict[str, str] | None:
    """Process-cached alias map. Caches BOTH the built map and the table-absent
    (None) outcome, so a missing security_map costs one probe, not one per call.
    Never invalidated in-process; a backend restart refreshes it."""
    global _symbol_alias_map, _symbol_alias_loaded
    if not _symbol_alias_loaded:
        with _symbol_alias_lock:
            if not _symbol_alias_loaded:
                _symbol_alias_map = _load_symbol_alias_map()
                _symbol_alias_loaded = True
    return _symbol_alias_map


def _resolve_symbol_core(symbol: str, alias_map: dict[str, str] | None) -> str:
    """PURE symbol resolution (unit-tested). Uppercase + dot->dash normalize, then
    map an alias to its primary via alias_map. A None map (table absent) or a
    symbol that is not an alias returns the normalized input unchanged."""
    normalized = (symbol or "").strip().upper().replace(".", "-")
    if not alias_map:
        return normalized
    return alias_map.get(normalized, normalized)


def _resolve_symbol(symbol: str) -> str:
    """Fold an alias symbol onto its primary listing (GS-PA -> GS, BRK.B -> BRK-A).
    Cheap: reads the process-cached alias map. Falls back to the normalized input
    when security_map is absent or the symbol is not an alias. The cache is process
    -lifetime — restart the backend to pick up a rebuilt security_map."""
    return _resolve_symbol_core(symbol, _symbol_aliases())


# ── Ticker search ────────────────────────────────────────────────────────────

@app.get("/api/tickers/search")
```

---

## 2a. `/api/individual/{ticker}` — resolve before any load / SELECT

`_resolve_symbol` already does the uppercase + dot->dash normalize, so it fully
subsumes the old `ticker.upper()`. Everything downstream (`load_ticker_rows`, the
`tickers` metadata SELECT, and the `financials` SELECT) keys off `ticker_upper`, so a
single reassignment folds the whole endpoint onto the primary.

### Edit block — individual endpoint

**old_string**
```python
def individual_endpoint(request: Request, ticker: str = PathParam(pattern=TICKER_PATTERN)) -> dict[str, Any]:
    ticker_upper = ticker.upper()
```

**new_string**
```python
def individual_endpoint(request: Request, ticker: str = PathParam(pattern=TICKER_PATTERN)) -> dict[str, Any]:
    # Phase 2: fold an alias (GS-PA, BRK.B, MS-PO, GOOGL) onto its primary listing
    # BEFORE load_ticker_rows / the tickers + financials SELECTs, all of which key
    # off ticker_upper. _resolve_symbol also does the uppercase + dot->dash
    # normalize, so it fully replaces the old ticker.upper(); with security_map
    # absent it IS ticker.upper()-with-dots-dashed, i.e. unchanged behaviour.
    ticker_upper = _resolve_symbol(ticker)
```

---

## 2b. `/api/tickers/search` — surface primaries, drop alias rows

Three behaviours, all no-ops when `security_map` is absent:

1. **Exact-symbol resolution.** If the query resolves to a *different* primary
   (i.e. the user typed an alias like `GS-PA` or `BRK.B`), the primary row is fetched
   directly and emitted first, so it leads the results.
2. **Alias de-duplication.** Rows whose ticker is a known alias are skipped, so the
   preferred/warrant/unit siblings do not clutter the list — the primary carries the
   data. To avoid starving the result set, the SQL fetch takes headroom
   (`limit * 3`, capped) and the Python side trims back to `limit` after de-duping.
3. **Name-substring search still works.** Aliases are dropped by *ticker*, never by
   name; the primary shares the company name and still matches the `name LIKE`
   branch, so searching by company name is unaffected.

With `security_map` absent, `alias_map` is `{}`, `resolved == q_clean`, no primary row
is fetched, and no rows are skipped — the SQL order is preserved and the first `limit`
rows are returned, identical to today (the larger SQL LIMIT only adds trailing rows
that the trim discards).

### Edit block — search endpoint body

**old_string**
```python
    q_clean = q.strip().upper()
    if len(q_clean) < 1:
        return []
    pattern = f"{q_clean}%"
    with db_conn() as conn:
        rows = conn.execute(
            """
            SELECT ticker, name, sector, industry
            FROM tickers
            WHERE UPPER(ticker) LIKE ? OR UPPER(name) LIKE ?
            ORDER BY
                CASE WHEN UPPER(ticker) = ? THEN 0
                     WHEN UPPER(ticker) LIKE ? THEN 1
                     ELSE 2 END,
                ticker
            LIMIT ?
            """,
            (pattern, f"%{q_clean}%", q_clean, pattern, limit),
        ).fetchall()
    return [
        {"ticker": r["ticker"], "name": r["name"], "sector": r["sector"], "industry": r["industry"]}
        for r in rows
    ]
```

**new_string**
```python
    q_clean = q.strip().upper()
    if len(q_clean) < 1:
        return []
    # Phase 2: fold aliases onto primaries. alias_map is {} when security_map is
    # absent, which makes every step below a no-op and preserves today's output.
    alias_map = _symbol_aliases() or {}
    resolved = _resolve_symbol(q_clean)
    pattern = f"{q_clean}%"
    # Fetch headroom so dropping alias rows can't starve the result set; trim to
    # `limit` after de-duping. Capped so a 1-char query can't scan the universe.
    fetch_limit = min(limit * 3, 60)
    with db_conn() as conn:
        rows = conn.execute(
            """
            SELECT ticker, name, sector, industry
            FROM tickers
            WHERE UPPER(ticker) LIKE ? OR UPPER(name) LIKE ?
            ORDER BY
                CASE WHEN UPPER(ticker) = ? THEN 0
                     WHEN UPPER(ticker) LIKE ? THEN 1
                     ELSE 2 END,
                ticker
            LIMIT ?
            """,
            (pattern, f"%{q_clean}%", q_clean, pattern, fetch_limit),
        ).fetchall()
        # If the query was an alias (resolved to a different primary symbol), pull
        # that primary row directly so it can lead the list even when the alias
        # itself is no longer a tickers row after remediation.
        primary_row = None
        if resolved != q_clean:
            primary_row = conn.execute(
                "SELECT ticker, name, sector, industry FROM tickers WHERE UPPER(ticker) = ?",
                (resolved,),
            ).fetchone()

    out: list[dict[str, Any]] = []
    seen: set[str] = set()

    def _emit(r: sqlite3.Row) -> None:
        key = str(r["ticker"]).upper()
        if key in seen:
            return
        seen.add(key)
        out.append({"ticker": r["ticker"], "name": r["name"],
                    "sector": r["sector"], "industry": r["industry"]})

    if primary_row is not None:
        _emit(primary_row)
    for r in rows:
        # Skip alias rows (a ticker that maps to some OTHER primary): the primary
        # carries the data. Aliases are dropped by ticker only, so name-substring
        # matches still surface the primary (it shares the company name).
        if str(r["ticker"]).upper() in alias_map:
            continue
        _emit(r)
        if len(out) >= limit:
            break
    return out[:limit]
```

---

## 3. Behavior with `security_map` absent (graceful degradation)

The current production `financials.db` has **no** `security_map` table (verified: the
remediation DB's table list does not contain it). Proof that this patch is a strict
no-op until the applier creates the table:

| Call                     | With `security_map` absent                                              |
|--------------------------|-------------------------------------------------------------------------|
| `_load_symbol_alias_map` | `sqlite_master` probe returns no row → returns `None` (no query run).    |
| `_symbol_aliases`        | Caches `None` once; every later call returns `None` with no DB hit.      |
| `_resolve_symbol_core`   | `alias_map` is falsy → returns `symbol.upper().replace(".", "-")`.       |
| `_resolve_symbol("gs")`  | `"GS"` — same as the old `ticker.upper()` (plus dot→dash, a superset).   |
| `individual_endpoint`    | `ticker_upper = _resolve_symbol(ticker)` == old `ticker.upper()` for any dot-free symbol; a dotted input like `BRK.B` becomes `BRK-B`, which is the correct DB key anyway. |
| `search_tickers`         | `alias_map == {}`, `resolved == q_clean`, `primary_row is None`, nothing skipped. The larger `fetch_limit` only appends trailing rows the final `out[:limit]` trims, so the returned slice equals today's `LIMIT limit` result in the same order. |

One intentional, safe difference even with the table absent: a dotted query such as
`BRK.B` is normalized to `BRK-B` before the lookup. That is the DB's actual key format
(dash, not dot), so it can only *help* — it never changes a result that already
matched. Everything else is identical to the pre-patch code.

---

## Test

`backend/test_symbol_resolution.py` unit-tests the **pure core** with hand-built alias
maps (no DB, no network, no heavy `api.py` import). Covered cases: `GS-PA -> GS`,
`BRK.B -> BRK-A` (dot→dash normalize + alias fold), unknown-symbol passthrough,
table-missing (`None` map) passthrough, lowercase/whitespace normalize, and empty input.
