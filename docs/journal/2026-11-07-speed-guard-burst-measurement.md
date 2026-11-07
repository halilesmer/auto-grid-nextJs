---
date: 2026-11-07
author: Claude
type: plan
status: open
pr: [443]
features: [ENG-31]
areas: [worker, frontend, docs]
---

# Speed guard plan and XAUUSD burst measurement

## Request
The owner uses grid setups with a small step (example: $0.50). Sometimes the price moves very fast and with high volume. The owner wants no entries in these moves. Questions: which setting can do this, and can an indicator predict these moves? Conversation codes: 1107-A17, 1107-A18, 1107-A19.

## Current state

| Item | Fact |
|---|---|
| Template | ENG-31 (`worker_python/src/core/spread_guard.py`): above the limit, the bot deletes the pending orders of the setup and blocks all entries. TP/SL of open positions continue. Recovery after 30 s below 80 % of the limit. |
| Loop | `LOOP_INTERVAL_SECONDS`, default 1.0 s (`worker_python/src/core/wrappers.py`). |
| Limit of a reactive guard | Pending orders wait at the broker. MT5 fills them between two loops. Thus a guard cannot prevent the first fills of a fast move. It stops the chain: the sliding grid places new levels, and these fill until `Maks Pozisyon`. |

## Measurement

### Method

| Item | Value |
|---|---|
| Data | XAUUSD M1 from the demo server, 180 days to 2026-11-07, 176,414 candles, no missing ranges. Source: `GET /api/market/{id}/rates`. |
| Valid candles | 175,414 in 129 trading days (candles with a 24 h baseline) |
| True range (TR) | max(high, previous close) − min(low, previous close). After a break of more than 5 min: high − low. |
| Baseline | Median TR of the previous 1440 candles (24 h). Median of the baseline: $1.63. |
| Burst candle | TR > k × baseline. k = 4 if the text does not give k. |
| Episode | The first burst candle after 30 min without a burst candle |
| Target | An episode starts in the next 30 min. Base rate: 10.0 %. |
| Lift | Rate of the target when the candidate flag is on, divided by the base rate |
| Caught | Share of episodes with the flag on 1 min before the start |
| NY time | Server time − 7 h. The daily break ended at 01:00 server time in each month from May to November. |

### Frequency

| k | Episodes per day | Median TR of a burst candle |
|---|---|---|
| 3 | 7.8 | $6.04 |
| 4 | 4.7 | $7.74 |
| 5 | 2.6 | $9.67 |

With a $0.50 step, one burst candle with a TR of $7.74 crosses approx. 15 levels.

### Candidates for a warning before an episode

| Candidate | Time with flag on | Lift | Caught |
|---|---|---|---|
| 30 min before 08:30, 10:00 and 14:00 NY (Monday to Friday) | 6.5 % | 2.5x | 17.0 % |
| NY 08:00–11:00 | 13.1 % | 2.4x | 29.7 % |
| ATR15 / ATR240 > 1.3 | 20.0 % | 1.7x | 36.8 % |
| ATR15 / ATR240 > 1.6 | 8.9 % | 1.4x | 13.9 % |
| ATR15 / 24 h median TR > 1.5 | 20.6 % | 1.7x | 37.7 % |
| Burst candle in the last 60 min | 23.0 % | 1.3x | 24.0 % |
| Bollinger squeeze (std of 100 closes in the lowest 10 % of 24 h) | 10.7 % | 0.6x | 6.0 % |
| London open, NY 02:00–04:00 | 8.8 % | 0.6x | 4.4 % |

Time of day:

- 43.8 % of the episodes start at minute :29–:33 or :59–:03. An equal distribution gives 16.7 %.
- NY 08:30–08:34 has 4.7 % of the episodes in 0.36 % of the time.
- Lift per NY hour: 08 h 2.5, 09 h 2.6, 10 h 1.7, 20 h 1.5, 21 h 2.7. The 21 h peak is probably the Shanghai and Asia open (not verified).

### Clustering after an episode

| Window after the episode start | New burst candle | Random start | Lift |
|---|---|---|---|
| 2–10 min | 26.5 % | 5.0 % | 5.3x |
| 10–30 min | 25.8 % | 10.7 % | 2.4x |
| 30–60 min | 28.3 % | 14.2 % | 2.0x |
| 60–120 min | 34.5 % | 23.1 % | 1.5x |
| 120–240 min | 38.1 % | 33.4 % | 1.1x |

### Profile before an episode (median)

| Minute | ATR15 / 24 h median TR | Tick volume |
|---|---|---|
| t − 30 | 1.25 | 136 |
| t − 1 | 1.35 | 146 |
| t (episode start) | 1.63 | 180 |
| All valid candles | 1.07 | 121 |

### Data limits

- The candle spread is 16 points in 99 % of the candles. It gives no information. The tick spread (`tick_spread=1`, BKT-19) was not measured.
- The tick volume stops near 200 per minute (99th percentile: 193). A volume spike cannot show.
- One symbol, one demo server, 129 days. No out-of-sample split. The values describe the data. They are not trade results.

## Decisions

The owner accepted the recommendations of 1107-A17 and 1107-A18 ("tm", 2026-11-07).

| Topic | Decision | Code |
|---|---|---|
| Behavior | Like ENG-31: the bot deletes the pending orders of the setup and blocks all entries. Open positions keep TP/SL. | 1107-A17.3 |
| Measure | Recommendation after the measurement: compare the M1 TR with the 24 h median TR, not with a short ATR. | 1107-A19.1 |
| Volume condition | None in version 1 | 1107-A17.2 |
| Direction | Fast moves in both directions | 1107-A17.4 |
| Recovery | After 30–60 min without a new burst candle, not after 30 s | 1107-A17.3, 1107-A18.2 |
| Bollinger squeeze | Not used | 1107-A18 |
| Backtest | The browser backtest uses the same rule on M1 candles (parity as in ENG-30 and ENG-31) | 1107-A17.1 |

## Why
A reactive guard always comes at least one fill late. The calendar is the strongest signal before a move, so a news window (1107-A16) and the reactive guard complete each other.

A baseline from the last 60 min makes the guard blind when the risk is highest. A 60 min baseline with k = 3 triggers on only 40.9 % of the burst candles (24 h baseline, k = 4). In volatile hours (ATR15 > 2 × 24 h median TR), it triggers on only 24.9 %.

The first measurement used the 60 min baseline. It showed a lift of 1.4x for the squeeze and 0.5x for clustering. The 24 h baseline gives 0.6x and 2.4x (10–30 min). The relative definition made a burst easy in calm hours and difficult in volatile hours.

The squeeze has a lift below 1. A squeeze is also the range phase where a grid earns. A block in the squeeze stops the best phase of the grid.

## Open points
- [ ] 1107-A19.2: Select k (3, 4 or 5). Each trigger stops the setup for 30–60 min.
- [ ] 1107-A19.3: Select a fixed hour block (NY 08:00–11:00) or a block around calendar events only (1107-A16).
- [ ] 1107-A17.5: Decide if the news window is part of this guard or of 1107-A16.
- [ ] 1107-A18.3: Adaptive grid step, step = max(set step, m × ATR). Test it in the backtest before a decision.
- [ ] Measure the tick spread before bursts with `tick_spread=1` on a short range.
- [ ] Repeat the measurement on a live server feed and on a second symbol.
- [ ] Before the implementation: feature ID, catalog entry and a design artifact (CLAUDE.md, "Design first").

## Lessons
- Do not define a burst relative to the last hour when you measure a regime or clustering. That definition removes the effect that you measure.
- Examine the spread and tick volume columns before you use them. On the demo server, both columns give almost no information.
