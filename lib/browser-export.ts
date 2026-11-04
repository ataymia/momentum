"use client";

/** Browser-only, user-triggered exports of records already authorized in the caller's view. */
export function downloadCsv(filename:string, rows:ReadonlyArray<Record<string,unknown>>, columns:readonly string[]):void{
  if(typeof document==="undefined"||typeof URL==="undefined")return;
  // Protect spreadsheet programs against CSV formula injection in customer-entered strings.
  const cell=(value:unknown):string=>{
    if(value===undefined||value===null)return '""';
    let text=String(value);
    if(typeof value==="string"&&/^[=+@-]/.test(text.trimStart()))text="'"+text;
    return '"'+text.replaceAll('"','""')+'"';
  };
  const csv="\uFEFF"+[columns.map(cell).join(","),...rows.map(row=>columns.map(key=>cell(row[key])).join(","))].join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));
  const a=document.createElement("a");
  a.href=url;a.download=filename.replace(/[^a-zA-Z0-9._-]/g,"_")||"momentum-export.csv";
  document.body.appendChild(a);a.click();a.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
