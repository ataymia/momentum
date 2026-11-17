"use client";

/** CSV exports operate only on records already authorized by the caller.
 * This module does not grant data access or replace server-side record checks.
 */
export function escapeCsvCell(value:unknown):string{
  if(value===undefined||value===null)return '""';
  let text=String(value);
  // Spreadsheet formula evaluation may ignore leading whitespace and control
  // characters. Prefix risky text rather than stripping business content.
  if(typeof value==="string"&&/^[\s\u0000-\u001f\u007f\ufeff]*[=+@-]/u.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}

export function csvDocument(rows:ReadonlyArray<Record<string,unknown>>,columns:readonly string[]):string{
  // Only allowlisted columns are serialized, never incidental object properties.
  return "\uFEFF"+[columns.map(escapeCsvCell).join(","),...rows.map(row=>columns.map(key=>escapeCsvCell(row[key])).join(","))].join("\r\n");
}

/** Browser-only, user-triggered exports of records already authorized in the caller's view. */
export function downloadCsv(filename:string,rows:ReadonlyArray<Record<string,unknown>>,columns:readonly string[]):void{
  if(typeof document==="undefined"||typeof window==="undefined"||typeof URL==="undefined"||typeof URL.createObjectURL!=="function")return;
  const url=URL.createObjectURL(new Blob([csvDocument(rows,columns)],{type:"text/csv;charset=utf-8;"}));
  const a=document.createElement("a");
  a.href=url;
  a.download=filename.replace(/[^a-zA-Z0-9._-]/g,"_")||"momentum-export.csv";
  document.body.appendChild(a);
  try{a.click();}finally{
    a.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
}
