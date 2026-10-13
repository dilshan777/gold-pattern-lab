// ---- Central tuning file -------------------------------------------------
// Every tolerance / weight lives here so you can tune after backtesting.

export const SWING_CONFIG = {
  lookback: 3,
};

/** Tolerances expressed in multiples of ATR(14) unless noted otherwise. */
export const PATTERN_CONFIG = {
  candlestick: {
    dojiBodyATR: 0.1, // body <= this * ATR
    longWickRatio: 2.0, // wick >= ratio * body
    smallWickMaxRangePct: 0.1, // opposite wick <= pct of range
    bodyPositionPct: 0.33, // body must sit in top/bottom third
    starBodyATR: 0.25, // middle candle of morning/evening star
    starClosePct: 0.5, // 3rd candle closes past midpoint of 1st
  },
  structure: {
    sweepWickATR: 0.05, // wick must exceed the level by this much
    sweepCloseBack: true, // close back on the other side of the level
    obMinMoveATR: 1.5, // impulse that validates an order block
    obMaxCandles: 12,
    fvgMinGapATR: 0.05,
    bosCloseBeyond: true, // require a CLOSE beyond the swing level
  },
  classic: {
    doubleTopTolATR: 0.35, // two peaks within this distance
    minSwingSeparation: 3, // candles between two peaks/troughs
    necklineBreakATR: 0.05, // confirmation close beyond neckline
    hsShoulderTolATR: 0.5, // shoulder vs shoulder tolerance
    hsMinHeadDepthATR: 0.75, // head must exceed shoulders by this
    impulseMinATR: 2.0, // flagpole / cup depth etc.
    impulseMaxCandles: 15,
    flagMaxBars: 12,
    flagSlopeMaxATR: 0.6, // consolidation span per bar
    triangleTouches: 2, // min swing touches per boundary
    wedgeSlopeMinATR: 0.05, // per-bar slope must exceed this
    cupDepthMinATR: 1.5,
    cupRimTolATR: 0.75,
    handleMaxBars: 10,
    handleDepthMaxATR: 0.75,
  },
};

/** Signal-panel voting weights. */
export const SIGNAL_WEIGHTS = {
  candlestick: 1,
  structure: 1.5,
  classic: 2,
  emaTrend: 1, // +/-1 vote scaled by this weight
  rsiExtreme: 1, // +/-1 vote scaled by this weight
};

export const SIGNAL_CONFIG = {
  /** Only patterns ending within the last N closed candles vote. */
  lookbackCandles: 40,
  buyThresholdPct: 65,
  sellThresholdPct: 35,
};

export const RISK_CONFIG = {
  maxRiskPerTradePct: 2, // block orders risking more than this of balance
  maxDailyLossPct: 3, // disable ordering after losing this much in a day
  oneTradeAtATime: true,
};

export const INSTRUMENT = "XAU_USD";
