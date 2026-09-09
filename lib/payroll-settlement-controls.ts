import { arizonaDateKey } from "./date-time";
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

const dateKey = /^\d{4}-\d{2}-\d{2}$/;
const today = () => arizonaDateKey();

export function validSettlementDate(value: string, asOf = today()) {
  return dateKey.test(value) && value <= asOf;
}

export function liabilityCanSchedule(liability: TaxLiability) {
  return liability.status === "Accrued";
}

export function liabilityCanRecordPaid(liability: TaxLiability, reference: string, paidDate: string, asOf = today()) {
  return liability.status === "Scheduled" && Boolean(reference.trim()) && validSettlementDate(paidDate, asOf);
}

export function disbursementCanRecordSettlement(disbursement: Disbursement, reference: string, settlementDate: string, asOf = today()) {
  return disbursement.status === "Released" && Boolean(reference.trim()) && validSettlementDate(settlementDate, asOf);
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
