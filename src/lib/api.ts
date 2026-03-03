import { supabase } from './supabase'
import type { Case, CaseItem, Company, Category, FeeRate, FeeRateMap, AppSettings } from './types'

// ── Categories ─────────────────────────────────────────
export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order')
  if (error) throw error
  return data
}

export async function saveCategories(categories: Category[]): Promise<void> {
  // 全削除して再挿入
  const { error: delError } = await supabase
    .from('categories')
    .delete()
    .neq('id', '__dummy__')
  if (delError) throw delError

  if (categories.length === 0) return

  const { error } = await supabase
    .from('categories')
    .insert(categories.map((c, i) => ({ ...c, sort_order: i })))
  if (error) throw error
}

// ── Companies ──────────────────────────────────────────
export async function getCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .order('sort_order')
  if (error) throw error
  return data
}

export async function saveCompanies(companies: Company[]): Promise<void> {
  const { error: delError } = await supabase
    .from('companies')
    .delete()
    .neq('id', '__dummy__')
  if (delError) throw delError

  if (companies.length === 0) return

  const { error } = await supabase
    .from('companies')
    .insert(companies.map((c, i) => ({ ...c, sort_order: i })))
  if (error) throw error
}

// ── Fee Rates ──────────────────────────────────────────
export async function getFeeRates(): Promise<FeeRateMap> {
  const { data, error } = await supabase
    .from('fee_rates')
    .select('*')
  if (error) throw error

  const map: FeeRateMap = {}
  for (const row of data as FeeRate[]) {
    if (!map[row.company_id]) map[row.company_id] = {}
    map[row.company_id][row.category_id] = row.rate
  }
  return map
}

export async function saveFeeRates(feeRates: FeeRateMap): Promise<void> {
  const { error: delError } = await supabase
    .from('fee_rates')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
  if (delError) throw delError

  const rows = []
  for (const company_id of Object.keys(feeRates)) {
    for (const category_id of Object.keys(feeRates[company_id])) {
      rows.push({ company_id, category_id, rate: feeRates[company_id][category_id] })
    }
  }
  if (rows.length === 0) return

  const { error } = await supabase.from('fee_rates').insert(rows)
  if (error) throw error
}

// ── Cases ──────────────────────────────────────────────
export async function getCases(): Promise<Case[]> {
  const { data, error } = await supabase
    .from('cases')
    .select(`*, items:case_items(*)`)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createCase(
  c: Omit<Case, 'id' | 'created_at' | 'updated_at'>,
  items: Omit<CaseItem, 'id' | 'case_id' | 'created_at'>[]
): Promise<Case> {
  const { data, error } = await supabase
    .from('cases')
    .insert({
      company_name: c.company_name,
      referral_to: c.referral_to,
      status: c.status,
      contracted_at: c.contracted_at || null,
      notes: c.notes,
    })
    .select()
    .single()
  if (error) throw error

  if (items.length > 0) {
    const { error: itemError } = await supabase
      .from('case_items')
      .insert(items.map((it, i) => ({ ...it, case_id: data.id, sort_order: i })))
    if (itemError) throw itemError
  }

  return { ...data, items: [] }
}

export async function updateCase(
  id: string,
  c: Partial<Omit<Case, 'id' | 'created_at' | 'updated_at'>>,
  items?: Omit<CaseItem, 'id' | 'case_id' | 'created_at'>[]
): Promise<void> {
  const { error } = await supabase
    .from('cases')
    .update({
      company_name: c.company_name,
      referral_to: c.referral_to,
      status: c.status,
      contracted_at: c.contracted_at || null,
      notes: c.notes,
    })
    .eq('id', id)
  if (error) throw error

  if (items !== undefined) {
    const { error: delError } = await supabase
      .from('case_items')
      .delete()
      .eq('case_id', id)
    if (delError) throw delError

    if (items.length > 0) {
      const { error: itemError } = await supabase
        .from('case_items')
        .insert(items.map((it, i) => ({ ...it, case_id: id, sort_order: i })))
      if (itemError) throw itemError
    }
  }
}

export async function bulkUpdateStatus(ids: string[], status: string): Promise<void> {
  const { error } = await supabase
    .from('cases')
    .update({ status })
    .in('id', ids)
  if (error) throw error
}

// ── App Settings ───────────────────────────────────────
export async function getAppSettings(): Promise<AppSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function saveAppSettings(settings: Partial<AppSettings>): Promise<void> {
  const { error } = await supabase
    .from('app_settings')
    .update(settings)
    .eq('id', 1)
  if (error) throw error
}
// ── Delete / Restore Cases ─────────────────────────────
export async function deleteCase(id: string): Promise<void> {
  const { error } = await supabase
    .from('cases')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function restoreCase(id: string): Promise<void> {
  const { error } = await supabase
    .from('cases')
    .update({ deleted_at: null })
    .eq('id', id)
  if (error) throw error
}