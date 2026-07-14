import sqlite3, json, re, datetime
from collections import defaultdict, OrderedDict

DB = 'file:C:/Users/Zaki_Mir/Downloads/files/financials_remediation.db?mode=ro'
SEC_MAIN = 'C:/Users/Zaki_Mir/Downloads/files/remediation/sec_company_tickers.json'
SEC_EXCH = 'C:/Users/Zaki_Mir/Downloads/files/remediation/sec_company_tickers_exchange.json'
OUT = 'C:/Users/Zaki_Mir/Downloads/files/remediation/phase2_fold_plan.json'

INVALID_CIK = {None, '', '0000000000', '0'}

# ---------- kind classifier ----------
def classify(sym):
    if '-' not in sym:
        return 'common'
    base, suf = sym.split('-', 1)
    if suf in ('WT', 'WS'):
        return 'warrant'
    if suf in ('U', 'UN'):
        return 'unit'
    if re.match(r'^P[A-Z]?$', suf):
        return 'preferred'
    if re.match(r'^[A-Z]$', suf):   # single-letter share class -> common
        return 'common'
    return 'common'

def is_share_class(sym):
    # dashed single trailing letter, e.g. BRK-A / BIO-B => legitimate common share class
    if '-' in sym:
        base, suf = sym.split('-', 1)
        return bool(re.match(r'^[A-Z]$', suf))
    return False

def pad(cik):
    if cik is None:
        return None
    if isinstance(cik, int):
        return str(cik).zfill(10)
    return str(cik).zfill(10)

# ---------- load SEC universe ----------
sec = json.load(open(SEC_MAIN))
cik2syms = OrderedDict()          # padded cik -> [symbols in SEC order]
sym2cik = {}                      # symbol -> padded cik (first wins)
for _, v in sec.items():
    c = pad(v['cik_str']); s = v['ticker']
    cik2syms.setdefault(c, []).append(s)
    if s not in sym2cik:
        sym2cik[s] = c

exch = json.load(open(SEC_EXCH))
# (exchange available if needed; classification is regex-based)

# ---------- load DB ----------
con = sqlite3.connect(DB, uri=True)
c = con.cursor()
c.execute('PRAGMA table_info(financials)')
cols = [r[1] for r in c.fetchall()]
iT = cols.index('Ticker'); iY = cols.index('Calendar Year')
iC = cols.index('Cik'); iF = cols.index('Filling Date')

# per (ticker, year): best row stats (we keep aggregate: for each ticker-year there is one PK row)
# structure: tyr[ticker][year] = (nonnull, filling_date)
tyr = defaultdict(dict)
tick_cik_counts = defaultdict(lambda: defaultdict(int))  # ticker -> cik -> count

c.execute('SELECT * FROM financials')
for row in c.fetchall():
    t = row[iT]; y = row[iY]
    nn = sum(1 for x in row if x is not None)
    fd = row[iF] or ''
    tyr[t][y] = (nn, fd)
    cikv = row[iC]
    if cikv not in INVALID_CIK:
        tick_cik_counts[t][cikv] += 1

# canonical fin cik per ticker (modal valid cik)
fin_cik = {}
for t, d in tick_cik_counts.items():
    fin_cik[t] = max(d.items(), key=lambda kv: kv[1])[0]

# tickers table
c.execute('SELECT ticker, exchange, status FROM tickers')
tickers_tbl = {r[0]: {'exchange': r[1], 'status': r[2]} for r in c.fetchall()}

def data_years(t):
    return sorted(tyr.get(t, {}).keys())

def ndy(t):
    return len(tyr.get(t, {}))

# canonical cik for any symbol: fin cik first, else SEC mapping
def canon_cik(sym):
    if sym in fin_cik:
        return fin_cik[sym]
    return sym2cik.get(sym)

# ---------- group symbols by canonical cik ----------
cik_members = defaultdict(set)
# DB financials tickers
for t in tyr.keys():
    cc = canon_cik(t)
    if cc:
        cik_members[cc].add(t)
# tickers-table symbols
for t in tickers_tbl.keys():
    cc = canon_cik(t)
    if cc:
        cik_members[cc].add(t)

# ---------- build folds ----------
folds = []
conflicts = []
n_rekey = n_quar = n_alias = 0

for cik in sorted(cik_members.keys()):
    all_members = cik_members[cik]
    sec_syms = cik2syms.get(cik, [])
    sec_first = sec_syms[0] if sec_syms else None
    sec_listed = set(sec_syms)

    # A member NOT in the SEC symbol list for this CIK but carrying financials
    # rows was grouped only via a (mis-stamped) financials.Cik. It is very likely
    # a distinct security (ETN/foreign line) wrongly tagged with this issuer's CIK,
    # e.g. INR under Morgan Stanley's CIK. Never fold it -> flag for human review.
    suspects = sorted([m for m in all_members if m not in sec_listed])
    suspect_with_data = [m for m in suspects if ndy(m) > 0]
    if suspect_with_data:
        if sec_listed:
            conflicts.append({'cik': cik,
                              'issue': 'data-carrying symbol(s) not in SEC symbol list for this CIK (likely mis-stamped financials.Cik on a distinct security)',
                              'symbols': suspect_with_data})
        else:
            # CIK not present in the SEC universe at all
            if len(suspect_with_data) > 1:
                conflicts.append({'cik': cik,
                                  'issue': 'CIK absent from SEC universe; multiple data-carrying symbols share it',
                                  'symbols': suspect_with_data})
            continue

    # only SEC-listed symbols of this issuer participate in the fold
    members = {m for m in all_members if m in sec_listed}
    if not members:
        continue

    # ---- primary selection ----
    common_with_data = [m for m in members if classify(m) == 'common' and ndy(m) > 0]
    primary = None; psource = None
    exclude = set()   # ambiguous data-carrying symbols pulled out of the fold

    def legit_carrier(m, base):
        # A common sibling that may legitimately outrank the SEC-first common and
        # become primary (data_carrier). Two shapes only:
        #   (a) dashed single-letter share class:  BRK-A, BIO-B, HEI-A
        #   (b) plain dual-class where the SEC-first symbol is an EXTENSION of the
        #       carrier (GOOGL = GOOG + "L")  -> base.startswith(m), m shorter.
        # This rejects dash-less warrants/units/preferreds/baby-bonds (COOTW,
        # GTENU, NHPBP, LTRYW) that only *look* common to the coarse regex and
        # happen to carry more (mislabeled) data-years than a sparse common.
        if is_share_class(m):
            return True
        if base and base.startswith(m) and len(m) < len(base):
            return True
        return False

    if sec_first and classify(sec_first) == 'common':
        base = sec_first
        richer = [m for m in common_with_data if m != base and ndy(m) > ndy(base)]
        carriers = [m for m in richer if legit_carrier(m, base)]
        # dash-less pseudo-common carriers that outrank the common but are NOT a
        # legitimate share class are almost certainly distinct securities wrongly
        # stamped -> flag + exclude so they can neither become primary nor win a
        # per-year contest and corrupt the common.
        ambiguous = [m for m in richer if m not in carriers]
        if carriers:
            mx = max(ndy(m) for m in carriers)
            top = sorted([m for m in carriers if ndy(m) == mx])
            primary = top[0]; psource = 'data_carrier'
            if len(top) > 1:
                conflicts.append({'cik': cik, 'issue': 'multiple share-class siblings tie on data-years for data_carrier primary', 'symbols': top})
        else:
            primary = base; psource = 'sec_first'
        if ambiguous:
            conflicts.append({'cik': cik, 'issue': 'dash-less pseudo-common sibling(s) carry more data-years than the SEC common (likely warrant/unit/preferred mis-stamped as common); excluded from the fold', 'symbols': sorted(ambiguous)})
            exclude.update(ambiguous)
    else:
        # SEC-first listing is not common (or CIK absent from universe): the true
        # common is unknown/absent -> do not guess a primary, flag for review.
        if data_sibs_any := [m for m in members if ndy(m) > 0]:
            conflicts.append({'cik': cik, 'issue': 'SEC-first listing for this CIK is not common-class; primary common uncertain', 'symbols': sorted(data_sibs_any)})
        continue

    if primary is None:
        continue

    # apply exclusions, then recompute working sibling sets
    members = {m for m in members if m not in exclude}
    data_sibs = sorted([m for m in members if ndy(m) > 0])
    real_members = sorted([m for m in members if m in tickers_tbl or ndy(m) > 0])

    # ---- decide whether a fold is warranted ----
    non_primary_real = [m for m in real_members if m != primary]
    # skip clean single companies: primary is sec_first common with data and no other real siblings
    if not non_primary_real and psource == 'sec_first' and ndy(primary) > 0:
        continue
    # also skip if literally nothing to do (no data anywhere, no siblings)
    if not non_primary_real and ndy(primary) == 0 and not data_sibs:
        continue

    # ---- per-year winner resolution across data siblings ----
    rekey_years = defaultdict(list)      # from_sym -> [years]
    quar_years = defaultdict(list)       # from_sym -> [years]
    years_all = set()
    for m in data_sibs:
        years_all.update(tyr[m].keys())

    for y in sorted(years_all):
        contenders = [(m, tyr[m][y][0], tyr[m][y][1]) for m in data_sibs if y in tyr[m]]
        # winner: max nonnull; tie -> newer filling date; tie -> lex first symbol
        winner = max(contenders, key=lambda x: (x[1], x[2], ))[0]
        # apply lex tiebreak explicitly among top
        top_nn = max(x[1] for x in contenders)
        top = [x for x in contenders if x[1] == top_nn]
        if len(top) > 1:
            top_fd = max(x[2] for x in top)
            top2 = [x for x in top if x[2] == top_fd]
            winner = sorted(x[0] for x in top2)[0]
        else:
            winner = top[0][0]
        for (m, nn, fd) in contenders:
            if m == winner:
                if winner != primary:
                    rekey_years[winner].append(y)
                # else: primary keeps its own row, no action
            else:
                quar_years[m].append(y)

    # ---- assemble actions ----
    actions = []
    for frm in sorted(rekey_years):
        actions.append({'type': 'rekey', 'from': frm, 'to': primary, 'years': sorted(rekey_years[frm])})
        n_rekey += 1
    for frm in sorted(quar_years):
        actions.append({'type': 'quarantine', 'from': frm, 'years': sorted(quar_years[frm]), 'reason': 'duplicate_sibling'})
        n_quar += 1
    # aliases: every non-primary sibling present in tickers table
    for m in sorted(non_primary_real):
        if m in tickers_tbl:
            actions.append({'type': 'alias', 'symbol': m, 'to': primary, 'kind': classify(m)})
            n_alias += 1

    # A fold with no rekey/quarantine/alias performs no remediation. This also
    # discards data_carrier reassignments where the SEC-first symbol is absent
    # from the DB (nothing to alias, data carrier already stands alone) and the
    # suffix-variant "carrier" may not even be the true common.
    if not actions:
        continue

    folds.append({
        'cik': cik,
        'primary': primary,
        'primary_source': psource,
        'actions': actions,
    })

summary = {
    'ciks_analyzed': len(cik_members),
    'folds': len(folds),
    'rekeys': n_rekey,
    'quarantines': n_quar,
    'aliases': n_alias,
    'conflicts': len(conflicts),
}

out = {
    'generated_at': datetime.datetime.now().isoformat(),
    'summary': summary,
    'folds': folds,
    'conflicts': conflicts,
}
json.dump(out, open(OUT, 'w'), indent=2)

# ---- report ----
print(json.dumps(summary, indent=2))
byprim = {f['primary']: f for f in folds}
# also index by any symbol involved for MS/BAC/WFC etc whose primary is the common
def find_fold_for(sym):
    for f in folds:
        if f['primary'] == sym:
            return f
        for a in f['actions']:
            if a.get('symbol') == sym or a.get('from') == sym or a.get('to') == sym:
                return f
    return None

print('\n=== KNOWN CASES ===')
for s in ['GS', 'MS', 'BAC', 'WFC', 'BRK-A', 'GOOG', 'JPM']:
    f = find_fold_for(s)
    print(f'\n--- {s} ---')
    print(json.dumps(f, indent=2) if f else 'NO FOLD')

print('\n=== FIRST 10 CONFLICTS ===')
print(json.dumps(conflicts[:10], indent=2))
print('\nTOTALS', summary)
