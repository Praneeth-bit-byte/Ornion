"""
ORNION — Personal AI Assistant (jarvis_market.py compatibility module)
Created and developed by Praneeth Thota

Real-Time Stock Market Intelligence & Buy/Sell Technical Analysis.
Connects to live market feeds (Yahoo Finance) for Indian & US stocks and Crypto.
"""

import urllib.request
import urllib.parse
import json
import ssl
import time
import threading

try:
    import certifi
    _CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    _CTX = None

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

# Default Watchlist: Indian Bluechips, Indices, US Tech & Crypto
DEFAULT_TICKERS = {
    "^NSEI": "Nifty 50",
    "^BSESN": "Sensex",
    "RELIANCE.NS": "Reliance Industries",
    "TCS.NS": "TCS",
    "INFY.NS": "Infosys",
    "HDFCBANK.NS": "HDFC Bank",
    "NVDA": "Nvidia",
    "AAPL": "Apple",
    "BTC-USD": "Bitcoin",
}

_CACHE_LOCK = threading.Lock()
_TICKER_CACHE = {}
_CACHE_TTL_SEC = 45.0


def _fetch_chart(symbol, range_period="5d", interval="15m"):
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/"
        f"{urllib.parse.quote(symbol)}?range={range_period}&interval={interval}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=8, context=_CTX) as resp:
            data = json.loads(resp.read().decode("utf-8", "ignore"))
            res = data.get("chart", {}).get("result", [])
            if not res:
                return None
            return res[0]
    except Exception:
        return None


def analyze_ticker(symbol, use_cache=True):
    """
    Fetches real-time price, calculates 5-day momentum & moving average,
    and returns a Buy, Sell, or Hold signal with key levels and HUD sparklines.
    """
    now = time.time()
    with _CACHE_LOCK:
        cached = _TICKER_CACHE.get(symbol)
        if use_cache and cached and (now - cached["ts"] < _CACHE_TTL_SEC):
            return dict(cached["data"])

    chart = _fetch_chart(symbol)
    if not chart:
        with _CACHE_LOCK:
            if cached:
                stale_copy = dict(cached["data"])
                stale_copy["stale"] = True
                return stale_copy
        return None

    meta = chart.get("meta", {})
    name = DEFAULT_TICKERS.get(symbol, symbol)
    currency = meta.get("currency", "INR" if ".NS" in symbol or "^" in symbol else "USD")
    curr_symbol = "₹" if currency == "INR" else "$"

    price = meta.get("regularMarketPrice")
    prev_close = meta.get("chartPreviousClose") or meta.get("previousClose") or price

    if price is None:
        return None

    price = float(price)
    prev_close = float(prev_close) if prev_close else price
    change = price - prev_close
    pct_change = (change / prev_close) * 100.0 if prev_close else 0.0

    quotes = chart.get("indicators", {}).get("quote", [{}])[0].get("close", [])
    valid_quotes = [float(q) for q in quotes if q is not None]

    signal = "HOLD"
    reason = "Consolidating near previous close."
    above_sma = price >= prev_close
    mom_pct = pct_change

    if valid_quotes:
        first_q = valid_quotes[0]
        if first_q:
            mom_pct = ((price - first_q) / first_q) * 100.0

    if len(valid_quotes) >= 10:
        sma_short = sum(valid_quotes[-5:]) / 5.0
        sma_long = sum(valid_quotes[-15:]) / min(len(valid_quotes), 15)
        above_sma = price >= sma_short

        if price > sma_short and sma_short > sma_long and pct_change > 0.5:
            signal = "STRONG BUY"
            reason = "Bullish momentum above short-term and medium-term moving averages."
        elif price > sma_short and pct_change >= 0.0:
            signal = "BUY / ACCUMULATE"
            reason = "Holding above short-term support with positive price action."
        elif price < sma_short and sma_short < sma_long and pct_change < -0.5:
            signal = "STRONG SELL / SHORT"
            reason = "Bearish crossover below major moving averages with active selling pressure."
        elif price < sma_short:
            signal = "SELL / TAKE PROFIT"
            reason = "Slipping below intraday support; risk of further pullback."

    spark = [round(q, 2) for q in valid_quotes[-24:]] if valid_quotes else [round(prev_close, 2), round(price, 2)]

    result = {
        "symbol": symbol,
        "sym": symbol,
        "name": name,
        "price": round(price, 2),
        "change": round(change, 2),
        "pct_change": round(pct_change, 2),
        "pct": round(pct_change, 2),
        "mom": round(mom_pct, 2),
        "above": bool(above_sma),
        "spark": spark,
        "stale": False,
        "currency": curr_symbol,
        "signal": signal,
        "reason": reason,
        "high": round(float(meta.get("regularMarketDayHigh") or price), 2),
        "low": round(float(meta.get("regularMarketDayLow") or price), 2),
    }

    with _CACHE_LOCK:
        _TICKER_CACHE[symbol] = {"ts": now, "data": result}

    return dict(result)


def market_briefing():
    """Returns a formatted spoken overview of major indices and top signals."""
    reports = []
    for sym in ["^NSEI", "RELIANCE.NS", "NVDA", "BTC-USD"]:
        data = analyze_ticker(sym)
        if data:
            direction = "up" if data["pct_change"] >= 0 else "down"
            reports.append(
                f"{data['name']} is at {data['currency']}{data['price']:,}, "
                f"{direction} {abs(data['pct_change'])}%. Signal: {data['signal']}."
            )
    if not reports:
        return "Live market feed is currently unreachable. Please check your internet connection."
    return " ".join(reports)


def get_market_watchlist():
    """Returns all watched tickers as structured data for the ORNION Neural Interface HUD."""
    results = []
    for sym, name in DEFAULT_TICKERS.items():
        data = analyze_ticker(sym)
        if data:
            results.append(data)
        else:
            results.append({"sym": sym, "symbol": sym, "name": name, "err": True})
    return results


if __name__ == "__main__":
    print("Testing ORNION Market Intelligence...")
    print(market_briefing())
