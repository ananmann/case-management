'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  getCategories, saveCategories,
  getCompanies, saveCompanies,
  getFeeRates, saveFeeRates,
  getCases, createCase, updateCase, bulkUpdateStatus,
  getAppSettings, saveAppSettings,
  deleteCase, restoreCase,
} from '@/lib/api'
import type { Case, CaseItem, Company, Category, FeeRateMap, AppSettings } from '@/lib/types'

// ── Constants ──────────────────────────────────────────


const STATUS_LIST = [
  { id:"estimate",   label:"見積",        bg:"#f3f4f6", text:"#374151", dot:"#9ca3af" },
  { id:"prospect70", label:"成約70%",     bg:"#eff6ff", text:"#1d4ed8", dot:"#60a5fa" },
  { id:"contracted", label:"成約",        bg:"#ecfdf5", text:"#065f46", dot:"#10b981" },
  { id:"invoiced",   label:"請求書送付済", bg:"#f5f3ff", text:"#5b21b6", dot:"#8b5cf6" },
  { id:"lost",       label:"失注",        bg:"#fef2f2", text:"#991b1b", dot:"#f87171" },
];
const STATUS_MAP = Object.fromEntries(STATUS_LIST.map(s=>[s.id,s]));
const PALETTE = ["#3b82f6","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444"];









const MONTHS = Array.from({length:12},(_,i)=>{
  const d = new Date(); d.setMonth(d.getMonth()-11+i);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
});
const MONTH_LABELS = Object.fromEntries(MONTHS.map(m=>[m,`${m.slice(0,4)}年${String(parseInt(m.slice(5)))}月`]));
const MONTH_SHORT  = Object.fromEntries(MONTHS.map(m=>[m,`${String(parseInt(m.slice(5)))}月`]));

// ── Helpers ────────────────────────────────────────────
const fmt      = (v: any) => (v!=null&&v!==""&&!isNaN(v)) ? "¥"+Number(v).toLocaleString() : "—";
const today    = () => new Date().toISOString().slice(0,10);
const addMonth = (d: string) => { const dt=new Date(d); dt.setMonth(dt.getMonth()+1); return dt.toISOString().slice(0,10); };
const fmtDate  = (d: string|null) => { if(!d)return "—"; const [y,m,day]=d.split("-"); return `${y}/${m}/${day}`; };

function calcFeeAmount(contractAmount: number|null, companyId: string, categoryId: string, feeRates: FeeRateMap) {
  const rate = feeRates?.[companyId]?.[categoryId];
  if(!rate || !contractAmount) return "";
  return Math.floor(Number(contractAmount) * rate / 100);
}

// 案件の総成約金額（items合計）
function totalContractAmount(c) {
  return (c.items||[]).reduce((s,it)=>s+(Number(it.contract_amount)||0), 0);
}

// ── Shared styles ──────────────────────────────────────
const inp = { width:"100%", padding:"8px 10px", borderRadius:"6px", border:"1px solid #e5e7eb", fontSize:"14px", color:"#111827", background:"#fff", boxSizing:"border-box", outline:"none", fontFamily:"inherit" };
const lbl = { display:"block", fontSize:"11px", fontWeight:600, color:"#9ca3af", marginBottom:"5px", letterSpacing:"0.05em" };
function Field({ label, children, half }) { return <div style={half?{flex:"1 1 140px"}:{}}><label style={lbl}>{label}</label>{children}</div>; }
function Row({ children }) { return <div style={{display:"flex",gap:"12px",flexWrap:"wrap"}}>{children}</div>; }
function SectionLabel({ children }) {
  return <div style={{fontSize:"11px",fontWeight:700,color:"#9ca3af",letterSpacing:"0.06em",borderBottom:"1px solid #f3f4f6",paddingBottom:"6px",marginBottom:"10px"}}>{children}</div>;
}
function PillToggle({ options, value, onChange }) {
  return (
    <div style={{display:"inline-flex",background:"#f3f4f6",borderRadius:"8px",padding:"3px",gap:"2px"}}>
      {options.map(([k,v])=>(
        <button key={k} onClick={()=>onChange(k)}
          style={{padding:"5px 12px",borderRadius:"6px",border:"none",fontSize:"12px",fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",
            background:value===k?"#fff":"transparent",color:value===k?"#111827":"#9ca3af",
            boxShadow:value===k?"0 1px 3px rgba(0,0,0,0.08)":"none",transition:"all 0.15s"}}>
          {v}
        </button>
      ))}
    </div>
  );
}

// ── Modal shell ────────────────────────────────────────
function Overlay({children}){return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.35)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px",overflowY:"auto"}}>{children}</div>;}
function ModalBox({children,maxWidth="480px"}){return <div style={{background:"#fff",borderRadius:"12px",width:"100%",maxWidth,boxShadow:"0 8px 40px rgba(0,0,0,0.15)",display:"flex",flexDirection:"column",gap:"16px",padding:"24px 0 20px",maxHeight:"92vh",overflowY:"auto",margin:"auto"}}>{children}</div>;}
function ModalHeader({title,sub}){return <div style={{padding:"0 24px"}}><h2 style={{margin:0,fontSize:"16px",fontWeight:700,color:"#111827"}}>{title}</h2>{sub&&<p style={{margin:"3px 0 0",fontSize:"12px",color:"#9ca3af"}}>{sub}</p>}</div>;}
function ModalFooter({onClose,onSave,saveLabel,extra}){
  return (
    <div style={{padding:"4px 24px 0",display:"flex",gap:"8px",justifyContent:"flex-end",alignItems:"center"}}>
      {extra}
      <button onClick={onClose} style={{padding:"8px 18px",borderRadius:"7px",border:"1px solid #e5e7eb",background:"#fff",color:"#6b7280",fontWeight:600,cursor:"pointer",fontSize:"13px"}}>キャンセル</button>
      <button onClick={onSave}  style={{padding:"8px 20px",borderRadius:"7px",border:"none",background:"#111827",color:"#fff",fontWeight:600,cursor:"pointer",fontSize:"13px"}}>{saveLabel}</button>
    </div>
  );
}

// ── Invoice HTML ───────────────────────────────────────
function buildInvoiceHTML({invoiceNo,issueDate,month,co,lines,notes,settings}){
  const dueDate  = addMonth(issueDate);
  const subtotal = lines.reduce((s,l)=>s+(Number(l.amount)||0),0);
  const tax      = Math.floor(subtotal*0.1);
  const total    = subtotal+tax;
  const billTaxId = co?.tax_id ? `<div class="itax">登録番号：${co.tax_id}</div>` : "";
  const stampHTML = settings.stamp_image
    ? `<img src="${settings.stamp_image}" style="width:72px;height:72px;object-fit:contain;opacity:0.85;"/>`
    : `<div style="width:72px;height:72px;border:1.5px solid #d1d5db;border-radius:4px;"></div>`;
  const rows = lines.map(l=>`<tr><td>${l.item||"紹介手数料"}</td><td style="color:#6b7280">${l.summary||l.company_name}</td><td class="r">¥${Number(l.amount||0).toLocaleString()}</td></tr>`).join("");

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Hiragino Sans','Noto Sans JP',sans-serif;color:#111827;background:#fff;padding:52px 56px;font-size:13px;line-height:1.7;}
.top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px;}
h1{font-size:28px;font-weight:700;letter-spacing:.1em;}
.meta{font-size:12px;color:#6b7280;margin-top:4px;}
.issuer{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:6px;}
.iname{font-size:15px;font-weight:700;}.idetail{font-size:12px;color:#6b7280;line-height:1.8;margin-top:2px;}.itax{font-size:11px;color:#9ca3af;margin-top:3px;}
hr{border:none;border-top:2px solid #111827;margin:20px 0 22px;}
.bill .bl{font-size:10px;font-weight:700;color:#9ca3af;letter-spacing:.07em;margin-bottom:5px;}.bill .bn{font-size:19px;font-weight:700;}.bill .bc{font-size:13px;color:#374151;margin-top:2px;}
.bill .btax{font-size:11px;color:#9ca3af;margin-top:3px;}
.dates{display:flex;gap:28px;margin:22px 0 28px;}
.di .dl{font-size:10px;font-weight:700;color:#9ca3af;letter-spacing:.06em;margin-bottom:2px;}.di .dv{font-size:13px;font-weight:600;}
table{width:100%;border-collapse:collapse;margin-bottom:20px;}
th{background:#f9fafb;border-bottom:1px solid #e5e7eb;padding:9px 14px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.04em;}
td{padding:11px 14px;border-bottom:1px solid #f9fafb;font-size:13px;vertical-align:top;}td.r{text-align:right;white-space:nowrap;}
.totals{margin-left:auto;width:240px;}.totals td{border:none;padding:5px 0;font-size:13px;}.trow td{font-size:16px;font-weight:700;border-top:2px solid #111827;padding-top:10px;}
.bank{margin-top:28px;padding:16px 20px;background:#f9fafb;border-radius:8px;font-size:12px;color:#374151;}.bklabel{font-size:10px;font-weight:700;color:#9ca3af;letter-spacing:.06em;margin-bottom:6px;}
.notes-box{margin-top:20px;padding:14px 18px;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;color:#374151;}.notes-label{font-size:10px;font-weight:700;color:#9ca3af;letter-spacing:.06em;margin-bottom:5px;}
</style></head><body>
<div class="top">
  <div><h1>請求書</h1><div class="meta">No. ${invoiceNo||"—"}　発行日：${fmtDate(issueDate)}　対象月：${MONTH_LABELS[month]||month}</div></div>
  <div class="issuer">
    <div><div class="iname">${settings.company_name||"（発行会社未設定）"}</div>
    <div class="idetail">${settings.company_zip&&settings.company_addr?`〒${settings.company_zip} ${settings.company_addr}`:""}</div>
    ${settings.invoice_tax_id?`<div class="itax">登録番号：${settings.invoice_tax_id}</div>`:""}</div>
    <div>${stampHTML}</div>
  </div>
</div>
<hr/>
<div class="bill">
  <div class="bl">請求先</div>
  <div class="bn">${co?.bill_company||"（未設定）"} 御中</div>
  ${co?.bill_contact?`<div class="bc">${co.bill_contact} 様</div>`:""}
  ${billTaxId}
</div>
<div class="dates">
  <div class="di"><div class="dl">対象月</div><div class="dv">${MONTH_LABELS[month]||month}</div></div>
  <div class="di"><div class="dl">支払期限</div><div class="dv">${fmtDate(dueDate)}</div></div>
</div>
<table><thead><tr><th>項目</th><th>摘要</th><th style="text-align:right;width:150px">金額（税抜）</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="totals"><table>
  <tr><td style="color:#6b7280">小計</td><td style="text-align:right">¥${subtotal.toLocaleString()}</td></tr>
  <tr><td style="color:#6b7280">消費税（10%）</td><td style="text-align:right">¥${tax.toLocaleString()}</td></tr>
  <tr class="trow"><td>合計</td><td style="text-align:right">¥${total.toLocaleString()}</td></tr>
</table></div>
${notes?`<div class="notes-box"><div class="notes-label">備考</div>${notes.replace(/\n/g,"<br>")}</div>`:""}
${settings.bank_info?`<div class="bank"><div class="bklabel">お振込先</div>${settings.bank_info.replace(/\n/g,"<br>")}</div>`:""}
</body></html>`;
}

// ── Bulk Status Update Dialog ──────────────────────────
function BulkStatusDialog({ caseNames, onConfirm, onSkip }) {
  return (
    <Overlay>
      <ModalBox maxWidth="420px">
        <ModalHeader title="ステータスを一括変更" sub="請求書ダウンロード完了"/>
        <div style={{padding:"0 24px",display:"flex",flexDirection:"column",gap:"12px"}}>
          <div style={{padding:"12px 14px",background:"#f5f3ff",borderRadius:"8px",border:"1px solid #ddd6fe"}}>
            <div style={{fontSize:"11px",fontWeight:700,color:"#7c3aed",marginBottom:"8px",letterSpacing:"0.04em"}}>対象案件</div>
            {caseNames.map((n,i)=>(
              <div key={i} style={{fontSize:"13px",color:"#374151",padding:"3px 0",display:"flex",alignItems:"center",gap:"6px"}}>
                <span style={{width:"5px",height:"5px",borderRadius:"50%",background:"#8b5cf6",flexShrink:0,display:"inline-block"}}/>
                {n}
              </div>
            ))}
          </div>
          <p style={{fontSize:"13px",color:"#374151",lineHeight:1.6}}>
            上記の案件のステータスを<strong>「請求書送付済」</strong>に変更しますか？
          </p>
        </div>
        <div style={{padding:"4px 24px 0",display:"flex",gap:"8px",justifyContent:"flex-end"}}>
          <button onClick={onSkip}    style={{padding:"8px 18px",borderRadius:"7px",border:"1px solid #e5e7eb",background:"#fff",color:"#6b7280",fontWeight:600,cursor:"pointer",fontSize:"13px"}}>変更しない</button>
          <button onClick={onConfirm} style={{padding:"8px 20px",borderRadius:"7px",border:"none",background:"#5b21b6",color:"#fff",fontWeight:600,cursor:"pointer",fontSize:"13px"}}>一括変更する</button>
        </div>
      </ModalBox>
    </Overlay>
  );
}

// ── Monthly Invoice Modal ──────────────────────────────
function MonthlyInvoiceModal({ cases, companies, categories, settings, feeRates, onClose, onBulkStatusChange }) {
  const [step,        setStep]        = useState(1);
  const [selMonth,    setSelMonth]    = useState(MONTHS[MONTHS.length-1]);
  const [selCompany,  setSelCompany]  = useState(companies[0]?.id||"");
  const [invoiceNo,   setInvoiceNo]   = useState("");
  const [issueDate,   setIssueDate]   = useState(today());
  const [notes,       setNotes]       = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [lines,       setLines]       = useState([]);
  const [showBulk,    setShowBulk]    = useState(false);

  const co = companies.find(c=>c.id===selCompany);

  // 成約案件を items×カテゴリで明細行に展開
  function buildLines() {
    const targets = cases.filter(c =>
      c.referral_to===selCompany && c.status==="contracted" && c.contracted_at?.slice(0,7)===selMonth
    );
    const rows = [];
    targets.forEach(c => {
      const its = c.items?.length ? c.items : [];
      its.forEach(it => {
        const cat    = categories.find(x=>x.id===it.category_id);
        const amount = calcFeeAmount(it.contract_amount, selCompany, it.category_id, feeRates);
        rows.push({
          case_id:           c.id,
          company_name:      c.company_name,
          category_id:       it.category_id,
          contract_amount:   it.contract_amount,
          item:              `紹介手数料（${cat?.label||it.category_id}）`,
          summary:           c.company_name,
          amount:            amount,
          fee_rate:          feeRates?.[selCompany]?.[it.category_id]||0,
          included:          true,
        });
      });
    });
    return rows;
  }

  function goToEdit() { setLines(buildLines()); setPreviewMode(false); setStep(2); }

  const setLine = (i,k,v) => setLines(p=>p.map((l,j)=>j===i?{...l,[k]:v}:l));
  const included = lines.filter(l=>l.included);
  const subtotal = included.reduce((s,l)=>s+(Number(l.amount)||0),0);
  const tax      = Math.floor(subtotal*0.1);
  const total    = subtotal+tax;
  const htmlArgs = { invoiceNo, issueDate, month:selMonth, co, lines:included, notes, settings };
  const html     = buildInvoiceHTML(htmlArgs);

  async function handleDownload() {
    try {
      const res = await fetch('/api/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceNo, issueDate, month: selMonth,
          co, lines: included, notes, settings
        }),
      })
      if (!res.ok) throw new Error('PDF生成失敗')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `請求書_${co?.label}_${MONTH_LABELS[selMonth]}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      setShowBulk(true)
    } catch(e) {
      alert('PDF生成に失敗しました。もう一度お試しください。')
      console.error(e)
    }
  }

  const targetCaseNames = [...new Set(included.map(l=>l.company_name))];
  const targetCaseIds   = [...new Set(included.map(l=>l.case_id))];

  // Preview target cases for step1
  const previewTargets = cases.filter(c=>
    c.referral_to===selCompany && c.status==="contracted" && c.contracted_at?.slice(0,7)===selMonth
  );

  return (
    <>
      <Overlay>
        <ModalBox maxWidth={step===2?"780px":"420px"}>
          {step===1&&(
            <>
              <ModalHeader title="月締請求書を作成" sub="対象月と紹介先を選択してください"/>
              <div style={{padding:"0 24px",display:"flex",flexDirection:"column",gap:"14px"}}>
                <Field label="対象月">
                  <select style={inp} value={selMonth} onChange={e=>setSelMonth(e.target.value)}>
                    {MONTHS.map(m=><option key={m} value={m}>{MONTH_LABELS[m]}</option>)}
                  </select>
                </Field>
                <Field label="紹介先">
                  <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                    {companies.map(c=>(
                      <button key={c.id} onClick={()=>setSelCompany(c.id)}
                        style={{flex:"1 1 100px",padding:"10px",borderRadius:"8px",fontWeight:600,fontSize:"13px",cursor:"pointer",
                          border:`1.5px solid ${selCompany===c.id?c.color:"#e5e7eb"}`,
                          background:selCompany===c.id?`${c.color}12`:"#fff",
                          color:selCompany===c.id?c.color:"#6b7280"}}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                </Field>
                <div style={{background:"#f9fafb",borderRadius:"8px",padding:"12px 14px"}}>
                  <div style={{fontSize:"11px",fontWeight:700,color:"#9ca3af",marginBottom:"8px",letterSpacing:"0.04em"}}>
                    対象案件（成約 / {MONTH_LABELS[selMonth]}）
                  </div>
                  {previewTargets.length===0
                    ?<div style={{fontSize:"13px",color:"#9ca3af"}}>該当する成約案件がありません</div>
                    :previewTargets.map(c=>(
                      <div key={c.id} style={{padding:"6px 0",borderBottom:"1px solid #f3f4f6",fontSize:"13px"}}>
                        <div style={{fontWeight:600,color:"#374151",marginBottom:"3px"}}>{c.company_name}</div>
                        {(c.items||[]).map((it,i)=>{
                          const cat=categories.find(x=>x.id===it.category_id);
                          const fee=calcFeeAmount(it.contract_amount,selCompany,it.category_id,feeRates);
                          return (
                            <div key={i} style={{display:"flex",justifyContent:"space-between",paddingLeft:"10px",fontSize:"12px",color:"#6b7280"}}>
                              <span>{cat?.label||it.category_id}　成約 {fmt(it.contract_amount)}</span>
                              <span style={{color:"#065f46",fontWeight:600}}>→ 手数料 {fee!==""?fmt(fee):"（率未設定）"}</span>
                            </div>
                          );
                        })}
                      </div>
                    ))
                  }
                  {previewTargets.length>0&&(
                    <div style={{display:"flex",justifyContent:"flex-end",marginTop:"8px",fontSize:"13px",fontWeight:700,color:"#111827"}}>
                      手数料合計：{fmt(previewTargets.reduce((s,c)=>{
                        return s+(c.items||[]).reduce((s2,it)=>{
                          const f=calcFeeAmount(it.contract_amount,selCompany,it.category_id,feeRates);
                          return s2+(Number(f)||0);
                        },0);
                      },0))}
                    </div>
                  )}
                </div>
              </div>
              <ModalFooter onClose={onClose} onSave={goToEdit} saveLabel="明細を編集 →"/>
            </>
          )}

          {step===2&&(
            <>
              <div style={{padding:"0 24px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"12px",flexWrap:"wrap"}}>
                <div>
                  <h2 style={{margin:0,fontSize:"16px",fontWeight:700,color:"#111827"}}>{co?.label} / {MONTH_LABELS[selMonth]} 請求書</h2>
                  <p style={{margin:"3px 0 0",fontSize:"12px",color:"#9ca3af"}}>明細・金額を確認・編集してください</p>
                </div>
                <div style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap"}}>
                  <PillToggle options={[["edit","編集"],["preview","プレビュー"]]} value={previewMode?"preview":"edit"} onChange={v=>setPreviewMode(v==="preview")}/>
                  <button onClick={handleDownload} style={{padding:"8px 16px",borderRadius:"7px",border:"none",background:"#111827",color:"#fff",fontWeight:600,fontSize:"13px",cursor:"pointer"}}>ダウンロード</button>
                </div>
              </div>

              {!settings.company_name&&(
                <div style={{margin:"0 24px",padding:"10px 14px",background:"#fffbeb",borderRadius:"8px",border:"1px solid #fcd34d",fontSize:"12px",color:"#92400e"}}>
                  発行会社情報が未設定です。
                </div>
              )}

              {previewMode?(
                <div style={{padding:"0 24px"}}>
                  <div style={{border:"1px solid #e5e7eb",borderRadius:"8px",overflow:"hidden",height:"500px"}}>
                    <iframe srcDoc={html} style={{width:"100%",height:"100%",border:"none"}} title="請求書プレビュー"/>
                  </div>
                </div>
              ):(
                <div style={{padding:"0 24px",display:"flex",flexDirection:"column",gap:"16px"}}>
                  <div>
                    <SectionLabel>請求書情報</SectionLabel>
                    <Row>
                      <Field label="請求書番号" half><input style={inp} value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} placeholder="INV-2025-03"/></Field>
                      <Field label="発行日" half><input type="date" style={inp} value={issueDate} onChange={e=>setIssueDate(e.target.value)}/></Field>
                    </Row>
                  </div>

                  <div>
                    <SectionLabel>明細</SectionLabel>
                    {lines.length===0&&<div style={{padding:"16px",textAlign:"center",color:"#9ca3af",fontSize:"13px",background:"#f9fafb",borderRadius:"8px"}}>対象案件がありません</div>}
                    <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                      {lines.map((l,i)=>(
                        <div key={i} style={{padding:"12px",borderRadius:"8px",border:`1px solid ${l.included?"#e5e7eb":"#f3f4f6"}`,background:l.included?"#fff":"#f9fafb",opacity:l.included?1:0.5}}>
                          <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:l.included?"10px":"0"}}>
                            <input type="checkbox" checked={l.included} onChange={e=>setLine(i,"included",e.target.checked)} style={{width:"16px",height:"16px",cursor:"pointer",accentColor:"#111827",flexShrink:0}}/>
                            <span style={{fontSize:"13px",fontWeight:600,color:"#111827",flex:1}}>{l.company_name}</span>
                            <span style={{fontSize:"11px",padding:"2px 8px",borderRadius:"4px",background:"#f3f4f6",color:"#6b7280",fontWeight:600}}>
                              {categories.find(c=>c.id===l.category_id)?.label}
                            </span>
                            {l.fee_rate>0&&(
                              <span style={{fontSize:"11px",color:"#9ca3af"}}>手数料率 {l.fee_rate}%</span>
                            )}
                          </div>
                          {l.included&&(
                            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px",paddingLeft:"26px"}}>
                              <div><label style={lbl}>項目</label><input style={{...inp,fontSize:"12px",padding:"6px 8px"}} value={l.item} onChange={e=>setLine(i,"item",e.target.value)}/></div>
                              <div><label style={lbl}>摘要</label><input style={{...inp,fontSize:"12px",padding:"6px 8px"}} value={l.summary} onChange={e=>setLine(i,"summary",e.target.value)}/></div>
                              <div><label style={lbl}>請求金額（円）</label><input type="number" style={{...inp,fontSize:"12px",padding:"6px 8px"}} value={l.amount} onChange={e=>setLine(i,"amount",e.target.value)}/></div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div style={{marginTop:"12px",padding:"12px 16px",background:"#f9fafb",borderRadius:"8px",display:"flex",flexDirection:"column",gap:"4px"}}>
                      {[["小計",fmt(subtotal)],["消費税（10%）",fmt(tax)]].map(([k,v])=>(
                        <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:"13px",color:"#6b7280"}}><span>{k}</span><span>{v}</span></div>
                      ))}
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:"15px",fontWeight:700,color:"#111827",borderTop:"1px solid #e5e7eb",paddingTop:"6px",marginTop:"4px"}}>
                        <span>合計</span><span>{fmt(total)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <SectionLabel>備考</SectionLabel>
                    <textarea style={{...inp,height:"72px",resize:"vertical"}} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="請求書に記載する備考・連絡事項など"/>
                  </div>
                </div>
              )}

              <ModalFooter onClose={onClose} onSave={handleDownload} saveLabel="ダウンロード"
                extra={<button onClick={()=>setStep(1)} style={{padding:"8px 14px",borderRadius:"7px",border:"1px solid #e5e7eb",background:"#fff",color:"#374151",fontWeight:600,cursor:"pointer",fontSize:"13px",marginRight:"auto"}}>← 戻る</button>}
              />
            </>
          )}
        </ModalBox>
      </Overlay>

      {showBulk&&(
        <BulkStatusDialog
          caseNames={targetCaseNames}
          onConfirm={()=>{ onBulkStatusChange(targetCaseIds); setShowBulk(false); onClose(); }}
          onSkip={()=>{ setShowBulk(false); onClose(); }}
        />
      )}
    </>
  );
}

// ── Fee Rate Settings (dynamic categories) ────────────
function FeeRateModal({ companies, categories, feeRates, onClose, onSave }) {
  const [cats, setCats]   = useState(categories.map(c=>({...c})));
  const [rates, setRates] = useState(() => {
    const r = {};
    companies.forEach(co => { r[co.id] = { ...(feeRates[co.id]||{}) }; });
    return r;
  });
  const [newCatLabel, setNewCatLabel] = useState("");
  const setRate = (coId, catId, val) => setRates(p=>({...p,[coId]:{...p[coId],[catId]:Number(val)}}));

  function addCategory() {
    const label = newCatLabel.trim();
    if(!label) return;
    const id = label.toLowerCase().replace(/\s+/g,"_").replace(/[^\w]/g,"") + "_" + Date.now();
    setCats(p=>[...p, { id, label }]);
    setNewCatLabel("");
  }

  function removeCategory(catId) {
    setCats(p=>p.filter(c=>c.id!==catId));
    setRates(p=>{
      const next = {...p};
      Object.keys(next).forEach(coId=>{ const r={...next[coId]}; delete r[catId]; next[coId]=r; });
      return next;
    });
  }

  const colCount = cats.length;

  return (
    <Overlay><ModalBox maxWidth="560px">
      <ModalHeader title="手数料率設定" sub="案件カテゴリの追加・削除と、紹介先×カテゴリごとの料率設定"/>
      <div style={{padding:"0 24px",display:"flex",flexDirection:"column",gap:"16px"}}>

        {/* Category management */}
        <div>
          <SectionLabel>案件カテゴリ管理</SectionLabel>
          <div style={{display:"flex",gap:"8px",flexWrap:"wrap",marginBottom:"10px"}}>
            {cats.map(cat=>(
              <div key={cat.id} style={{display:"flex",alignItems:"center",gap:"6px",padding:"5px 10px 5px 12px",borderRadius:"99px",background:"#f3f4f6",border:"1px solid #e5e7eb"}}>
                <span style={{fontSize:"13px",fontWeight:600,color:"#374151"}}>{cat.label}</span>
                <button onClick={()=>removeCategory(cat.id)}
                  style={{width:"18px",height:"18px",borderRadius:"50%",border:"none",background:"#e5e7eb",color:"#9ca3af",cursor:"pointer",fontSize:"13px",lineHeight:"18px",textAlign:"center",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:"8px"}}>
            <input value={newCatLabel} onChange={e=>setNewCatLabel(e.target.value)}
              placeholder="新しいカテゴリ名（例：コンサル）"
              style={{...inp,flex:1}}
              onKeyDown={e=>e.key==="Enter"&&addCategory()}/>
            <button onClick={addCategory}
              style={{padding:"8px 16px",borderRadius:"7px",border:"none",background:"#111827",color:"#fff",fontWeight:600,fontSize:"13px",cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>
              追加
            </button>
          </div>
        </div>

        {/* Rate table */}
        <div>
          <SectionLabel>手数料率テーブル</SectionLabel>
          {cats.length===0 ? (
            <div style={{padding:"20px",textAlign:"center",color:"#9ca3af",fontSize:"13px",background:"#f9fafb",borderRadius:"8px"}}>
              カテゴリを追加してください
            </div>
          ) : (
            <div style={{borderRadius:"8px",overflow:"hidden",border:"1px solid #e5e7eb"}}>
              {/* header row */}
              <div style={{display:"grid",gridTemplateColumns:`150px repeat(${colCount},1fr)`,background:"#f9fafb",borderBottom:"1px solid #e5e7eb"}}>
                <div style={{padding:"10px 14px",fontSize:"11px",fontWeight:700,color:"#9ca3af"}}></div>
                {cats.map(cat=>(
                  <div key={cat.id} style={{padding:"10px 8px",fontSize:"11px",fontWeight:700,color:"#374151",textAlign:"center",borderLeft:"1px solid #e5e7eb"}}>
                    {cat.label}
                  </div>
                ))}
              </div>
              {/* company rows */}
              {companies.map((co,ci)=>(
                <div key={co.id} style={{display:"grid",gridTemplateColumns:`150px repeat(${colCount},1fr)`,background:ci%2===0?"#fff":"#fafafa",borderTop:ci===0?"none":"1px solid #f3f4f6"}}>
                  <div style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:"8px"}}>
                    <div style={{width:"8px",height:"8px",borderRadius:"2px",background:co.color,flexShrink:0}}/>
                    <span style={{fontSize:"13px",fontWeight:600,color:"#374151",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{co.label}</span>
                  </div>
                  {cats.map(cat=>(
                    <div key={cat.id} style={{padding:"7px 8px",borderLeft:"1px solid #e5e7eb",display:"flex",alignItems:"center",gap:"3px",justifyContent:"center"}}>
                      <input type="number" min="0" max="100"
                        value={rates[co.id]?.[cat.id]??0}
                        onChange={e=>setRate(co.id,cat.id,e.target.value)}
                        style={{...inp,padding:"5px 6px",fontSize:"13px",textAlign:"right",width:"58px"}}/>
                      <span style={{fontSize:"12px",color:"#9ca3af",flexShrink:0}}>%</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          <p style={{fontSize:"12px",color:"#9ca3af",marginTop:"8px"}}>0%は自動計算なし。請求書モーダルで手動入力できます。</p>
        </div>
      </div>
      <ModalFooter onClose={onClose} onSave={()=>onSave(cats, rates)} saveLabel="保存する"/>
    </ModalBox></Overlay>
  );
}

// ── Settings Modal ─────────────────────────────────────
function SettingsModal({ settings, onClose, onSave }) {
  const [form,setForm]=useState({...settings});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const stampRef=useRef();
  function handleStamp(e){const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=ev=>set("stamp_image",ev.target.result);r.readAsDataURL(file);}
  return (
    <Overlay><ModalBox maxWidth="500px">
      <ModalHeader title="アプリ設定" sub="発行会社情報は請求書に反映されます"/>
      <div style={{padding:"0 24px",display:"flex",flexDirection:"column",gap:"16px"}}>
        <div>
          <SectionLabel>発行会社情報（自社）</SectionLabel>
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            <Field label="会社名"><input style={inp} value={form.company_name} onChange={e=>set("company_name",e.target.value)} placeholder="株式会社〇〇"/></Field>
            <Row>
              <Field label="郵便番号" half><input style={inp} value={form.company_zip} onChange={e=>set("company_zip",e.target.value)} placeholder="530-0001"/></Field>
              <Field label="住所" half><input style={inp} value={form.company_addr} onChange={e=>set("company_addr",e.target.value)} placeholder="大阪府大阪市〇〇"/></Field>
            </Row>
            <Field label="インボイス登録番号（T番号）"><input style={inp} value={form.invoice_tax_id} onChange={e=>set("invoice_tax_id",e.target.value)} placeholder="T1234567890123"/></Field>
          </div>
        </div>
        <div>
          <SectionLabel>会社印</SectionLabel>
          <div style={{display:"flex",alignItems:"center",gap:"16px"}}>
            <div style={{width:"72px",height:"72px",border:"1px solid #e5e7eb",borderRadius:"8px",overflow:"hidden",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:"#f9fafb"}}>
              {form.stamp_image?<img src={form.stamp_image} style={{width:"100%",height:"100%",objectFit:"contain"}}/>:<span style={{fontSize:"11px",color:"#d1d5db"}}>未設定</span>}
            </div>
            <div>
              <button onClick={()=>stampRef.current.click()} style={{padding:"7px 16px",borderRadius:"6px",border:"1px solid #e5e7eb",background:"#fff",color:"#374151",fontSize:"13px",fontWeight:600,cursor:"pointer",display:"block",marginBottom:"6px"}}>画像を選択</button>
              <p style={{fontSize:"11px",color:"#9ca3af"}}>PNG / JPG。透過PNG推奨。</p>
              {form.stamp_image&&<button onClick={()=>set("stamp_image","")} style={{marginTop:"6px",padding:"4px 10px",borderRadius:"5px",border:"1px solid #fecaca",background:"#fef2f2",color:"#f87171",fontSize:"11px",fontWeight:600,cursor:"pointer"}}>削除</button>}
            </div>
            <input ref={stampRef} type="file" accept="image/*" onChange={handleStamp} style={{display:"none"}}/>
          </div>
        </div>
        <div>
          <SectionLabel>振込先情報</SectionLabel>
          <Field label="振込先（複数行可）">
            <textarea style={{...inp,height:"80px",resize:"vertical"}} value={form.bank_info} onChange={e=>set("bank_info",e.target.value)} placeholder={"〇〇銀行 〇〇支店\n普通 1234567\nカ）〇〇〇〇"}/>
          </Field>
        </div>
      </div>
      <ModalFooter onClose={onClose} onSave={()=>onSave(form)} saveLabel="保存する"/>
    </ModalBox></Overlay>
  );
}

// ── Company Master Modal ───────────────────────────────
function CompanyMasterModal({ companies, onClose, onSave }) {
  const [list,setList]=useState(companies.map(c=>({...c})));
  const [sel,setSel]=useState(list[0]?.id||null);
  const [newLabel,setNewLabel]=useState("");
  const [newColor,setNewColor]=useState(PALETTE[companies.length%PALETTE.length]);
  const cur=list.find(c=>c.id===sel);
  const setF=(k,v)=>setList(p=>p.map(c=>c.id===sel?{...c,[k]:v}:c));
  function add(){if(!newLabel.trim())return;const id=newLabel.trim().toLowerCase().replace(/\s+/g,"_")+"_"+Date.now();setList(p=>[...p,{id,label:newLabel.trim(),color:newColor,bill_company:"",bill_contact:"",tax_id:""}]);setSel(id);setNewLabel("");setNewColor(PALETTE[(list.length+1)%PALETTE.length]);}
  return (
    <Overlay><ModalBox maxWidth="520px">
      <ModalHeader title="紹介先マスター" sub="請求先情報・T番号を設定できます"/>
      <div style={{padding:"0 24px",display:"flex",gap:"8px",flexWrap:"wrap"}}>
        {list.map(co=>(
          <button key={co.id} onClick={()=>setSel(co.id)}
            style={{padding:"6px 14px",borderRadius:"99px",fontWeight:600,fontSize:"13px",cursor:"pointer",
              border:`1.5px solid ${sel===co.id?co.color:"#e5e7eb"}`,
              background:sel===co.id?`${co.color}15`:"#fff",color:sel===co.id?co.color:"#6b7280"}}>
            {co.label}
          </button>
        ))}
      </div>
      {cur&&(
        <div style={{padding:"0 24px",display:"flex",flexDirection:"column",gap:"12px"}}>
          <Row>
            <Field label="表示名" half><input style={inp} value={cur.label} onChange={e=>setF("label",e.target.value)}/></Field>
            <div style={{display:"flex",flexDirection:"column"}}><label style={lbl}>カラー</label>
              <input type="color" value={cur.color} onChange={e=>setF("color",e.target.value)} style={{width:"42px",height:"38px",border:"1px solid #e5e7eb",borderRadius:"6px",cursor:"pointer",padding:"2px"}}/>
            </div>
          </Row>
          <div>
            <SectionLabel>請求先情報</SectionLabel>
            <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
              <Field label="請求先会社名"><input style={inp} value={cur.bill_company||""} onChange={e=>setF("bill_company",e.target.value)} placeholder="請求書に記載される会社名"/></Field>
              <Field label="担当者名"><input style={inp} value={cur.bill_contact||""} onChange={e=>setF("bill_contact",e.target.value)} placeholder="山田 太郎"/></Field>
              <Field label="事業者登録番号（T番号）">
  <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
    <span style={{fontSize:"14px",fontWeight:700,color:"#374151",flexShrink:0}}>T</span>
    <input style={inp} value={(cur.tax_id||"").replace(/^T/,"")} maxLength={13}
      onChange={e=>{const v=e.target.value.replace(/\D/g,"").slice(0,13);setF("tax_id",v?"T"+v:"");}}
      placeholder="1234567890123"/>
  </div>
  {cur.tax_id&&cur.tax_id.length!==14&&<p style={{fontSize:"11px",color:"#f87171",marginTop:"4px"}}>13桁で入力してください</p>}
</Field>
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end"}}>
            <button onClick={()=>{setList(p=>p.filter(c=>c.id!==sel));setSel(list.find(c=>c.id!==sel)?.id||null);}} style={{padding:"6px 12px",borderRadius:"6px",border:"1px solid #fecaca",background:"#fef2f2",color:"#f87171",fontSize:"12px",fontWeight:600,cursor:"pointer"}}>この紹介先を削除</button>
          </div>
        </div>
      )}
      <div style={{padding:"0 24px"}}>
        <div style={{display:"flex",gap:"8px",alignItems:"center",padding:"10px 12px",background:"#f9fafb",borderRadius:"8px",border:"1.5px dashed #e5e7eb"}}>
          <input type="color" value={newColor} onChange={e=>setNewColor(e.target.value)} style={{width:"26px",height:"26px",border:"none",borderRadius:"5px",cursor:"pointer",padding:0,flexShrink:0}}/>
          <input value={newLabel} onChange={e=>setNewLabel(e.target.value)} placeholder="新しい紹介先名" style={{...inp,flex:1,padding:"6px 10px",fontSize:"13px",background:"transparent",border:"none"}} onKeyDown={e=>e.key==="Enter"&&add()}/>
          <button onClick={add} style={{padding:"6px 14px",borderRadius:"6px",border:"none",background:"#111827",color:"#fff",fontWeight:600,fontSize:"13px",cursor:"pointer",flexShrink:0}}>追加</button>
        </div>
      </div>
      <ModalFooter onClose={onClose} onSave={()=>onSave(list)} saveLabel="保存する"/>
    </ModalBox></Overlay>
  );
}

// ── Case Modal ─────────────────────────────────────────
function CaseModal({ onClose, onSave, editCase, companies, categories }) {
  const initItems = editCase?.items?.length
    ? editCase.items.map(it=>({...it}))
    : [{ category_id: categories[0]?.id||"", contract_amount:"" }];

  const [form, setForm] = useState({
    company_name:   editCase?.company_name   || "",
    referral_to:    editCase?.referral_to    || companies[0]?.id||"",
    status:         editCase?.status         || "estimate",
    contracted_at:  editCase?.contracted_at  || "",
    notes:          editCase?.notes          || "",
  });
  const [items, setItems] = useState(initItems);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const setItem  = (i,k,v) => setItems(p=>p.map((it,j)=>j===i?{...it,[k]:v}:it));
  const addItem  = () => {
    const usedIds = items.map(it=>it.category_id);
    const next    = categories.find(c=>!usedIds.includes(c.id));
    setItems(p=>[...p, { category_id: next?.id||categories[0]?.id||"", contract_amount:"" }]);
  };
  const removeItem = i => setItems(p=>p.filter((_,j)=>j!==i));

  const isContracted = form.status==="contracted";
  const catOptions   = categories.map(c=>c.id);

  function handleSave() {
    if(!form.company_name) return;
    if(!items.length) { alert("明細を1つ以上追加してください"); return; }
    onSave({ ...form, items });
  }

  return (
    <Overlay><ModalBox>
      <ModalHeader title={editCase?"案件を編集":"新規案件を登録"}/>
      <div style={{padding:"0 24px 4px",display:"flex",flexDirection:"column",gap:"14px"}}>

        <Field label="企業名">
          <input style={inp} value={form.company_name} onChange={e=>set("company_name",e.target.value)} placeholder="株式会社〇〇"/>
        </Field>

        <Field label="紹介先">
          <select style={inp} value={form.referral_to} onChange={e=>set("referral_to",e.target.value)}>
            {companies.map(co=><option key={co.id} value={co.id}>{co.label}</option>)}
          </select>
        </Field>

        <Field label="ステータス">
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
            {STATUS_LIST.map(s=>(
              <button key={s.id} onClick={()=>set("status",s.id)}
                style={{padding:"9px 8px",borderRadius:"7px",fontWeight:600,fontSize:"13px",cursor:"pointer",textAlign:"center",
                  border:`1.5px solid ${form.status===s.id?s.dot:"#e5e7eb"}`,
                  background:form.status===s.id?s.bg:"#fff",
                  color:form.status===s.id?s.text:"#9ca3af",transition:"all 0.15s"}}>
                <span style={{display:"inline-block",width:"6px",height:"6px",borderRadius:"50%",background:form.status===s.id?s.dot:"#d1d5db",marginRight:"6px",verticalAlign:"middle"}}/>
                {s.label}
              </button>
            ))}
          </div>
        </Field>

        {/* Items: category × amount — 成約・請求書送付済のみ表示 */}
        {(form.status==="contracted"||form.status==="invoiced")&&<div>
          <label style={lbl}>カテゴリ別成約金額</label>
          <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
            {items.map((it,i)=>(
              <div key={i} style={{display:"flex",gap:"8px",alignItems:"center",padding:"10px 12px",background:"#f9fafb",borderRadius:"8px",border:"1px solid #f3f4f6"}}>
                <select value={it.category_id} onChange={e=>setItem(i,"category_id",e.target.value)}
                  style={{...inp,width:"110px",flex:"0 0 110px",padding:"6px 8px",fontSize:"13px"}}>
                  {categories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <div style={{flex:1,position:"relative"}}>
                  <span style={{position:"absolute",left:"10px",top:"50%",transform:"translateY(-50%)",color:"#9ca3af",fontSize:"13px",pointerEvents:"none"}}>¥</span>
                  <input type="number" value={it.contract_amount||""} onChange={e=>setItem(i,"contract_amount",e.target.value)}
                    placeholder={isContracted?"成約金額":"（見込み金額）"}
                    style={{...inp,paddingLeft:"24px",fontSize:"13px",padding:"6px 8px 6px 24px"}}/>
                </div>
                {items.length>1&&(
                  <button onClick={()=>removeItem(i)}
                    style={{width:"28px",height:"28px",borderRadius:"6px",border:"1px solid #fecaca",background:"#fef2f2",color:"#f87171",cursor:"pointer",fontSize:"16px",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    ×
                  </button>
                )}
              </div>
            ))}
            {items.length < categories.length && (
              <button onClick={addItem}
                style={{padding:"8px",borderRadius:"8px",border:"1.5px dashed #e5e7eb",background:"#f9fafb",color:"#9ca3af",fontSize:"13px",fontWeight:600,cursor:"pointer"}}>
                ＋ カテゴリを追加
              </button>
            )}
          </div>
        </div>}

        {(form.status==="contracted"||form.status==="invoiced")&&(
          <Field label="成約日">
            <input type="date" style={inp} value={form.contracted_at||""} onChange={e=>set("contracted_at",e.target.value)}/>
          </Field>
        )}

        <Field label="備考">
          <textarea style={{...inp,height:"60px",resize:"vertical"}} value={form.notes} onChange={e=>set("notes",e.target.value)} placeholder="メモ"/>
        </Field>
      </div>
      <ModalFooter onClose={onClose} onSave={handleSave} saveLabel={editCase?"保存する":"登録する"}/>
    </ModalBox></Overlay>
  );
}

// ── Charts ─────────────────────────────────────────────
function BarChartMonthly({ cases, companies }) {
  const [metric,setMetric]=useState("amount");
  const contracted=cases.filter(c=>c.status==="contracted"||c.status==="invoiced");
  const data=MONTHS.map(m=>{
    const row={month:MONTH_SHORT[m]};
    companies.forEach(co=>{const matched=contracted.filter(c=>c.referral_to===co.id&&c.contracted_at?.slice(0,7)===m);row[co.id]=metric==="amount"?matched.reduce((s,c)=>s+totalContractAmount(c),0):matched.length;});
    row._total=companies.reduce((s,co)=>s+(row[co.id]||0),0);return row;
  });
  const max=Math.max(...data.map(d=>d._total),1);
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px"}}>
        <span style={{fontSize:"13px",fontWeight:600,color:"#374151"}}>月別推移</span>
        <PillToggle options={[["amount","金額"],["count","件数"]]} value={metric} onChange={setMetric}/>
      </div>
      <div style={{display:"flex",gap:"10px",alignItems:"flex-end",height:"160px"}}>
        {data.map(d=>{
          const label=d._total>0?(metric==="amount"?`¥${(d._total/10000).toFixed(0)}万`:`${d._total}件`):"";
          return (
            <div key={d.month} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",height:"160px"}}>
              <div style={{height:"22px",display:"flex",alignItems:"center"}}><span style={{fontSize:"11px",fontWeight:700,color:"#6b7280",whiteSpace:"nowrap"}}>{label}</span></div>
              <div style={{width:"100%",display:"flex",flexDirection:"column-reverse",gap:"2px",flex:1,justifyContent:"flex-start",maxHeight:"120px"}}>
                {companies.map((co,i)=>{const h=d._total>0?((d[co.id]||0)/max)*120:0;if(h<1)return null;return <div key={co.id} style={{width:"100%",height:`${h}px`,background:co.color,borderRadius:i===companies.length-1?"4px 4px 0 0":"0",minHeight:"3px",opacity:.85}}/>;})}{d._total===0&&<div style={{width:"100%",height:"4px",background:"#e5e7eb",borderRadius:"3px",marginTop:"auto"}}/>}
              </div>
              <div style={{fontSize:"12px",color:"#9ca3af",fontWeight:500,marginTop:"8px"}}>{d.month}</div>
            </div>
          );
        })}
      </div>
      <div style={{display:"flex",gap:"14px",marginTop:"14px",justifyContent:"center",flexWrap:"wrap"}}>
        {companies.map(co=><div key={co.id} style={{display:"flex",alignItems:"center",gap:"5px",fontSize:"12px",color:"#9ca3af"}}><div style={{width:"8px",height:"8px",borderRadius:"2px",background:co.color,opacity:.85}}/>{co.label}</div>)}
      </div>
    </div>
  );
}
function BarChartByCompany({ cases, companies }) {
  const [metric,setMetric]=useState("amount");
  const contracted=cases.filter(c=>c.status==="contracted"||c.status==="invoiced");
  const data=companies.map(co=>{const matched=contracted.filter(c=>c.referral_to===co.id);return{...co,value:metric==="amount"?matched.reduce((s,c)=>s+totalContractAmount(c),0):matched.length,count:matched.length,total:cases.filter(c=>c.referral_to===co.id).length};});
  const max=Math.max(...data.map(d=>d.value),1);
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px"}}>
        <span style={{fontSize:"13px",fontWeight:600,color:"#374151"}}>紹介先別集計</span>
        <PillToggle options={[["amount","金額"],["count","件数"]]} value={metric} onChange={setMetric}/>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
        {data.map(d=>(
          <div key={d.id}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:"7px"}}><span style={{fontSize:"13px",fontWeight:600,color:"#374151"}}>{d.label}</span><span style={{fontSize:"14px",fontWeight:700,color:"#111827"}}>{metric==="amount"?fmt(d.value):`${d.value}件`}</span></div>
            <div style={{height:"8px",background:"#f3f4f6",borderRadius:"99px",overflow:"hidden"}}><div style={{height:"100%",width:`${(d.value/max)*100}%`,background:d.color,borderRadius:"99px",opacity:.8,transition:"width .4s ease"}}/></div>
            <div style={{fontSize:"11px",color:"#9ca3af",marginTop:"5px"}}>成約 {d.count}件 / 全 {d.total}件</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────
export default function Home() {
  const [cases,        setCases]        = useState<Case[]>([]);
  const [companies,    setCompanies]    = useState<Company[]>([]);
  const [settings,     setSettings]     = useState<AppSettings>({ id:1, company_name:"", company_zip:"", company_addr:"", bank_info:"", invoice_tax_id:"", stamp_image:"" });
  const [categories,   setCategories]   = useState<Category[]>([]);
  const [feeRates,     setFeeRates]     = useState<FeeRateMap>({});
  const [loading,      setLoading]      = useState(true);
  const [view,         setView]         = useState("dashboard");
  const [chartMode,    setChartMode]    = useState("monthly");
  const [modal,        setModal]        = useState<Case | "new" | null>(null);
  const [masterOpen,   setMasterOpen]   = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feeOpen,      setFeeOpen]      = useState(false);
  const [invoiceOpen,  setInvoiceOpen]  = useState(false);
  const [search,       setSearch]       = useState("");
  const [fStatus,  setFStatus]  = useState("all");
  const [fCompany, setFCompany] = useState("all");
  const [fMonth,   setFMonth]   = useState("all");

  // Supabaseからデータ取得
  useEffect(() => {
    async function load() {
      try {
        const [cats, cos, fees, cas, sets] = await Promise.all([
          getCategories(), getCompanies(), getFeeRates(), getCases(), getAppSettings(),
        ])
        setCategories(cats)
        setCompanies(cos)
        setFeeRates(fees)
        setCases(cas)
        setSettings(sets)
      } catch(e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const contracted   = cases.filter(c=>c.status==="contracted"||c.status==="invoiced");
  const totalAmount  = contracted.reduce((s,c)=>s+totalContractAmount(c),0);
  const contractRate = cases.length?Math.round(contracted.length/cases.length*100):0;
  const settingsIncomplete = !settings.company_name;

  const filtered=useMemo(()=>cases.filter(c=>{
    if(loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"sans-serif"}}>読み込み中...</div>
    if(fStatus!=="all"  && c.status!==fStatus)               return false;
    if(fCompany!=="all" && c.referral_to!==fCompany)          return false;
    if(fMonth!=="all"   && c.contracted_at?.slice(0,7)!==fMonth) return false;
    if(search && !c.company_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }),[cases,fStatus,fCompany,fMonth,search]);

  async function handleSave(form: any) {
    const items = (form.items||[]).map((it: any, i: number) => ({ category_id: it.category_id, contract_amount: it.contract_amount||null, sort_order: i }))
    if(modal==="new") {
      const created = await createCase(form, items)
      setCases(p=>[{ ...form, id: created.id, created_at: created.created_at, updated_at: created.updated_at, items: form.items||[] }, ...p])
    } else if(modal && modal !== "new") {
      await updateCase(modal.id, form, items)
      setCases(p=>p.map(c=>c.id===(modal as Case).id?{...c,...form,items:form.items||[]}:c))
    }
    setModal(null)
  }

  async function handleBulkStatus(ids: string[]) {
    await bulkUpdateStatus(ids, "invoiced")
    setCases(p=>p.map(c=>ids.includes(c.id)?{...c,status:"invoiced" as const}:c))
  }

  async function handleDelete(id: string) {
    if(!confirm('この案件を削除しますか？\n（あとからSupabaseで復元できます）')) return
    await deleteCase(id)
    setCases(p=>p.filter(c=>c.id!==id))
  }

  const coLabel=id=>companies.find(c=>c.id===id)?.label||id;
  const coColor=id=>companies.find(c=>c.id===id)?.color||"#9ca3af";
  const tabStyle=k=>({padding:"6px 14px",borderRadius:"6px",border:"none",fontSize:"13px",fontWeight:600,cursor:"pointer",background:"transparent",color:view===k?"#111827":"#9ca3af",borderBottom:view===k?"2px solid #111827":"2px solid transparent"});

  return (
    <div style={{minHeight:"100vh",background:"#fff",fontFamily:"'Noto Sans JP','Hiragino Sans',sans-serif",color:"#111827"}}>
      <div style={{borderBottom:"1px solid #f3f4f6",background:"#fff",position:"sticky",top:0,zIndex:90}}>
        <div style={{maxWidth:"720px",margin:"0 auto",padding:"0 10px",display:"flex",alignItems:"center",justifyContent:"space-between",height:"52px",gap:"6px"}}>
          <div style={{display:"flex",alignItems:"center",gap:"6px",flexShrink:0}}>
            <div style={{width:"20px",height:"20px",background:"#111827",borderRadius:"4px",flexShrink:0}}/>
            <span style={{fontSize:"13px",fontWeight:700,letterSpacing:"0.02em",whiteSpace:"nowrap"}}>案件管理</span>
          </div>
        <div style={{display:"flex",alignItems:"center",gap:"2px",flexShrink:0}}>
        <button style={tabStyle("dashboard")} onClick={()=>setView("dashboard")}>DB</button>
        <button style={tabStyle("list")} onClick={()=>setView("list")}>一覧</button>
        </div>
        <div style={{display:"flex",gap:"4px",flexShrink:0}}>
            <button onClick={()=>setMasterOpen(true)} style={{padding:"5px 7px",borderRadius:"6px",border:"1px solid #e5e7eb",background:"#fff",color:"#374151",fontSize:"11px",fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>紹介先</button>
            <button onClick={()=>setFeeOpen(true)} style={{padding:"5px 7px",borderRadius:"6px",border:"1px solid #e5e7eb",background:"#fff",color:"#374151",fontSize:"11px",fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>手数料</button>
            <button onClick={()=>setSettingsOpen(true)} style={{padding:"5px 7px",borderRadius:"6px",border:`1px solid ${settingsIncomplete?"#fcd34d":"#e5e7eb"}`,background:settingsIncomplete?"#fffbeb":"#fff",color:settingsIncomplete?"#92400e":"#374151",fontSize:"11px",fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>{settingsIncomplete?"⚠ 設定":"設定"}</button>
          </div>
        </div>
      </div>

      <div style={{maxWidth:"720px",margin:"0 auto",padding:"24px 16px 100px"}}>

        {/* ━━━ Dashboard ━━━ */}
        {view==="dashboard"&&(
          <div style={{display:"flex",flexDirection:"column",gap:"20px"}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"12px"}}>
              {[{label:"総案件数",value:`${cases.length}件`},{label:"成約件数",value:`${contracted.length}件`,sub:`成約率 ${contractRate}%`},{label:"累計成約金額",value:`¥${(totalAmount/10000).toFixed(0)}万`}].map(({label,value,sub})=>(
                <div key={label} style={{padding:"16px",borderRadius:"10px",border:"1px solid #f3f4f6",background:"#fafafa"}}>
                  <div style={{fontSize:"11px",color:"#9ca3af",fontWeight:600,marginBottom:"8px",letterSpacing:"0.04em"}}>{label}</div>
                  <div style={{fontSize:"22px",fontWeight:700,color:"#111827",lineHeight:1,whiteSpace:"nowrap"}}>{value}</div>
                  {sub&&<div style={{fontSize:"11px",color:"#9ca3af",marginTop:"5px"}}>{sub}</div>}
                </div>
              ))}
            </div>
            <div style={{borderRadius:"10px",border:"1px solid #f3f4f6",padding:"16px",background:"#fafafa"}}>
              <div style={{fontSize:"11px",fontWeight:700,color:"#9ca3af",letterSpacing:"0.04em",marginBottom:"12px"}}>ステータス内訳</div>
              <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                {STATUS_LIST.map(s=>{const cnt=cases.filter(c=>c.status===s.id).length;return(
                  <div key={s.id} style={{display:"flex",alignItems:"center",gap:"8px",padding:"10px 12px",borderRadius:"8px",background:s.bg,flex:"1 1 90px"}}>
                    <span style={{width:"7px",height:"7px",borderRadius:"50%",background:s.dot,flexShrink:0}}/>
                    <div><div style={{fontSize:"10px",color:s.text,fontWeight:700,lineHeight:1.3}}>{s.label}</div><div style={{fontSize:"17px",fontWeight:700,color:s.text,lineHeight:1.2}}>{cnt}件</div></div>
                  </div>
                );})}
              </div>
            </div>
            <div style={{borderRadius:"10px",border:"1px solid #f3f4f6",padding:"20px",background:"#fafafa"}}>
              <div style={{display:"flex",justifyContent:"flex-end",marginBottom:"20px"}}>
                <PillToggle options={[["monthly","月別"],["byCompany","紹介先別"]]} value={chartMode} onChange={setChartMode}/>
              </div>
              {chartMode==="monthly"?<BarChartMonthly cases={cases} companies={companies}/>:<BarChartByCompany cases={cases} companies={companies}/>}
            </div>
            <button onClick={()=>setInvoiceOpen(true)}
              style={{width:"100%",padding:"14px",borderRadius:"10px",border:"1px solid #e5e7eb",background:"#fff",color:"#111827",fontSize:"14px",fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:"8px"}}>
              <span style={{fontWeight:400,fontSize:"16px"}}>+</span> 月締請求書を作成
            </button>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:"10px"}}>
              {companies.map(co=>{const cc=contracted.filter(c=>c.referral_to===co.id);const amt=cc.reduce((s,c)=>s+totalContractAmount(c),0);return(
                <div key={co.id} style={{padding:"14px",borderRadius:"10px",border:`1px solid ${co.color}30`,background:`${co.color}08`}}>
                  <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"10px"}}><div style={{width:"8px",height:"8px",borderRadius:"2px",background:co.color}}/><span style={{fontSize:"12px",fontWeight:700,color:co.color}}>{co.label}</span></div>
                  <div style={{fontSize:"18px",fontWeight:700,color:"#111827"}}>¥{(amt/10000).toFixed(0)}万</div>
                  <div style={{fontSize:"11px",color:"#9ca3af",marginTop:"4px"}}>成約 {cc.length} / {cases.filter(c=>c.referral_to===co.id).length}件</div>
                </div>
              );})}
            </div>
          </div>
        )}

        {/* ━━━ Case List ━━━ */}
        {view==="list"&&(
          <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
            {/* Search */}
            <div style={{position:"relative"}}>
              <div style={{position:"absolute",left:"12px",top:"50%",transform:"translateY(-50%)",color:"#9ca3af",fontSize:"14px",pointerEvents:"none"}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </div>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="企業名で検索..."
                style={{...inp,paddingLeft:"36px",fontSize:"14px"}}/>
              {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:"10px",top:"50%",transform:"translateY(-50%)",border:"none",background:"none",cursor:"pointer",color:"#9ca3af",fontSize:"16px",lineHeight:1}}>×</button>}
            </div>

            {/* Filters */}
            <div style={{display:"flex",flexWrap:"wrap",gap:"8px",alignItems:"center"}}>
              {[{val:fStatus,set:setFStatus,opts:[["all","全ステータス"],...STATUS_LIST.map(s=>[s.id,s.label])]},{val:fCompany,set:setFCompany,opts:[["all","全紹介先"],...companies.map(c=>[c.id,c.label])]},{val:fMonth,set:setFMonth,opts:[["all","全期間"],...MONTHS.map(m=>[m,MONTH_SHORT[m]])]}].map(({val,set,opts},i)=>(
                <select key={i} value={val} onChange={e=>set(e.target.value)} style={{...inp,width:"auto",flex:"1 1 90px",fontSize:"13px",padding:"7px 10px"}}>
                  {opts.map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              ))}
              <span style={{fontSize:"12px",color:"#9ca3af",fontWeight:600,whiteSpace:"nowrap"}}>{filtered.length}件</span>
            </div>

            {filtered.length===0?(
              <div style={{textAlign:"center",padding:"48px 24px",color:"#9ca3af",fontSize:"14px",borderRadius:"10px",border:"1px solid #f3f4f6"}}>
                {search?"「"+search+"」に一致する案件がありません":"該当する案件がありません"}
              </div>
            ):filtered.map(c=>{
              const s=STATUS_MAP[c.status];
              return (
                <div key={c.id} style={{padding:"16px",borderRadius:"10px",border:"1px solid #f3f4f6",background:"#fff",transition:"border-color .15s,box-shadow .15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor="#e5e7eb";e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,0.06)";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor="#f3f4f6";e.currentTarget.style.boxShadow="none";}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"10px"}}>
                    <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>setModal(c)}>
                      <div style={{fontWeight:600,fontSize:"14px",color:"#111827",marginBottom:"6px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.company_name}</div>
                      <div style={{display:"flex",gap:"6px",flexWrap:"wrap",alignItems:"center"}}>
                        <span style={{fontSize:"11px",fontWeight:600,padding:"2px 8px",borderRadius:"4px",color:coColor(c.referral_to),background:`${coColor(c.referral_to)}15`}}>{coLabel(c.referral_to)}</span>
                        {(c.categories||[]).map(catId=>(
                          <span key={catId} style={{fontSize:"11px",fontWeight:600,padding:"2px 7px",borderRadius:"4px",background:"#f3f4f6",color:"#374151"}}>
                            {categories.find(x=>x.id===catId)?.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:"6px",flexShrink:0}}>
                      <span style={{fontSize:"11px",fontWeight:600,color:s.text,background:s.bg,padding:"3px 9px",borderRadius:"4px",display:"flex",alignItems:"center",gap:"4px",cursor:"pointer",whiteSpace:"nowrap"}} onClick={()=>setModal(c)}>
                        <span style={{width:"5px",height:"5px",borderRadius:"50%",background:s.dot,display:"inline-block"}}/>{s.label}
                      </span>
                      {totalContractAmount(c)>0&&(
                        <div style={{display:"flex",gap:"4px",flexWrap:"wrap",justifyContent:"flex-end"}}>
                          {(c.items||[]).filter(it=>it.contract_amount).map((it,i)=>{
                            const cat=categories.find(x=>x.id===it.category_id);
                            return <span key={i} style={{fontSize:"11px",fontWeight:600,color:"#065f46",background:"#ecfdf5",padding:"2px 7px",borderRadius:"4px"}}>{cat?.label} {fmt(it.contract_amount)}</span>;
                          })}
                        </div>
                      )}
                      <button onClick={e=>{e.stopPropagation();handleDelete(c.id);}}
                        style={{marginTop:"6px",padding:"3px 10px",borderRadius:"5px",border:"1px solid #fecaca",background:"#fef2f2",color:"#f87171",fontSize:"11px",fontWeight:600,cursor:"pointer"}}>
                        削除
                      </button>
                    </div>
                  </div>
                  {c.notes&&<div style={{marginTop:"10px",fontSize:"12px",color:"#6b7280",borderTop:"1px solid #f3f4f6",paddingTop:"8px"}}>{c.notes}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{position:"fixed",bottom:"24px",right:"20px",zIndex:50}}>
        <button onClick={()=>setModal("new")} style={{width:"48px",height:"48px",borderRadius:"50%",background:"#111827",border:"none",color:"#fff",fontSize:"20px",cursor:"pointer",boxShadow:"0 2px 12px rgba(0,0,0,0.2)",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
      </div>

      {modal&&<CaseModal onClose={()=>setModal(null)} onSave={handleSave} editCase={modal==="new"?null:modal} companies={companies} categories={categories}/>}
      {masterOpen&&<CompanyMasterModal companies={companies} onClose={()=>setMasterOpen(false)} onSave={async(list:Company[])=>{await saveCompanies(list);setCompanies(list);setMasterOpen(false);}}/>}
      {settingsOpen&&<SettingsModal settings={settings} onClose={()=>setSettingsOpen(false)} onSave={async(s:AppSettings)=>{await saveAppSettings(s);setSettings(s);setSettingsOpen(false);}}/>}
      {feeOpen&&<FeeRateModal companies={companies} categories={categories} feeRates={feeRates} onClose={()=>setFeeOpen(false)} onSave={async(cats:Category[],r:FeeRateMap)=>{await saveCategories(cats);await saveFeeRates(r);setCategories(cats);setFeeRates(r);setFeeOpen(false);}}/>}
      {invoiceOpen&&<MonthlyInvoiceModal cases={cases} companies={companies} categories={categories} settings={settings} feeRates={feeRates} onClose={()=>setInvoiceOpen(false)} onBulkStatusChange={handleBulkStatus}/>}
    </div>
  );
}