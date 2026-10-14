import {getFirestore} from "firebase-admin/firestore";
import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {notificationCandidates} from "./notification-candidates";

/**
 * Review-only event capture. There is deliberately no email transport.
 * @param {string} document Exact source path; avoids unrelated write triggers.
 * @return {Function} Firestore handler for the selected source.
 */
const observe = (document: string) => onDocumentWritten(
  {document, region: "us-central1"},
  async (event) => {
    if (!event.data) return;
    const path = document;
    const candidates = notificationCandidates(
      path, event.data.before.data(), event.data.after.data(),
      event.id, event.time,
    );
    if (!candidates.length) return;
    const db = getFirestore();
    // Bound transactions below Firestore's per-commit write limit.
    // Reads before writes; duplicate trigger deliveries cannot replace review.
    for (let offset = 0; offset < candidates.length; offset += 100) {
      const group = candidates.slice(offset, offset + 100);
      await db.runTransaction(async (tx) => {
        const refs = group.map((item) =>
          db.doc(`notificationCandidates/${item.id}`));
        const existing = await Promise.all(refs.map((ref) => tx.get(ref)));
        group.forEach((item, index) => {
          if (!existing[index].exists) tx.create(refs[index], item);
        });
      });
    }
  },
);

export const captureOrderNotifications =
  observe("domains/commercial/fields/orders");
export const captureDeliveryNotifications =
  observe("domains/delivery/fields/tasks");
export const captureDeliveryOverrideNotifications =
  observe("domains/delivery/fields/overrides");
export const capturePaymentNotifications =
  observe("domains/commerce/fields/payments");
export const captureInvoiceNotifications =
  observe("domains/commerce/fields/invoices");
