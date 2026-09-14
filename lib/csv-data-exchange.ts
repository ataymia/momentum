import type { Appointment, InventoryLot } from "./types";
import type { Shift } from "./hcm-engine";
import { isValidCalendarDateKey } from "./date-time";

export type CsvRow = Record<string, string>;
export type CsvParseResult = { headers: string[]; rows: CsvRow[]; errors: string[] };
export type ImportResult<T> = { records: T[]; errors: string[] };

function csvCell(value: unknown) {
  if (value === undefined || value === null) return "";
  const text = Array.isArray(value) ? value.join("|") : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function rowsToCsv(rows: Record<string, unknown>[], columns?: string[]) {
  const headers = columns?.length ? columns : [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [headers.map(csvCell).join(","), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))].join("\n");
}

export function parseCsv(text: string): CsvParseResult {
  const matrix: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; continue; }
      if (char === '"') { quoted = false; continue; }
      cell += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ",") { row.push(cell); cell = ""; continue; }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim())) matrix.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) matrix.push(row);
  if (!matrix.length) return { headers: [], rows: [], errors: ["CSV file is empty."] };
  const headers = matrix[0].map((value) => value.trim());
  const errors: string[] = [];
  if (headers.some((header) => !header)) errors.push("Every CSV column must have a header.");
  if (new Set(headers).size !== headers.length) errors.push("CSV headers must be unique.");
  const rows = matrix.slice(1).map((values, rowIndex) => {
    if (values.length > headers.length) errors.push(`Row ${rowIndex + 2} has more values than headers.`);
    return Object.fromEntries(headers.map((header, columnIndex) => [header, values[columnIndex]?.trim() ?? ""]));
  });
  return { headers, rows, errors };
}

const required = (row: CsvRow, fields: string[], rowNumber: number, errors: string[]) => {
  const missing = fields.filter((field) => !row[field]?.trim());
  if (missing.length) errors.push(`Row ${rowNumber}: missing ${missing.join(", ")}.`);
  return missing.length === 0;
};
const numberValue = (value: string, label: string, rowNumber: number, errors: string[], options: { min?: number; integer?: boolean } = {}) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (options.integer && !Number.isInteger(parsed)) || (options.min !== undefined && parsed < options.min)) {
    errors.push(`Row ${rowNumber}: ${label} is invalid.`);
    return undefined;
  }
  return parsed;
};
const dateValue = (value: string, label: string, rowNumber: number, errors: string[]) => {
  if (!isValidCalendarDateKey(value)) { errors.push(`Row ${rowNumber}: ${label} must be a valid YYYY-MM-DD calendar date.`); return undefined; }
  return value;
};
const timeValue = (value: string, label: string, rowNumber: number, errors: string[]) => {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) { errors.push(`Row ${rowNumber}: ${label} must use HH:MM 24-hour time.`); return undefined; }
  return value;
};

export type AccountImportRow = { name:string; location:string; channel:string; contactName:string; contactRole:string; phone:string; email:string; customerName?:string; locationName?:string; streetAddress?:string };
export function parseAccountImport(rows: CsvRow[]): ImportResult<AccountImportRow> {
  const records: AccountImportRow[] = []; const errors: string[] = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (!required(row, ["name","location","channel","contactName","contactRole","phone","email"], rowNumber, errors)) return;
    records.push({ name:row.name, location:row.location, channel:row.channel, contactName:row.contactName, contactRole:row.contactRole, phone:row.phone, email:row.email, customerName:row.customerName||undefined, locationName:row.locationName||undefined, streetAddress:row.streetAddress||undefined });
  });
  return { records, errors };
}

export function parseInventoryImport(rows: CsvRow[]): ImportResult<InventoryLot> {
  const records: InventoryLot[] = []; const errors: string[] = []; const statuses = new Set<InventoryLot["status"]>(["Available","Quality hold","Low stock"]);
  rows.forEach((row,index) => {
    const rowNumber=index+2;
    if(!required(row,["lotCode","product","receivedAt","bestBy","onHand","status","location"],rowNumber,errors))return;
    const receivedAt=dateValue(row.receivedAt,"receivedAt",rowNumber,errors); const bestBy=dateValue(row.bestBy,"bestBy",rowNumber,errors);
    const onHand=numberValue(row.onHand,"onHand",rowNumber,errors,{min:0,integer:true}); const reserved=row.reserved?numberValue(row.reserved,"reserved",rowNumber,errors,{min:0,integer:true}):0;
    if(!statuses.has(row.status as InventoryLot["status"]))errors.push(`Row ${rowNumber}: status must be Available, Quality hold, or Low stock.`);
    if(!receivedAt||!bestBy||onHand===undefined||reserved===undefined||!statuses.has(row.status as InventoryLot["status"]))return;
    if(reserved!==0){errors.push(`Row ${rowNumber}: reserved must be 0 on a new lot import. Reservations must be created from approved orders so the custody ledger and order evidence stay linked.`);return;}
    records.push({id:row.id||"",lotCode:row.lotCode,product:row.product,receivedAt,bestBy,onHand,reserved:0,available:onHand,status:row.status as InventoryLot["status"],location:row.location,holdReason:row.holdReason||undefined});
  });
  return{records,errors};
}

export type AppointmentImportRow = Pick<Appointment,"accountId"|"date"|"startTime"|"duration"|"type"|"objective"> & { ownerId?:string; priority?:Appointment["priority"]; tags?:string[]; arrivalWindow?:string };
export function parseAppointmentImport(rows:CsvRow[]):ImportResult<AppointmentImportRow>{
  const records:AppointmentImportRow[]=[];const errors:string[]=[];const types=new Set<Appointment["type"]>(["First visit","Sample drop","Placement check","Reorder","Delivery"]);const priorities=new Set(["Normal","High","Urgent"]);
  rows.forEach((row,index)=>{const rowNumber=index+2;if(!required(row,["accountId","date","startTime","duration","type","objective"],rowNumber,errors))return;const date=dateValue(row.date,"date",rowNumber,errors);const startTime=timeValue(row.startTime,"startTime",rowNumber,errors);const duration=numberValue(row.duration,"duration",rowNumber,errors,{min:1,integer:true});if(!types.has(row.type as Appointment["type"]))errors.push(`Row ${rowNumber}: appointment type is invalid.`);if(row.priority&&!priorities.has(row.priority))errors.push(`Row ${rowNumber}: priority is invalid.`);if(!date||!startTime||duration===undefined||!types.has(row.type as Appointment["type"])||(row.priority&&!priorities.has(row.priority)))return;records.push({accountId:row.accountId,date,startTime,duration,type:row.type as Appointment["type"],objective:row.objective,ownerId:row.ownerId||undefined,priority:(row.priority||undefined) as Appointment["priority"],tags:row.tags?row.tags.split("|").map((value)=>value.trim()).filter(Boolean):[],arrivalWindow:row.arrivalWindow||undefined});});return{records,errors};
}

export type OrderImportRow={accountId:string;cases:number;product:string};
export function parseOrderImport(rows:CsvRow[]):ImportResult<OrderImportRow>{const records:OrderImportRow[]=[];const errors:string[]=[];rows.forEach((row,index)=>{const rowNumber=index+2;if(!required(row,["accountId","cases","product"],rowNumber,errors))return;const cases=numberValue(row.cases,"cases",rowNumber,errors,{min:1,integer:true});if(cases===undefined)return;records.push({accountId:row.accountId,cases,product:row.product.trim()});});return{records,errors};}

export type ShiftImportRow=Omit<Shift,"id"|"createdAt"|"createdBy">;
export function parseShiftImport(rows:CsvRow[]):ImportResult<ShiftImportRow>{const records:ShiftImportRow[]=[];const errors:string[]=[];const statuses=new Set<Shift["status"]>(["Draft","Published","Open","Completed","Cancelled"]);rows.forEach((row,index)=>{const rowNumber=index+2;if(!required(row,["userId","date","startTime","endTime","role","location","status"],rowNumber,errors))return;const date=dateValue(row.date,"date",rowNumber,errors);const startTime=timeValue(row.startTime,"startTime",rowNumber,errors);const endTime=timeValue(row.endTime,"endTime",rowNumber,errors);if(!statuses.has(row.status as Shift["status"]))errors.push(`Row ${rowNumber}: shift status is invalid.`);if(date&&startTime&&endTime&&minutes(endTime)<=minutes(startTime))errors.push(`Row ${rowNumber}: endTime must be later than startTime.`);if(!date||!startTime||!endTime||!statuses.has(row.status as Shift["status"])||minutes(endTime)<=minutes(startTime))return;records.push({userId:row.userId,date,startTime,endTime,role:row.role,location:row.location,status:row.status as Shift["status"],note:row.note||undefined});});return{records,errors};}

function minutes(value:string){const[hours,mins]=value.split(":").map(Number);return hours*60+mins;}
