"""Stage 5b: 기술적 분석. methodology.html #tech 참고.

Yahoo Finance 3개월 일봉으로 RSI/MACD/볼린저밴드/EMA/거래량을 계산하고 매수·매도 점수를 합산한다.
출력은 web/lib/types.ts 의 TechnicalSignal 구조와 동일하게 맞춘다.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf

import config


def _yf_symbol(ticker: str, market: str) -> str:
    if market == "KOSPI":
        return f"{ticker}.KS"
    if market == "KOSDAQ":
        return f"{ticker}.KQ"
    return ticker  # NASDAQ / NYSE


def _rsi(close: pd.Series, period: int) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    # Wilder's smoothing == EMA with alpha = 1/period
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _macd(close: pd.Series) -> tuple[pd.Series, pd.Series]:
    ema_fast = close.ewm(span=config.MACD_FAST, adjust=False).mean()
    ema_slow = close.ewm(span=config.MACD_SLOW, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=config.MACD_SIGNAL, adjust=False).mean()
    return macd_line, signal_line


def _bollinger(close: pd.Series) -> tuple[pd.Series, pd.Series]:
    middle = close.rolling(config.BB_PERIOD).mean()
    std = close.rolling(config.BB_PERIOD).std()
    # -1~1 로 정규화(0=중단선, +-1이 대략 상/하단 밴드). methodology.html의 %B(0~1) 임계값은
    # score_and_signal() 안에서 이 스케일에 맞춰 환산해서 사용한다.
    position = (close - middle) / (2 * std)
    return middle, position.clip(-1.5, 1.5)


def _annualized_volatility_pct(close: pd.Series) -> float | None:
    """일간 수익률 표준편차를 연율화(%)한다. AI Investor의 변동성 역가중 사이징에 사용
    (processing/investor_decide.py). 이미 받아둔 3개월 종가 시계열을 재사용해 추가 API 호출이 없다."""
    returns = close.pct_change().dropna()
    if len(returns) < 5:
        return None
    vol = float(returns.std() * (252 ** 0.5) * 100)
    return round(vol, 2) if np.isfinite(vol) else None


def _ema_trend(close: pd.Series) -> str:
    ema5 = close.ewm(span=config.EMA_PERIODS[0], adjust=False).mean().iloc[-1]
    ema20 = close.ewm(span=config.EMA_PERIODS[1], adjust=False).mean().iloc[-1]
    ema60 = close.ewm(span=config.EMA_PERIODS[2], adjust=False).mean().iloc[-1]
    if ema5 > ema20 > ema60:
        return "up"
    if ema5 < ema20 < ema60:
        return "down"
    return "neutral"


def _score_and_signal(
    rsi: float, macd: float, macd_signal: float, macd_prev: float, macd_signal_prev: float,
    bb_position: float, volume_ratio: float, change_pct: float,
) -> tuple[int, int, str]:
    buy = 0
    sell = 0

    if rsi < 30:
        buy += 30
    elif rsi < 45:
        buy += 15
    elif rsi <= 75 and rsi >= 60:
        sell += 10
    elif rsi > 75:
        sell += 30

    golden_cross = macd_prev <= macd_signal_prev and macd > macd_signal
    dead_cross = macd_prev >= macd_signal_prev and macd < macd_signal
    if golden_cross:
        buy += 30
    elif macd - macd_signal > 0:
        buy += 15
    if dead_cross:
        sell += 30
    elif macd - macd_signal < 0:
        sell += 15

    # 원본 임계값(%B 0.2/0.85, 0~1 스케일)을 -1~1 중심 스케일로 환산: centered = 2*%B - 1
    if bb_position < -0.6:
        buy += 25
    elif bb_position > 0.7:
        sell += 25

    if volume_ratio >= config.VOLUME_SPIKE_RATIO:
        if change_pct > 0:
            buy += 15
        elif change_pct < 0:
            sell += 15

    if buy > sell and buy >= 30:
        signal = "buy"
    elif sell > buy and sell >= 30:
        signal = "sell"
    else:
        signal = "neutral"

    return buy, sell, signal


def get_technical_signal(ticker: str, market: str) -> dict[str, Any] | None:
    symbol = _yf_symbol(ticker, market)
    df = yf.download(symbol, period="3mo", interval="1d", progress=False, auto_adjust=True)
    if df is None or len(df) < config.BB_PERIOD + 1:
        return None
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    close = df["Close"]
    volume = df["Volume"]

    rsi = _rsi(close, config.RSI_PERIOD)
    macd_line, macd_signal_line = _macd(close)
    _, bb_position = _bollinger(close)
    volume_avg20 = volume.rolling(20).mean()

    last_close = float(close.iloc[-1])
    prev_close = float(close.iloc[-2])
    change_pct = (last_close - prev_close) / prev_close * 100 if prev_close else 0.0
    last_rsi = float(rsi.iloc[-1]) if not np.isnan(rsi.iloc[-1]) else 50.0
    last_macd = float(macd_line.iloc[-1])
    last_macd_signal = float(macd_signal_line.iloc[-1])
    prev_macd = float(macd_line.iloc[-2])
    prev_macd_signal = float(macd_signal_line.iloc[-2])
    last_bb_position = float(bb_position.iloc[-1]) if not np.isnan(bb_position.iloc[-1]) else 0.0
    last_volume_ratio = (
        float(volume.iloc[-1] / volume_avg20.iloc[-1]) if volume_avg20.iloc[-1] else 1.0
    )

    buy_score, sell_score, signal = _score_and_signal(
        last_rsi, last_macd, last_macd_signal, prev_macd, prev_macd_signal,
        last_bb_position, last_volume_ratio, change_pct,
    )

    return {
        "price": round(last_close, 2),
        "changePct": round(change_pct, 2),
        "rsi": round(last_rsi, 1),
        "macd": round(last_macd, 2),
        "macdSignal": round(last_macd_signal, 2),
        "bbPosition": round(last_bb_position, 2),
        "volumeRatio": round(last_volume_ratio, 2),
        "volatilityPct": _annualized_volatility_pct(close),
        "emaTrend": _ema_trend(close),
        "buyScore": buy_score,
        "sellScore": sell_score,
        "signal": signal,
    }
