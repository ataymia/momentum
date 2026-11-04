"use client";
/** Manual, explicitly triggered CSV export of fields already scoped to the caller. */
export function downloadPayrollCsv(name:string,rows:ReadonlyArray<Record<string,unknown>>,columns:readonly string[]){
  if(typeof document==="undefined"||typeof window==="undefined")return;
  const cell=(value:unknown)=>{
    if(value==null)return '""';
    let v=String(value);
    if(typeof value==="string"&&/^[=+\-@]/.test(v.trimStart()))v="'"+v;
    return '"'+v.replaceAll('"','""')+'"';
  };
  const csv="\uFEFF"+[columns.map(cell).join(","),...rows.map(row=>columns.map(k=>cell(row[k])).join(","))].join("\r\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");anchor.href=url;anchor.download=name.replace(/[^a-zA-Z0-9_.-]/g,"_")||"payroll.csv";
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
