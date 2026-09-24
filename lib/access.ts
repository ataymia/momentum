import type { Account, Approval, Bulletin, PageKey, WorkspaceData, WorkspaceUser } from "./types";

const pageAccess: Record<WorkspaceUser["role"], PageKey[]> = {
  Administrator: ["home","work","actions","accounts","quickVisit","salesMap","accountSetup","accountHealth","dispatch","retail","orders","orderCash","inventory","inventoryLedger","products","marketing","brandAmbassadors","people","employees","newHire","onboarding","trainingAdmin","timekeeping","materials","payroll","finance","accounting","reports","performance","reportingCenter","audit","settings","dataExchange","help"],
  "Sales Manager": ["home","work","actions","accounts","quickVisit","salesMap","accountSetup","accountHealth","dispatch","retail","orders","orderCash","products","marketing","people","employees","timekeeping","materials","payroll","finance","reports","performance","reportingCenter","help"],
  "Sales Representative": ["home","work","actions","accounts","quickVisit","salesMap","accountSetup","accountHealth","dispatch","retail","orders","orderCash","products","marketing","brandAmbassadors","people","employees","timekeeping","materials","payroll","finance","reports","performance","reportingCenter","help"],
  "Brand Ambassador": ["home","brandAmbassadors","timekeeping","materials","help"],
  Operations: ["home","work","actions","dispatch","orders","orderCash","inventory","inventoryLedger","products","marketing","people","employees","timekeeping","materials","payroll","finance","help"],
  Warehouse: ["home","work","actions","orders","inventory","inventoryLedger","products","people","employees","timekeeping","materials","payroll","help"],
  "Delivery Driver": ["home","orders","inventory","inventoryLedger","people","employees","timekeeping","materials","help"],
  Customer: ["home","accounts","orders","help"],
};

export const canAccessPage = (user: WorkspaceUser | null, page: PageKey) => Boolean(user && pageAccess[user.role].includes(page));
export const isCustomer = (user: WorkspaceUser | null) => user?.role === "Customer";
export const canCreateAccount = (user: WorkspaceUser | null) => Boolean(user && ["Administrator","Sales Manager","Sales Representative"].includes(user.role));
export const canCreateOrder = (user: WorkspaceUser | null) => Boolean(user && ["Administrator","Sales Manager","Sales Representative","Customer"].includes(user.role));
export const canAdvanceFulfillment = (user: WorkspaceUser | null) => Boolean(user && ["Administrator","Operations","Delivery Driver"].includes(user.role));
export const canManageSchedule = (user: WorkspaceUser | null) => Boolean(user && ["Administrator","Sales Manager","Operations"].includes(user.role));
export const canCreateScheduleItem = (user: WorkspaceUser | null) => Boolean(user && ["Administrator","Sales Manager","Sales Representative","Operations"].includes(user.role));
export const canPostBulletin = (user: WorkspaceUser | null) => Boolean(user && ["Administrator","Sales Manager"].includes(user.role));
export const canReconcileOrderPayment = (user: WorkspaceUser | null | undefined) => user?.role === "Administrator";
export const canManageMarketing = (user: WorkspaceUser | null | undefined) => user?.role === "Administrator";
export const canManageCustomerCredit = (user: WorkspaceUser | null | undefined) => Boolean(user && ["Administrator","Sales Manager"].includes(user.role));
export const canEditEmployeeDirectory = (user: WorkspaceUser | null | undefined) => user?.role === "Administrator";

const managedUserIds = (data: WorkspaceData, user: WorkspaceUser) => {
  const teams = new Set(user.managedTeams ?? []);
  return new Set(data.users.filter(candidate => candidate.id === user.id || candidate.managerId === user.id || teams.has(candidate.team)).map(candidate => candidate.id));
};

export const canManageUser = (data: WorkspaceData, actor: WorkspaceUser | null | undefined, targetUserId: string, includeSelf = true) => {
  if (!actor) return false;
  if (actor.role === "Administrator") return true;
  if (includeSelf && actor.id === targetUserId) return true;
  if (actor.role !== "Sales Manager") return false;
  if (actor.id === targetUserId) return false;
  return managedUserIds(data, actor).has(targetUserId);
};

/** Brand Ambassador supervision is intentionally narrower than HR management. */
export const canSuperviseBrandAmbassador = (data: WorkspaceData, actor: WorkspaceUser | null | undefined, targetUserId: string) => {
  if (!actor) return false;
  const target = data.users.find((user) => user.id === targetUserId && user.role === "Brand Ambassador");
  return Boolean(target && actor.role === "Administrator");
};

export const canAssignScheduleUser = (data: WorkspaceData, actor: WorkspaceUser | null | undefined, targetUserId: string) => {
  if (!actor) return false;
  const target = data.users.find((user) => user.id === targetUserId);
  if (!target || target.role === "Customer" || target.role === "Warehouse" || target.role === "Brand Ambassador") return false;
  if (actor.role === "Administrator") return ["Sales", "Operations", "Leadership"].includes(target.team);
  if (actor.role === "Operations") return target.team === "Operations";
  if (actor.role === "Sales Manager") return target.team === "Sales" && canManageUser(data, actor, target.id, true);
  if (actor.role === "Sales Representative") return target.id === actor.id;
  return false;
};

export const accountIsVisible = (data: WorkspaceData, user: WorkspaceUser, account: Account) => {
  if (["Administrator","Operations","Warehouse"].includes(user.role)) return true;
  if (user.role === "Delivery Driver") return data.orders.some((order) => order.accountId === account.id && ["Approved","Allocated","Out for delivery","Delivered","Paid"].includes(order.status));
  if (user.role === "Customer") return (user.accountIds ?? []).includes(account.id);
  if (user.role === "Brand Ambassador") return false;
  if (user.role === "Sales Representative") return account.ownerId === user.id || (!account.ownerId && account.stage === "Prospect");
  return Boolean(account.ownerId) && managedUserIds(data, user).has(account.ownerId);
};

/** Only an unassigned Prospect may be self-claimed. Existing customers still use managed responsibility transfer. */
export const canClaimUnassignedProspect = (user: WorkspaceUser | null | undefined, account: Account | null | undefined) => Boolean(
  user?.role === "Sales Representative" &&
  account &&
  account.stage === "Prospect" &&
  !account.ownerId,
);

export const canTransferSalesResponsibility = (data: WorkspaceData, actor: WorkspaceUser | null | undefined, account: Account, targetUserId: string) => {
  if (!actor || !["Administrator", "Sales Manager"].includes(actor.role) || !accountIsVisible(data, actor, account)) return false;
  const target = data.users.find((user) => user.id === targetUserId && ["Sales Representative", "Sales Manager"].includes(user.role));
  if (!target) return false;
  if (actor.role === "Administrator") return true;
  return target.team === "Sales" && canManageUser(data, actor, target.id, true);
};

export const canReviewApproval = (data: WorkspaceData, user: WorkspaceUser | null, approval: Approval) => {
  if (!user) return false;
  // Sales orders have one authoritative Administrator approval. A Sales Manager may still review
  // manager-owned workflows such as timecards, but cannot create a second order decision.
  if (["Order", "Low stock sale"].includes(approval.type)) return user.role === "Administrator";
  if (user.role === "Administrator") return true;
  if (user.role !== "Sales Manager") return false;
  if (approval.requesterId && managedUserIds(data, user).has(approval.requesterId)) return approval.requesterId !== user.id;
  return Boolean(approval.team && (user.managedTeams ?? []).includes(approval.team));
};

export const canPublishBulletinTo = (user: WorkspaceUser | null, audience: Bulletin["audience"], team?: Bulletin["team"]) => {
  if (!user) return false;
  if (user.role === "Administrator") return audience === "Company" || Boolean(team && team !== "Customer");
  return user.role === "Sales Manager" && audience === "Team" && Boolean(team && (user.managedTeams ?? []).includes(team));
};

export function getWorkspaceScope(data: WorkspaceData, user: WorkspaceUser | null) {
  const empty = { users: [], accounts: [], activities: [], appointments: [], orders: [], placements: [], inventory: [], approvals: [], timeEntries: [], timecards: [], notifications: [], bulletins: [] };
  if (!user) return empty;
  const accounts = data.accounts.filter(account => accountIsVisible(data, user, account));
  const accountIds = new Set(accounts.map(account => account.id));
  const managedIds = managedUserIds(data, user);
  const users = user.role === "Administrator" ? data.users : data.users.filter(candidate => candidate.id === user.id || (user.role === "Sales Manager" && managedIds.has(candidate.id)) || (user.role === "Sales Representative" && (candidate.id === user.managerId || (candidate.role === "Brand Ambassador" && candidate.managerId === user.id))));
  const appointments = user.role === "Administrator"
    ? data.appointments
    : user.role === "Operations"
      ? data.appointments.filter(item => item.ownerId === user.id || item.type === "Delivery")
      : user.role === "Sales Manager"
        ? data.appointments.filter(item => !item.ownerId ? item.type !== "Delivery" : managedIds.has(item.ownerId))
        : user.role === "Sales Representative"
          ? data.appointments.filter(item => item.ownerId === user.id)
          : [];
  const orders = ["Administrator","Operations","Warehouse"].includes(user.role) ? data.orders : user.role === "Delivery Driver" ? data.orders.filter((order) => ["Approved","Allocated","Out for delivery","Delivered","Paid"].includes(order.status)) : data.orders.filter(order => accountIds.has(order.accountId));
  const placements = ["Customer","Operations","Warehouse","Brand Ambassador","Delivery Driver"].includes(user.role) ? [] : user.role === "Administrator" ? data.placements : data.placements.filter(item => accountIds.has(item.accountId));
  const approvals = user.role === "Administrator" ? data.approvals : user.role === "Sales Manager" ? data.approvals.filter(item => (item.requesterId && managedIds.has(item.requesterId)) || Boolean(item.team && (user.managedTeams ?? []).includes(item.team))) : data.approvals.filter(item => item.requesterId === user.id);
  const visibleTimeUserIds = user.role === "Administrator" ? new Set(data.users.filter((candidate) => candidate.role !== "Customer").map((candidate) => candidate.id)) : user.role === "Sales Manager" ? managedIds : new Set([user.id]);
  const timecards = data.timecards.filter((card) => visibleTimeUserIds.has(card.userId));
  const now = new Date().toISOString();
  const bulletins = user.role === "Customer" ? [] : data.bulletins.filter(item => {
    if (user.role === "Administrator") return true;
    if (item.expiresAt && item.expiresAt < now) return false;
    if (item.audience === "Company") return true;
    return user.role === "Sales Manager" ? Boolean(item.team && (user.managedTeams ?? []).includes(item.team)) : item.team === user.team;
  });
  const activities = user.role === "Operations"
    ? data.activities.filter(item => item.type === "order" || (item.type === "visit" && appointments.some(appointment => appointment.accountId === item.accountId)))
    : user.role === "Delivery Driver"
      ? data.activities.filter((item) => item.type === "order")
    : user.role === "Warehouse"
      ? data.activities.filter(item => item.type === "order")
      : user.role === "Brand Ambassador"
        ? []
        : data.activities.filter(item => !item.accountId || accountIds.has(item.accountId));
  return {
    users, accounts, activities, appointments, orders, placements,
    inventory: ["Administrator","Operations","Warehouse","Delivery Driver"].includes(user.role) ? data.inventory : [],
    approvals,
    timeEntries: data.timeEntries.filter(item => visibleTimeUserIds.has(item.userId)),
    timecards,
    notifications: user.role === "Customer" ? [] : data.notifications.filter(item => !item.audienceUserIds || item.audienceUserIds.includes(user.id)),
    bulletins,
  };
}
