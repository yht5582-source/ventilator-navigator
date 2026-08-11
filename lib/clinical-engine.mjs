const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const hasNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

const inRange = (value, min, max) =>
  hasNumber(value) && value >= min && value <= max;

export function validatePatientInputs(patient = {}) {
  const invalid = [];
  if (hasNumber(patient.height) && !inRange(patient.height, 120, 230)) {
    invalid.push("身高需介於 120–230 cm，請確認輸入單位。");
  }
  if (hasNumber(patient.weight) && !inRange(patient.weight, 20, 350)) {
    invalid.push("體重需介於 20–350 kg，請確認輸入值。");
  }
  if (hasNumber(patient.fio2) && !inRange(patient.fio2, 0.21, 1)) {
    invalid.push("FiO₂ 請輸入 0.21–1.00，而不是百分比整數。");
  }
  if (hasNumber(patient.spo2) && !inRange(patient.spo2, 40, 100)) {
    invalid.push("SpO₂ 需介於 40–100%。");
  }
  if (hasNumber(patient.ph) && !inRange(patient.ph, 6.6, 7.8)) {
    invalid.push("pH 超出可接受輸入範圍 6.60–7.80。");
  }
  if (hasNumber(patient.vt) && !inRange(patient.vt, 100, 2000)) {
    invalid.push("VT 需介於 100–2000 mL。");
  }
  if (hasNumber(patient.totalPeep) && !inRange(patient.totalPeep, 0, 40)) {
    invalid.push("Total PEEP 需介於 0–40 cmH₂O。");
  }
  if (hasNumber(patient.pplat) && !inRange(patient.pplat, 0, 80)) {
    invalid.push("Pplat 需介於 0–80 cmH₂O。");
  }
  if (
    hasNumber(patient.pplat) &&
    hasNumber(patient.totalPeep) &&
    patient.pplat < patient.totalPeep
  ) {
    invalid.push("Pplat 不應低於 Total PEEP；請重新確認量測與輸入。");
  }
  return invalid;
}

export function calculatePredictedBodyWeight(sex, heightCm) {
  if (!hasNumber(heightCm) || heightCm <= 0) return null;
  const heightInches = heightCm / 2.54;
  const base = sex === "female" ? 45.5 : sex === "male" ? 50 : null;
  if (base === null) return null;
  return round(base + 2.3 * (heightInches - 60));
}

export function calculateDerivedMetrics(patient = {}) {
  const validHeight = inRange(patient.height, 120, 230);
  const validWeight = inRange(patient.weight, 20, 350);
  const validVt = inRange(patient.vt, 100, 2000);
  const validFio2 = inRange(patient.fio2, 0.21, 1);
  const validPao2 = inRange(patient.pao2, 20, 700);
  const validPressures =
    inRange(patient.pplat, 0, 80) &&
    inRange(patient.totalPeep, 0, 40) &&
    patient.pplat >= patient.totalPeep;
  const pbw = validHeight
    ? calculatePredictedBodyWeight(patient.sex, patient.height)
    : null;
  const bmi =
    validWeight && validHeight
      ? round(patient.weight / (patient.height / 100) ** 2)
      : null;
  const vtPerPbw =
    validVt && hasNumber(pbw) && pbw > 0
      ? round(patient.vt / pbw)
      : null;
  const pfRatio =
    validPao2 && validFio2
      ? Math.round(patient.pao2 / patient.fio2)
      : null;
  const drivingPressure =
    validPressures
      ? round(patient.pplat - patient.totalPeep)
      : null;
  const staticCompliance =
    validVt && hasNumber(drivingPressure) && drivingPressure > 0
      ? round(patient.vt / drivingPressure)
      : null;

  return { bmi, pbw, vtPerPbw, pfRatio, drivingPressure, staticCompliance };
}

const warning = (level, title, detail) => ({ level, title, detail });

export function analyzePatient(patient = {}) {
  const metrics = calculateDerivedMetrics(patient);
  const invalidData = validatePatientInputs(patient);
  const warnings = [];
  const reasoning = [];
  const monitorNext = ["SpO₂ 與血氣變化", "呼吸功與病人－呼吸器同步性"];
  const avoid = [];
  const missingData = [];

  if (metrics.pbw === null) {
    missingData.push("缺少身高或生理性別：PBW 與 VT/PBW 無法可靠判讀。");
  } else {
    monitorNext.unshift("VT/PBW");
  }
  if (metrics.drivingPressure === null) {
    missingData.push("Plateau pressure 未知：Driving pressure 無法可靠判讀。");
  } else {
    monitorNext.push("Pplat 與 Driving pressure");
  }

  if (hasNumber(patient.spo2) && patient.spo2 < 88) {
    warnings.push(
      warning(
        "danger",
        "嚴重低血氧",
        "需立即 bedside reassessment，確認氣道、肺部病因、循環與設備狀態。",
      ),
    );
  }
  if (hasNumber(patient.ph) && patient.ph < 7.15) {
    warnings.push(
      warning(
        "danger",
        "重度酸血症",
        "建議立即由資深臨床人員評估病因、代償需求與通氣策略。",
      ),
    );
  }
  if (hasNumber(patient.pplat) && patient.pplat > 30) {
    warnings.push(
      warning(
        "danger",
        "平台壓偏高",
        "重新確認量測方式、胸壁影響、潮氣量與肺保護目標。",
      ),
    );
  }
  if (
    patient.hemodynamicallyStable === false ||
    (hasNumber(patient.map) && patient.map < 65)
  ) {
    warnings.push(
      warning(
        "danger",
        "血流動力學不穩定",
        "調整 PEEP 或正壓支持前後需立即重新評估 MAP、灌流、右心負荷與升壓劑需求。",
      ),
    );
  }
  if (hasNumber(metrics.drivingPressure) && metrics.drivingPressure > 15) {
    warnings.push(
      warning(
        "attention",
        "Driving pressure 偏高",
        "這是重新檢視 VT、PEEP、順應性與肺保護策略的訊號，不應單獨決定 Mode。",
      ),
    );
  }
  if (patient.condition === "copd" || patient.condition === "asthma") {
    if (
      (hasNumber(patient.autoPeep) && patient.autoPeep >= 5) ||
      patient.expiratoryFlowReturns === "no"
    ) {
      warnings.push(
        warning(
          "danger",
          "疑似動態過度充氣 / Auto-PEEP",
          "先評估呼氣流量是否回到基線、呼氣時間、RR、VT、吸氣流量與氣道阻力。",
        ),
      );
      reasoning.push("阻塞性生理合併 Auto-PEEP，優先處理呼氣時間、RR 與氣道阻力。");
      monitorNext.push("Auto-PEEP 與呼氣流量回零", "I:E 與有效呼氣時間");
      avoid.push("只更換 Mode，卻未處理呼氣不足與 dynamic hyperinflation");
    }
    if (
      hasNumber(patient.ppeak) &&
      hasNumber(patient.pplat) &&
      patient.ppeak - patient.pplat >= 12
    ) {
      reasoning.push("Ppeak 明顯高於 Pplat，需考慮氣道阻力增加，而非直接推定肺泡過度膨脹。");
    }
  }

  const metabolicAcidosis =
    patient.condition === "metabolic-acidosis" ||
    (hasNumber(patient.ph) &&
      patient.ph < 7.25 &&
      hasNumber(patient.hco3) &&
      patient.hco3 < 18);
  if (metabolicAcidosis) {
    warnings.push(
      warning(
        "danger",
        "代償性過度換氣 / 高分鐘通氣需求",
        "插管與鎮靜後若失去原有代償，酸血症可能快速惡化；需資深臨床評估。",
      ),
    );
    reasoning.push("低 HCO₃⁻ 與低 PaCO₂ 可能反映代償，不能把低 PaCO₂ 單獨視為過度通氣。");
    avoid.push("未考慮代謝性代償就將 PaCO₂ 正常化或降低分鐘通氣");
    monitorNext.push("pH、HCO₃⁻、PaCO₂ 與實際 minute ventilation");
  }

  const liberationMissing = [];
  if (patient.liberationPhase === true) {
    if (!hasNumber(patient.fio2)) liberationMissing.push("FiO₂");
    if (!hasNumber(patient.totalPeep)) liberationMissing.push("PEEP");
    if (!hasNumber(patient.spo2)) liberationMissing.push("SpO₂");
  }
  const readyForLiberation =
    patient.liberationPhase === true &&
    liberationMissing.length === 0 &&
    patient.hemodynamicallyStable === true &&
    patient.spontaneousDrive === "adequate" &&
    inRange(patient.fio2, 0.21, 0.4) &&
    inRange(patient.totalPeep, 0, 8) &&
    inRange(patient.spo2, 92, 100);

  for (const item of liberationMissing) {
    missingData.push(`Liberation assessment 缺少 ${item}，不可確認 SBT readiness。`);
  }

  let strategy;
  let preferredMode;
  let confidence = "中等";
  let alternatives;

  const noninvasiveInterface = ["hfnc", "none", "niv"].includes(patient.airway);
  if (noninvasiveInterface && patient.spontaneousDrive === "none") {
    strategy = "需重新評估氣道與呼吸支持介面";
    preferredMode = "目前介面無法提供可靠 invasive Assist/Control 支持";
    alternatives = ["立即評估人工氣道與 invasive ventilation 適應症", "若仍適合非侵入性支持，需確認自主呼吸、氣道保護與 failure signs"];
    confidence = "需立即複評";
    warnings.push(
      warning(
        "danger",
        "介面與策略不相容",
        "HFNC、無人工氣道或一般 NIV 介面無法取代需要可靠全支持時的 invasive A/C；請立即 bedside reassessment。",
      ),
    );
    reasoning.push("目前呼吸介面與缺乏自主驅動不相容，Mode 建議前必須先處理 airway / interface。");
  } else if (patient.liberationPhase === true && liberationMissing.length > 0) {
    strategy = "資料不足：無法判定 SBT readiness";
    preferredMode = "先補齊氧合支持條件與床邊 readiness assessment";
    alternatives = ["維持目前安全支持並補齊 FiO₂、PEEP、SpO₂", "確認疾病改善、分泌物、咳嗽與 mental status"];
    reasoning.push("SBT readiness 不能把缺少的氧合資料視為已達標。");
  } else if (readyForLiberation) {
    strategy = "呼吸器脫離與自主呼吸測試評估";
    preferredMode = "考慮 SBT（PSV/CPAP 或 T-piece，依臨床流程）";
    alternatives = ["持續低度 PSV 並重新評估 readiness", "若 SBT 失敗，先找可逆原因再調整支持"];
    reasoning.push("疾病改善、循環穩定、自主驅動可靠且氧合支持需求低，適合進入 liberation 評估。");
    monitorNext.push("SBT 耐受度、RR/VT、呼吸功、循環與分泌物處理");
  } else if (patient.spontaneousDrive === "none") {
    strategy = patient.condition === "ards" ? "肺保護性全支持通氣" : "可靠的全支持通氣";
    preferredMode = "Assist/Control family（volume- 或 pressure-targeted）";
    alternatives = ["Volume-targeted A/C：優先確保 VT 與 minute ventilation", "Pressure-targeted A/C：優先限制吸氣壓並持續監測 delivered VT"];
    confidence = "高";
    reasoning.push("缺乏可靠自主呼吸驅動，需要具 backup 的 controlled / assist-control 支持。");
    if (patient.condition === "ards") {
      reasoning.push("ARDS 生理需要肺保護目標；VC 或 PC 皆須以 VT/PBW、Pplat 與 ΔP 監測安全性。");
    }
  } else if (patient.spontaneousDrive === "weak") {
    strategy = "具備 backup 的部分至高度通氣支持";
    preferredMode = "Assisted A/C 或 adaptive pressure ventilation";
    alternatives = ["Pressure-targeted A/C", "Volume-targeted A/C"];
    reasoning.push("自主驅動偏弱，單純 PSV 可能無法提供可靠的分鐘通氣與 apnea protection。");
  } else {
    strategy = "以生理目標導向的輔助通氣";
    preferredMode = "Assisted A/C 或適當的 pressure support strategy";
    alternatives = ["Volume-targeted A/C", "Pressure-targeted A/C", "在支持需求低且驅動可靠時考慮 PSV"];
    reasoning.push("仍有自主呼吸；Mode 選擇需再依支持需求、力學與同步性調整。");
  }

  if (patient.condition === "ards") {
    monitorNext.push("FiO₂、PEEP、P/F ratio 與血流動力影響");
  }
  if (warnings.some((item) => item.level === "danger")) confidence = "需立即複評";

  const priority = { danger: 0, attention: 1, info: 2 };
  warnings.sort((a, b) => priority[a.level] - priority[b.level]);

  return {
    metrics,
    strategy,
    preferredMode,
    confidence,
    alternatives,
    reasoning: [...new Set(reasoning)],
    warnings,
    missingData,
    invalidData,
    monitorNext: [...new Set(monitorNext)],
    avoid: [...new Set(avoid)],
  };
}

export const clinicalRules = [
  {
    id: "ards-lpv",
    population: "成人 ARDS",
    label: "肺保護性通氣監測",
    source: "ATS/ESICM/SCCM Mechanical Ventilation in ARDS",
    year: 2017,
    evidenceLevel: "Strong recommendation; moderate certainty for low VT / pressure limitation",
    url: "https://www.thoracic.org/statements/resources/cc/ards-guidelines.pdf",
    doi: "10.1164/rccm.201703-0548ST",
    lastReviewed: "2026-08-11",
  },
  {
    id: "ards-management-update",
    population: "成人 ARDS",
    label: "ARDS management update",
    source: "Official ATS Clinical Practice Guideline Update",
    year: 2024,
    evidenceLevel: "GRADE recommendations; strength varies by intervention",
    url: "https://academic.oup.com/ajrccm/article/209/1/24/8427573",
    doi: "10.1164/rccm.202311-2011ST",
    lastReviewed: "2026-08-11",
  },
  {
    id: "patient-ventilator-assessment",
    population: "成人侵入性通氣",
    label: "病人－呼吸器評估",
    source: "AARC Patient–Ventilator Assessment CPG",
    year: 2024,
    evidenceLevel: "Evidence-based clinical practice guideline",
    url: "https://www.aarc.org/wp-content/uploads/2024/10/patient-ventilator-assessment-aarc-cpg.pdf",
    doi: null,
    lastReviewed: "2026-08-11",
  },
  {
    id: "sbt-liberation",
    population: "成人呼吸器脫離",
    label: "自主呼吸測試",
    source: "AARC Spontaneous Breathing Trials CPG",
    year: 2024,
    evidenceLevel: "Evidence-based clinical practice guideline",
    url: "https://www.aarc.org/wp-content/uploads/2023/11/CPG2024SpontaneousBreathingTrial.pdf",
    doi: null,
    lastReviewed: "2026-08-11",
  },
];
