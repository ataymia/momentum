import { currentFirebaseSession } from "./firebase-auth-rest";
import { firebaseFunctionUrl } from "./firebase-functions";
import type { Approval, Order } from "./types";

export type DurableOrderRecord = {
  version: 1;
  order: Order;
  approval: Approval;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
};

type ServiceResponse<T> = { ok: true } & T | { ok: false; message: string };

async function callOrderService<T>(functionName: string, body: Record<string, unknown>): Promise<ServiceResponse<T>> {
  const session = await currentFirebaseSession();
  if (!session) return { ok: false, message: "Your Firebase session expired. Sign in again before submitting business records." };
  try {
    const response = await fetch(firebaseFunctionUrl(functionName), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.idToken}`,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null) as ServiceResponse<T> | null;
    if (!payload) return { ok: false, message: `The order service returned an unreadable response (${response.status}).` };
    if (!response.ok || payload.ok !== true) return { ok: false, message: "message" in payload ? payload.message : `Order service failed (${response.status}).` };
    return payload;
  } catch {
    return { ok: false, message: "Could not reach the durable order service. The order was not submitted. Your draft remains on this screen." };
  }
}

export async function submitDurableOrder(order: Order, approval: Approval) {
  return callOrderService<{ record: DurableOrderRecord }>("submitOrder", { order, approval });
}

export async function listDurableOrders() {
  return callOrderService<{ records: DurableOrderRecord[] }>("listOrders", {});
}

export async function decideDurableOrder(orderId: string, decision: "Approved" | "Returned", returnReason?: string) {
  return callOrderService<{ record: DurableOrderRecord }>("decideOrder", { orderId, decision, returnReason });
}
