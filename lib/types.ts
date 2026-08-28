export type PageKey = "home" | "work" | "accounts" | "dispatch" | "retail" | "orders" | "inventory" | "people" | "payroll" | "finance" | "marketing" | "reports" | "settings";

export type Role = "Administrator" | "Sales Manager" | "Sales Representative" | "Operations" | "Customer";
export type Team = "Leadership" | "Sales" | "Operations" | "Customer";

export type WorkspaceUser = {
  id: string; name: string; firstName: string; email: string; initials: string;
  title: string; role: Role; team: Team; managerId?: string; managedTeams?: Team[];
  accountIds?: string[]; accent: string;
};

export type AccountStage = "Prospect" | "Qualified" | "Sampled" | "Opening order" | "Placed" | "Reordered" | "At risk";
export type Account = {
  id: string; name: string; location: string; channel: string; stage: AccountStage;
  ownerId: string; contactName: string; contactRole: string; phone: string; email: string;
  lastActivity: string; nextAction: string; nextActionDate: string;
  health: "Strong" | "Watch" | "New" | "At risk"; lifetimeCases: number; reorderCount: number; notes: string;
};

export type Activity = {
  id: string; accountId?: string; type: "call" | "visit" | "sample" | "order" | "placement" | "note";
  title: string; detail: string; at: string; userId: string;
};

export type AppointmentStatus = "Scheduled" | "Dispatched" | "En route" | "Arrived" | "Completed" | "Needs follow-up";
export type AppointmentOutcome = "Order placed" | "Follow-up scheduled" | "Placement verified" | "No decision" | "Closed lost" | "Delivery completed";
export type Appointment = {
  id: string; accountId: string; ownerId: string; date: string; startTime: string; duration: number;
  type: "First visit" | "Sample drop" | "Placement check" | "Reorder" | "Delivery";
  status: AppointmentStatus; objective: string; location: string; completedAt?: string;
  outcome?: AppointmentOutcome; closeoutNote?: string; nextAction?: string; nextActionDate?: string;
};

export type OrderStatus = "Draft" | "Awaiting approval" | "Approved" | "Allocated" | "Out for delivery" | "Delivered" | "Paid";
export type Order = {
  id: string; number: string; accountId: string; cases: number; pricePerCase: number; amount: number;
  status: OrderStatus; placedAt: string; ownerId: string; paidAt?: string;
  priceBasis: "Demo entered price" | "Prior demo order snapshot";
  paymentStatus: "Not invoiced" | "Open" | "Partially paid" | "Paid";
};

export type Placement = {
  id: string; accountId: string; product: string; casesDelivered: number; facings: number; location: string;
  cold: boolean; shelfPrice: number; observedStock: number; lastChecked: string; nextCheck: string;
  source: "Physical count" | "Customer estimate" | "Demo POS feed";
  status: "Healthy" | "Check soon" | "Out of stock";
};

export type InventoryLot = {
  id: string; lotCode: string; product: string; receivedAt: string; bestBy: string; onHand: number;
  reserved: number; available: number; status: "Available" | "Quality hold" | "Low stock"; location: string;
  holdReason?: string; holdDecision?: string; holdResolvedAt?: string; holdResolvedBy?: string;
};

export type ApprovalType = "Order" | "Timecard" | "Price exception" | "Inventory adjustment" | "Leave" | "Expense" | "Marketing spend" | "Compensation";
export type Approval = {
  id: string; type: ApprovalType; title: string; detail: string; requestedBy: string;
  requesterId?: string; recordId?: string; team?: Team; submittedAt: string; dueAt: string;
  priority: "Normal" | "High" | "Urgent"; status: "Pending" | "Approved" | "Returned";
};

export type TimeEntry = {
  id: string; userId: string; date: string; clockIn: string; clockOut?: string;
  mealStart?: string; mealEnd?: string; breakMinutes: number;
  source: "Demo mobile" | "Demo desktop" | "Manual correction"; note?: string;
};
export type Timecard = {
  id: string; userId: string; weekStart: string; weekEnd: string;
  status: "Open" | "Submitted" | "Manager approved" | "Returned" | "Payroll ready";
  submittedAt?: string; approvedAt?: string; approverId?: string; attested: boolean;
};

export type Notification = {
  id: string; title: string; detail: string; at: string; readBy: string[];
  tone: "info" | "warning" | "success"; audienceUserIds?: string[];
};

export type Bulletin = {
  id: string; title: string; body: string; audience: "Company" | "Team"; team?: Team;
  priority: "Update" | "Important" | "Urgent"; authorId: string; publishedAt: string;
  expiresAt?: string; acknowledgedBy: string[];
};

export type WorkspaceData = {
  users: WorkspaceUser[]; accounts: Account[]; activities: Activity[]; appointments: Appointment[];
  orders: Order[]; placements: Placement[]; inventory: InventoryLot[]; approvals: Approval[];
  timeEntries: TimeEntry[]; timecards: Timecard[]; notifications: Notification[]; bulletins: Bulletin[];
};
