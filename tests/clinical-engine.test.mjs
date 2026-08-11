import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzePatient,
  calculateDerivedMetrics,
  calculatePredictedBodyWeight,
} from "../lib/clinical-engine.mjs";

test("calculates PBW from height and sex rather than actual weight", () => {
  assert.equal(calculatePredictedBodyWeight("male", 170), 65.9);
  assert.equal(calculatePredictedBodyWeight("female", 170), 61.4);
  assert.equal(calculatePredictedBodyWeight("male", null), null);
});

test("derives bedside metrics only when the required inputs exist", () => {
  const complete = calculateDerivedMetrics({
    sex: "male",
    height: 170,
    weight: 82,
    vt: 420,
    pao2: 65,
    fio2: 0.7,
    pplat: 28,
    totalPeep: 10,
  });

  assert.deepEqual(complete, {
    bmi: 28.4,
    pbw: 65.9,
    vtPerPbw: 6.4,
    pfRatio: 93,
    drivingPressure: 18,
    staticCompliance: 23.3,
  });

  const incomplete = calculateDerivedMetrics({
    sex: "male",
    height: null,
    vt: 420,
    pplat: null,
    totalPeep: 10,
  });
  assert.equal(incomplete.pbw, null);
  assert.equal(incomplete.vtPerPbw, null);
  assert.equal(incomplete.drivingPressure, null);
});

test("deeply sedated ARDS favors an assist-control family and lung protection", () => {
  const result = analyzePatient({
    condition: "ards",
    indication: "hypoxemic",
    spontaneousDrive: "none",
    sedation: "deep",
    fio2: 0.7,
    pao2: 65,
    pplat: 28,
    totalPeep: 10,
    vt: 420,
    sex: "male",
    height: 170,
  });

  assert.equal(result.strategy, "肺保護性全支持通氣");
  assert.match(result.preferredMode, /Assist\/Control/);
  assert.equal(result.confidence, "高");
  assert.ok(result.reasoning.some((item) => item.includes("自主呼吸驅動")));
  assert.ok(result.monitorNext.includes("VT/PBW"));
});

test("COPD with auto-PEEP prioritizes dynamic hyperinflation assessment", () => {
  const result = analyzePatient({
    condition: "copd",
    indication: "hypercapnic",
    spontaneousDrive: "adequate",
    autoPeep: 9,
    expiratoryFlowReturns: "no",
    rr: 28,
    ppeak: 42,
    pplat: 24,
  });

  assert.ok(result.warnings.some((warning) => warning.title.includes("動態過度充氣")));
  assert.ok(result.reasoning.some((item) => item.includes("呼氣時間")));
  assert.ok(result.monitorNext.some((item) => item.includes("Auto-PEEP")));
});

test("an awake improving patient enters liberation assessment", () => {
  const result = analyzePatient({
    condition: "postop",
    spontaneousDrive: "adequate",
    liberationPhase: true,
    hemodynamicallyStable: true,
    fio2: 0.35,
    totalPeep: 5,
    spo2: 96,
  });

  assert.equal(result.strategy, "呼吸器脫離與自主呼吸測試評估");
  assert.match(result.preferredMode, /SBT/);
});

test("severe metabolic acidosis preserves compensatory ventilation", () => {
  const result = analyzePatient({
    condition: "metabolic-acidosis",
    indication: "mixed",
    spontaneousDrive: "excessive",
    ph: 7.08,
    hco3: 8,
    paco2: 20,
  });

  assert.ok(result.warnings.some((warning) => warning.title.includes("代償性過度換氣")));
  assert.ok(result.avoid.some((item) => item.includes("PaCO₂ 正常化")));
});

test("missing height and plateau pressure remain explicit unknowns", () => {
  const result = analyzePatient({
    sex: "male",
    height: null,
    vt: 500,
    pplat: null,
    totalPeep: 8,
  });

  assert.ok(result.missingData.some((item) => item.includes("PBW")));
  assert.ok(result.missingData.some((item) => item.includes("Driving pressure")));
});

test("danger warnings are ordered ahead of attention warnings", () => {
  const result = analyzePatient({
    condition: "copd",
    spontaneousDrive: "adequate",
    autoPeep: 9,
    expiratoryFlowReturns: "no",
    pplat: 29,
    totalPeep: 10,
  });

  assert.equal(result.warnings[0].level, "danger");
  assert.ok(result.warnings.some((item) => item.title.includes("動態過度充氣")));
});

test("missing oxygenation prerequisites cannot produce an affirmative SBT recommendation", () => {
  const result = analyzePatient({
    liberationPhase: true,
    hemodynamicallyStable: true,
    spontaneousDrive: "adequate",
  });

  assert.equal(result.strategy, "資料不足：無法判定 SBT readiness");
  assert.doesNotMatch(result.preferredMode, /考慮 SBT/);
  assert.ok(result.missingData.some((item) => item.includes("FiO₂")));
  assert.ok(result.missingData.some((item) => item.includes("PEEP")));
  assert.ok(result.missingData.some((item) => item.includes("SpO₂")));
});

test("implausible values suppress dependent calculations", () => {
  const result = analyzePatient({
    sex: "male",
    height: 170,
    vt: 420,
    fio2: 70,
    pao2: 65,
    pplat: 5,
    totalPeep: 10,
  });

  assert.equal(result.metrics.pfRatio, null);
  assert.equal(result.metrics.drivingPressure, null);
  assert.ok(result.invalidData.some((item) => item.includes("FiO₂")));
  assert.ok(result.invalidData.some((item) => item.includes("Pplat")));
});

test("noninvasive interfaces do not receive invasive assist-control guidance", () => {
  const result = analyzePatient({
    airway: "hfnc",
    spontaneousDrive: "none",
    indication: "hypoxemic",
  });

  assert.doesNotMatch(result.preferredMode, /^Assist\/Control family/);
  assert.ok(result.warnings.some((item) => item.title.includes("介面與策略不相容")));
});

test("hypotension produces an explicit hemodynamic warning", () => {
  const result = analyzePatient({
    map: 58,
    hemodynamicallyStable: false,
    spontaneousDrive: "adequate",
  });

  assert.ok(result.warnings.some((item) => item.title.includes("血流動力學")));
});
