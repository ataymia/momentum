import {randomUUID} from "node:crypto";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";

type Row=Record<string, unknown>;
type Result={
  uid: string;
  separatedAt: string;
  releasedAccountIds: string[];
  suspendedTerritoryIds: string[];
  authDisabled: boolean;
};

const record=(value: unknown):value is Row=>
  Boolean(value && typeof value==="object" && !Array.isArray(value));
const text=(value: unknown):string=>
  typeof value==="string"?value.trim():"";
const rows=(value: unknown):Row[]=>
  Array.isArray(value)?value.filter(record):[];

/** A recoverable and client-safe employee offboarding failure. */
export class EmployeeSeparationError extends Error {
  /**
   * @param {number} status HTTP status.
   * @param {string} message Client-safe explanation.
   */
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

/**
 * Revoke one former employee while retaining their directory identity and
 * every sale, order, note, commission source, and historic assignment.
 *
 * Account ownership is a commercial overlay, so base workspace account
 * records stay untouched. This is also essential for legacy normalization,
 * which expects historical account owners to remain in the user directory.
 *
 * @param {string} adminUid Verified active Administrator Firebase UID.
 * @param {string} targetUid Employee UID; cannot be self or Administrator.
 * @param {string} reason Approved internal offboarding explanation.
 * @return {Promise<Result>} Release counts and identity lockout result.
 */
export async function separateEmployee(
  adminUid: string,
  targetUid: string,
  reason: string,
):Promise<Result> {
  if (!adminUid || !targetUid || adminUid===targetUid ||
      reason.trim().length<5 || reason.length>500) {
    throw new EmployeeSeparationError(
      400, "Choose another employee and provide a reason.");
  }

  const db=getFirestore();
  const adminRef=db.doc(`userAccess/${adminUid}`);
  const targetRef=db.doc(`userAccess/${targetUid}`);
  const directoryRef=db.doc(`employeeDirectory/${targetUid}`);
  const accountsRef=db.doc("domains/workspace/fields/accounts");
  const commercialRef=db.doc("domains/commercial/fields/_root");
  const territoriesRef=db.doc("domains/commercial/fields/territories");
  const auditRef=db.doc(`employeeSeparations/${targetUid}`);
  const metaRef=db.doc("platform/meta");

  const outcome=await db.runTransaction(async (tx) => {
    const [
      admin, target, directory, accountDoc, commercial, territoryDoc, audit,
    ]=await Promise.all([
      tx.get(adminRef), tx.get(targetRef), tx.get(directoryRef),
      tx.get(accountsRef), tx.get(commercialRef), tx.get(territoriesRef),
      tx.get(auditRef),
    ]);
    const adminData=admin.data();
    const targetData=target.data();
    if (adminData?.role!=="Administrator" ||
        adminData.accountState!=="Active") {
      throw new EmployeeSeparationError(403, "Administrator access required.");
    }
    if (!target.exists || !directory.exists) {
      throw new EmployeeSeparationError(404, "Employee record not found.");
    }
    if (targetData?.role==="Administrator") {
      throw new EmployeeSeparationError(
        403, "Administrator separation requires separate approval.");
    }

    // A retry after a partial Firebase Auth failure must be safe.
    if (audit.exists && targetData?.accountState==="Separated") {
      const prior=audit.data();
      return {
        uid: targetUid,
        separatedAt: text(prior?.separatedAt),
        releasedAccountIds: Array.isArray(prior?.releasedAccountIds)?
          prior.releasedAccountIds.filter(
            (value: unknown):value is string=>typeof value==="string") : [],
        suspendedTerritoryIds: Array.isArray(prior?.suspendedTerritoryIds)?
          prior.suspendedTerritoryIds.filter(
            (value: unknown):value is string=>typeof value==="string") : [],
      };
    }

    const baseAccounts=rows(accountDoc.data()?.items);
    const rawRoot=commercial.data()?.data;
    const root=record(rawRoot)?rawRoot: {};
    const currentPatches=record(root.accountPatches)?
      root.accountPatches: {};
    const patches: Row={...currentPatches};
    const releasedAccountIds: string[]=[];
    const stamp=new Date().toISOString();

    for (const account of baseAccounts) {
      const id=text(account.id);
      if (!id) continue;
      const candidate=currentPatches[id];
      const prior=record(candidate)?candidate: {};
      const owner=typeof prior.ownerId==="string"?
        prior.ownerId: text(account.ownerId);
      if (owner!==targetUid) continue;
      patches[id]={
        ...prior,
        ownerId: "",
        accountManagerId: "",
        responsibilityStartedAt: stamp,
        lastActivity: "Account released after employee separation",
      };
      releasedAccountIds.push(id);
    }

    const currentTerritories=rows(territoryDoc.data()?.items);
    const suspendedTerritoryIds: string[]=[];
    const territories=currentTerritories.map((territory) => {
      if (text(territory.ownerId)!==targetUid) return territory;
      const id=text(territory.id);
      if (id) suspendedTerritoryIds.push(id);
      const {ownerId, ...history}=territory;
      void ownerId;
      return {
        ...history,
        status: "Suspended",
        updatedAt: stamp,
        updatedBy: adminUid,
        notes: text(territory.notes) +
          " | Employee separated; territory awaits reassignment.",
      };
    });

    tx.update(targetRef, {
      accountState: "Separated",
      updatedAt: stamp,
      updatedBy: adminUid,
    });
    tx.set(directoryRef, {
      employmentStatus: "Separated",
      separatedAt: stamp,
    }, {merge: true});
    if (releasedAccountIds.length) {
      tx.set(commercialRef, {
        data: {...root, accountPatches: patches},
      });
    }
    if (suspendedTerritoryIds.length) {
      tx.set(territoriesRef, {items: territories});
    }

    const event={
      uid: targetUid,
      actorUid: adminUid,
      separatedAt: stamp,
      reason: reason.trim(),
      previousState: text(targetData?.accountState),
      releasedAccountIds,
      suspendedTerritoryIds,
      historyPreserved: true,
    };
    if (audit.exists) {
      tx.update(auditRef, event);
    } else {
      tx.create(auditRef, event);
    }
    const paths=["employeeDirectory"];
    if (releasedAccountIds.length) {
      paths.push("domains_commercial_fields_root");
    }
    if (suspendedTerritoryIds.length) {
      paths.push("domains_commercial_fields_territories");
    }
    const version=stamp+"#"+randomUUID().slice(0, 6);
    tx.set(metaRef, {
      versions: Object.fromEntries(paths.map((key)=>[key, version])),
    }, {merge: true});

    return {
      uid: targetUid,
      separatedAt: stamp,
      releasedAccountIds,
      suspendedTerritoryIds,
    };
  });

  // Firestore's live rules deny separated identities as soon as the above
  // transaction commits. Now also lock Firebase Auth and refresh tokens.
  // A failure here is retryable: no account/history rollback is attempted.
  let authDisabled=true;
  try {
    await getAuth().updateUser(targetUid, {disabled: true});
    await getAuth().revokeRefreshTokens(targetUid);
  } catch (error) {
    const code=record(error)?text(error.code):"";
    if (code==="auth/user-not-found") {
      // The identity is already gone; do not report an Auth disable that
      // never took place. Firestore access remains revoked.
      authDisabled=false;
    } else {
      await auditRef.set({authLockoutStatus: "Retry required"},
        {merge: true});
      throw new EmployeeSeparationError(
        502, "Workspace access was revoked. Firebase Auth lockout " +
        "needs Administrator verification and retry.");
    }
  }

  await auditRef.set({
    authLockoutStatus: authDisabled ? "Disabled" : "Identity missing",
    authCheckedAt: new Date().toISOString(),
  }, {merge: true});
  return {...outcome, authDisabled};
}
