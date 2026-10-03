// Rule tests for the engine embedded in index.html.
// Run: node tests.cjs
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) throw new Error('engine block not found');
const mod = { exports: {} };
new Function('module', m[1])(mod);
const VE = mod.exports;

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + e.message); }
}

console.log('Predicted body weight');
t('male 170 cm = 66.0 kg', () => assert.equal(VE.pbw('m', 170), 66));
t('female 160 cm = 52.4 kg', () => assert.equal(VE.pbw('f', 160), 52.4));
t('height out of range → null', () => assert.equal(VE.pbw('m', 300), null));
t('missing sex → null', () => assert.equal(VE.pbw('', 170), null));

console.log('Initial settings');
t('ARDS: 6 mL/kg, rounded to 10 mL (66 kg → 400)', () => assert.equal(VE.initial({ pheno: 'ards', sex: 'm', height: 170 }).vt, 400));
t('no height → VT null + missing message', () => {
  const r = VE.initial({ pheno: 'general', sex: 'm', height: '' });
  assert.equal(r.vt, null); assert.ok(r.missing.length);
});
t('metabolic acidosis: Winter formula 1.5×10+8 = 23', () => assert.equal(VE.initial({ pheno: 'metabolic', sex: 'm', height: 170, hco3: 10 }).expPaco2, 23));
t('metabolic acidosis HCO3 5 → expected PaCO2 < 20 warning', () => {
  const r = VE.initial({ pheno: 'metabolic', sex: 'm', height: 170, hco3: 5 });
  assert.ok(r.cautions.some(c => c[0] === 'stop'));
});
t('shock adds hemodynamic caution', () => assert.ok(VE.initial({ pheno: 'general', sex: 'f', height: 160, shock: true }).cautions.length >= 1));
t('COPD baseline PaCO2 replaces target', () => assert.ok(VE.initial({ pheno: 'copd', sex: 'm', height: 170, base: 58 }).targets[1].includes('58')));
t('every phenotype VT within 4–8 mL/kg', () => Object.entries(VE.PHENO).forEach(([k, d]) => assert.ok(d.vtKg >= 4 && d.vtKg <= 8, k)));

console.log('ARDS definition (2024 global)');
const base = { setting: 'inv', c1: true, c2: true, c3: true, peep: 8 };
t('P/F 250 intubated → mild', () => assert.equal(VE.ardsDef({ ...base, pao2: 100, fio2: 0.4 }).severity, 'mild'));
t('P/F 150 → moderate', () => assert.equal(VE.ardsDef({ ...base, pao2: 75, fio2: 0.5 }).severity, 'moderate'));
t('P/F 100 → severe (≤100)', () => assert.equal(VE.ardsDef({ ...base, pao2: 60, fio2: 0.6 }).severity, 'severe'));
t('P/F 300 → mild (≤300)', () => assert.equal(VE.ardsDef({ ...base, pao2: 90, fio2: 0.3 }).severity, 'mild'));
t('P/F 310 → not ARDS', () => assert.equal(VE.ardsDef({ ...base, pao2: 93, fio2: 0.3 }).met, false));
t('S/F used when no PaO2: 92/0.6 = 153 → moderate', () => {
  const r = VE.ardsDef({ ...base, spo2: 92, fio2: 0.6 });
  assert.equal(r.basis, 'S/F'); assert.equal(r.severity, 'moderate');
});
t('S/F 148 → severe', () => assert.equal(VE.ardsDef({ ...base, spo2: 74, fio2: 0.5 }).severity, 'severe'));
t('SpO2 98% → S/F invalid', () => assert.equal(VE.ardsDef({ ...base, spo2: 98, fio2: 0.5 }).sf, null));
t('missing imaging criterion → not met', () => assert.equal(VE.ardsDef({ ...base, c2: false, pao2: 60, fio2: 0.6 }).met, false));
t('non-intubated on HFNC, S/F 300 → ARDS, ungraded', () => {
  const r = VE.ardsDef({ setting: 'non', support: 'hfnc', c1: true, c2: true, c3: true, spo2: 90, fio2: 0.3 });
  assert.equal(r.met, true); assert.equal(r.severity, 'nonintubated');
});
t('non-intubated on plain O2 → not met', () => assert.equal(VE.ardsDef({ setting: 'non', support: 'none', c1: true, c2: true, c3: true, spo2: 90, fio2: 0.4 }).met, false));
t('Berlin needs PEEP ≥ 5', () => assert.equal(VE.ardsDef({ ...base, peep: 3, pao2: 60, fio2: 0.6 }).berlin, 'nopeep'));

console.log('ARDSNet PEEP/FiO2 tables');
t('lower 0.5 → 8–10', () => assert.deepEqual([VE.peepFor(0.5, 'lower').lo, VE.peepFor(0.5, 'lower').hi], [8, 10]));
t('lower 0.7 → 10–14', () => assert.deepEqual([VE.peepFor(0.7, 'lower').lo, VE.peepFor(0.7, 'lower').hi], [10, 14]));
t('lower 1.0 → 18–24', () => assert.deepEqual([VE.peepFor(1, 'lower').lo, VE.peepFor(1, 'lower').hi], [18, 24]));
t('lower 0.45 rounds up to 0.5 row', () => assert.equal(VE.peepFor(0.45, 'lower').fio2, 0.5));
t('lower 0.25 uses 0.3 row → 5', () => assert.equal(VE.peepFor(0.25, 'lower').lo, 5));
t('higher 0.3 → 5–14', () => assert.deepEqual([VE.peepFor(0.3, 'higher').lo, VE.peepFor(0.3, 'higher').hi], [5, 14]));
t('higher 0.6 → 20', () => assert.deepEqual([VE.peepFor(0.6, 'higher').lo, VE.peepFor(0.6, 'higher').hi], [20, 20]));
t('higher 0.8 → 20–22', () => assert.deepEqual([VE.peepFor(0.8, 'higher').lo, VE.peepFor(0.8, 'higher').hi], [20, 22]));
t('FiO2 entered as 60 (percent) → null', () => assert.equal(VE.peepFor(60, 'lower'), null));

console.log('ARDSNet VT / Pplat / pH');
const w = 66;
t('Pplat 32 at 7.6 mL/kg → reduce 1 mL/kg (→ 440 mL)', () => assert.equal(VE.ardsnet({ pbw: w, vt: 500, pplat: 32, peep: 10 }).newVt, 440));
t('Pplat 32 at 4 mL/kg → no further reduction', () => {
  const r = VE.ardsnet({ pbw: w, vt: 264, pplat: 32, peep: 10 });
  assert.equal(r.newVt, null); assert.ok(r.acts.some(a => a[0] === 'stop'));
});
t('VT 8 mL/kg, Pplat ok → step down toward 6', () => assert.equal(VE.ardsnet({ pbw: w, vt: 528, pplat: 26, peep: 10 }).newVt, 460));
t('Pplat 22 at 5 mL/kg → may increase to 6', () => assert.equal(VE.ardsnet({ pbw: w, vt: 330, pplat: 22, peep: 8 }).newVt, 400));
t('pH 7.10 → RR 35', () => assert.equal(VE.ardsnet({ pbw: w, vt: 400, pplat: 25, peep: 10, ph: 7.10, rr: 24 }).newRr, 35));
t('pH 7.25 with PaCO2 55 RR 20 → RR rises but ≤ 35', () => {
  const r = VE.ardsnet({ pbw: w, vt: 400, pplat: 25, peep: 10, ph: 7.25, rr: 20, paco2: 55 });
  assert.ok(r.newRr > 20 && r.newRr <= 35);
});
t('driving pressure 18 flagged', () => assert.ok(VE.ardsnet({ pbw: w, vt: 400, pplat: 28, peep: 10 }).acts.some(a => a[1].includes('驅動壓'))));

console.log('Obstructive');
t('RR 18, VT 480, flow 50 → Ti 0.58, Te 2.75, I:E ~1:4.7', () => {
  const r = VE.obstructive({ kind: 'copd', rr: 18, vt: 480, flow: 50 });
  assert.equal(r.ti, 0.58); assert.equal(r.te, 2.75); assert.equal(r.ie, 4.7);
});
t('RR 30, VT 500, flow 40 → I:E < 1:2 stop', () => assert.ok(VE.obstructive({ kind: 'copd', rr: 30, vt: 500, flow: 40 }).alerts.some(a => a[0] === 'stop')));
t('auto-PEEP = total − set', () => assert.equal(VE.obstructive({ kind: 'copd', peep: 5, tpeep: 12 }).autoPeep, 7));
t('COPD triggering with auto-PEEP 10 → external PEEP 8', () => assert.ok(VE.obstructive({ kind: 'copd', peep: 5, tpeep: 15, trig: true }).actions.some(a => a[1].includes('8 cmH₂O'))));
t('asthma triggering → no external PEEP recommendation', () => assert.ok(!VE.obstructive({ kind: 'asthma', peep: 0, tpeep: 10, trig: true }).actions.some(a => a[1].startsWith('外加 PEEP'))));
t('hypotension → disconnect first', () => assert.equal(VE.obstructive({ kind: 'asthma', hypo: true }).actions[0][1], '先斷開呼吸器 30–60 秒'));

console.log('Mechanics');
const mk = VE.mechanics({ pbw: 66, rr: 16, vt: 450, ph: 7.28, paco2: 55, pao2: 68, fio2: 0.5, spo2: 93, ppeak: 30, pplat: 24, peep: 8, flow: 60, mpaw: 14 });
t('ΔP = 16', () => assert.equal(mk.dp, 16));
t('Cstat = 450/16 ≈ 28', () => assert.equal(mk.cstat, 28));
t('Raw = 6 / 1 L/s = 6', () => assert.equal(mk.raw, 6));
t('MP = 0.098×16×0.45×(30−8) = 15.5', () => assert.equal(mk.mp, 15.5));
t('VR = 7.2 L × 55 / (66×100×37.5) = 1.6', () => assert.equal(mk.vr, 1.6));
t('OI = 0.5×100×14/68 = 10.3', () => assert.equal(mk.oi, 10.3));
t('P/F = 136', () => assert.equal(mk.pf, 136));

console.log('ABG adjustment');
t('PaCO2 55 → 40 at RR 16 → RR 22', () => assert.equal(VE.abgAdjust({ pbw: 66, rr: 16, vt: 450, paco2: 55, target: 40 }).newRr, 22));
t('RR > 35 needed → capped at 35 with warning', () => {
  const r = VE.abgAdjust({ pbw: 66, rr: 30, vt: 400, paco2: 70, target: 40 });
  assert.equal(r.newRr, 35); assert.ok(r.vent[0][1].includes('超過 35'));
});
t('low PaCO2 with acidemia → do not reduce MV', () => assert.ok(VE.abgAdjust({ pbw: 66, rr: 28, vt: 500, paco2: 20, target: 40, ph: 7.15 }).vent.some(a => a[0] === 'stop')));
t('SpO2 below target with FiO2 0.7 → PEEP first', () => assert.ok(VE.abgAdjust({ spo2: 86, fio2: 0.7, otgt: 'ards' }).oxy[0][2].includes('PEEP')));
t('SpO2 above target → wean FiO2', () => assert.ok(VE.abgAdjust({ spo2: 99, fio2: 0.6, otgt: 'std' }).oxy[0][2].includes('先降 FiO₂')));
t('HCO3 from pH 7.40 / PaCO2 40 ≈ 24', () => assert.ok(Math.abs(VE.hco3Of(7.4, 40) - 24.4) < 0.3));

console.log('Pressure pattern');
t('Ppeak 45, Pplat 23, PEEP 8 → resistive', () => assert.equal(VE.pressure({ ppeak: 45, pplat: 23, peep: 8 }).pattern, 'resistive'));
t('Ppeak 38, Pplat 34 → elastic', () => assert.equal(VE.pressure({ ppeak: 38, pplat: 34, peep: 10 }).pattern, 'elastic'));
t('Ppeak 50, Pplat 35 → both', () => assert.equal(VE.pressure({ ppeak: 50, pplat: 35, peep: 10 }).pattern, 'both'));
t('no Pplat → noplat', () => assert.equal(VE.pressure({ ppeak: 40 }).pattern, 'noplat'));
t('Pplat > Ppeak → invalid', () => assert.equal(VE.pressure({ ppeak: 20, pplat: 25 }).pattern, 'invalid'));
t('driving pressure uses total PEEP when given', () => assert.equal(VE.pressure({ ppeak: 30, pplat: 25, peep: 5, tpeep: 12 }).dp, 13));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
