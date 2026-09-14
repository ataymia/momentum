import { arizonaDateKey, isValidCalendarDateKey } from "./date-time";
import type { Disbursement, TaxLiability } from "./payroll-engine";

export type TaxLiabilityRecord = TaxLiability & {
  scheduledAt?: string;
  scheduledBy?: string;
  paidAt?: string;
  paidBy?: string;
  paymentReference?: string;
};

export type DisbursementRecord = Disbursement & {
  settlementReference?: string;
  failedAt?: string;
  failedBy?: string;
  failureReason?: string;
  retryOf?: string;
  replacedBy?: string;
};

const today = () => arizonaDateKey();
const businessDateFromInstant = (value?: string) => value && !Number.isNaN(new Date(value).getTime()) ? arizonaDateKey(value) : undefined;

export function validSettlementDate(value: string, asOf = today()) {
  return isValidCalendarDateKey(value) && isValidCalendarDateKey(asOf) && value <= asOf;
}

export function liabilityCanSchedule(liability: TaxLiability) {
  return liability.status === "Accrued" && Number.isFinite(liability.amount) && liability.amount > 0;
}

export function liabilityCanRecordPaid(liability: TaxLiability, reference: string, paidDate: string, asOf = today()) {
  const record = liability as TaxLiabilityRecord;
  const notBefore = businessDateFromInstant(record.scheduledAt) ?? businessDateFromInstant(record.createdAt);
  return liability.status === "Scheduled" && Number.isFinite(liability.amount) && liability.amount > 0 && Boolean(reference.trim()) && validSettlementDate(paidDate, asOf) && Boolean(notBefore && paidDate >= notBefore);
}

export function disbursementCanRecordSettlement(disbursement: Disbursement, reference: string, settlementDate: string, asOf = today()) {
  const notBefore = businessDateFromInstant(disbursement.createdAt);
  return disbursement.status === "Released" && Number.isFinite(disbursement.amount) && disbursement.amount >= 0 && Boolean(reference.trim()) && validSettlementDate(settlementDate, asOf) && Boolean(notBefore && settlementDate >= notBefore);
}

export function disbursementCanRecordFailure(disbursement: Disbursement, reason: string) {
  return disbursement.status === "Released" && Boolean(reason.trim());
}

export function disbursementCanRetry(disbursement: Disbursement) {
  const record = disbursement as DisbursementRecord;
  return disbursement.status === "Failed" && !record.replacedBy;
}

export const taxLiabilityRecord = (liability: TaxLiability) => liability as TaxLiabilityRecord;
export const disbursementRecord = (disbursement: Disbursement) => disbursement as DisbursementRecord;
