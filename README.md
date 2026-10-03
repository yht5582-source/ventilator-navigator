# 呼吸器設定導航

繁體中文的成人侵入性呼吸器決策輔助工具。依臨床情境給起始設定，並涵蓋 ARDS 肺保護、阻塞性疾病、血氣與力學調整、疑難排解。單一靜態網頁，部署於 GitHub Pages：<https://yht5582-source.github.io/ventilator-navigator/>

> 本工具用於臨床教育與決策輔助，所有數值皆為起始建議，需依床邊評估、波形、血氣與病人反應調整，不能取代醫師與呼吸治療師的判斷。

## 分頁

1. **起始設定**：七種情境（肺部大致正常、ARDS、COPD 急性惡化、重度氣喘、重度代謝性酸中毒、急性腦傷、神經肌肉無力），依 PBW 算出 VT，並列出模式、RR、PEEP、FiO₂、流速、目標與接上後第一小時的檢查。代謝性酸中毒以 Winter 公式算預期 PaCO₂；勾選休克時會加上循環警示。可複製設定摘要。
2. **ARDS 肺保護**
   - 2024 全球定義：插管（P/F 或 S/F 分級）與非插管（HFNC ≥ 30 L/min 或 NIV/CPAP ≥ 5），同時對照 Berlin 分級。
   - ARDSNet 較低／較高 PEEP/FiO₂ 表，依 FiO₂ 標示對應 PEEP。
   - VT／Pplat／pH 調整：Pplat > 30 降 VT 1 mL/kg（最低 4）、VT > 6 逐步下調、pH 7.15–7.30 上調 RR（最高 35，依 Henderson–Hasselbalch 粗估目標 RR）、pH < 7.15 的處置、驅動壓 > 15 提示。
   - 輔助治療階梯（ATS 2017／2024、ESICM 2023）：俯臥、較高 PEEP、肌鬆、類固醇、VV-ECMO（EOLIA 條件）、避免長時間肺泡擴張術與 HFOV。
   - 藥物劑量：dexamethasone（DEXA-ARDS）、methylprednisolone（Meduri）、hydrocortisone（CAPE COD）、COVID-19 dexamethasone（RECOVERY）、cisatracurium（ACURASYS／ROSE）。
3. **阻塞性疾病**：以 RR、VT、流速估算 Ti、Te、I:E 與 auto-PEEP，依序列出降 RR、提高流速、降 VT、治療阻塞；COPD 自行觸發時外加 PEEP 約 auto-PEEP 的 80%；插管後低血壓先斷開管路。附經呼吸器給藥的支氣管擴張劑、全身性類固醇、magnesium、ketamine 劑量。
4. **血氣與力學調整**：VT/PBW、MV、P/F、S/F、驅動壓、靜態順應性、氣道阻力、機械功率、通氣比、氧合指數；依目標 PaCO₂ 調 RR，依 SpO₂ 目標調 FiO₂／PEEP。
5. **疑難排解**：急性去飽和的 DOPE 流程、高氣道壓阻力型與彈性型判讀、七種人機不同步的波形與處置。
6. **模式與案例**：常用模式比較表，與 10 個案例練習題。
7. **文獻**

## 檔案

```text
.
├── index.html   # 頁面與計算 engine（/*ENGINE-START*/ … /*ENGINE-END*/）
├── tests.cjs    # 規則測試
├── README.md
└── .nojekyll
```

## 測試

```bash
node tests.cjs
```

## 主要依據

- Fan E, et al. ATS/ESICM/SCCM guideline: mechanical ventilation in adult ARDS. *AJRCCM* 2017;195:1253–1263.
- Qadir N, et al. ATS clinical practice guideline update on ARDS. *AJRCCM* 2024;209:24–36.
- Grasselli G, et al. ESICM guidelines on ARDS. *Intensive Care Med* 2023;49:727–759.
- Matthay MA, et al. A new global definition of ARDS. *AJRCCM* 2024;209:37–47.
- NHLBI ARDS Network ventilator protocol.
- Rochwerg B, et al. ERS/ATS NIV guideline. *Eur Respir J* 2017;50:1602426.

前一版為 Next.js（vinext）應用，已於 2026-10-03 改寫為單一靜態頁面；舊版原始碼保留在 git 歷史中。
