# Turbofan — the plan

**Working name: Borescope.** A borescope is the camera an inspector threads inside
a jet engine to see its health without taking it apart. That is the job of this
project: read the sensors on the outside, infer the health on the inside, and turn
it into a decision someone can act on.

> **Pitch.** Most turbofan projects predict a number. This one decides *when to pull
> the engine*, says *how sure it is*, names *which module is failing*, counts the
> *fuel and CO₂ that degradation burns*, and reports *the energy it spent learning
> all of that*.

**Data.** NASA's simulated run-to-failure fleets. First C-MAPSS (Saxena et al.,
2008), to learn the craft on the standard benchmark. Then N-CMAPSS (Arias Chao et
al., 2021), which replays real flight profiles, measures fuel flow and gives the
true health of each engine module. Those two things make the diagnosis and carbon
layers possible.

---

## What you will have at the end

Six results. The usual turbofan project stops at a single RMSE.

1. **A model ladder with an energy column.** You see what each step up in model
   complexity bought in accuracy and what it cost in compute.
2. **An RUL bound you can bet on.** For example, "at least 18 cycles left, 95 % of
   the time", with measured coverage on engines the model never saw.
3. **A module diagnosis checked against the truth.** For example, "HPC efficiency is
   down 1.9 %", scored against N-CMAPSS's ground-truth health parameters.
4. **The carbon of degradation.** The kilograms of CO₂ per flight that a wearing
   engine burns beyond a healthy one, rising towards failure.
5. **A maintenance-policy map.** It shows which removal policy wins at which cost
   ratio, the carbon price at which cost-optimal and carbon-optimal maintenance
   agree, and how much another point of RMSE is actually worth.
6. **"Pull or Fly".** A public demo where a visitor watches a real simulated engine
   degrade flight by flight, decides when to pull it, and is scored against the
   model on cost and CO₂.

## Why this won't be ordinary

| The usual turbofan project | Borescope |
|---|---|
| FD001 only | All four C-MAPSS sets, then N-CMAPSS real flight profiles |
| One LSTM, one RMSE, best seed | A baseline ladder, ≥ 5 seeds, RMSE + NASA score + prognostic metrics |
| Random row split (leaks the answer) | Splits by engine, a sealed test set with an access log |
| A point estimate | Calibrated intervals with a coverage guarantee |
| "RUL = 43" | "HPC efficiency −1.9 %, plan removal within 18 flights, here is why" |
| Stops at the model | A fleet simulator, removal policies, shop capacity, cost and CO₂ |
| Ignores its own footprint | Every run logs its energy; budgets enforced in CI; a tiny final model |
| A notebook | A tested package; one command rebuilds every number and figure |
| A screenshot | A playable demo |

## Ground rules (every phase)

1. **Every number has a basis.** Each one links back to a run id, config, git SHA
   and data hash. README tables are *generated* from `runs/`, and CI fails if they
   are stale.
2. **Engines, not rows.** Every split is by engine. No scaler, normaliser, cap or
   threshold is ever fitted on data that a model is then scored on.
3. **The test set is sealed.** It is opened only at phase milestones. Every opening
   is appended to `TEST_ACCESS.md` with the date, run id and reason. That log is
   published.
4. **Simulated means simulated.** Every claim says "in simulation". The method
   transfers to real engines; the numbers do not.
5. **The cheapest model that meets the target wins.** A bigger model has to beat it
   by more than the seed-to-seed noise.
6. **Energy is logged from day one**, not bolted on at the end.

## Phase map

Effort is in focused days (about 6 h each). Tags: `NEW` is a feature most
projects don't have, `BETTER` improves on the usual approach, `LEANER` saves time,
compute or bytes.

| # | Phase | Main output | Effort |
|---|---|---|---|
| 0 | Foundations | One-command reproducible repo, run records, energy logging, CI | 2 |
| 1 | Know the engine, build the referee | EDA and an evaluation harness written *before* any model | 4 |
| 2 | Baseline ladder | R0–R3 on FD001–FD004 with an energy column | 3 |
| 3 | Health indicators | Healthy-engine baselines, a health index, similarity RUL | 4 |
| 4 | Deep models, done lean | Small TCN/GRU with quantile heads, ensembles, HPO under budget | 5 |
| 5 | Uncertainty you can bet on | Conformal intervals and a one-sided lower bound with coverage | 3 |
| 6 | Real flights: N-CMAPSS and diagnosis | Snapshot pipeline, virtual health sensors, module isolation | 8 |
| 7 | The carbon of degradation | Excess fuel and CO₂ per flight vs. health | 4 |
| 8 | From prediction to decision | Fleet simulator, six policies, cost/CO₂ map, value of information | 7 |
| 9 | Trust | Module explanations graded against truth, OOD flag, robustness suite, health card | 5 |
| 10 | Green AI | Accuracy–energy Pareto, distillation, int8 ONNX, CI budgets, project receipt | 3 |
| 11 | Ship | CLI, "Pull or Fly" demo, model and data cards, write-up | 5 |

**About 53 days in total.** That is roughly 4 months at three focused days a week,
or 11 weeks full-time. If you have less time, see
[The minimum remarkable version](#the-minimum-remarkable-version).

---

## Phase 0 — Foundations · 2 days

**Goal.** Before any modelling, a fresh clone and one command reproduce a scored,
energy-logged run.

1. Create a **separate repo** (e.g. `borescope`). A Python ML project with
   multi-gigabyte data does not belong inside a static website. Use `uv`,
   Python 3.12, `ruff`, `pytest` and `pre-commit`.
2. `make data` downloads C-MAPSS (12.4 MB) from the NASA PCoE repository (links
   under [Data](#data)). It verifies the SHA-256 against `data/manifest.json` and
   parses the space-separated text into Parquet as `float32`. Raw and processed data
   are gitignored; only the manifest is committed.
3. `NEW` **Run record contract.** Every train or eval run writes
   `runs/<timestamp>-<slug>/` containing `config.yaml`, `git_sha`, `data_hash`,
   `metrics.json`, `energy.json` and `predictions.parquet`, and appends a row to
   `runs/index.csv`. Nothing is reported that did not come from a run folder.
4. `NEW` **Energy from run one.** Wrap every run in CodeCarbon's
   `OfflineEmissionsTracker(country_iso_code="NLD")` and write kWh and gCO₂e into
   `energy.json`. Note the grid-intensity assumption next to it.
5. `LEANER` `make quick` trains the cheapest model on a fixed FD001 subset in under
   2 minutes. It is the inner dev loop and the CI job.
6. CI runs lint, unit tests and `make quick`.

**Done when:** fresh clone → `make data quick` produces a run folder with metrics and
energy, and CI is green.

## Phase 1 — Know the engine, build the referee · 4 days

**Goal.** Understand the data, then write the evaluation harness *before* any model.
That way no model can bend the rules.

1. **EDA with a purpose.** Make one table per subset: engines, operating conditions
   and fault modes.

   | Subset | Train / test engines | Operating conditions | Fault modes |
   |---|---|---|---|
   | FD001 | 100 / 100 | 1 | HPC |
   | FD002 | 260 / 259 | 6 | HPC |
   | FD003 | 100 / 100 | 1 | HPC + fan |
   | FD004 | 248 / 249 | 6 | HPC + fan |

2. `BETTER` Plot every sensor against **cycles-to-failure** (aligned at failure, not
   at start). Aligned at the end, the degradation signal jumps out. Find the flat
   sensors *per subset* rather than hard-coding FD001's list for all four.
3. Show that in FD002/FD004 the raw sensors are dominated by the operating regime,
   not by health: cluster the three settings into 6 regimes and colour by regime.
   This motivates Phase 3.
4. **Labels.** `rul = max_cycle − cycle` per engine. The piecewise cap (the flat
   "healthy" region) is a **hyperparameter chosen on validation**; sweep 110–150.
   Keep the uncapped label too, because the decision layer needs it.
5. **Splits.** Use `GroupKFold(5)` by engine id. Also freeze a group of **calibration
   engines** (about 20 %) that no model ever trains on; Phase 5 needs them. Write the
   test `test_no_engine_in_two_splits`.
6. `BETTER` **The referee** (`evaluate/protocol.py`), three protocols:
   - **Benchmark:** last window per test engine vs. `RUL_FD00x.txt`, reporting RMSE
     and NASA score. This is the only protocol comparable with the literature.
   - **Full-life:** every cycle of held-out *training* engines (out-of-fold),
     reporting RMSE per RUL bucket: 0–30, 30–80 and 80+. Late-life error is what
     grounds aircraft; an average hides it.
   - **Prognostic:** α–λ accuracy and prognostic horizon (Saxena et al., 2010),
     which ask *how early* the model becomes trustworthy.
   - Report ≥ 5 seeds as mean ± std. Compare models on paired per-engine
     differences, not on two means.
7. **Short test engines** (shorter than the window) are left-padded with their first
   value plus a mask. They are never dropped: dropping them silently makes a result
   incomparable.

```python
def nasa_score(y_true, y_pred):
    d = y_pred - y_true                     # d > 0: predicted too late, penalised harder
    return np.sum(np.where(d < 0, np.exp(-d / 13) - 1, np.exp(d / 10) - 1))

df["rul"] = df.groupby("unit")["cycle"].transform("max") - df["cycle"]
df["rul_capped"] = df["rul"].clip(upper=CAP)     # CAP picked on validation, never on test
```

**Done when:** every harness metric has a unit test against a hand-computed value,
and a constant-mean predictor runs cleanly through all three protocols.

## Phase 2 — Baseline ladder · 3 days

**Goal.** Know what "good" costs before building anything big.

| Rung | Model | Features |
|---|---|---|
| R0 | Mean training RUL | none (the floor every model must clear) |
| R1 | Ridge | current-cycle sensors |
| R2 | LightGBM | last value, EWMA (α = 0.1, 0.3), rolling mean/std, OLS slope over the last 5/10/30 cycles (all causal) |
| R3 | LightGBM | R2 on regime-normalised sensors (FD002/FD004) |

1. A rung stays on the ladder only if it beats the rung below by more than the seed
   noise.
2. `LEANER` Build features with vectorised `polars` rolling ops grouped by unit, not
   Python loops. LightGBM trains in seconds on a CPU.
3. `NEW` Generate the ladder table from `runs/` with **accuracy *and* cost** columns:
   RMSE, NASA score, params, train kWh, inference µs per engine. The ladder is a
   result in its own right.

**Done when:** the ladder table for FD001–FD004 is generated, not typed.

## Phase 3 — Health indicators · 4 days

**Goal.** Turn 21 raw sensors into one honest measure of health. This is also how
real engine trend monitoring works.

1. `BETTER` **Healthy-engine baseline.** For each sensor, learn
   `sensor = f(operating settings)` on the first ~20 cycles of every training engine
   (the "as-new" engine). The **residual** is the health signal. This is the delta
   approach airlines use when they trend EGT margin, and it removes the operating
   regime far better than per-cluster z-scores.
2. **Health index (HI).** Fuse the residuals into one HI running from 1 to 0, either
   by regressing onto a linearly decaying target or with the first principal
   component. Score candidates on monotonicity, trendability and prognosability,
   and keep the best.
3. `NEW` **Per-engine degradation onset.** Run change-point detection (`ruptures`,
   CUSUM) on the HI and use a per-engine piecewise label instead of the global cap.
   Keep it only if it beats the global cap on validation; log the decision either way.
4. `NEW` **Similarity RUL.** Build a library of training HI curves. For a new engine,
   match its recent HI trajectory against the library (Euclidean on the aligned tail,
   or DTW) and predict the weighted remaining life of the *k* nearest. It is
   interpretable: "this engine behaves like engines 17, 42 and 88 did 40 cycles
   before they failed". The health card reuses this in Phase 9.

**Done when:** every engine has an HI plot, the similarity model is on the ladder,
and the onset-vs-cap decision is logged.

## Phase 4 — Deep models, done lean · 5 days

**Goal.** Earn the deep model's place on the ladder, and make it produce quantiles
rather than a single number.

1. `LEANER` Build **zero-copy windows** and have the `Dataset` index them lazily.

   ```python
   from numpy.lib.stride_tricks import sliding_window_view

   def unit_windows(x, w):                  # x: (T, F) float32, one engine
       return sliding_window_view(x, w, axis=0).transpose(0, 2, 1)   # (T-w+1, w, F), a view
   ```

2. **Models.** A small dilated **TCN / 1-D CNN** (20–50 k params) and a small
   **GRU**. Try a Transformer only if it beats the TCN outside seed noise. On 100–260
   engines it usually won't, so test that rather than assume it.
3. `BETTER` **Quantile head.** Train with pinball loss at τ = 0.05, 0.5 and 0.95. The
   median replaces MSE and the outer quantiles feed Phase 5.
4. `BETTER` **Augmentation.** Random truncation, which mimics how the test set is
   cut, and random sensor dropout, where a sensor is replaced by its regime baseline.
   The second one pays off in Phase 9.
5. Add a multi-task head that predicts RUL and HI together. Keep it only if it helps.
6. Train a **deep ensemble** of 5 seeds; Phase 10 distils it into one model.
7. `LEANER` **Hyperparameter search under a budget.** Use Optuna with
   `MedianPruner`, a fixed 30 trials per subset, and energy logged per trial. Use
   early stopping, a one-cycle LR schedule and `.npy` memmap caches keyed by config
   hash. A CPU is enough for C-MAPSS.

**Target:** land inside the range published deep models report for FD001 under the
benchmark protocol, with < 50 k parameters. Collect those published numbers, with
their sources, in `reports/literature.csv` *before* comparing.

**Done when:** the deep models are on the ladder table, energy column included.

## Phase 5 — Uncertainty you can bet on · 3 days

**Goal.** Replace "RUL = 43" with a bound whose coverage is measured, not assumed.

1. **Conformalized quantile regression** (Romano et al., 2019) on the Phase 4
   quantiles, calibrated on the frozen calibration engines, gives a two-sided 90 %
   interval.
2. `NEW` **One-sided lower bound:** "at least *X* cycles left, 95 % of the time".
   This is the question a maintenance planner actually asks.
3. `BETTER` **Mondrian conformal** by predicted-life bucket, so late-life intervals
   stay tight and early-life intervals stay honest.
4. `BETTER` **Be straight about exchangeability.** Windows from one engine are not
   independent. For the formal guarantee, calibrate on **one randomly drawn cut
   point per calibration engine**. Also report the all-windows version, and label
   which is which.
5. Report coverage per bucket and per subset, mean width, and a reliability diagram.
   `test_conformal_coverage` checks the code on synthetic data where the answer is
   known.

```python
def conformal_q(scores, alpha):
    n = len(scores)
    return np.quantile(scores, min(1.0, np.ceil((n + 1) * (1 - alpha)) / n), method="higher")

# two-sided CQR
s = np.maximum(q_lo_cal - y_cal, y_cal - q_hi_cal)
Q = conformal_q(s, alpha=0.10)
lower, upper = q_lo_new - Q, q_hi_new + Q

# one-sided: P(true RUL >= bound) >= 95 %
Q1 = conformal_q(q_lo_cal - y_cal, alpha=0.05)
rul_at_least = q_lo_new - Q1
```

**Done when:** held-out coverage is within about ±3 points of nominal in every
bucket, or you have written down where it isn't and why.

## Phase 6 — Real flights: N-CMAPSS and diagnosis · 8 days

**Goal.** Move from one snapshot per cycle to real flight profiles, and from "how
long" to "what is wrong".

**Why N-CMAPSS.** It replays real flight trajectories. It has 4 flight descriptors
(altitude, Mach, throttle angle TRA, inlet temperature T2), 14 measured sensors
including **fuel flow `Wf`**, and virtual sensors. For development units it also has
**10 ground-truth health parameters**: flow and efficiency modifiers for the fan,
LPC, HPC, HPT and LPT. Each record also carries unit, flight cycle, flight class and
health state.

1. `LEANER` **Getting the data.** The official archive is **15.8 GB**: a zip with a
   deflate-compressed `data_set.zip` inside, so you cannot fetch one file with a range
   request. Download it **once**, stream-extract only the subsets you need, convert
   each HDF5 file in chunks (`h5py`) to Parquet partitioned by unit as `float32`, then
   delete the zip. **Start with DS02 alone.** Read the column names from the file's
   `*_var` arrays; don't hard-code them.
2. `NEW` `LEANER` **Snapshotting.** Traditional engine condition monitoring doesn't
   downlink 1 Hz data; it records a few **steady-state snapshots per flight**,
   typically takeoff and cruise. Detect the steady segments (|Δalt|, |ΔMach| and |ΔTRA| below a
   threshold for ≥ N seconds) and extract a takeoff and a cruise snapshot per flight.
   Rows drop by three orders of magnitude or more, and the model becomes one that
   could run on real ECM data.
3. **Healthy-engine residuals** as in Phase 3, now conditioned on (alt, Mach, TRA, T2).
4. `NEW` **Virtual health sensors.** Train a model that predicts the 10 health
   parameters from snapshot residuals. That is **fault isolation**: which module, and
   by how much.
5. `NEW` **Two-stage prognosis.** Predict the health-parameter trajectory, then RUL
   from it, and compare with direct RUL. The idea follows the hybrid physics + deep
   learning approach of Arias Chao et al. (2022). You don't have the simulator, so
   the learned healthy-engine model stands in for the physics.
6. **Evaluation.** Use leave-one-engine-out CV, since there are only a handful of
   units per subset. Add a shift test: train on short flights, test on long-haul.

**Done when:** you have per-module health estimates with error against the ground
truth, RUL results on the DS02 test units, and a documented snapshot pipeline.

## Phase 7 — The carbon of degradation · 4 days

**Goal.** Put a number on the fuel and CO₂ a wearing engine burns, per flight and
towards failure. This is the result a sustainability analyst is uniquely placed to
frame.

1. **Healthy-fuel model.** Fit `Wf_healthy = g(alt, Mach, TRA, T2)` on each fleet's
   early flights.
2. `BETTER` **Check thrust before claiming fuel.** Confirm that fan speed (`Nf`) at a
   given flight condition does not drift as the engine degrades. If it does,
   normalise fuel per unit fan speed. Write down the result of the check either way.
   Without it, "excess fuel" might just be *less thrust*.
3. **Excess fuel per flight.** `Wf` is in lb/s, sampled once a second, so the sum
   over a flight is pounds. Multiply by 0.4536 for kg of fuel, then by 3.16 for kg of
   CO₂ (the ICAO standard factor for jet fuel).

   ```python
   cond = ["alt", "Mach", "TRA", "T2"]
   early = df[df.cycle <= 10]                          # the "as-new" engine; state the choice
   g = LGBMRegressor().fit(early[cond], early["Wf"])
   df["wf_excess"] = df["Wf"] - g.predict(df[cond])   # lb/s at 1 Hz
   per_flight = df.groupby(["unit", "cycle"])["wf_excess"].sum() * 0.4536 * 3.16   # kg CO₂
   ```

4. `NEW` **Degradation–fuel curve.** Plot excess fuel (%) against HI and against
   cycles-to-failure, broken down **by failing module**: which failures cost the most
   fuel.
5. `NEW` (stretch) **Counterfactual restoration.** Fit a surrogate
   `Wf = g(w, health params)` on dev units, set the HPC efficiency modifier back to
   baseline, and read off the fuel a restoration would save. Label it a surrogate
   estimate.

**Done when:** one figure shows kg CO₂ per flight attributable to degradation for
every engine, with the method and its caveats written beside it.

## Phase 8 — From prediction to decision · 7 days

**Goal.** This is the heart of the project. RMSE is not the product; the removal
decision is.

1. `NEW` **Fleet simulator.** The engines are *full* run-to-failure trajectories with
   **out-of-fold** predictions. C-MAPSS test engines stop before failure, so they
   can't be used here. At each cycle a policy sees only the past and decides *fly*
   or *pull*. The parameters are:
   - lead time *L*: cycles of notice needed to book a shop slot
   - shop capacity *k*: removals per period
   - cost ratio *r*: cost of an unscheduled removal ÷ cost of a scheduled one
   - embodied CO₂ per shop visit *E*
   - the Phase 7 excess-fuel curve

   ```python
   def run_engine(e, policy, lead):
       for t in range(e.first_cycle, e.fail_cycle):
           if policy.decide(e.forecasts_up_to(t)) == "pull":        # causal: past only
               removal = t + lead
               return Outcome(e.id, removal=min(removal, e.fail_cycle),
                              failed=removal >= e.fail_cycle,
                              wasted=max(0, e.fail_cycle - removal))
       return Outcome(e.id, removal=e.fail_cycle, failed=True, wasted=0)
   ```

2. **Policies.**
   - P0 run to failure
   - P1 hard-time: a fixed interval, tuned on training engines
   - P2 point RUL below a threshold
   - P3 **risk-based**: pull when the conformal lower bound ≤ *L*
   - P4 **expected-cost optimal**: pull when the expected cost of flying one more
     *L*-window exceeds the cost of pulling now, under the predictive distribution
   - P5 **fleet-constrained**: with capacity *k*, rank by risk, or solve a small ILP
     (OR-Tools) each period
3. **Scores per policy.** Unscheduled removals, wasted cycles, total cost, CO₂ (fuel
   penalty flown plus shop visits) and availability.
4. `BETTER` **Don't pretend to know an airline's prices.** Sweep *r* from 2 to 20 and
   *E* over a wide range, and plot where each policy wins. The deliverable is a
   **map**, not a number.
5. `NEW` **Cost-optimal vs. carbon-optimal.** Find the removal time that minimises
   cost and the one that minimises CO₂, then the **carbon price at which they
   coincide**. This is the headline analysis.
6. `NEW` **Value of information.** Degrade the model on purpose (add noise to its
   forecasts) and plot policy cost against RMSE. It shows whether chasing another
   0.5 RMSE is worth anything, which almost no RUL paper asks.

**Done when:** you have a policy frontier (failures vs. wasted life), a cost map over
*r*, the carbon-price crossover with its basis, and the value-of-information curve.

## Phase 9 — Trust · 5 days

**Goal.** A planner can ask "why?", "should I believe this?" and "what if a sensor
dies?", and get an answer.

1. **Module-level explanations.** Aggregate attributions (integrated gradients for
   the deep models, SHAP for LightGBM) by engine module (fan, LPC, HPC, HPT, LPT)
   using a sensor-to-station map, and show how they evolve over time.
2. `NEW` **Explanations graded against the truth.** N-CMAPSS tells you which module
   actually degraded. Measure how often the top-attributed module is the true one. An
   explanation that fails this test doesn't ship.
3. `NEW` **Out-of-distribution flag.** Compute the Mahalanobis distance of the
   operating conditions and the model's latent embedding from training. Acceptance
   test: a model trained on FD001 must flag FD002 engines.
4. `BETTER` **Robustness suite** in pytest: dead sensor, stuck sensor, bias drift,
   doubled noise and missing cycles. Predictions must degrade gracefully and the
   data-quality or OOD flag must fire.
5. `NEW` **Engine health card.** One page per engine, as HTML or PDF: module health,
   an RUL fan chart with its conformal band, the Phase 8 recommendation, the top
   drivers, CO₂ penalty to date, nearest fleet lookalikes (Phase 3.4) and
   data-quality/OOD status. The text comes from a **template, not an LLM**, so it is
   deterministic, testable, and free to run.

   ```text
   ENGINE 42 · DS02 · flight 61                       data quality ✓   in distribution ✓
   RUL, 90 %      [ lo ─── median ─── hi ] flights     →  PLAN REMOVAL within <lo> flights
   Modules        Fan ●●●●○  LPC ●●●●●  HPC ●●○○○ (eff −x.x %)  HPT ●●●○○  LPT ●●●●●
   Why            T30 +x.x σ at cruise · fuel flow +x.x % · trend steepening since flight nn
   Carbon         +xxx kg CO₂ so far from degradation · +xx kg per flight now
   Looks like     engines a, b, c at nn flights before failure
   (layout sketch: every value is filled from a run, none typed by hand)
   ```

**Done when:** the robustness suite is green, attribution accuracy is reported, and
every test engine has a health card.

## Phase 10 — Green AI · 3 days

**Goal.** The final model is small because you measured that it could be.

1. **Accuracy–energy Pareto.** Plot every ladder model's RMSE against training kWh,
   inference µs and file size, and pick the knee.
2. **Distil** the 5-seed ensemble into one small student trained to match its
   quantiles.
3. `LEANER` Export to **ONNX with int8 dynamic quantisation**. A test enforces an
   accuracy-drop budget (e.g. ≤ 0.3 RMSE).
4. `BETTER` **Budgets in CI** use deterministic proxies, because shared runners
   can't measure energy honestly: params ≤ 50 k, model file ≤ 200 KB, `make quick` ≤
   120 s, and metric floors on the quick run. Measured energy stays a local,
   reported number.
5. `NEW` **The project's receipt.** A generated README table of the total kWh and
   CO₂ spent across every run in `runs/`, split into exploration, HPO and final
   training.

**Done when:** the receipt, the Pareto figure and the CI budgets are all in place.

## Phase 11 — Ship · 5 days

1. **CLI.** `borescope card engine_42.parquet` writes a health card, and
   `borescope simulate --policy risk --r 8` runs a policy.
2. `NEW` **"Pull or Fly"**, a static page on GitHub Pages. A held-out engine plays
   flight by flight with its sensors, its HI and the model's RUL band. The visitor
   presses **Pull** when they would. The reveal shows the true failure, and the
   visitor's cost and CO₂ against the model's policy and against hard-time.
   `LEANER` Predictions for about 20 engines are **precomputed into a few hundred KB
   of JSON**. No model runtime is shipped and no server is needed, because shipping a
   multi-MB inference runtime to replay 20 engines would contradict the point.
3. **Model card and data card.** Intended use, simulation only, limits, coverage, OOD
   behaviour and energy.
4. **Write-up: "RMSE is not the product."** Four figures: the ladder with energy,
   coverage, the policy frontier, and the carbon-price crossover.
5. `make all` rebuilds every figure and table from raw data, and CI checks that the
   README numbers match `runs/`.

**Done when:** the demo is public, the write-up is published, and `make all`
reproduces them.

---

## The minimum remarkable version

With about 4 weeks full-time (≈ 18 days), build this subset. It already goes further
than a typical turbofan repo because it ends in a *decision*, not an RMSE:

- Phase 0 (all)
- Phase 1 (all)
- Phase 2: R0–R2
- Phase 4: TCN only, with the quantile head
- Phase 5: steps 1–2
- Phase 8: P0–P3 on C-MAPSS, with the cost sweep
- Phase 11: a lite "Pull or Fly"

Phases 6–7 (N-CMAPSS, diagnosis, carbon) are the first expansion. They are what
make the project *yours*, so schedule them next.

## Traps that make most turbofan results wrong

| Trap | Why it's wrong | Guard |
|---|---|---|
| Random row split | Windows from one engine land in train and val, so val leaks | `GroupKFold` by engine plus a leakage test |
| Scaler fitted on all data | Test statistics leak into training | Fit inside each fold; a test asserts it |
| Cap or window tuned on test | Test becomes validation | Tune on CV; `TEST_ACCESS.md` |
| Scoring every test window | Not the benchmark protocol, so not comparable | Last window per engine for benchmark claims |
| Dropping short test engines | Quietly changes the test set | Pad and mask |
| Centered smoothing | Uses future cycles, impossible online | Causal filters only (EWMA, trailing windows) |
| Reporting the best seed | Luck presented as skill | ≥ 5 seeds, mean ± std, paired comparisons |
| Comparing NASA scores across sets | It's a sum, so it scales with engine count | Compare only on identical engine sets |
| Hard-coded flat-sensor list | Differs by subset | Detect per subset from training data |

## Metrics reference

| Family | Metric | Used for |
|---|---|---|
| Accuracy | RMSE (benchmark and full-life), MAE per RUL bucket | Ladder, literature comparison |
| Asymmetric | NASA score (late predictions penalised harder) | Safety-weighted accuracy |
| Prognostic | α–λ accuracy, prognostic horizon | How early the model becomes trustworthy |
| Uncertainty | Empirical coverage, mean width, per-bucket coverage | Phase 5 |
| Diagnosis | Health-parameter MAE, top-module accuracy | Phases 6 and 9 |
| Decision | Unscheduled removals, wasted cycles, cost at *r*, CO₂, availability | Phase 8 |
| Efficiency | Params, file KB, train kWh, inference µs | Ladder, Phase 10 |

## Stack

| Need | Choice | Why |
|---|---|---|
| Env | `uv`, Python 3.12 | Fast, lockfile, reproducible |
| Data | `polars`, `pyarrow` (Parquet), `h5py` | Columnar, fast, low memory |
| Classic ML | `scikit-learn`, `lightgbm` | Strong cheap baselines |
| Deep | `torch` (CPU is enough for C-MAPSS) | Small TCN/GRU |
| HPO | `optuna` + `MedianPruner` | Budgeted search |
| Change points | `ruptures` | Degradation onset |
| Explain | `shap`, `captum` | LightGBM and deep attributions |
| Decisions | `ortools` | Capacity-constrained scheduling |
| Energy | `codecarbon` (offline mode) | Per-run kWh and CO₂ |
| Export | `onnx`, `onnxruntime` | int8 quantised final model |
| Quality | `pytest`, `ruff`, `pre-commit`, GitHub Actions | Tests, lint, budgets |

```text
borescope/
├─ pyproject.toml · uv.lock · Makefile · README.md · TEST_ACCESS.md
├─ configs/                      one YAML per experiment
├─ data/manifest.json            SHA-256 of every raw file (raw/ and processed/ are gitignored)
├─ src/borescope/
│  ├─ data/        cmapss.py · ncmapss.py · snapshots.py · windows.py · splits.py
│  ├─ features/    baseline.py · health_index.py · onset.py
│  ├─ models/      ladder.py · lgbm.py · tcn.py · gru.py · similarity.py · distill.py
│  ├─ uncertainty/ conformal.py
│  ├─ evaluate/    metrics.py · protocol.py · prognostic.py
│  ├─ carbon/      fuel.py · energy.py
│  ├─ decide/      simulator.py · policies.py · schedule.py
│  ├─ explain/     attribution.py · ood.py
│  ├─ report/      health_card.py · tables.py · figures.py
│  └─ cli.py
├─ tests/          no_leakage · metrics · windows · conformal_coverage · simulator · robustness · budgets
├─ runs/           run folders (gitignored) + index.csv
├─ reports/        figures/ · literature.csv · writeup.md
└─ demo/           index.html · engines.json   ("Pull or Fly")
```

**First commands:**

```bash
uv init borescope && cd borescope
uv add numpy polars pyarrow scikit-learn lightgbm torch optuna ruptures codecarbon h5py matplotlib
uv add --dev pytest ruff pre-commit
```

## Risks

| Risk | Mitigation |
|---|---|
| Simulated ≠ real engines | Say "in simulation" everywhere; sell the method, not the numbers; snapshot design keeps it close to real ECM data |
| N-CMAPSS size (15.8 GB) | Download once, keep DS02 first, snapshot to Parquet, delete the archive |
| Scope creep | Every phase has a "done when"; Phases 7–8 are the differentiators, so protect their time; cut the Transformer and API first |
| Overfitting the benchmark | The referee is written in Phase 1, before any model; the test set is sealed and its access logged |
| Conformal guarantee under dependent windows | One cut point per calibration engine for the formal claim; report empirical coverage either way |
| "Excess fuel" is really less thrust | The Phase 7.2 fan-speed check, with its result written down |

## Data

- **C-MAPSS** (12.4 MB):
  `https://phm-datasets.s3.amazonaws.com/NASA/6.+Turbofan+Engine+Degradation+Simulation+Data+Set.zip`
- **N-CMAPSS** (15.8 GB):
  `https://phm-datasets.s3.amazonaws.com/NASA/17.+Turbofan+Engine+Degradation+Simulation+Data+Set+2.zip`
- Index pages: the [NASA PCoE Data Set Repository](https://www.nasa.gov/intelligent-systems-division/discovery-and-systems-health/pcoe/pcoe-data-set-repository/)
  and the [PHM Society mirror](https://data.phmsociety.org/nasa/).
  Record the SHA-256 of whatever you download in `data/manifest.json`.

## References

- Saxena, A., Goebel, K., Simon, D., & Eklund, N. (2008). Damage propagation modeling
  for aircraft engine run-to-failure simulation. *International Conference on
  Prognostics and Health Management (PHM 2008)*. The C-MAPSS dataset and the NASA
  scoring function.
- Saxena, A., Celaya, J., Saha, B., Saha, S., & Goebel, K. (2010). Metrics for offline
  evaluation of prognostic performance. *International Journal of Prognostics and
  Health Management*. α–λ accuracy and prognostic horizon.
- Arias Chao, M., Kulkarni, C., Goebel, K., & Fink, O. (2021). Aircraft engine
  run-to-failure dataset under real flight conditions for prognostics and
  diagnostics. *Data, 6*(1), 5. https://doi.org/10.3390/data6010005 (N-CMAPSS).
- Arias Chao, M., Kulkarni, C., Goebel, K., & Fink, O. (2022). Fusing physics-based
  and deep learning models for prognostics. *Reliability Engineering & System Safety,
  217*, 107961.
- Romano, Y., Patterson, E., & Candès, E. (2019). Conformalized quantile regression.
  *Advances in Neural Information Processing Systems 32*.
