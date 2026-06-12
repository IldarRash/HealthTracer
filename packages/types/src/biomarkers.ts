import { z } from "zod";

// ---------------------------------------------------------------------------
// Biomarker catalog — as code (no DB catalog table, no pg enum).
//
// ~50 wellness-framed markers across 8 areas. Each entry carries the units we
// accept as-reported (NO conversion logic anywhere — storing as-reported is a
// deliberate safety decision; silent mmol/L<->mg/dL conversion is the most
// dangerous bug class for lab data), a wellness-neutral "typical range" used
// only for display framing and a plausibility band, and EN/RU aliases that the
// lab-extraction LLM prompt uses to map free-text lab-sheet labels onto keys.
//
// Wording is wellness-neutral on purpose: ranges are "typical", never
// "normal/abnormal/deficient". This is not diagnosis or treatment guidance.
// ---------------------------------------------------------------------------

export const BIOMARKER_AREAS = [
  "metabolic",
  "lipids_cardiovascular",
  "hormones",
  "nutrients",
  "inflammation",
  "blood_count",
  "kidney",
  "liver",
] as const;

export type BiomarkerArea = (typeof BIOMARKER_AREAS)[number];

/** Display order for the dashboard (mirrors BIOMARKER_AREAS today). */
export const BIOMARKER_AREA_ORDER: readonly BiomarkerArea[] = BIOMARKER_AREAS;

export type BiomarkerValueKind = "numeric" | "qualitative";

export interface BiomarkerRange {
  readonly low: number;
  readonly high: number;
  readonly unit: string;
}

export interface BiomarkerCatalogEntry {
  readonly key: BiomarkerKey;
  readonly area: BiomarkerArea;
  readonly displayLabel: string;
  readonly canonicalUnit: string;
  readonly acceptedUnits: readonly string[];
  /** Wellness-framed typical band; null where too sex/age-variable to frame fairly. */
  readonly typicalRange: BiomarkerRange | null;
  /** Optimal/longevity band; null for nearly all markers at MVP. */
  readonly optimalRange: BiomarkerRange | null;
  /** EN + RU lab-sheet names; consumed by the extraction prompt. Never empty. */
  readonly aliases: readonly string[];
  readonly valueKind: BiomarkerValueKind;
}

// The canonical key list. z.enum + the BiomarkerKey union derive from this, and
// a catalog-integrity test asserts it stays in sync with BIOMARKER_CATALOG.
export const BIOMARKER_KEYS = [
  // metabolic
  "fasting_glucose",
  "hba1c",
  "fasting_insulin",
  // lipids_cardiovascular
  "total_cholesterol",
  "ldl_cholesterol",
  "hdl_cholesterol",
  "triglycerides",
  "apob",
  "lipoprotein_a",
  // hormones
  "testosterone_total",
  "testosterone_free",
  "shbg",
  "estradiol",
  "cortisol_am",
  "tsh",
  "free_t4",
  "free_t3",
  "dhea_s",
  // nutrients
  "vitamin_d",
  "vitamin_b12",
  "folate",
  "ferritin",
  "iron",
  "tibc",
  "transferrin_saturation",
  "magnesium",
  // inflammation
  "hs_crp",
  "homocysteine",
  "uric_acid",
  // blood_count
  "hemoglobin",
  "hematocrit",
  "rbc",
  "wbc",
  "platelets",
  "mcv",
  "rdw",
  "neutrophils",
  "lymphocytes",
  // kidney
  "creatinine",
  "egfr",
  "bun",
  "albumin",
  // liver
  "alt",
  "ast",
  "ggt",
  "alp",
  "bilirubin_total",
  "total_protein",
] as const;

export type BiomarkerKey = (typeof BIOMARKER_KEYS)[number];

export const biomarkerKeySchema = z.enum(BIOMARKER_KEYS);

export const BIOMARKER_CATALOG: readonly BiomarkerCatalogEntry[] = [
  // ── metabolic ───────────────────────────────────────────────────────────
  {
    key: "fasting_glucose",
    area: "metabolic",
    displayLabel: "Fasting glucose",
    canonicalUnit: "mg/dL",
    acceptedUnits: ["mg/dL", "mmol/L"],
    typicalRange: { low: 70, high: 99, unit: "mg/dL" },
    optimalRange: null,
    aliases: ["Glucose, fasting", "Fasting glucose", "Глюкоза натощак", "Глюкоза"],
    valueKind: "numeric",
  },
  {
    key: "hba1c",
    area: "metabolic",
    displayLabel: "HbA1c",
    canonicalUnit: "%",
    acceptedUnits: ["%", "mmol/mol"],
    typicalRange: { low: 4.0, high: 5.6, unit: "%" },
    optimalRange: null,
    aliases: ["HbA1c", "Hemoglobin A1c", "Glycated hemoglobin", "Гликированный гемоглобин", "Гликогемоглобин"],
    valueKind: "numeric",
  },
  {
    key: "fasting_insulin",
    area: "metabolic",
    displayLabel: "Fasting insulin",
    canonicalUnit: "µIU/mL",
    acceptedUnits: ["µIU/mL", "mIU/L", "pmol/L"],
    typicalRange: { low: 2, high: 15, unit: "µIU/mL" },
    optimalRange: null,
    aliases: ["Insulin, fasting", "Fasting insulin", "Инсулин натощак", "Инсулин"],
    valueKind: "numeric",
  },
  // ── lipids_cardiovascular ───────────────────────────────────────────────
  {
    key: "total_cholesterol",
    area: "lipids_cardiovascular",
    displayLabel: "Total cholesterol",
    canonicalUnit: "mg/dL",
    acceptedUnits: ["mg/dL", "mmol/L"],
    typicalRange: { low: 125, high: 200, unit: "mg/dL" },
    optimalRange: null,
    aliases: ["Cholesterol, total", "Total cholesterol", "Холестерин общий", "Общий холестерин"],
    valueKind: "numeric",
  },
  {
    key: "ldl_cholesterol",
    area: "lipids_cardiovascular",
    displayLabel: "LDL cholesterol",
    canonicalUnit: "mg/dL",
    acceptedUnits: ["mg/dL", "mmol/L"],
    typicalRange: { low: 50, high: 100, unit: "mg/dL" },
    optimalRange: null,
    aliases: ["LDL", "LDL cholesterol", "LDL-C", "ЛПНП", "Холестерин ЛПНП"],
    valueKind: "numeric",
  },
  {
    key: "hdl_cholesterol",
    area: "lipids_cardiovascular",
    displayLabel: "HDL cholesterol",
    canonicalUnit: "mg/dL",
    acceptedUnits: ["mg/dL", "mmol/L"],
    // Wide unisex band: HDL targets differ by sex but a single 40-90 band frames both fairly.
    typicalRange: { low: 40, high: 90, unit: "mg/dL" },
    optimalRange: null,
    aliases: ["HDL", "HDL cholesterol", "HDL-C", "ЛПВП", "Холестерин ЛПВП"],
    valueKind: "numeric",
  },
  {
    key: "triglycerides",
    area: "lipids_cardiovascular",
    displayLabel: "Triglycerides",
    canonicalUnit: "mg/dL",
    acceptedUnits: ["mg/dL", "mmol/L"],
    typicalRange: { low: 40, high: 150, unit: "mg/dL" },
    optimalRange: null,
    aliases: ["Triglycerides", "TG", "Триглицериды"],
    valueKind: "numeric",
  },
  {
    key: "apob",
    area: "lipids_cardiovascular",
    displayLabel: "Apolipoprotein B",
    canonicalUnit: "mg/dL",
    acceptedUnits: ["mg/dL", "g/L"],
    typicalRange: { low: 40, high: 100, unit: "mg/dL" },
    optimalRange: null,
    aliases: ["ApoB", "Apolipoprotein B", "Apo B", "Аполипопротеин B", "Апо B"],
    valueKind: "numeric",
  },
  {
    key: "lipoprotein_a",
    area: "lipids_cardiovascular",
    displayLabel: "Lipoprotein(a)",
    canonicalUnit: "nmol/L",
    acceptedUnits: ["nmol/L", "mg/dL"],
    // null: Lp(a) has a strongly right-skewed population distribution with no
    // meaningful "typical low"; framing a symmetric band would be misleading.
    typicalRange: null,
    optimalRange: null,
    aliases: ["Lipoprotein(a)", "Lp(a)", "Липопротеин(а)", "ЛП(а)"],
    valueKind: "numeric",
  },
  // ── hormones ────────────────────────────────────────────────────────────
  {
    key: "testosterone_total",
    area: "hormones",
    displayLabel: "Total testosterone",
    canonicalUnit: "ng/dL",
    acceptedUnits: ["ng/dL", "nmol/L"],
    // null: strongly sex-dependent and there is no sex field on profiles at MVP.
    typicalRange: null,
    optimalRange: null,
    aliases: ["Testosterone, total", "Total testosterone", "Тестостерон общий", "Общий тестостерон"],
    valueKind: "numeric",
  },
  {
    key: "testosterone_free",
    area: "hormones",
    displayLabel: "Free testosterone",
    canonicalUnit: "pg/mL",
    acceptedUnits: ["pg/mL", "pmol/L"],
    // null: strongly sex-dependent (no profile sex field at MVP).
    typicalRange: null,
    optimalRange: null,
    aliases: ["Testosterone, free", "Free testosterone", "Тестостерон свободный", "Свободный тестостерон"],
    valueKind: "numeric",
  },
  {
    key: "shbg",
    area: "hormones",
    displayLabel: "SHBG",
    canonicalUnit: "nmol/L",
    acceptedUnits: ["nmol/L"],
    // Wide unisex band; SHBG varies by sex but 10-80 frames both broadly.
    typicalRange: { low: 10, high: 80, unit: "nmol/L" },
    optimalRange: null,
    aliases: ["SHBG", "Sex hormone binding globulin", "ГСПГ", "Глобулин, связывающий половые гормоны"],
    valueKind: "numeric",
  },
  {
    key: "estradiol",
    area: "hormones",
    displayLabel: "Estradiol",
    canonicalUnit: "pg/mL",
    acceptedUnits: ["pg/mL", "pmol/L"],
    // null: strongly sex- and cycle-dependent (no profile sex field at MVP).
    typicalRange: null,
    optimalRange: null,
    aliases: ["Estradiol", "E2", "Эстрадиол"],
    valueKind: "numeric",
  },
  {
    key: "cortisol_am",
    area: "hormones",
    displayLabel: "Cortisol (AM)",
    canonicalUnit: "µg/dL",
    acceptedUnits: ["µg/dL", "nmol/L"],
    typicalRange: { low: 6, high: 23, unit: "µg/dL" },
    optimalRange: null,
    aliases: ["Cortisol", "Cortisol, AM", "Morning cortisol", "Кортизол", "Кортизол утренний"],
    valueKind: "numeric",
  },
  {
    key: "tsh",
    area: "hormones",
    displayLabel: "TSH",
    canonicalUnit: "µIU/mL",
    acceptedUnits: ["µIU/mL", "mIU/L"],
    typicalRange: { low: 0.4, high: 4.0, unit: "µIU/mL" },
    optimalRange: null,
    aliases: ["TSH", "Thyroid stimulating hormone", "ТТГ", "Тиреотропный гормон"],
    valueKind: "numeric",
  },
  {
    key: "free_t4",
    area: "hormones",
    displayLabel: "Free T4",
    canonicalUnit: "ng/dL",
    acceptedUnits: ["ng/dL", "pmol/L"],
    typicalRange: { low: 0.8, high: 1.8, unit: "ng/dL" },
    optimalRange: null,
    aliases: ["Free T4", "FT4", "Free thyroxine", "Т4 свободный", "Свободный тироксин"],
    valueKind: "numeric",
  },
  {
    key: "free_t3",
    area: "hormones",
    displayLabel: "Free T3",
    canonicalUnit: "pg/mL",
    acceptedUnits: ["pg/mL", "pmol/L"],
    typicalRange: { low: 2.3, high: 4.2, unit: "pg/mL" },
    optimalRange: null,
    aliases: ["Free T3", "FT3", "Free triiodothyronine", "Т3 свободный", "Свободный трийодтиронин"],
    valueKind: "numeric",
  },
  {
    key: "dhea_s",
    area: "hormones",
    displayLabel: "DHEA-S",
    canonicalUnit: "µg/dL",
    acceptedUnits: ["µg/dL", "µmol/L"],
    // null: strongly age- and sex-dependent (no profile sex field at MVP).
    typicalRange: null,
    optimalRange: null,
    aliases: ["DHEA-S", "DHEA sulfate", "Dehydroepiandrosterone sulfate", "ДГЭА-С", "ДЭА-SO4"],
    valueKind: "numeric",
  },
  // ── nutrients ───────────────────────────────────────────────────────────
  {
    key: "vitamin_d",
    area: "nutrients",
    displayLabel: "Vitamin D (25-OH)",
    canonicalUnit: "ng/mL",
    acceptedUnits: ["ng/mL", "nmol/L"],
    typicalRange: { low: 30, high: 100, unit: "ng/mL" },
    optimalRange: null,
    aliases: ["Vitamin D", "25-OH Vitamin D", "25-hydroxyvitamin D", "Витамин D", "Витамин Д 25-ОН"],
    valueKind: "numeric",
  },
  {
    key: "vitamin_b12",
    area: "nutrients",
    displayLabel: "Vitamin B12",
    canonicalUnit: "pg/mL",
    acceptedUnits: ["pg/mL", "pmol/L"],
    typicalRange: { low: 200, high: 900, unit: "pg/mL" },
    optimalRange: null,
    aliases: ["Vitamin B12", "Cobalamin", "B12", "Витамин B12", "Витамин В12", "Кобаламин"],
    valueKind: "numeric",
  },
  {
    key: "folate",
    area: "nutrients",
    displayLabel: "Folate",
    canonicalUnit: "ng/mL",
    acceptedUnits: ["ng/mL", "nmol/L"],
    typicalRange: { low: 3, high: 20, unit: "ng/mL" },
    optimalRange: null,
    aliases: ["Folate", "Folic acid", "Vitamin B9", "Фолиевая кислота", "Фолат"],
    valueKind: "numeric",
  },
  {
    key: "ferritin",
    area: "nutrients",
    displayLabel: "Ferritin",
    canonicalUnit: "ng/mL",
    acceptedUnits: ["ng/mL", "µg/L"],
    // Wide unisex band: ferritin reference differs markedly by sex; 15-300 frames
    // both broadly without overstating where a single value sits.
    typicalRange: { low: 15, high: 300, unit: "ng/mL" },
    optimalRange: null,
    aliases: ["Ferritin", "Ферритин"],
    valueKind: "numeric",
  },
  {
    key: "iron",
    area: "nutrients",
    displayLabel: "Serum iron",
    canonicalUnit: "µg/dL",
    acceptedUnits: ["µg/dL", "µmol/L"],
    typicalRange: { low: 50, high: 170, unit: "µg/dL" },
    optimalRange: null,
    aliases: ["Iron", "Serum iron", "Железо", "Железо сывороточное"],
    valueKind: "numeric",
  },
  {
    key: "tibc",
    area: "nutrients",
    displayLabel: "TIBC",
    canonicalUnit: "µg/dL",
    acceptedUnits: ["µg/dL", "µmol/L"],
    typicalRange: { low: 250, high: 450, unit: "µg/dL" },
    optimalRange: null,
    aliases: ["TIBC", "Total iron binding capacity", "ОЖСС", "Общая железосвязывающая способность"],
    valueKind: "numeric",
  },
  {
    key: "transferrin_saturation",
    area: "nutrients",
    displayLabel: "Transferrin saturation",
    canonicalUnit: "%",
    acceptedUnits: ["%"],
    typicalRange: { low: 20, high: 50, unit: "%" },
    optimalRange: null,
    aliases: ["Transferrin saturation", "TSAT", "Iron saturation", "Насыщение трансферрина", "Коэффициент насыщения трансферрина"],
    valueKind: "numeric",
  },
  {
    key: "magnesium",
    area: "nutrients",
    displayLabel: "Magnesium",
    canonicalUnit: "mg/dL",
    acceptedUnits: ["mg/dL", "mmol/L"],
    typicalRange: { low: 1.7, high: 2.2, unit: "mg/dL" },
    optimalRange: null,
    aliases: ["Magnesium", "Mg", "Магний"],
    valueKind: "numeric",
  },
  // ── inflammation ────────────────────────────────────────────────────────
  {
    key: "hs_crp",
    area: "inflammation",
    displayLabel: "hs-CRP",
    canonicalUnit: "mg/L",
    acceptedUnits: ["mg/L", "mg/dL"],
    typicalRange: { low: 0.2, high: 3.0, unit: "mg/L" },
    optimalRange: null,
    aliases: ["hs-CRP", "High-sensitivity CRP", "C-reactive protein", "СРБ высокочувствительный", "С-реактивный белок"],
    valueKind: "numeric",
  },
  {
    key: "homocysteine",
    area: "inflammation",
    displayLabel: "Homocysteine",
    canonicalUnit: "µmol/L",
    acceptedUnits: ["µmol/L"],
    typicalRange: { low: 5, high: 15, unit: "µmol/L" },
    optimalRange: null,
    aliases: ["Homocysteine", "Гомоцистеин"],
    valueKind: "numeric",
  },
  {
    key: "uric_acid",
    area: "inflammation",
    displayLabel: "Uric acid",
    canonicalUnit: "mg/dL",
    acceptedUnits: ["mg/dL", "µmol/L"],
    // Wide unisex band; uric acid differs by sex but 3.0-7.0 frames both.
    typicalRange: { low: 3.0, high: 7.0, unit: "mg/dL" },
    optimalRange: null,
    aliases: ["Uric acid", "Urate", "Мочевая кислота"],
    valueKind: "numeric",
  },
  // ── blood_count ─────────────────────────────────────────────────────────
  {
    key: "hemoglobin",
    area: "blood_count",
    displayLabel: "Hemoglobin",
    canonicalUnit: "g/dL",
    acceptedUnits: ["g/dL", "g/L"],
    // Wide unisex band: hemoglobin reference is sex-dependent; 12-17 spans both.
    typicalRange: { low: 12, high: 17, unit: "g/dL" },
    optimalRange: null,
    aliases: ["Hemoglobin", "Hgb", "Hb", "Гемоглобин"],
    valueKind: "numeric",
  },
  {
    key: "hematocrit",
    area: "blood_count",
    displayLabel: "Hematocrit",
    canonicalUnit: "%",
    acceptedUnits: ["%", "L/L"],
    // Wide unisex band (sex-dependent reference).
    typicalRange: { low: 36, high: 50, unit: "%" },
    optimalRange: null,
    aliases: ["Hematocrit", "Hct", "Гематокрит"],
    valueKind: "numeric",
  },
  {
    key: "rbc",
    area: "blood_count",
    displayLabel: "Red blood cells",
    canonicalUnit: "10^6/µL",
    acceptedUnits: ["10^6/µL", "10^12/L"],
    // Wide unisex band (sex-dependent reference).
    typicalRange: { low: 4.0, high: 6.0, unit: "10^6/µL" },
    optimalRange: null,
    aliases: ["RBC", "Red blood cells", "Erythrocytes", "Эритроциты"],
    valueKind: "numeric",
  },
  {
    key: "wbc",
    area: "blood_count",
    displayLabel: "White blood cells",
    canonicalUnit: "10^3/µL",
    acceptedUnits: ["10^3/µL", "10^9/L"],
    typicalRange: { low: 3.5, high: 10.5, unit: "10^3/µL" },
    optimalRange: null,
    aliases: ["WBC", "White blood cells", "Leukocytes", "Лейкоциты"],
    valueKind: "numeric",
  },
  {
    key: "platelets",
    area: "blood_count",
    displayLabel: "Platelets",
    canonicalUnit: "10^3/µL",
    acceptedUnits: ["10^3/µL", "10^9/L"],
    typicalRange: { low: 150, high: 400, unit: "10^3/µL" },
    optimalRange: null,
    aliases: ["Platelets", "PLT", "Тромбоциты"],
    valueKind: "numeric",
  },
  {
    key: "mcv",
    area: "blood_count",
    displayLabel: "MCV",
    canonicalUnit: "fL",
    acceptedUnits: ["fL"],
    typicalRange: { low: 80, high: 100, unit: "fL" },
    optimalRange: null,
    aliases: ["MCV", "Mean corpuscular volume", "Средний объём эритроцита"],
    valueKind: "numeric",
  },
  {
    key: "rdw",
    area: "blood_count",
    displayLabel: "RDW",
    canonicalUnit: "%",
    acceptedUnits: ["%"],
    typicalRange: { low: 11.5, high: 14.5, unit: "%" },
    optimalRange: null,
    aliases: ["RDW", "Red cell distribution width", "Ширина распределения эритроцитов"],
    valueKind: "numeric",
  },
  {
    key: "neutrophils",
    area: "blood_count",
    displayLabel: "Neutrophils",
    canonicalUnit: "%",
    acceptedUnits: ["%", "10^3/µL"],
    typicalRange: { low: 40, high: 70, unit: "%" },
    optimalRange: null,
    aliases: ["Neutrophils", "Neut", "Нейтрофилы"],
    valueKind: "numeric",
  },
  {
    key: "lymphocytes",
    area: "blood_count",
    displayLabel: "Lymphocytes",
    canonicalUnit: "%",
    acceptedUnits: ["%", "10^3/µL"],
    typicalRange: { low: 20, high: 45, unit: "%" },
    optimalRange: null,
    aliases: ["Lymphocytes", "Lymph", "Лимфоциты"],
    valueKind: "numeric",
  },
  // ── kidney ──────────────────────────────────────────────────────────────
  {
    key: "creatinine",
    area: "kidney",
    displayLabel: "Creatinine",
    canonicalUnit: "mg/dL",
    acceptedUnits: ["mg/dL", "µmol/L"],
    // Wide unisex band (mildly sex-dependent reference).
    typicalRange: { low: 0.6, high: 1.3, unit: "mg/dL" },
    optimalRange: null,
    aliases: ["Creatinine", "Креатинин"],
    valueKind: "numeric",
  },
  {
    key: "egfr",
    area: "kidney",
    displayLabel: "eGFR",
    canonicalUnit: "mL/min/1.73m^2",
    acceptedUnits: ["mL/min/1.73m^2", "mL/min"],
    typicalRange: { low: 60, high: 120, unit: "mL/min/1.73m^2" },
    optimalRange: null,
    aliases: ["eGFR", "Estimated GFR", "Glomerular filtration rate", "СКФ", "Скорость клубочковой фильтрации"],
    valueKind: "numeric",
  },
  {
    key: "bun",
    area: "kidney",
    displayLabel: "BUN",
    canonicalUnit: "mg/dL",
    acceptedUnits: ["mg/dL", "mmol/L"],
    typicalRange: { low: 7, high: 20, unit: "mg/dL" },
    optimalRange: null,
    aliases: ["BUN", "Blood urea nitrogen", "Urea", "Мочевина", "Азот мочевины"],
    valueKind: "numeric",
  },
  {
    key: "albumin",
    area: "kidney",
    displayLabel: "Albumin",
    canonicalUnit: "g/dL",
    acceptedUnits: ["g/dL", "g/L"],
    typicalRange: { low: 3.5, high: 5.0, unit: "g/dL" },
    optimalRange: null,
    aliases: ["Albumin", "Альбумин"],
    valueKind: "numeric",
  },
  // ── liver ───────────────────────────────────────────────────────────────
  {
    key: "alt",
    area: "liver",
    displayLabel: "ALT",
    canonicalUnit: "U/L",
    acceptedUnits: ["U/L"],
    typicalRange: { low: 7, high: 55, unit: "U/L" },
    optimalRange: null,
    aliases: ["ALT", "Alanine aminotransferase", "SGPT", "АЛТ", "Аланинаминотрансфераза"],
    valueKind: "numeric",
  },
  {
    key: "ast",
    area: "liver",
    displayLabel: "AST",
    canonicalUnit: "U/L",
    acceptedUnits: ["U/L"],
    typicalRange: { low: 8, high: 48, unit: "U/L" },
    optimalRange: null,
    aliases: ["AST", "Aspartate aminotransferase", "SGOT", "АСТ", "Аспартатаминотрансфераза"],
    valueKind: "numeric",
  },
  {
    key: "ggt",
    area: "liver",
    displayLabel: "GGT",
    canonicalUnit: "U/L",
    acceptedUnits: ["U/L"],
    typicalRange: { low: 9, high: 48, unit: "U/L" },
    optimalRange: null,
    aliases: ["GGT", "Gamma-glutamyl transferase", "ГГТ", "Гамма-глутамилтрансфераза"],
    valueKind: "numeric",
  },
  {
    key: "alp",
    area: "liver",
    displayLabel: "Alkaline phosphatase",
    canonicalUnit: "U/L",
    acceptedUnits: ["U/L"],
    typicalRange: { low: 40, high: 130, unit: "U/L" },
    optimalRange: null,
    aliases: ["ALP", "Alkaline phosphatase", "Щелочная фосфатаза"],
    valueKind: "numeric",
  },
  {
    key: "bilirubin_total",
    area: "liver",
    displayLabel: "Total bilirubin",
    canonicalUnit: "mg/dL",
    acceptedUnits: ["mg/dL", "µmol/L"],
    typicalRange: { low: 0.2, high: 1.2, unit: "mg/dL" },
    optimalRange: null,
    aliases: ["Bilirubin, total", "Total bilirubin", "Билирубин общий", "Общий билирубин"],
    valueKind: "numeric",
  },
  {
    key: "total_protein",
    area: "liver",
    displayLabel: "Total protein",
    canonicalUnit: "g/dL",
    acceptedUnits: ["g/dL", "g/L"],
    typicalRange: { low: 6.0, high: 8.3, unit: "g/dL" },
    optimalRange: null,
    aliases: ["Total protein", "Protein, total", "Общий белок"],
    valueKind: "numeric",
  },
];

const CATALOG_BY_KEY: ReadonlyMap<BiomarkerKey, BiomarkerCatalogEntry> = new Map(
  BIOMARKER_CATALOG.map((entry) => [entry.key, entry]),
);

export function getBiomarkerCatalogEntry(
  key: BiomarkerKey,
): BiomarkerCatalogEntry | undefined {
  return CATALOG_BY_KEY.get(key);
}

// ---------------------------------------------------------------------------
// Shared reading-value validator
//
// Used by BOTH the extraction pipeline and the manual add/edit flows so the
// plausibility + formatting floors are enforced in exactly one place.
//
// The EN/RU unsafe-medical-language check is intentionally NOT performed here:
// packages/types cannot depend on packages/ai (packages/ai already depends on
// packages/types — importing back would create a dependency cycle). Callers in
// the service layer inject `containsUnsafeMedicalLanguage` from @health/ai via
// the optional `unsafeLanguageCheck` hook below. See the S1 report note.
// ---------------------------------------------------------------------------

/** Max length for free-text value / unit fields. */
export const MAX_BIOMARKER_VALUE_TEXT_CHARS = 40;
export const MAX_BIOMARKER_UNIT_CHARS = 40;

/** Plausibility band multiplier: a numeric value must sit within [low/20, high*20]. */
export const BIOMARKER_PLAUSIBILITY_FACTOR = 20;

/**
 * Allowlist for unit strings: letters (incl. Cyrillic via \p{L}), digits,
 * space, and the symbols % / ^ . - µ. Rejects anything that could smuggle
 * markup or free prose into a unit field.
 */
export const BIOMARKER_UNIT_ALLOWLIST = /^[\p{L}0-9 %/^.\-µ]+$/u;

export interface BiomarkerReadingValueInput {
  readonly biomarkerKey: string;
  readonly value?: number | null;
  readonly valueText?: string | null;
  readonly unit: string;
  /**
   * Optional injected EN/RU unsafe-medical-language check (from @health/ai).
   * When provided, it runs over the unit and any valueText. Omitted in pure
   * type-layer tests; supplied by the service layer.
   */
  readonly unsafeLanguageCheck?: (text: string) => boolean;
}

export function validateBiomarkerReadingValue(
  input: BiomarkerReadingValueInput,
): string[] {
  const errors: string[] = [];
  const entry = getBiomarkerCatalogEntry(input.biomarkerKey as BiomarkerKey);

  if (!entry) {
    errors.push(`biomarkerKey: Unknown biomarker key "${input.biomarkerKey}".`);
    return errors;
  }

  const hasValue = input.value !== undefined && input.value !== null;
  const hasValueText =
    input.valueText !== undefined &&
    input.valueText !== null &&
    input.valueText.trim().length > 0;

  if (hasValue === hasValueText) {
    errors.push("value: Provide exactly one of value or valueText.");
  }

  if (hasValue) {
    if (!Number.isFinite(input.value)) {
      errors.push("value: Numeric value must be finite.");
    } else if (entry.typicalRange) {
      const { low, high } = entry.typicalRange;
      const floor = low / BIOMARKER_PLAUSIBILITY_FACTOR;
      const ceil = high * BIOMARKER_PLAUSIBILITY_FACTOR;

      if (input.value! < floor || input.value! > ceil) {
        errors.push(
          `value: ${input.value} is outside the plausible band [${floor}, ${ceil}] for ${entry.displayLabel}.`,
        );
      }
    }
  }

  if (hasValueText) {
    if (entry.valueKind !== "qualitative") {
      errors.push(
        `valueText: ${entry.displayLabel} expects a numeric value, not free text.`,
      );
    }

    if (input.valueText!.length > MAX_BIOMARKER_VALUE_TEXT_CHARS) {
      errors.push(
        `valueText: Must be ${MAX_BIOMARKER_VALUE_TEXT_CHARS} characters or fewer.`,
      );
    }

    if (input.unsafeLanguageCheck?.(input.valueText!)) {
      errors.push("valueText: Contains wording that may imply diagnosis or treatment.");
    }
  }

  const unit = input.unit.trim();

  if (unit.length === 0) {
    errors.push("unit: Unit is required.");
  } else {
    if (unit.length > MAX_BIOMARKER_UNIT_CHARS) {
      errors.push(`unit: Must be ${MAX_BIOMARKER_UNIT_CHARS} characters or fewer.`);
    }

    if (!BIOMARKER_UNIT_ALLOWLIST.test(unit)) {
      errors.push("unit: Contains characters that are not allowed.");
    }

    if (input.unsafeLanguageCheck?.(unit)) {
      errors.push("unit: Contains wording that may imply diagnosis or treatment.");
    }
  }

  return errors;
}
