import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import React from 'react'

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#111827' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold', letterSpacing: 2 },
  meta: { fontSize: 9, color: '#6b7280', marginTop: 4 },
  issuer: { alignItems: 'flex-end' },
  issuerName: { fontSize: 12, fontWeight: 'bold' },
  issuerDetail: { fontSize: 9, color: '#6b7280', marginTop: 2 },
  hr: { borderBottomWidth: 2, borderBottomColor: '#111827', marginVertical: 16 },
  billLabel: { fontSize: 8, fontWeight: 'bold', color: '#9ca3af', marginBottom: 4, letterSpacing: 1 },
  billName: { fontSize: 16, fontWeight: 'bold' },
  billContact: { fontSize: 10, color: '#374151', marginTop: 2 },
  dates: { flexDirection: 'row', gap: 24, marginVertical: 16 },
  dateItem: { marginRight: 24 },
  dateLabel: { fontSize: 8, fontWeight: 'bold', color: '#9ca3af', letterSpacing: 1, marginBottom: 2 },
  dateValue: { fontSize: 10, fontWeight: 'bold' },
  table: { marginBottom: 16 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f9fafb', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingVertical: 6, paddingHorizontal: 8 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f9fafb', paddingVertical: 8, paddingHorizontal: 8 },
  colItem: { flex: 2, fontSize: 9, fontWeight: 'bold', color: '#6b7280' },
  colSummary: { flex: 3, fontSize: 9, fontWeight: 'bold', color: '#6b7280' },
  colAmount: { flex: 1, fontSize: 9, fontWeight: 'bold', color: '#6b7280', textAlign: 'right' },
  colItemVal: { flex: 2, fontSize: 9 },
  colSummaryVal: { flex: 3, fontSize: 9, color: '#6b7280' },
  colAmountVal: { flex: 1, fontSize: 9, textAlign: 'right' },
  totals: { alignItems: 'flex-end', marginBottom: 16 },
  totalRow: { flexDirection: 'row', gap: 32, marginBottom: 3 },
  totalLabel: { fontSize: 9, color: '#6b7280', width: 100, textAlign: 'right' },
  totalValue: { fontSize: 9, width: 80, textAlign: 'right' },
  grandTotalRow: { flexDirection: 'row', borderTopWidth: 2, borderTopColor: '#111827', paddingTop: 6, marginTop: 4 },
  grandTotalLabel: { fontSize: 12, fontWeight: 'bold', width: 100, textAlign: 'right' },
  grandTotalValue: { fontSize: 12, fontWeight: 'bold', width: 80, textAlign: 'right' },
  notes: { borderWidth: 1, borderColor: '#e5e7eb', padding: 12, borderRadius: 4, marginBottom: 16 },
  notesLabel: { fontSize: 8, fontWeight: 'bold', color: '#9ca3af', marginBottom: 4, letterSpacing: 1 },
  notesText: { fontSize: 9, color: '#374151' },
  bank: { backgroundColor: '#f9fafb', padding: 12, borderRadius: 4 },
  bankLabel: { fontSize: 8, fontWeight: 'bold', color: '#9ca3af', marginBottom: 4, letterSpacing: 1 },
  bankText: { fontSize: 9, color: '#374151' },
})

function fmt(v: number) {
  return '¥' + v.toLocaleString('ja-JP')
}

function fmtDate(d: string) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${y}/${m}/${day}`
}

function addMonth(d: string) {
  const dt = new Date(d)
  dt.setMonth(dt.getMonth() + 1)
  return dt.toISOString().slice(0, 10)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { invoiceNo, issueDate, month, co, lines, notes, settings } = body

    const monthLabel = `${month.slice(0, 4)}年${parseInt(month.slice(5))}月`
    const dueDate = addMonth(issueDate)
    const subtotal = lines.reduce((s: number, l: any) => s + (Number(l.amount) || 0), 0)
    const tax = Math.floor(subtotal * 0.1)
    const total = subtotal + tax

    const doc = React.createElement(Document, {},
      React.createElement(Page, { size: 'A4', style: styles.page },
        // ヘッダー
        React.createElement(View, { style: styles.header },
          React.createElement(View, {},
            React.createElement(Text, { style: styles.title }, '請求書'),
            React.createElement(Text, { style: styles.meta }, `No. ${invoiceNo || '—'}　発行日：${fmtDate(issueDate)}　対象月：${monthLabel}`),
          ),
          React.createElement(View, { style: styles.issuer },
            React.createElement(Text, { style: styles.issuerName }, settings.company_name || '（発行会社未設定）'),
            settings.company_zip && React.createElement(Text, { style: styles.issuerDetail }, `〒${settings.company_zip} ${settings.company_addr}`),
            settings.invoice_tax_id && React.createElement(Text, { style: styles.issuerDetail }, `登録番号：${settings.invoice_tax_id}`),
          ),
        ),
        // 区切り線
        React.createElement(View, { style: styles.hr }),
        // 請求先
        React.createElement(View, { style: { marginBottom: 8 } },
          React.createElement(Text, { style: styles.billLabel }, '請求先'),
          React.createElement(Text, { style: styles.billName }, `${co?.bill_company || '（未設定）'} 御中`),
          co?.bill_contact && React.createElement(Text, { style: styles.billContact }, `${co.bill_contact} 様`),
          co?.tax_id && React.createElement(Text, { style: { fontSize: 8, color: '#9ca3af', marginTop: 2 } }, `登録番号：${co.tax_id}`),
        ),
        // 日付
        React.createElement(View, { style: styles.dates },
          React.createElement(View, { style: styles.dateItem },
            React.createElement(Text, { style: styles.dateLabel }, '対象月'),
            React.createElement(Text, { style: styles.dateValue }, monthLabel),
          ),
          React.createElement(View, { style: styles.dateItem },
            React.createElement(Text, { style: styles.dateLabel }, '支払期限'),
            React.createElement(Text, { style: styles.dateValue }, fmtDate(dueDate)),
          ),
        ),
        // 明細テーブル
        React.createElement(View, { style: styles.table },
          React.createElement(View, { style: styles.tableHeader },
            React.createElement(Text, { style: styles.colItem }, '項目'),
            React.createElement(Text, { style: styles.colSummary }, '摘要'),
            React.createElement(Text, { style: styles.colAmount }, '金額（税抜）'),
          ),
          ...lines.map((l: any, i: number) =>
            React.createElement(View, { key: i, style: styles.tableRow },
              React.createElement(Text, { style: styles.colItemVal }, l.item || '紹介手数料'),
              React.createElement(Text, { style: styles.colSummaryVal }, l.summary || l.company_name),
              React.createElement(Text, { style: styles.colAmountVal }, fmt(Number(l.amount) || 0)),
            )
          ),
        ),
        // 合計
        React.createElement(View, { style: styles.totals },
          React.createElement(View, { style: styles.totalRow },
            React.createElement(Text, { style: styles.totalLabel }, '小計'),
            React.createElement(Text, { style: styles.totalValue }, fmt(subtotal)),
          ),
          React.createElement(View, { style: styles.totalRow },
            React.createElement(Text, { style: styles.totalLabel }, '消費税（10%）'),
            React.createElement(Text, { style: styles.totalValue }, fmt(tax)),
          ),
          React.createElement(View, { style: styles.grandTotalRow },
            React.createElement(Text, { style: styles.grandTotalLabel }, '合計'),
            React.createElement(Text, { style: styles.grandTotalValue }, fmt(total)),
          ),
        ),
        // 備考
        notes ? React.createElement(View, { style: styles.notes },
          React.createElement(Text, { style: styles.notesLabel }, '備考'),
          React.createElement(Text, { style: styles.notesText }, notes),
        ) : null,
        // 振込先
        settings.bank_info ? React.createElement(View, { style: styles.bank },
          React.createElement(Text, { style: styles.bankLabel }, 'お振込先'),
          React.createElement(Text, { style: styles.bankText }, settings.bank_info),
        ) : null,
      )
    )

    const buffer = await renderToBuffer(doc)

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice_${month}.pdf"`,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}