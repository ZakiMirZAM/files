

import os
import urllib.request
import json
import datetime
import matplotlib
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import yfinance as yf

# ── CONFIG ───────────────────────────────────────────────────────────────────
FRED_API_KEY = os.environ.get("FRED_API_KEY", "")
FRED_BASE = "https://api.stlouisfed.org/fred/series/observations" 

TODAY        = datetime.date.today()
END_DATE     = str(TODAY)

SP500_START  = "2013-01-01"
MAIN_START   = str(TODAY.year - 40) + "-01-01"


# ── LOW-LEVEL FETCH ──────────────────────────────────────────────────────────

def fred_fetch(series_id, start_date, end_date):
    """
    Pull observations from FRED.
    Returns list of {"date": datetime.date, "value": float}.
    Skips missing values (FRED uses "." for missing).
    """
    url = (
        FRED_BASE
        + "?series_id="         + series_id
        + "&api_key="           + FRED_API_KEY
        + "&file_type=json"
        + "&observation_start=" + start_date
        + "&observation_end="   + end_date
    )
    try:
        with urllib.request.urlopen(url) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        print("  ERROR fetching " + series_id + ": " + str(e))
        return []

    results = []
    for obs in data.get("observations", []):
        if obs["value"] != ".":
            parts = obs["date"].split("-")
            d = datetime.date(int(parts[0]), int(parts[1]), int(parts[2]))
            results.append({"date": d, "value": float(obs["value"])})
    return results


# ── YAHOO FINANCE FETCH ──────────────────────────────────────────────────────

def yahoo_fetch(ticker, start_date, end_date):
    """
    Pull daily closing prices from Yahoo Finance for a given ticker.
    Returns list of {"date": datetime.date, "value": float}, same format
    as fred_fetch so the rest of the program works without changes.
    """
    try:
        data = yf.download(
            ticker,
            start=start_date,
            end=end_date,
            progress=False,
            auto_adjust=True,
        )
    except Exception as e:
        print("  ERROR fetching " + ticker + " from Yahoo: " + str(e))
        return []

    if data is None or data.empty:
        print("  ERROR: Yahoo returned no data for " + ticker)
        return []

    results = []
    # The Close column may be a plain column or part of a multi-index
    close = data["Close"]
    for idx in range(len(close)):
        ts = close.index[idx]
        # Pull the scalar value (handles both Series and DataFrame shapes)
        raw = close.iloc[idx]
        if hasattr(raw, "iloc"):
            raw = raw.iloc[0]
        if raw is None:
            continue
        try:
            val = float(raw)
        except (ValueError, TypeError):
            continue
        # Skip NaN values
        if val != val:
            continue
        d = datetime.date(ts.year, ts.month, ts.day)
        results.append({"date": d, "value": val})

    return results


# ── RECESSION BANDS ──────────────────────────────────────────────────────────

def fetch_recession_bands(start_date, end_date):
    """
    Pull USREC from FRED (1 = recession, 0 = expansion).
    Returns list of (start_date, end_date) tuples for each recession band.
    """
    obs = fred_fetch("USREC", start_date, end_date)
    if not obs:
        return []

    bands = []
    in_recession = False
    band_start = None

    for o in obs:
        if o["value"] == 1.0 and not in_recession:
            in_recession = True
            band_start = o["date"]
        elif o["value"] == 0.0 and in_recession:
            in_recession = False
            bands.append((band_start, o["date"]))

    if in_recession and band_start is not None:
        bands.append((band_start, obs[-1]["date"]))

    return bands


def shade_recessions(ax, bands):
    for start, end in bands:
        ax.axvspan(start, end, color="#D1D5DB", alpha=0.5, zorder=0)


# ── YoY % CHANGE SERIES ──────────────────────────────────────────────────────

def build_yoy_series(obs):
    """
    Compute YoY % change at each observation point.
    Matches to closest point within 45 days of exactly 12 months prior.
    """
    result = []
    for i in range(len(obs)):
        current_date = obs[i]["date"]
        current_val  = obs[i]["value"]
        try:
            target_date = current_date.replace(year=current_date.year - 1)
        except ValueError:
            # Feb 29 in a leap year has no equivalent in the prior year — use Feb 28
            target_date = current_date.replace(year=current_date.year - 1, day=28)

        best_val  = None
        best_diff = 999999

        for j in range(i):
            diff = abs((obs[j]["date"] - target_date).days)
            if diff < best_diff:
                best_diff = diff
                best_val  = obs[j]["value"]

        if best_val is not None and best_val != 0 and best_diff <= 45:
            pct = ((current_val - best_val) / abs(best_val)) * 100
            result.append({"date": current_date, "value": pct})

    return result


# ── DERIVED: REAL M1 ─────────────────────────────────────────────────────────

def build_real_m1(start_date, end_date):
    """Real M1 = M1SL / CPIAUCSL * 100. Matched by date."""
    m1_obs  = fred_fetch("M1SL",     start_date, end_date)
    cpi_obs = fred_fetch("CPIAUCSL", start_date, end_date)

    cpi_by_date = {}
    for o in cpi_obs:
        cpi_by_date[o["date"]] = o["value"]

    real_m1 = []
    for o in m1_obs:
        d = o["date"]
        if d in cpi_by_date and cpi_by_date[d] != 0:
            real_m1.append({"date": d, "value": (o["value"] / cpi_by_date[d]) * 100})

    return real_m1


# ── DERIVED: M2/M1 ADJUSTED S&P 500 ─────────────────────────────────────────

def build_adjusted_sp500(money_series_id, sp500_obs):
    """
    Adjusted S&P 500 = SP500 / money_supply.
    Forward-fills monthly money supply to daily before dividing.
    Returns raw_ratio and normalized (base = 100 at first point).
    """
    money_obs = fred_fetch(money_series_id, SP500_START, END_DATE)
    if not money_obs or not sp500_obs:
        return [], []

    sorted_money = sorted(money_obs, key=lambda x: x["date"])
    all_sp_dates = sorted([o["date"] for o in sp500_obs])

    money_by_date = {}
    money_idx = 0
    for sp_date in all_sp_dates:
        while (money_idx + 1 < len(sorted_money)
               and sorted_money[money_idx + 1]["date"] <= sp_date):
            money_idx += 1
        money_by_date[sp_date] = sorted_money[money_idx]["value"]

    raw_ratio = []
    for o in sp500_obs:
        d = o["date"]
        if d in money_by_date and money_by_date[d] != 0:
            raw_ratio.append({"date": d, "value": o["value"] / money_by_date[d]})

    if not raw_ratio:
        return [], []

    base = raw_ratio[0]["value"]
    normalized = [{"date": o["date"], "value": (o["value"] / base) * 100}
                  for o in raw_ratio]

    return raw_ratio, normalized


# ── QUARTERLY RETURNS ─────────────────────────────────────────────────────────

def build_quarterly_returns(obs):
    """
    Compute quarterly % return from daily S&P 500 observations.
    Uses the last available trading day of each quarter as the close.
    """
    if not obs:
        return []

    quarters = {}
    for o in obs:
        d = o["date"]
        q = (d.year, (d.month - 1) // 3 + 1)
        if q not in quarters:
            quarters[q] = []
        quarters[q].append(o)

    sorted_keys = sorted(quarters.keys())

    quarter_closes = []
    for key in sorted_keys:
        q_obs = sorted(quarters[key], key=lambda x: x["date"])
        quarter_closes.append({"date": q_obs[-1]["date"], "value": q_obs[-1]["value"]})

    returns = []
    for i in range(1, len(quarter_closes)):
        prev_val = quarter_closes[i - 1]["value"]
        curr_val = quarter_closes[i]["value"]
        if prev_val != 0:
            pct = ((curr_val - prev_val) / abs(prev_val)) * 100
            returns.append({"date": quarter_closes[i]["date"], "value": pct})

    return returns


# ── PRINT HELPERS ─────────────────────────────────────────────────────────────

def print_sep(char="-", width=62):
    print(char * width)

def fmt_pct(val, decimals=2):
    if val is None:
        return "N/A"
    return str(round(val, decimals)) + "%"

def fmt_val(val, decimals=2):
    if val is None:
        return "N/A"
    return str(round(val, decimals))

def latest(obs):
    if not obs:
        return None, None
    return obs[-1]["date"], obs[-1]["value"]

def latest_yoy(obs):
    yoy_series = build_yoy_series(obs)
    d, v = latest(obs)
    _, pct = latest(yoy_series) if yoy_series else (None, None)
    return d, v, pct


# ── CHART HELPERS ─────────────────────────────────────────────────────────────

COLORS = {
    "blue"   : "#2563EB",
    "green"  : "#16A34A",
    "red"    : "#DC2626",
    "orange" : "#EA580C",
    "purple" : "#7C3AED",
    "teal"   : "#0D9488",
    "rose"   : "#E11D48",
    "gray"   : "#6B7280",
}

def extract_xy(obs):
    return [o["date"] for o in obs], [o["value"] for o in obs]

def style_ax(ax, title, ylabel, color):
    ax.set_title(title, fontsize=10, fontweight="bold", pad=8)
    ax.set_ylabel(ylabel, fontsize=8)
    ax.tick_params(axis="both", labelsize=7.5)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    ax.xaxis.set_major_locator(mdates.YearLocator(5))
    ax.grid(True, linestyle="--", alpha=0.4, zorder=1)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    for label in ax.get_xticklabels():
        label.set_rotation(30)

def fill_yoy(ax, dates, values, color):
    ax.plot(dates, values, color=color, linewidth=1.2, zorder=2)
    ax.axhline(0, color="#374151", linewidth=0.8, linestyle="-", zorder=2)
    pos_vals = [v if v >= 0 else 0 for v in values]
    neg_vals = [v if v <  0 else 0 for v in values]
    ax.fill_between(dates, pos_vals, 0, alpha=0.25, color=COLORS["green"], zorder=2)
    ax.fill_between(dates, neg_vals, 0, alpha=0.25, color=COLORS["red"],   zorder=2)

def fill_level(ax, dates, values, color, base=None):
    ax.plot(dates, values, color=color, linewidth=1.4, zorder=2)
    floor = base if base is not None else min(values)
    ax.fill_between(dates, values, floor, alpha=0.15, color=color, zorder=2)

def add_latest_label(ax, dates, values):
    if dates and values:
        ax.annotate(
            fmt_val(values[-1], 2),
            xy=(dates[-1], values[-1]),
            xytext=(5, 0), textcoords="offset points",
            fontsize=7, color="#111827", zorder=3
        )

def add_recession_legend(ax):
    import matplotlib.patches as mpatches
    patch = mpatches.Patch(color="#D1D5DB", alpha=0.5, label="Recession")
    handles, labels = ax.get_legend_handles_labels()
    ax.legend(handles=handles + [patch], labels=labels + ["Recession"],
              fontsize=7, loc="upper left")


# ── MAIN ─────────────────────────────────────────────────────────────────────

def main():

    print()
    print_sep("=")
    print("  FRED ECONOMIC METRICS DASHBOARD")
    print("  Fetching data... please wait.")
    print_sep("=")

    # Extra year back so YoY calculations have a prior-year comparison point
    extended_start = str(TODAY.year - 41) + "-01-01"

    # ── EXISTING SERIES ──────────────────────────────────────────────────────
    m2_obs      = fred_fetch("M2SL",            extended_start, END_DATE)
    m1_obs      = fred_fetch("M1SL",            extended_start, END_DATE)
    m2real_obs  = fred_fetch("M2REAL",          extended_start, END_DATE)
    real_m1_obs = build_real_m1(extended_start, END_DATE)
    cpi_obs     = fred_fetch("CPIAUCSL",        extended_start, END_DATE)
    ppi_obs     = fred_fetch("PPIACO",          extended_start, END_DATE)
    gdp_obs     = fred_fetch("A191RL1Q225SBEA", MAIN_START,     END_DATE)
    debt_obs    = fred_fetch("GFDGDPA188S",     MAIN_START,     END_DATE)
    yc_2y_obs   = fred_fetch("T10Y2Y",          MAIN_START,     END_DATE)
    yc_3m_obs   = fred_fetch("T10Y3M",          MAIN_START,     END_DATE)
    sp500_obs   = fred_fetch("SP500",           SP500_START,    END_DATE)

    # ── NEW: FX DEBT AS % OF GDP ─────────────────────────────────────────────
    # HBFIGDQ188S = Federal Debt Held by Foreign & International Investors as % GDP
    # Quarterly, seasonally adjusted. Best FRED proxy for FX debt exposure.
    fx_debt_obs = fred_fetch("HBFIGDQ188S", MAIN_START, END_DATE)

    # ── NEW: GLOBAL TRADE INDICES ────────────────────────────────────────────
    # 1. Nominal Broad USD Index (DTWEXBGS)
    #    Trade-weighted dollar vs broad basket of US trading partners.
    #    Daily. Index 2006=100. Most useful single proxy for trade competitiveness.
    usd_index_obs = fred_fetch("DTWEXBGS", MAIN_START, END_DATE)

    # 2. Trade Balance: Goods and Services (BOPGSTB)
    #    Monthly. Millions USD. Negative = trade deficit.
    #    Signals shifts in global demand for US goods and USD.
    trade_bal_obs = fred_fetch("BOPGSTB", MAIN_START, END_DATE)

    # 3. Import Price Index: All Commodities (IR)
    #    Monthly, back to 1982. Index 2000=100.
    #    Measures imported inflation. Leads CPI and signals global demand pressure.
    import_px_obs = fred_fetch("IR", extended_start, END_DATE)

    # 4. Real Exports of Goods and Services (EXPGSC1)
    #    Quarterly, billions chained 2017 dollars.
    #    Measures the actual volume of US exports in the global economy.
    exports_obs   = fred_fetch("EXPGSC1", MAIN_START, END_DATE)

    # Recession bands
    recession_main = fetch_recession_bands(MAIN_START,  END_DATE)
    recession_sp   = fetch_recession_bands(SP500_START, END_DATE)

    # Adjusted S&P 500
    sp500_m2_raw, sp500_m2_norm = build_adjusted_sp500("M2SL", sp500_obs)
    sp500_m1_raw, sp500_m1_norm = build_adjusted_sp500("M1SL", sp500_obs)

    # Quarterly returns
    sp500_qtr = build_quarterly_returns(sp500_obs)

    # YoY series
    m2_yoy         = build_yoy_series(m2_obs)
    m1_yoy         = build_yoy_series(m1_obs)
    m2real_yoy     = build_yoy_series(m2real_obs)
    real_m1_yoy    = build_yoy_series(real_m1_obs)
    cpi_yoy        = build_yoy_series(cpi_obs)
    ppi_yoy        = build_yoy_series(ppi_obs)
    usd_index_yoy  = build_yoy_series(usd_index_obs)
    import_px_yoy  = build_yoy_series(import_px_obs)
    exports_yoy    = build_yoy_series(exports_obs)

    # ── PRINT TABLE ──────────────────────────────────────────────────────────

    print()
    d, v, yoy = latest_yoy(m2_obs)
    print("1.  M2 Money Supply")
    print("    Date: " + str(d) + "  |  Level: $" + fmt_val(v) + "B  |  YoY: " + fmt_pct(yoy))

    d, v, yoy = latest_yoy(m1_obs)
    print("2.  M1 Money Supply")
    print("    Date: " + str(d) + "  |  Level: $" + fmt_val(v) + "B  |  YoY: " + fmt_pct(yoy))

    d, v, yoy = latest_yoy(m2real_obs)
    print("3.  Real M2 Money Supply")
    print("    Date: " + str(d) + "  |  Level: $" + fmt_val(v) + "B  |  YoY: " + fmt_pct(yoy))

    d, v, yoy = latest_yoy(real_m1_obs)
    print("4.  Real M1 (Derived: M1SL / CPI)")
    print("    Date: " + str(d) + "  |  Index: " + fmt_val(v) + "  |  YoY: " + fmt_pct(yoy))

    d, v = latest(yc_2y_obs)
    signal = "INVERTED" if v is not None and v < 0 else "Normal"
    print("5.  Yield Curve 10Y-2Y")
    print("    Date: " + str(d) + "  |  Spread: " + fmt_val(v) + " pp  |  " + signal)

    d, v = latest(yc_3m_obs)
    signal = "INVERTED" if v is not None and v < 0 else "Normal"
    print("6.  Yield Curve 10Y-3M")
    print("    Date: " + str(d) + "  |  Spread: " + fmt_val(v) + " pp  |  " + signal)

    d, v = latest(gdp_obs)
    print("7.  Annualized Real GDP Growth")
    print("    Date: " + str(d) + "  |  Rate: " + fmt_pct(v))

    d, v = latest(debt_obs)
    print("8.  Federal Debt as % of GDP (GFDGDPA188S, annual)")
    print("    Date: " + str(d) + "  |  Debt/GDP: " + fmt_pct(v))

    d, v, yoy = latest_yoy(cpi_obs)
    print("9.  CPI Inflation")
    print("    Date: " + str(d) + "  |  Index: " + fmt_val(v) + "  |  YoY: " + fmt_pct(yoy))

    d, v, yoy = latest_yoy(ppi_obs)
    print("10. PPI Inflation")
    print("    Date: " + str(d) + "  |  Index: " + fmt_val(v) + "  |  YoY: " + fmt_pct(yoy))

    d, v = latest(sp500_obs)
    print("11. S&P 500 (raw)")
    print("    Date: " + str(d) + "  |  Level: " + fmt_val(v))

    d, v = latest(sp500_m2_norm)
    print("12. S&P 500 / M2 Adjusted (normalized, base=100)")
    print("    Date: " + str(d) + "  |  Index: " + fmt_val(v))

    d, v = latest(sp500_m1_norm)
    print("13. S&P 500 / M1 Adjusted (normalized, base=100)")
    print("    Date: " + str(d) + "  |  Index: " + fmt_val(v))

    if sp500_qtr:
        d, v = latest(sp500_qtr)
        print("14. S&P 500 Most Recent Quarterly Return")
        print("    Quarter end: " + str(d) + "  |  Return: " + fmt_pct(v))

    d, v = latest(fx_debt_obs)
    print("15. FX Debt as % of GDP (HBFIGDQ188S)")
    print("    Def: Federal debt held by foreign investors as % of GDP")
    print("    Date: " + str(d) + "  |  FX Debt/GDP: " + fmt_pct(v))

    d, v, yoy = latest_yoy(usd_index_obs)
    print("16. Nominal Broad USD Index (DTWEXBGS)")
    print("    Date: " + str(d) + "  |  Index: " + fmt_val(v) + "  |  YoY: " + fmt_pct(yoy))

    d, v = latest(trade_bal_obs)
    print("17. Trade Balance: Goods & Services (BOPGSTB)")
    print("    Date: " + str(d) + "  |  Balance: $" + fmt_val(v) + "M")

    d, v, yoy = latest_yoy(import_px_obs)
    print("18. Import Price Index: All Commodities (IR)")
    print("    Date: " + str(d) + "  |  Index: " + fmt_val(v) + "  |  YoY: " + fmt_pct(yoy))

    d, v, yoy = latest_yoy(exports_obs)
    print("19. Real Exports of Goods & Services (EXPGSC1)")
    print("    Date: " + str(d) + "  |  Level: $" + fmt_val(v) + "B  |  YoY: " + fmt_pct(yoy))

    print()
    print_sep("=")
    print("  Building charts...")
    print_sep("=")


    # ── FIGURE 1: MONEY SUPPLY YoY % ─────────────────────────────────────────
    fig1, axes = plt.subplots(2, 2, figsize=(14, 8))
    fig1.suptitle("Money Supply — Year-over-Year % Change  (gray = recession)",
                  fontsize=13, fontweight="bold")
    fig1.patch.set_facecolor("#F9FAFB")

    datasets = [
        (m2_yoy,      "M2 YoY %",                     COLORS["blue"]),
        (m1_yoy,      "M1 YoY %",                     COLORS["green"]),
        (m2real_yoy,  "Real M2 YoY %",                COLORS["purple"]),
        (real_m1_yoy, "Real M1 YoY % (CPI-deflated)", COLORS["orange"]),
    ]
    flat_axes = [axes[0][0], axes[0][1], axes[1][0], axes[1][1]]

    for ax, (obs, title, color) in zip(flat_axes, datasets):
        shade_recessions(ax, recession_main)
        if obs:
            dates, values = extract_xy(obs)
            fill_yoy(ax, dates, values, color)
            add_latest_label(ax, dates, values)
        style_ax(ax, title, "% Change YoY", color)
        add_recession_legend(ax)

    plt.tight_layout()


    # ── FIGURE 2: YIELD CURVES ────────────────────────────────────────────────
    fig2, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))
    fig2.suptitle("Yield Curve Spreads (10Y minus Short Rate)  (gray = recession)",
                  fontsize=13, fontweight="bold")
    fig2.patch.set_facecolor("#F9FAFB")

    shade_recessions(ax1, recession_main)
    if yc_2y_obs:
        dates, values = extract_xy(yc_2y_obs)
        fill_yoy(ax1, dates, values, COLORS["blue"])
        add_latest_label(ax1, dates, values)
    style_ax(ax1, "10Y minus 2Y Treasury Spread", "Percentage Points", COLORS["blue"])
    add_recession_legend(ax1)

    shade_recessions(ax2, recession_main)
    if yc_3m_obs:
        dates, values = extract_xy(yc_3m_obs)
        fill_yoy(ax2, dates, values, COLORS["orange"])
        add_latest_label(ax2, dates, values)
    style_ax(ax2, "10Y minus 3M Treasury Spread", "Percentage Points", COLORS["orange"])
    add_recession_legend(ax2)

    plt.tight_layout()


    # ── FIGURE 3: INFLATION, GDP, DEBT ────────────────────────────────────────
    fig3, axes3 = plt.subplots(2, 2, figsize=(14, 8))
    fig3.suptitle("Inflation, GDP Growth, and Debt  (gray = recession)",
                  fontsize=13, fontweight="bold")
    fig3.patch.set_facecolor("#F9FAFB")

    ax = axes3[0][0]
    shade_recessions(ax, recession_main)
    if cpi_yoy:
        dates, values = extract_xy(cpi_yoy)
        fill_yoy(ax, dates, values, COLORS["red"])
        add_latest_label(ax, dates, values)
    style_ax(ax, "CPI YoY % Change", "% Change YoY", COLORS["red"])
    add_recession_legend(ax)

    ax = axes3[0][1]
    shade_recessions(ax, recession_main)
    if ppi_yoy:
        dates, values = extract_xy(ppi_yoy)
        fill_yoy(ax, dates, values, COLORS["orange"])
        add_latest_label(ax, dates, values)
    style_ax(ax, "PPI YoY % Change", "% Change YoY", COLORS["orange"])
    add_recession_legend(ax)

    ax = axes3[1][0]
    shade_recessions(ax, recession_main)
    if gdp_obs:
        dates, values = extract_xy(gdp_obs)
        fill_yoy(ax, dates, values, COLORS["green"])
        add_latest_label(ax, dates, values)
    style_ax(ax, "Annualized Real GDP Growth Rate", "% SAAR", COLORS["green"])
    add_recession_legend(ax)

    ax = axes3[1][1]
    shade_recessions(ax, recession_main)
    if debt_obs:
        dates, values = extract_xy(debt_obs)
        fill_level(ax, dates, values, COLORS["purple"], base=min(values))
        add_latest_label(ax, dates, values)
    style_ax(ax, "Federal Debt as % of GDP (Annual)", "% of GDP", COLORS["purple"])
    add_recession_legend(ax)

    plt.tight_layout()


    # ── FIGURE 4: S&P 500 ADJUSTED + QUARTERLY RETURNS ───────────────────────
    fig4, axes4 = plt.subplots(2, 3, figsize=(18, 8))
    fig4.suptitle("S&P 500: Money-Supply Adjusted & Quarterly Returns  (gray = recession)",
                  fontsize=13, fontweight="bold")
    fig4.patch.set_facecolor("#F9FAFB")

    ax = axes4[0][0]
    shade_recessions(ax, recession_sp)
    if sp500_obs:
        dates, values = extract_xy(sp500_obs)
        fill_level(ax, dates, values, COLORS["blue"], base=min(values))
        add_latest_label(ax, dates, values)
    style_ax(ax, "S&P 500 Raw Level", "Index Points", COLORS["blue"])
    add_recession_legend(ax)

    ax = axes4[0][1]
    shade_recessions(ax, recession_sp)
    if sp500_m2_raw:
        dates, values = extract_xy(sp500_m2_raw)
        fill_level(ax, dates, values, COLORS["green"], base=min(values))
        add_latest_label(ax, dates, values)
    style_ax(ax, "S&P 500 / M2 (Raw Ratio)", "Index pts per $B M2", COLORS["green"])
    add_recession_legend(ax)

    ax = axes4[0][2]
    shade_recessions(ax, recession_sp)
    if sp500_m2_norm:
        dates, values = extract_xy(sp500_m2_norm)
        fill_level(ax, dates, values, COLORS["purple"], base=100)
        ax.axhline(100, color="#374151", linewidth=0.8, linestyle="--", zorder=2)
        add_latest_label(ax, dates, values)
    style_ax(ax, "S&P 500 / M2 Normalized (base=100)", "Index (Jan 2013=100)", COLORS["purple"])
    add_recession_legend(ax)

    ax = axes4[1][0]
    shade_recessions(ax, recession_sp)
    if sp500_m1_norm:
        dates, values = extract_xy(sp500_m1_norm)
        fill_level(ax, dates, values, COLORS["orange"], base=100)
        ax.axhline(100, color="#374151", linewidth=0.8, linestyle="--", zorder=2)
        add_latest_label(ax, dates, values)
    style_ax(ax, "S&P 500 / M1 Normalized (base=100)", "Index (Jan 2013=100)", COLORS["orange"])
    add_recession_legend(ax)

    ax = axes4[1][1]
    shade_recessions(ax, recession_sp)
    if sp500_qtr:
        dates, values = extract_xy(sp500_qtr)
        bar_colors = [COLORS["green"] if v >= 0 else COLORS["red"] for v in values]
        ax.bar(dates, values, width=60, color=bar_colors, alpha=0.75, zorder=2)
        ax.axhline(0, color="#374151", linewidth=0.8, zorder=2)
        add_latest_label(ax, dates, values)
    style_ax(ax, "S&P 500 Quarterly % Returns", "% Return", COLORS["blue"])
    add_recession_legend(ax)

    axes4[1][2].set_visible(False)

    plt.tight_layout()


    # ── FIGURE 5: GLOBAL TRADE INDICES ───────────────────────────────────────
    fig5, axes5 = plt.subplots(2, 2, figsize=(14, 8))
    fig5.suptitle("Global Trade Indices  (gray = recession)",
                  fontsize=13, fontweight="bold")
    fig5.patch.set_facecolor("#F9FAFB")

    # Broad USD Index YoY %
    ax = axes5[0][0]
    shade_recessions(ax, recession_main)
    if usd_index_yoy:
        dates, values = extract_xy(usd_index_yoy)
        fill_yoy(ax, dates, values, COLORS["teal"])
        add_latest_label(ax, dates, values)
    style_ax(ax, "Nominal Broad USD Index YoY %\n(DTWEXBGS — trade-weighted vs major partners)",
             "% Change YoY", COLORS["teal"])
    add_recession_legend(ax)

    # Trade Balance level
    ax = axes5[0][1]
    shade_recessions(ax, recession_main)
    if trade_bal_obs:
        dates, values = extract_xy(trade_bal_obs)
        # Trade balance is usually negative (deficit) — fill relative to zero
        ax.plot(dates, values, color=COLORS["rose"], linewidth=1.2, zorder=2)
        ax.axhline(0, color="#374151", linewidth=0.8, linestyle="-", zorder=2)
        pos_vals = [v if v >= 0 else 0 for v in values]
        neg_vals = [v if v <  0 else 0 for v in values]
        ax.fill_between(dates, pos_vals, 0, alpha=0.25, color=COLORS["green"], zorder=2)
        ax.fill_between(dates, neg_vals, 0, alpha=0.25, color=COLORS["red"],   zorder=2)
        add_latest_label(ax, dates, values)
    style_ax(ax, "Trade Balance: Goods & Services (BOPGSTB)\n(negative = deficit, millions USD)",
             "Millions USD", COLORS["rose"])
    add_recession_legend(ax)

    # Import Price Index YoY %
    ax = axes5[1][0]
    shade_recessions(ax, recession_main)
    if import_px_yoy:
        dates, values = extract_xy(import_px_yoy)
        fill_yoy(ax, dates, values, COLORS["orange"])
        add_latest_label(ax, dates, values)
    style_ax(ax, "Import Price Index YoY % (IR)\n(all commodities — leads CPI, signals global demand)",
             "% Change YoY", COLORS["orange"])
    add_recession_legend(ax)

    # Real Exports YoY %
    ax = axes5[1][1]
    shade_recessions(ax, recession_main)
    if exports_yoy:
        dates, values = extract_xy(exports_yoy)
        fill_yoy(ax, dates, values, COLORS["green"])
        add_latest_label(ax, dates, values)
    style_ax(ax, "Real Exports of Goods & Services YoY % (EXPGSC1)\n(volume of US exports — reflects global demand for US output)",
             "% Change YoY", COLORS["green"])
    add_recession_legend(ax)

    plt.tight_layout()


    # ── FIGURE 6: FX DEBT AS % OF GDP ────────────────────────────────────────
    fig6, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))
    fig6.suptitle("Debt Exposure: Foreign Holdings & Total Federal Debt  (gray = recession)",
                  fontsize=13, fontweight="bold")
    fig6.patch.set_facecolor("#F9FAFB")

    # FX Debt / GDP level
    shade_recessions(ax1, recession_main)
    if fx_debt_obs:
        dates, values = extract_xy(fx_debt_obs)
        fill_level(ax1, dates, values, COLORS["rose"], base=min(values))
        add_latest_label(ax1, dates, values)
    style_ax(ax1,
             "Foreign-Held Federal Debt as % of GDP (HBFIGDQ188S)\n(FX debt proxy — foreign investor exposure to US debt)",
             "% of GDP", COLORS["rose"])
    add_recession_legend(ax1)

    # Domestic Debt / GDP for comparison
    shade_recessions(ax2, recession_main)
    if debt_obs:
        dates, values = extract_xy(debt_obs)
        fill_level(ax2, dates, values, COLORS["purple"], base=min(values))
        add_latest_label(ax2, dates, values)
    style_ax(ax2,
             "Total Federal Debt as % of GDP (GFDGDPA188S)\n(annual — total leverage of the US economy)",
             "% of GDP", COLORS["purple"])
    add_recession_legend(ax2)

    plt.tight_layout()


    # ── FIGURE 7: COMMODITY PRICES + VOLATILITY ───────────────────────────────

    # Fetch commodity series
    # All IMF monthly series go back to 1992; use MAIN_START (40yr) capped by data
    copper_obs   = fred_fetch("PCOPPUSDM",        MAIN_START, END_DATE)
    # Gold and silver pulled from Yahoo Finance instead of FRED.
    # GC=F = COMEX gold futures, SI=F = COMEX silver futures (USD per troy oz).
    # Yahoo history for these typically starts around 2000.
    gold_obs     = yahoo_fetch("GC=F", MAIN_START, END_DATE)
    silver_obs   = yahoo_fetch("SI=F", MAIN_START, END_DATE)
    wheat_obs    = fred_fetch("PWHEAMTUSDM",      MAIN_START, END_DATE)
    wti_obs      = fred_fetch("WTISPLC",          MAIN_START, END_DATE)
    brent_obs    = fred_fetch("POILBREUSDM",      MAIN_START, END_DATE)
    natgas_obs   = fred_fetch("MHHNGSP",          MAIN_START, END_DATE)
    # Heavy trucks: HTRUCKSSAAR = Motor Vehicle Retail Sales: Heavy Weight Trucks
    # Seasonally adjusted annual rate, thousands of units, back to 1967
    trucks_obs   = fred_fetch("HTRUCKSSAAR",      MAIN_START, END_DATE)
    # PPIACO already fetched above as ppi_obs

    # Gold is daily — resample to monthly end-of-month for consistent volatility
    def resample_monthly(obs):
        """Take the last observation each calendar month."""
        by_month = {}
        for o in obs:
            key = (o["date"].year, o["date"].month)
            by_month[key] = o  # last one wins since obs is sorted
        result = []
        for key in sorted(by_month.keys()):
            result.append(by_month[key])
        return result

    gold_monthly = resample_monthly(gold_obs)
    # Silver (SLVPRUSD) is also daily — resample to monthly for consistent volatility
    silver_monthly = resample_monthly(silver_obs)

    def build_log_vol(obs, window=12):
        """
        Compute rolling annualized volatility from log returns.
        vol_t = stdev( ln(P_t / P_{t-1}) for t in window ) * sqrt(window)
        Returns list of {"date", "value"} in % terms (multiplied by 100).
        window=12 means 12-month rolling window for monthly data.
        """
        import math

        # Compute log returns first
        log_returns = []
        for i in range(1, len(obs)):
            prev = obs[i - 1]["value"]
            curr = obs[i]["value"]
            if prev > 0 and curr > 0:
                lr = math.log(curr / prev)
                log_returns.append({"date": obs[i]["date"], "value": lr})

        if len(log_returns) < window:
            return []

        result = []
        for i in range(window - 1, len(log_returns)):
            window_vals = [log_returns[j]["value"] for j in range(i - window + 1, i + 1)]
            n = len(window_vals)
            mean = sum(window_vals) / n
            variance = sum((v - mean) ** 2 for v in window_vals) / (n - 1)
            stdev = variance ** 0.5
            annualized = stdev * (window ** 0.5) * 100  # in %
            result.append({"date": log_returns[i]["date"], "value": annualized})

        return result

    # Build volatility for each commodity
    copper_vol  = build_log_vol(copper_obs)
    gold_vol    = build_log_vol(gold_monthly)
    silver_vol  = build_log_vol(silver_monthly)
    wheat_vol   = build_log_vol(wheat_obs)
    wti_vol     = build_log_vol(wti_obs)
    brent_vol   = build_log_vol(brent_obs)
    natgas_vol  = build_log_vol(natgas_obs)
    trucks_vol  = build_log_vol(trucks_obs)
    ppi_vol     = build_log_vol(ppi_obs)

    # Print commodity table
    print()
    print_sep("-")
    print("  COMMODITY PRICES")
    print_sep("-")
    for label, obs in [
        ("Copper ($/MT)",        copper_obs),
        ("Gold ($/troy oz)",     gold_obs),
        ("Silver ($/troy oz)",   silver_obs),
        ("Wheat ($/MT)",         wheat_obs),
        ("WTI Crude ($/bbl)",    wti_obs),
        ("Brent Crude ($/bbl)",  brent_obs),
        ("Henry Hub ($/MMBtu)",  natgas_obs),
        ("Heavy Trucks (000s)",  trucks_obs),
        ("PPI All Commodities",  ppi_obs),
    ]:
        d, v = latest(obs)
        print("  " + label + ": " + fmt_val(v) + "  (" + str(d) + ")")

    def plot_commodity(ax_price, ax_vol, price_obs, vol_obs, label, price_color, vol_color, unit_label):
        """
        Plot price on ax_price (left y-axis) and volatility on ax_vol (right y-axis).
        ax_vol is a twin of ax_price sharing the x-axis.
        """
        if price_obs:
            dates, values = extract_xy(price_obs)
            ax_price.plot(dates, values, color=price_color, linewidth=1.4, zorder=2, label=label)
            ax_price.fill_between(dates, values, min(values), alpha=0.12, color=price_color, zorder=1)
            add_latest_label(ax_price, dates, values)

        if vol_obs:
            vdates, vvalues = extract_xy(vol_obs)
            ax_vol.plot(vdates, vvalues, color=vol_color, linewidth=1.0,
                        linestyle="--", zorder=3, label="12M Vol %", alpha=0.85)

        ax_price.set_ylabel(unit_label, fontsize=8, color=price_color)
        ax_price.tick_params(axis="y", labelcolor=price_color, labelsize=7.5)
        ax_vol.set_ylabel("Ann. Vol %", fontsize=8, color=vol_color)
        ax_vol.tick_params(axis="y", labelcolor=vol_color, labelsize=7.5)

        # Combined legend
        lines1, labs1 = ax_price.get_legend_handles_labels()
        lines2, labs2 = ax_vol.get_legend_handles_labels()
        ax_price.legend(lines1 + lines2, labs1 + labs2, fontsize=6.5, loc="upper left")

    # 9 commodities in a 3x3 grid
    fig7, axes7 = plt.subplots(3, 3, figsize=(18, 12))
    fig7.suptitle("Commodity Prices with 12-Month Rolling Annualized Volatility  (gray = recession)",
                  fontsize=13, fontweight="bold")
    fig7.patch.set_facecolor("#F9FAFB")

    commodity_panels = [
        (copper_obs,  copper_vol,  "Copper",          COLORS["orange"], COLORS["red"],    "USD / MT"),
        (gold_monthly,gold_vol,    "Gold",             COLORS["orange"], COLORS["purple"], "USD / troy oz"),
        (silver_monthly,silver_vol, "Silver",          COLORS["gray"],   COLORS["blue"],   "USD / troy oz"),
        (wheat_obs,   wheat_vol,   "Wheat",            COLORS["green"],  COLORS["orange"], "USD / MT"),
        (wti_obs,     wti_vol,     "WTI Crude",        COLORS["blue"],   COLORS["red"],    "USD / barrel"),
        (brent_obs,   brent_vol,   "Brent Crude",      COLORS["teal"],   COLORS["red"],    "USD / barrel"),
        (natgas_obs,  natgas_vol,  "Henry Hub Nat Gas",COLORS["purple"], COLORS["orange"], "USD / MMBtu"),
        (trucks_obs,  trucks_vol,  "Heavy Trucks (SAAR)", COLORS["rose"], COLORS["gray"], "000s units"),
        (ppi_obs,     ppi_vol,     "PPI All Commodities", COLORS["green"], COLORS["blue"], "Index"),
    ]

    flat7 = [axes7[r][c] for r in range(3) for c in range(3)]

    for ax, (p_obs, v_obs, label, p_color, v_color, unit) in zip(flat7, commodity_panels):
        shade_recessions(ax, recession_main)
        ax_twin = ax.twinx()
        plot_commodity(ax, ax_twin, p_obs, v_obs, label, p_color, v_color, unit)
        style_ax(ax, label, unit, p_color)
        # Override x-axis locator for the twin (style_ax only touches ax)
        ax_twin.tick_params(axis="x", labelsize=7.5)
        ax.xaxis.set_major_locator(mdates.YearLocator(5))
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
        for lbl in ax.get_xticklabels():
            lbl.set_rotation(30)

    plt.tight_layout()


    # ── SHOW ──────────────────────────────────────────────────────────────────
    print()
    print("  Opening 7 chart windows:")
    print("  [1] Money Supply YoY %")
    print("  [2] Yield Curves")
    print("  [3] Inflation, GDP, Debt")
    print("  [4] S&P 500 Adjusted + Quarterly Returns")
    print("  [5] Global Trade Indices")
    print("  [6] FX Debt as % of GDP")
    print("  [7] Commodity Prices + 12M Rolling Volatility")
    print()
    print("  Gray bands = NBER recessions (USREC).")
    print("  Dashed lines = annualized volatility (right y-axis).")
    print("  Close all windows to exit.")
    print()

    plt.show()


if __name__ == "__main__":
    main()