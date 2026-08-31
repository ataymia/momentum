import type { Account, Approval, Bulletin, PageKey, WorkspaceData, WorkspaceUser } from "./types";

const pageAccess: Record<WorkspaceUser["role"], PageKey[]> = {
  Administrator: ["home","work","accounts","dispatch","retail","orders","inventory","marketing","people","payroll","finance","reports","settings","help"],
  "Sales Manager": ["home","work","accounts","dispatch","retail","orders","reports","help"],
  "Sales Representative": ["home","work","accounts","dispatch","retail","orders","help"],
  Operations: ["home","work","dispatch","orders","inventory","marketing","people","payroll","finance","help"],
  Customer: ["home","accounts","orders","help"],
};

export const canAccessPage = (user: WorkspaceUser | null, page: PageKey) => Boolean(user && pageAccess[user.role].includes(page));
export const isCustomer = (user: WorkspaceUser | null) => user?.role === "Customer";
export const canCreateAccount = (user: WorkspaceUser | null) => Boolean(user && ["Administrator","Sales Manager","Sales Representative"].includes(user.role));
export const canCreateOrder = (user: WorkspaceUser | null) => Boolean(user && ["Administrator","Sales Manager","Sales Representative","Customer"].includes(user.role));
export const canAdvanceFulfillment = (user: WorkspaceUser | null) => Boolean(user && ["Administrator","Operations"].includes(user.role));
export const canManageSchedule = (user: WorkspaceUser | null) => Boolean(user && ["Administrator","Sales Manager","Operations"].includes(user.role));
export const canCreateScheduleItem = (user: WorkspaceUser | null) => Boolean(user && user.role !== "Customer");
export const canPostBulletin = (user: WorkspaceUser | null) => Boolean(user && ["Administrator","Sales Manager"].includes(user.role));

const managedUserIds = (data: WorkspaceData, user: WorkspaceUser) => {
  const teams = new Set(user.managedTeams ?? []);
  return new Set(data.users.filter(candidate => candidate.id === user.id || candidate.managerId === user.id || teams.has(candidate.team)).map(candidate => candidate.id));
};

export const accountIsVisible = (data: WorkspaceData, user: WorkspaceUser, account: Account) => {
  if (user.role === "Administrator" || user.role === "Operations") return true;
  if (user.role === "Customer") return (user.accountIds ?? []).includes(account.id);
  if (user.role === "Sales Representative") return account.ownerId === user.id;
  return managedUserIds(data, user).has(account.ownerId);
};

export const canReviewApproval = (data: WorkspaceData, user: WorkspaceUser | null, approval: Approval) => {
  if (!user) return false;
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
  const users = user.role === "Administrator" ? data.users : data.users.filter(candidate => candidate.id === user.id || (user.role === "Sales Manager" && managedIds.has(candidate.id)) || (user.role === "Sales Representative" && candidate.id === user.managerId));
  const appointments = user.role === "Administrator"
    ? data.appointments
    : user.role === "Operations"
      ? data.appointments.filter(item => item.ownerId === user.id || item.type === "Delivery")
      : user.role === "Sales Manager"
        ? data.appointments.filter(item => !item.ownerId ? item.type !== "Delivery" : managedIds.has(item.ownerId))
        : user.role === "Sales Representative"
          ? data.appointments.filter(item => item.ownerId === user.id)
          : [];
  const orders = user.role === "Administrator" || user.role === "Operations" ? data.orders : data.orders.filter(order => accountIds.has(order.accountId));
  const placements = user.role === "Customer" || user.role === "Operations" ? [] : user.role === "Administrator" ? data.placements : data.placements.filter(item => accountIds.has(item.accountId));
  const approvals = user.role === "Administrator" ? data.approvals : user.role === "Sales Manager" ? data.approvals.filter(item => (item.requesterId && managedIds.has(item.requesterId)) || Boolean(item.team && (user.managedTeams ?? []).includes(item.team))) : data.approvals.filter(item => item.requesterId === user.id);
  const timecards = user.role === "Administrator" ? data.timecards : user.role === "Sales Manager" ? data.timecards.filter(card => card.userId === user.id || managedIds.has(card.userId)) : data.timecards.filter(card => card.userId === user.id);
  const timecardUserIds = new Set(timecards.map(card => card.userId));
  const now = new Date().toISOString();
  const bulletins = user.role === "Customer" ? [] : data.bulletins.filter(item => {
    if (user.role === "Administrator") return true;
    if (item.expiresAt && item.expiresAt < now) return false;
    if (item.audience === "Company") return true;
    return user.role === "Sales Manager" ? Boolean(item.team && (user.managedTeams ?? []).includes(item.team)) : item.team === user.team;
  });
  const activities = user.role === "Operations"
    ? data.activities.filter(item => item.type === "order" || (item.type === "visit" && appointments.some(appointment => appointment.accountId === item.accountId)))
    : data.activities.filter(item => !item.accountId || accountIds.has(item.accountId));
  return {
    users, accounts, activities, appointments, orders, placements,
    inventory: user.role === "Administrator" || user.role === "Operations" ? data.inventory : [],
    approvals,
    timeEntries: data.timeEntries.filter(item => timecardUserIds.has(item.userId)),
    timecards,
    notifications: user.role === "Customer" ? [] : data.notifications.filter(item => !item.audienceUserIds || item.audienceUserIds.includes(user.id)),
    bulletins,
  };
}
