"use client";

import { useMemo, useState } from "react";
import { analyzePatient, clinicalRules } from "@/lib/clinical-engine.mjs";

type View = "home" | "assessment" | "compare" | "learning" | "evidence";
type Patient = {
  age: number | null;
  sex: string;
  height: number | null;
  weight: number | null;
  indication: string;
  condition: string;
  airway: string;
  sedation: string;
  spontaneousDrive: string;
  rr: number | null;
  spo2: number | null;
  fio2: number | null;
  pao2: number | null;
  ph: number | null;
  paco2: number | null;
  hco3: number | null;
  vt: number | null;
  ppeak: number | null;
  pplat: number | null;
  totalPeep: number | null;
  autoPeep: number | null;
  map: number | null;
  expiratoryFlowReturns: string;
  hemodynamicallyStable: boolean;
  liberationPhase: boolean;
};

const emptyPatient: Patient = {
  age: null,
  sex: "male",
  height: null,
  weight: null,
  indication: "hypoxemic",
  condition: "pneumonia",
  airway: "ett",
  sedation: "light",
  spontaneousDrive: "adequate",
  rr: null,
  spo2: null,
  fio2: null,
  pao2: null,
  ph: null,
  paco2: null,
  hco3: null,
  vt: null,
  ppeak: null,
  pplat: null,
  totalPeep: null,
  autoPeep: null,
  map: null,
  expiratoryFlowReturns: "unknown",
  hemodynamicallyStable: true,
  liberationPhase: false,
};

const examplePatient: Patient = {
  ...emptyPatient,
  age: 65,
  sex: "male",
  height: 170,
  weight: 78,
  indication: "hypoxemic",
  condition: "ards",
  airway: "ett",
  sedation: "deep",
  spontaneousDrive: "none",
  rr: 24,
  spo2: 91,
  fio2: 0.7,
  pao2: 65,
  ph: 7.31,
  paco2: 48,
  hco3: 24,
  vt: 420,
  ppeak: 34,
  pplat: 28,
  totalPeep: 10,
  autoPeep: 1,
  map: 72,
};

const modeRows = [
  {
    id: "vcac",
    name: "VC-A/C",
    control: "Volume-targeted",
    vt: "高",
    pressure: "低",
    drive: "非必要",
    backup: "有",
    use: "需要可靠 VT / minute ventilation",
    caution: "壓力上升、flow starvation",
  },
  {
    id: "pcac",
    name: "PC-A/C",
    control: "Pressure-targeted",
    vt: "隨力學改變",
    pressure: "高",
    drive: "非必要",
    backup: "有",
    use: "需限制吸氣壓或調整 flow pattern",
    caution: "需密切監測 delivered VT",
  },
  {
    id: "prvc",
    name: "PRVC / adaptive",
    control: "Pressure breath + VT target",
    vt: "目標導向",
    pressure: "自動調整",
    drive: "非必要",
    backup: "有",
    use: "希望兼顧 pressure delivery 與 VT target",
    caution: "廠牌演算法不同；病人 effort 會影響反應",
  },
  {
    id: "psv",
    name: "PSV",
    control: "Pressure support",
    vt: "隨力學與 effort",
    pressure: "設定支持壓",
    drive: "必要",
    backup: "依機型",
    use: "可靠自主呼吸、支持需求較低",
    caution: "apnea、疲勞、VT 與 minute ventilation 波動",
  },
  {
    id: "aprv",
    name: "APRV",
    control: "Time-cycled pressure levels",
    vt: "變動",
    pressure: "Phigh / Plow",
    drive: "可保留",
    backup: "模式相關",
    use: "特定氧合策略；進階使用",
    caution: "release 設定、肺可招募性、血流動力學",
  },
  {
    id: "niv",
    name: "NIV Bilevel",
    control: "IPAP / EPAP",
    vt: "隨力學與 effort",
    pressure: "IPAP / EPAP",
    drive: "必要",
    backup: "依設定",
    use: "合適的高碳酸或心因性肺水腫病人",
    caution: "氣道保護、分泌物、aspiration 與 NIV failure",
  },
];

const learningCases = [
  ["Severe ARDS", "全支持 + 肺保護目標", "A/C family", "不要把 ARDS 等同單一 Mode。"],
  ["COPD with marked auto-PEEP", "延長呼氣、降低 air trapping", "A/C 或適當輔助模式", "先處理 RR、VT、flow 與阻力。"],
  ["Severe asthma", "避免 dynamic hyperinflation", "具 backup 的支持", "高 Ppeak 不等於高 alveolar pressure。"],
  ["Post-operative patient waking up", "逐步降低支持", "PSV / SBT assessment", "先確認鎮靜、疼痛與肌力。"],
  ["Neuromuscular weakness", "支持通氣與咳嗽能力", "A/C 或 NIV（依 airway）", "氧合正常不代表通氣安全。"],
  ["Severe metabolic acidosis", "維持代償性高分鐘通氣", "可可靠達成 ventilation 的策略", "避免插管後 PaCO₂ 快速上升。"],
  ["Cardiogenic pulmonary edema", "改善氧合與降低呼吸功", "NIV CPAP / Bilevel", "持續監測 NIV failure。"],
  ["Patient ready for SBT", "進入 liberation", "SBT", "RSBI 不是唯一 hard gate。"],
  ["High Ppeak, normal Pplat", "找氣道阻力", "維持或調整現有模式", "不要只因 Ppeak 改成 PC。"],
  ["Double triggering", "辨識 drive 與 Ti mismatch", "依原因調整", "先找原因，再決定是否改 Mode。"],
];

function Icon({ name }: { name: "lungs" | "shield" | "book" | "compare" | "plus" | "check" | "alert" }) {
  const paths = {
    lungs: <><path d="M12 3v8"/><path d="M10 7c-2 1-5 3-6 6-1 3 0 7 2 8 2 1 5-1 5-3V9"/><path d="M14 7c2 1 5 3 6 6 1 3 0 7-2 8-2 1-5-1-5-3V9"/></>,
    shield: <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z"/>,
    book: <><path d="M4 5c3-1 6 0 8 2v14c-2-2-5-3-8-2V5Z"/><path d="M20 5c-3-1-6 0-8 2v14c2-2 5-3 8-2V5Z"/></>,
    compare: <><path d="M7 4v16"/><path d="m4 7 3-3 3 3"/><path d="M17 20V4"/><path d="m14 17 3 3 3-3"/></>,
    plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    check: <path d="m5 12 4 4 10-10"/>,
    alert: <><path d="M12 4 3 20h18L12 4Z"/><path d="M12 9v5"/><path d="M12 17h.01"/></>,
  };
  return <svg aria-hidden="true" className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function NavButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button aria-pressed={active} className={`nav-button ${active ? "active" : ""}`} onClick={onClick}>{children}</button>;
}

function MetricCard({ label, value, unit, status = "acceptable" }: { label: string; value: string | number; unit?: string; status?: "acceptable" | "attention" | "missing" | "danger" }) {
  const words = { acceptable: "可接受", attention: "需追蹤", missing: "缺資料", danger: "高風險" };
  return <div className={`metric-card ${status}`}><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-unit">{unit ?? "\u00A0"}</div><div className="metric-status">{words[status]}</div></div>;
}

function Field({ label, value, onChange, unit, step = "1", min, max }: { label: string; value: string | number | boolean | null; onChange: (value: number | null) => void; unit?: string; step?: string; min?: string; max?: string }) {
  return <label className="field"><span>{label}</span><div className="input-wrap"><input type="number" inputMode="decimal" value={typeof value === "number" ? value : ""} step={step} min={min} max={max} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}/>{unit ? <b>{unit}</b> : null}</div></label>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string | number | boolean | null; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <label className="field"><span>{label}</span><select value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
}

export default function VentilatorNavigator() {
  const [view, setView] = useState<View>("home");
  const [patient, setPatient] = useState<Patient>(emptyPatient);
  const [isExample, setIsExample] = useState(false);
  const [step, setStep] = useState(1);
  const [guided, setGuided] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [comparison, setComparison] = useState(["vcac", "pcac", "psv"]);
  const [learningCase, setLearningCase] = useState(0);
  const [caseChoice, setCaseChoice] = useState("");
  const [caseRevealed, setCaseRevealed] = useState(false);
  const analysis = useMemo(() => analyzePatient(patient as unknown as Record<string, unknown>), [patient]);

  const update = (key: keyof Patient, value: string | number | boolean | null) => {
    setPatient((current) => ({ ...current, [key]: value }));
  };
  const openAssessment = () => { setView("assessment"); setStep(1); };
  const startNewAssessment = () => {
    setPatient(emptyPatient);
    setIsExample(false);
    openAssessment();
  };

  return <main className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => setView("home")} aria-label="回到首頁">
        <span className="brand-mark"><Icon name="lungs" /></span>
        <span><strong>Ventilator Navigator</strong><small>呼吸器導航</small></span>
      </button>
      <nav aria-label="主要導覽">
        <NavButton active={view === "assessment"} onClick={openAssessment}>評估</NavButton>
        <NavButton active={view === "compare"} onClick={() => setView("compare")}>模式比較</NavButton>
        <NavButton active={view === "learning"} onClick={() => setView("learning")}>教學案例</NavButton>
        <NavButton active={view === "evidence"} onClick={() => setView("evidence")}>安全與證據</NavButton>
      </nav>
      <div className="audience"><Icon name="shield" />成人 ICU</div>
    </header>

    {view === "home" ? <HomeView onAssessment={startNewAssessment} onLearning={() => setView("learning")} onCompare={() => setView("compare")} /> : null}
    {view === "assessment" ? <AssessmentView patient={patient} analysis={analysis} update={update} step={step} setStep={setStep} guided={guided} setGuided={setGuided} showAdvanced={showAdvanced} setShowAdvanced={setShowAdvanced} isExample={isExample} onExample={() => { setPatient(examplePatient); setIsExample(true); }} onReset={() => { setPatient(emptyPatient); setIsExample(false); }} /> : null}
    {view === "compare" ? <CompareView selected={comparison} setSelected={setComparison} /> : null}
    {view === "learning" ? <LearningView index={learningCase} setIndex={(value) => { setLearningCase(value); setCaseChoice(""); setCaseRevealed(false); }} choice={caseChoice} setChoice={setCaseChoice} revealed={caseRevealed} setRevealed={setCaseRevealed} /> : null}
    {view === "evidence" ? <EvidenceView /> : null}

    <footer>For adult clinical education and decision support. Final ventilator management requires bedside clinical assessment.</footer>
  </main>;
}

function HomeView({ onAssessment, onLearning, onCompare }: { onAssessment: () => void; onLearning: () => void; onCompare: () => void }) {
  return <div className="page home-page">
    <section className="hero">
      <div className="hero-copy">
        <h1>成人呼吸器模式<br/>互動決策助手</h1>
        <p>從病人生理需求出發，而不是從呼吸器 Mode 名稱出發。</p>
        <div className="hero-actions">
          <button className="button primary" onClick={onAssessment}><Icon name="plus" />開始新個案</button>
          <button className="button secondary" onClick={onLearning}><Icon name="book" />快速教學模式</button>
          <button className="button ghost" onClick={onCompare}><Icon name="compare" />Mode 比較</button>
        </div>
        <div className="privacy-note"><Icon name="shield" /><span><strong>不輸入可識別病人資料</strong><small>本站只使用去識別化臨床參數；所有建議均需 bedside verification。</small></span></div>
      </div>
      <div className="hero-dashboard" aria-label="示範分析摘要">
        <div className="demo-top"><span>臨床分析摘要</span><b>Example</b></div>
        <div className="demo-physiology"><small>主要生理問題</small><strong>低血氧性呼吸衰竭</strong><span>＋ Reduced compliance</span></div>
        <div className="demo-metrics"><MetricCard label="VT/PBW" value="6.4" unit="mL/kg"/><MetricCard label="P/F" value="93" status="attention"/><MetricCard label="ΔP" value="18" unit="cmH₂O" status="attention"/></div>
        <div className="demo-result"><span className="result-icon"><Icon name="lungs" /></span><div><small>建議策略</small><strong>肺保護性全支持通氣</strong><p>A/C family · 同時比較 VC 與 PC trade-off</p></div></div>
        <div className="demo-warning"><Icon name="alert" /><span><strong>需床邊複評</strong><small>高風險訊號先於 Mode 建議顯示</small></span></div>
      </div>
    </section>
    <section className="principles"><div><span>01</span><strong>Physiology</strong><p>辨識 oxygenation、ventilation、airway 與 respiratory drive。</p></div><div><span>02</span><strong>Goal</strong><p>釐清全支持、部分支持、肺保護或 liberation 目標。</p></div><div><span>03</span><strong>Mode family</strong><p>呈現首選、替代方案、理由、監測與重新評估時機。</p></div></section>
  </div>;
}

function AssessmentView({ patient, analysis, update, step, setStep, guided, setGuided, showAdvanced, setShowAdvanced, isExample, onExample, onReset }: { patient: Patient; analysis: ReturnType<typeof analyzePatient>; update: (key: keyof Patient, value: string | number | boolean | null) => void; step: number; setStep: (value: number) => void; guided: boolean; setGuided: (value: boolean) => void; showAdvanced: boolean; setShowAdvanced: (value: boolean) => void; isExample: boolean; onExample: () => void; onReset: () => void }) {
  const steps = ["病人與目標", "通氣需求", "氧合與血氣", "力學與安全", "建議"];
  const m = analysis.metrics;
  const status = (value: number | null, attention: (value: number) => boolean) => value === null ? "missing" as const : attention(value) ? "attention" as const : "acceptable" as const;
  return <div className="page assessment-page">
    <div className="assessment-toolbar"><div><h1>成人機械通氣評估</h1><p>逐步完成關鍵資料；缺少或不合理資料會明確標示，不會自動猜測。</p></div><div className="toolbar-actions"><div className="segment"><button aria-pressed={guided} className={guided ? "active" : ""} onClick={() => setGuided(true)}>Guided</button><button aria-pressed={!guided} className={!guided ? "active" : ""} onClick={() => setGuided(false)}>Expert</button></div><button className="text-button" onClick={onExample}>載入範例</button><button className="text-button danger-text" onClick={onReset}>重設</button></div></div>
    {isExample ? <div className="example-banner" role="status"><Icon name="book"/><span><strong>目前為示範個案</strong><small>所有數值皆為教學資料，不代表真實病人；開始臨床評估前請按「重設」。</small></span></div> : null}
    <ol className="stepper">{steps.map((name, index) => <li key={name} className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""}><button aria-current={step === index + 1 ? "step" : undefined} onClick={() => setStep(index + 1)}><span>{step > index + 1 ? <Icon name="check" /> : index + 1}</span><b>{name}</b></button></li>)}</ol>
    <div className="assessment-layout">
      <section className="workspace-panel">
        {step === 1 ? <div className="form-section"><div className="section-heading"><div><small>STEP 1</small><h2>病人資料與支持目標</h2></div>{guided ? <p>身高用於計算 PBW；潮氣量評估不以 actual body weight 取代。</p> : null}</div><div className="derived-strip"><div><small>PBW</small><strong>{m.pbw ?? "—"}</strong><span>kg</span></div><div><small>BMI</small><strong>{m.bmi ?? "—"}</strong><span>kg/m²</span></div><div><small>Static compliance</small><strong>{m.staticCompliance ?? "—"}</strong><span>mL/cmH₂O</span></div></div><div className="form-grid"><Field label="年齡 Age" value={patient.age} onChange={(v) => update("age", v)} unit="歲" min="18" max="120"/><SelectField label="生理性別 Sex" value={patient.sex} onChange={(v) => update("sex", v)} options={[["male","男性"],["female","女性"]]}/><Field label="身高 Height" value={patient.height} onChange={(v) => update("height", v)} unit="cm" min="120" max="230"/><Field label="實際體重" value={patient.weight} onChange={(v) => update("weight", v)} unit="kg" min="20" max="350"/><SelectField label="主要適應症" value={patient.indication} onChange={(v) => update("indication", v)} options={[["hypoxemic","低血氧性呼吸衰竭"],["hypercapnic","高碳酸血症呼吸衰竭"],["mixed","混合型呼吸衰竭"],["airway","氣道保護"],["work","呼吸功增加"]]}/><SelectField label="臨床情境" value={patient.condition} onChange={(v) => update("condition", v)} options={[["ards","ARDS / 疑似 ARDS"],["pneumonia","Pneumonia"],["copd","COPD exacerbation"],["asthma","Severe asthma"],["metabolic-acidosis","Severe metabolic acidosis"],["neuromuscular","Neuromuscular disease"],["postop","Post-operative"]]}/><SelectField label="呼吸介面" value={patient.airway} onChange={(v) => update("airway", v)} options={[["ett","Endotracheal tube"],["trach","Tracheostomy"],["niv","NIV mask"],["hfnc","HFNC"],["none","No artificial airway"]]}/><SelectField label="鎮靜深度" value={patient.sedation} onChange={(v) => update("sedation", v)} options={[["none","None"],["light","Light sedation"],["deep","Deep sedation"]]}/></div></div> : null}
        {step === 2 ? <div className="form-section"><div className="section-heading"><div><small>STEP 2</small><h2>自主呼吸與支持需求</h2></div>{guided ? <p>可靠的 spontaneous drive 影響 assisted / spontaneous mode 與 backup ventilation 的需求。</p> : null}</div><div className="form-grid"><SelectField label="Spontaneous respiratory drive" value={patient.spontaneousDrive} onChange={(v) => update("spontaneousDrive", v)} options={[["none","None｜無"],["weak","Weak｜弱"],["adequate","Adequate｜足夠"],["excessive","Excessive｜過強"],["irregular","Irregular｜不規則"]]}/><Field label="總呼吸速率 RR" value={patient.rr} onChange={(v) => update("rr", v)} unit="/min"/><SelectField label="循環穩定" value={String(patient.hemodynamicallyStable)} onChange={(v) => update("hemodynamicallyStable", v === "true")} options={[["true","是"],["false","否 / 休克"]]}/><SelectField label="進入 liberation phase" value={String(patient.liberationPhase)} onChange={(v) => update("liberationPhase", v === "true")} options={[["false","否 / 不確定"],["true","是"]]}/></div><div className="teaching-callout"><Icon name="book"/><span><strong>判讀提醒</strong><p>沒有自主驅動時，優先確保可預測的 backup ventilation；有自主驅動也不代表可直接改為 PSV，仍需評估支持需求與疲勞。</p></span></div></div> : null}
        {step === 3 ? <div className="form-section"><div className="section-heading"><div><small>STEP 3</small><h2>氧合、血氣與分鐘通氣需求</h2></div>{guided ? <p>PaCO₂ 必須與 pH、HCO₃⁻ 與 clinical condition 一起解讀。</p> : null}</div><div className="form-grid"><Field label="SpO₂" value={patient.spo2} onChange={(v) => update("spo2", v)} unit="%" min="40" max="100"/><Field label="FiO₂（小數）" value={patient.fio2} onChange={(v) => update("fio2", v)} step="0.01" min="0.21" max="1"/><Field label="PaO₂" value={patient.pao2} onChange={(v) => update("pao2", v)} unit="mmHg" min="20" max="700"/><Field label="pH" value={patient.ph} onChange={(v) => update("ph", v)} step="0.01" min="6.6" max="7.8"/><Field label="PaCO₂" value={patient.paco2} onChange={(v) => update("paco2", v)} unit="mmHg" min="5" max="200"/><Field label="HCO₃⁻" value={patient.hco3} onChange={(v) => update("hco3", v)} unit="mEq/L" min="1" max="60"/></div></div> : null}
        {step === 4 ? <div className="form-section"><div className="section-heading"><div><small>STEP 4</small><h2>肺力學與安全限制</h2></div>{guided ? <p>高 Ppeak 不等於高 alveolar pressure；需與 Pplat、Auto-PEEP 與 waveform 一起判讀。</p> : null}</div><div className="form-grid"><Field label="Expired VT" value={patient.vt} onChange={(v) => update("vt", v)} unit="mL" min="100" max="2000"/><Field label="Ppeak" value={patient.ppeak} onChange={(v) => update("ppeak", v)} unit="cmH₂O" min="0" max="100"/><Field label="Pplat" value={patient.pplat} onChange={(v) => update("pplat", v)} unit="cmH₂O" min="0" max="80"/><Field label="Total PEEP" value={patient.totalPeep} onChange={(v) => update("totalPeep", v)} unit="cmH₂O" min="0" max="40"/><Field label="Auto-PEEP" value={patient.autoPeep} onChange={(v) => update("autoPeep", v)} unit="cmH₂O" min="0" max="40"/><Field label="MAP" value={patient.map} onChange={(v) => update("map", v)} unit="mmHg" min="20" max="180"/></div><button className="disclosure" onClick={() => setShowAdvanced(!showAdvanced)}>{showAdvanced ? "收合" : "展開"} Advanced Assessment</button>{showAdvanced ? <div className="advanced-panel"><SelectField label="呼氣流量在下一次吸氣前回到基線？" value={patient.expiratoryFlowReturns} onChange={(v) => update("expiratoryFlowReturns", v)} options={[["yes","Yes"],["no","No"],["unknown","Unknown"]]}/><p>進階資料可再整合 waveform、I:E、inspiratory flow、trigger、rise time、P0.1、NIF 與 EAdi。</p></div> : null}</div> : null}
        {step === 5 ? <Results analysis={analysis} /> : null}
        <div className="form-nav"><button className="button ghost" disabled={step === 1} onClick={() => setStep(Math.max(1, step - 1))}>上一步</button><button className="button primary" disabled={step === 5} onClick={() => setStep(Math.min(5, step + 1))}>{step === 4 ? "產生建議" : "下一步"}</button></div>
      </section>
      <aside className="safety-rail"><h2>即時安全儀表板</h2><div className="metrics-grid"><MetricCard label="VT / PBW" value={m.vtPerPbw ?? "—"} unit="mL/kg" status={status(m.vtPerPbw, (v) => v > 8)}/><MetricCard label="P/F" value={m.pfRatio ?? "—"} status={status(m.pfRatio, (v) => v < 200)}/><MetricCard label="Pplat" value={patient.pplat ?? "—"} unit="cmH₂O" status={status(patient.pplat, (v) => v > 30)}/><MetricCard label="ΔP" value={m.drivingPressure ?? "—"} unit="cmH₂O" status={status(m.drivingPressure, (v) => v > 15)}/><MetricCard label="Auto-PEEP" value={patient.autoPeep ?? "—"} unit="cmH₂O" status={status(patient.autoPeep, (v) => v >= 5)}/><MetricCard label="pH" value={patient.ph ?? "—"} status={status(patient.ph, (v) => v < 7.25)}/><MetricCard label="MAP" value={patient.map ?? "—"} unit="mmHg" status={status(patient.map, (v) => v < 65)}/></div>{analysis.warnings.length > 0 ? <div aria-live="assertive" className="warning-stack" role="alert">{analysis.warnings.map((warning) => <div className={`warning ${warning.level}`} key={warning.title}><Icon name="alert"/><span><strong>{warning.title}</strong><small>{warning.detail}</small></span></div>)}</div> : <div className="calm-state"><Icon name="check"/><span><strong>目前無立即高風險旗標</strong><small>仍需持續 bedside reassessment。</small></span></div>}{analysis.invalidData.length > 0 ? <div className="invalid-stack">{analysis.invalidData.map((item) => <p key={item}>{item}</p>)}</div> : null}<div className="rail-recommendation"><small>目前策略方向</small><strong>{analysis.strategy}</strong><span>{analysis.preferredMode}</span><button onClick={() => setStep(5)}>查看完整理由</button></div></aside>
    </div>
  </div>;
}

function Results({ analysis }: { analysis: ReturnType<typeof analyzePatient> }) {
  return <div className="results">{analysis.warnings.length > 0 ? <div aria-live="assertive" className="results-warnings" role="alert">{analysis.warnings.map((item) => <div className={`warning ${item.level}`} key={item.title}><Icon name="alert"/><span><strong>{item.title}</strong><small>{item.detail}</small></span></div>)}</div> : null}<div className="result-hero"><span className="result-icon"><Icon name="lungs"/></span><div><small>Suggested ventilation strategy</small><h2>{analysis.strategy}</h2><p>{analysis.preferredMode}</p><span className="confidence">Confidence：{analysis.confidence}</span></div></div><div className="derived-strip result-derived"><div><small>PBW</small><strong>{analysis.metrics.pbw ?? "—"}</strong><span>kg</span></div><div><small>BMI</small><strong>{analysis.metrics.bmi ?? "—"}</strong><span>kg/m²</span></div><div><small>Static compliance</small><strong>{analysis.metrics.staticCompliance ?? "—"}</strong><span>mL/cmH₂O</span></div></div><div className="result-columns"><section><h3>Why this strategy?</h3><ul className="check-list">{analysis.reasoning.map((item) => <li key={item}><Icon name="check"/>{item}</li>)}</ul></section><section><h3>Reasonable alternatives</h3><ul>{analysis.alternatives.map((item) => <li key={item}>{item}</li>)}</ul></section><section><h3>What should I monitor next?</h3><ul>{analysis.monitorNext.map((item) => <li key={item}>{item}</li>)}</ul></section><section><h3>What could go wrong?</h3><ul>{analysis.avoid.length > 0 ? analysis.avoid.map((item) => <li key={item}>{item}</li>) : <li>不要把單一數值或疾病名稱直接等同特定 Mode。</li>}</ul></section></div>{analysis.invalidData.length > 0 ? <div className="invalid-data"><strong>Invalid / implausible data</strong>{analysis.invalidData.map((item) => <p key={item}>{item}</p>)}</div> : null}{analysis.missingData.length > 0 ? <div className="missing-data"><strong>Missing Data</strong>{analysis.missingData.map((item) => <p key={item}>{item}</p>)}</div> : null}<details className="transparency"><summary>Why am I seeing this recommendation?</summary><div><span>Patient findings</span><b>→</b><span>Detected physiology</span><b>→</b><span>Clinical goal</span><b>→</b><span>Mode family</span><b>→</b><span>Recommendation + reassessment</span></div></details></div>;
}

function CompareView({ selected, setSelected }: { selected: string[]; setSelected: (value: string[]) => void }) {
  const rows = modeRows.filter((mode) => selected.includes(mode.id));
  const toggle = (id: string) => {
    if (selected.includes(id) && selected.length <= 2) return;
    setSelected(selected.includes(id) ? selected.filter((item) => item !== id) : selected.length < 3 ? [...selected, id] : [...selected.slice(1), id]);
  };
  return <div className="page simple-page"><div className="page-title"><h1>Compare Ventilator Modes</h1><p>選擇 2–3 個 Mode，比較控制變數、可預測性、backup 與常見陷阱；比較表不代表疾病對應固定模式。</p></div><div className="mode-picker">{modeRows.map((mode) => <button aria-pressed={selected.includes(mode.id)} key={mode.id} className={selected.includes(mode.id) ? "selected" : ""} onClick={() => toggle(mode.id)}>{selected.includes(mode.id) ? <Icon name="check"/> : null}{mode.name}</button>)}</div><div className="comparison-wrap"><table><caption>選取之呼吸器模式特性比較</caption><thead><tr><th scope="col">比較項目</th>{rows.map((mode) => <th scope="col" key={mode.id}>{mode.name}</th>)}</tr></thead><tbody>{[["Controlled variable","control"],["VT predictability","vt"],["Pressure predictability","pressure"],["Requires spontaneous breathing","drive"],["Backup ventilation","backup"],["Typical use","use"],["Major caution","caution"]].map(([label, key]) => <tr key={key}><th scope="row">{label}</th>{rows.map((mode) => <td key={mode.id}>{mode[key as keyof typeof mode]}</td>)}</tr>)}</tbody></table></div><div className="teaching-callout"><Icon name="shield"/><span><strong>Mode behavior is manufacturer dependent</strong><p>PRVC、VC+、Autoflow 等名稱可能屬相近 family，但演算法細節不可視為完全相同。</p></span></div></div>;
}

function LearningView({ index, setIndex, choice, setChoice, revealed, setRevealed }: { index: number; setIndex: (value: number) => void; choice: string; setChoice: (value: string) => void; revealed: boolean; setRevealed: (value: boolean) => void }) {
  const current = learningCases[index];
  return <div className="page simple-page"><div className="page-title"><h1>Interactive Learning Cases</h1><p>先做自己的判斷，再查看 preferred approach、alternatives、安全議題與常見錯誤。</p></div><div className="learning-layout"><aside className="case-list">{learningCases.map((item, i) => <button aria-pressed={i === index} key={item[0]} className={i === index ? "active" : ""} onClick={() => setIndex(i)}><span>{String(i + 1).padStart(2,"0")}</span>{item[0]}</button>)}</aside><section className="case-workspace"><small>CASE {index + 1} / 10</small><h2>{current[0]}</h2><p className="case-prompt">在看到解析前，你會選擇哪一種通氣策略？</p><div className="choice-grid">{["Volume-targeted A/C","Pressure-targeted A/C","Adaptive / dual-control","PSV / CPAP","NIV","先處理生理問題再決定 Mode"].map((item) => <button aria-pressed={choice === item} key={item} className={choice === item ? "selected" : ""} onClick={() => { setChoice(item); setRevealed(false); }}>{choice === item ? <Icon name="check"/> : null}{item}</button>)}</div><button className="button primary" disabled={!choice} onClick={() => setRevealed(true)}>Submit Decision</button>{revealed ? <div aria-live="polite" className="case-answer"><div><small>Preferred approach</small><strong>{current[1]}</strong></div><div><small>Reasonable mode family</small><strong>{current[2]}</strong></div><div><small>Common mistake</small><strong>{current[3]}</strong></div><p>你的選擇：{choice}。重點不只是答案，而是能否說明 What、Why、monitor next、risk 與 reconsideration point。</p></div> : null}</section></div></div>;
}

function EvidenceView() {
  return <div className="page simple-page"><div className="page-title"><h1>安全原則與 Evidence</h1><p>這是 Clinical Decision Support + Education Tool，不是 autonomous treatment system。</p></div><div className="evidence-grid"><section><h2>九項安全護欄</h2><ol><li>顯示 clinical reasoning 與實際輸入資料。</li><li>重要資料缺失時不得假設正常。</li><li>顯示不確定性與合理替代策略。</li><li>保留 clinician override 與 bedside context。</li><li>不宣稱任何 Mode 是唯一正確答案。</li><li>高風險狀況先顯示紅色文字警示。</li><li>不可因單一數值直接做高風險決定。</li><li>所有建議包含後續監測與重新評估時機。</li><li>不收集姓名、病歷號或身分證等識別資料。</li></ol></section><section><h2>Clinical rule registry</h2>{clinicalRules.map((rule) => <article className="reference-row" key={rule.id}><div><strong>{rule.label}</strong><span>{rule.population}</span></div><div><a href={rule.url} target="_blank" rel="noreferrer">{rule.source} ({rule.year})</a><p>{rule.evidenceLevel}</p>{rule.doi ? <small>DOI: {rule.doi}</small> : null}</div><small>Last reviewed: {rule.lastReviewed}</small></article>)}<div className="source-note">正式臨床使用前，應由院內 ICU／胸腔／呼吸治療團隊完成規則、版本與在地流程驗證。</div></section></div></div>;
}
