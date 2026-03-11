export type Status = 'estimate' | 'prospect70' | 'contracted' | 'invoiced' | 'lost'

export type Category = {
  id: string
  label: string
  sort_order: number
}

export type Company = {
  id: string
  label: string
  color: string
  bill_company: string
  bill_contact: string
  tax_id: string
  sort_order: number
  issuer_id: number
}

export type FeeRate = {
  id: string
  company_id: string
  category_id: string
  rate: number
}

export type CaseItem = {
  id: string
  case_id: string
  category_id: string
  contract_amount: number | null
  sort_order: number
}

export type Case = {
  id: string
  company_name: string
  referral_to: string
  status: Status
  contracted_at: string | null
  notes: string
  created_at: string
  updated_at: string
  items?: CaseItem[]
}

export type AppSettings = {
  id: number
  company_name: string
  company_zip: string
  company_addr: string
  bank_info: string
  invoice_tax_id: string
  stamp_image: string
}

export type Issuer = AppSettings

// 手数料率をネストした形式（UI用）
export type FeeRateMap = {
  [company_id: string]: {
    [category_id: string]: number
  }
}