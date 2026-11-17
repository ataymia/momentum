import {recoverableUnverifiedAuditEvents, type AuditState} from "./audit-engine";

/**
 * A read-only administrator recovery bundle for legacy records that cannot
 * prove their user/time provenance. Never reinterpret these as verified actions.
 * Exporting does not alter source records or make unverified data authoritative.
 */
export function auditRecoveryArchive(state:AuditState,exportedAt:string){
  return {
    format:"momentum-unverified-audit-recovery-v1",
    exportedAt,
    warning:"Legacy observations are not evidence that the named user performed a change. Reconcile against authenticated source records before accepting an event.",
    unverifiedCount:recoverableUnverifiedAuditEvents(state).length,
    records:recoverableUnverifiedAuditEvents(state),
  };
}
