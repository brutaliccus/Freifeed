/**
 * WHO (0–24 mo) + CDC (24+ mo) growth percentiles via embedded LMS tables
 * (sourced from WHO Child Growth Standards / CDC Growth Charts).
 */

import wfaBoys05 from '../data/growth/wfa_boys_0_5_zscores.json'
import wfaGirls05 from '../data/growth/wfa_girls_0_5_zscores.json'
import lhfaBoys05 from '../data/growth/lhfa_boys_0_5_zscores.json'
import lhfaGirls05 from '../data/growth/lhfa_girls_0_5_zscores.json'
import hcfaBoys05 from '../data/growth/hcfa_boys_0_5_zscores.json'
import hcfaGirls05 from '../data/growth/hcfa_girls_0_5_zscores.json'
import wfaBoys220 from '../data/growth/wfa_boys_2_20_zscores.cdc.json'
import wfaGirls220 from '../data/growth/wfa_girls_2_20_zscores.cdc.json'
import lhfaBoys220 from '../data/growth/lhfa_boys_2_20_zscores.cdc.json'
import lhfaGirls220 from '../data/growth/lhfa_girls_2_20_zscores.cdc.json'
import type { BabySex } from '../types'
import { parseDayLocal } from './time'

type LmsRow = { L: string; M: string; S: string }
type LmsTable = Record<string, LmsRow>

const TABLES = {
  wfa_boys_0_5: indexByMonth(wfaBoys05 as Array<LmsRow & { Month: string }>),
  wfa_girls_0_5: indexByMonth(wfaGirls05 as Array<LmsRow & { Month: string }>),
  lhfa_boys_0_5: indexByMonth(lhfaBoys05 as Array<LmsRow & { Month: string }>),
  lhfa_girls_0_5: indexByMonth(lhfaGirls05 as Array<LmsRow & { Month: string }>),
  hcfa_boys_0_5: indexByMonth(hcfaBoys05 as Array<LmsRow & { Month: string }>),
  hcfa_girls_0_5: indexByMonth(hcfaGirls05 as Array<LmsRow & { Month: string }>),
  wfa_boys_2_20: indexByMonth(wfaBoys220 as Array<LmsRow & { Month: string }>),
  wfa_girls_2_20: indexByMonth(wfaGirls220 as Array<LmsRow & { Month: string }>),
  lhfa_boys_2_20: indexByMonth(lhfaBoys220 as Array<LmsRow & { Month: string }>),
  lhfa_girls_2_20: indexByMonth(lhfaGirls220 as Array<LmsRow & { Month: string }>),
}

function indexByMonth(rows: Array<LmsRow & { Month: string }>): LmsTable {
  const out: LmsTable = {}
  for (const row of rows) {
    out[row.Month] = { L: row.L, M: row.M, S: row.S }
  }
  return out
}

function tableMaxMonth(table: LmsTable): number {
  let max = 0
  for (const key of Object.keys(table)) {
    const month = Number(key)
    if (!Number.isNaN(month)) max = Math.max(max, month)
  }
  return max
}

/** Standard normal CDF (Abramowitz & Stegun). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp((-z * z) / 2)
  const p =
    d *
    t *
    (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return z > 0 ? 1 - p : p
}

function lmsZScore(value: number, L: number, M: number, S: number): number {
  if (L === 0) return Math.log(value / M) / S
  return (Math.pow(value / M, L) - 1) / (L * S)
}

function lookupLms(table: LmsTable, ageMonths: number): LmsRow | null {
  const maxMonth = tableMaxMonth(table)
  const month = Math.min(maxMonth, Math.max(0, Math.floor(ageMonths)))
  return table[String(month)] ?? null
}

function tableFor(
  indicator: 'weight' | 'length' | 'headCirc',
  sex: BabySex,
  ageMonths: number,
): LmsTable | null {
  const isBoy = sex === 'male'
  const useCdc = ageMonths >= 24
  if (indicator === 'weight') {
    if (useCdc) return isBoy ? TABLES.wfa_boys_2_20 : TABLES.wfa_girls_2_20
    return isBoy ? TABLES.wfa_boys_0_5 : TABLES.wfa_girls_0_5
  }
  if (indicator === 'length') {
    if (useCdc) return isBoy ? TABLES.lhfa_boys_2_20 : TABLES.lhfa_girls_2_20
    return isBoy ? TABLES.lhfa_boys_0_5 : TABLES.lhfa_girls_0_5
  }
  if (indicator === 'headCirc') {
    if (ageMonths >= 60) return null
    return isBoy ? TABLES.hcfa_boys_0_5 : TABLES.hcfa_girls_0_5
  }
  return null
}

export function ageInMonthsAt(birthDate: string, at: Date): number | null {
  const birth = parseDayLocal(birthDate)
  if (Number.isNaN(birth.getTime())) return null
  const ms = at.getTime() - birth.getTime()
  if (ms < 0) return null
  return ms / (1000 * 60 * 60 * 24 * 30.4375)
}

export function lengthHeightLabel(ageMonths: number): 'Length' | 'Height' {
  return ageMonths >= 24 ? 'Height' : 'Length'
}

export function formatPercentileLabel(percentile: number): string {
  return `${percentile} Percentile`
}

export function formatWeightLbOz(lb: number | null, oz: number | null): string | null {
  if (lb == null && oz == null) return null
  const totalLb = (lb ?? 0) + (oz ?? 0) / 16
  if (totalLb < 1) return `${Math.round((oz ?? 0) * 10) / 10} oz`
  const whole = Math.floor(totalLb)
  const remOz = Math.round((totalLb - whole) * 16)
  if (remOz === 0) return `${whole} lb`
  return `${whole} lb ${remOz} oz`
}

export function formatInches(inches: number | null): string | null {
  if (inches == null) return null
  return `${Math.round(inches * 10) / 10}"`
}

function lbOzToKg(lb: number | null, oz: number | null): number | null {
  if (lb == null && oz == null) return null
  const totalLb = (lb ?? 0) + (oz ?? 0) / 16
  return totalLb * 0.45359237
}

function inchesToCm(inches: number): number {
  return inches * 2.54
}

export interface PercentileResult {
  percentile: number
  label: string
}

export function growthPercentile(
  indicator: 'weight' | 'length' | 'headCirc',
  value: number,
  birthDate: string | null,
  sex: BabySex | null,
  measuredAt: Date,
): PercentileResult | null {
  if (!birthDate || !sex) return null
  const ageMonths = ageInMonthsAt(birthDate, measuredAt)
  if (ageMonths == null || ageMonths > 240) return null

  const table = tableFor(indicator, sex, ageMonths)
  if (!table) return null

  const lms = lookupLms(table, ageMonths)
  if (!lms) return null

  const L = parseFloat(lms.L)
  const M = parseFloat(lms.M)
  const S = parseFloat(lms.S)
  if (!Number.isFinite(L) || !Number.isFinite(M) || !Number.isFinite(S) || M <= 0 || S <= 0) {
    return null
  }

  const z = lmsZScore(value, L, M, S)
  if (!Number.isFinite(z)) return null

  const pct = Math.round(normalCdf(z) * 100)
  const percentile = Math.min(99, Math.max(1, pct))
  return { percentile, label: formatPercentileLabel(percentile) }
}

export function weightPercentile(
  weightLb: number | null,
  weightOz: number | null,
  birthDate: string | null,
  sex: BabySex | null,
  measuredAt: Date,
): PercentileResult | null {
  const kg = lbOzToKg(weightLb, weightOz)
  if (kg == null || kg <= 0) return null
  return growthPercentile('weight', kg, birthDate, sex, measuredAt)
}

export function lengthPercentile(
  lengthIn: number | null,
  birthDate: string | null,
  sex: BabySex | null,
  measuredAt: Date,
): PercentileResult | null {
  if (lengthIn == null || lengthIn <= 0) return null
  return growthPercentile('length', inchesToCm(lengthIn), birthDate, sex, measuredAt)
}

export function headCircPercentile(
  headCircIn: number | null,
  birthDate: string | null,
  sex: BabySex | null,
  measuredAt: Date,
): PercentileResult | null {
  if (headCircIn == null || headCircIn <= 0) return null
  return growthPercentile('headCirc', inchesToCm(headCircIn), birthDate, sex, measuredAt)
}

export function profilePercentileHint(baby: {
  birthDate: string | null
  sex: BabySex | null
}): string | null {
  if (!baby.birthDate && !baby.sex) return 'Set birth date & sex in Profile'
  if (!baby.birthDate) return 'Set birth date in Profile'
  if (!baby.sex) return 'Set sex in Profile'
  return null
}
