---
theme: air
title: Problem & method
toc: false
---

# Estimating the UTC offset of logsheet datetimes

## The problem

Logsheet datetimes are ambiguous: a recorded date and time may have been entered in **vessel
(local) time** or in **UTC**, and the two cannot be told apart from the value alone. To analyse or
migrate this data we must resolve that ambiguity in two steps:

1. **Decide the clock** — was the datetime entered in **vessel time** or **UTC**?
2. **Estimate the UTC offset** — if it is already UTC the offset is `0`; if it is vessel time we
   still have to estimate by how many hours it is offset from UTC.

> Per the logsheet manual, **all logsheet data is supposed to be entered as UTC**. Only observer
> data is recorded in **both** vessel time and UTC — which makes observer records our reference for
> the truth.

## Step 1 — Which clock?

We test the recorded times against a known operational signal (when fishing sets physically
happen, relative to sunrise / first light):

- **[Purseseine](./ps-set-time-distribution)** — set times only match the expected biological
  pattern when read as **UTC**. Purse-seine datetimes are therefore already UTC → **offset = 0**,
  no estimation needed.
- **[Longline](./ll-set-time-distribution)** — set times already cluster at first light *without*
  any adjustment, i.e. they are recorded in **vessel time**. Longline datetimes therefore need
  their UTC offset estimated.

## Step 2 — Estimating the longline offset

### What we already know

For longline logsheets that have **matched observer data**, the observer records the same activity
in both vessel time and UTC. The difference gives a measured UTC offset per activity, which we
treat as the truth (most observer-entered data is assumed correct). See
[observer offsets](./observer-offsets).

### Generalising to every logsheet

Observer coverage is the catch: longline observer coverage averages only about **5%**
(see [observer coverage](./observer-coverage)). So measured offsets only exist for a small fraction
of logsheets, and we must generalise to the rest. Two approaches:

- **Train a model on the observer data (preferred).** Use the observer activities — where the
  offset is known — to learn a predictor for *every* logsheet. Candidate methods:
  - a **decision tree** (`vessel_flag × EEZ → offset`) — interpretable and shippable as rules;
  - **Bayesian inference** over the same features;
  - a black-box ML model (e.g. TensorFlow).

  This app uses a **scikit-learn `DecisionTreeClassifier`** trained on observer *activities*
  (one example per fishing set), with **vessel flag** and **EEZ** as features. The result is an
  auditable [decision tree](./decision-tree) you can download as `flag × eez → offset`.

- **Nautical timezone from longitude** (fallback). Approximate the offset as
  `round(longitude / 15)`. This is available for any activity with a position, but it can differ
  from the observer truth — e.g. when a captain keeps the **departure-port** timezone as vessel
  time regardless of where the vessel sails.

## How the pages fit together

| Page | Role |
|---|---|
| [Purseseine set time](./ps-set-time-distribution) | Step 1 — proves PS times are UTC → offset 0 |
| [Longline set time distribution](./ll-set-time-distribution) | Step 1 — proves LL times are vessel time |
| [Observer coverage](./observer-coverage) | Step 2 — how much observer data we have to learn from |
| [Observer & nautical offsets](./observer-offsets) | Step 2 — measured observer offsets (training data) vs the longitude/15 estimate |
| [Decision tree](./decision-tree) | Step 2 — the trained `flag × eez → offset` model |
