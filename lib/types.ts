/**
 * Canonical workspace record shapes.
 *
 * Every engine, context, and panel reads and writes through these types. `lib/workspace-normalization.ts`
 * is the single runtime gate that proves an untrusted payload (localStorage or Firestore) matches them,
 * so the literal unions below and the validator's allow-lists must stay in step.
 */

export type Role =
  | "Administrator"
  | "Sales Manager"
  | "Sales Representative"
  | "Brand Ambassador"
  | "Operations"
  | "Warehouse"
  | "Customer";

export type Team = "Leadership" | "Sales" | "Operations" | "Customer";

export type PageKey =
  | "home"
  | "work"
  | "actions"
  | "accounts"
  | "accountHealth"
  | "crmTools"
  | "dispatch"
  | "retail"
  | "orders"
  | "orderCash"
  | "inventory"
  | "inventoryLedger"
  | "marketing"
  | "brandAmbassadors"
  | "people"
  | "employees"
  | "newHire"
  | "onboarding"
  | "trainingAdmin"
  | "payroll"
  | "finance"
  | "accounting"
  | "reports"
  | "performance"
  | "reportingCenter"
  | "audit"
  | "settings"
  | "dataExchange"
  | "help";

export type WorkspaceUser = {
  id: string;
  name: string;
  firstName: string;
  email: string;
  initials: string;
  title: string;
  role: Role;
  team: Team;
  managerId?: string;
  /** Login identifier. The e-mail is kept for recovery, verification, and notifications only. */
  username?: string;
  phone?: string;
  /** Teams a Sales Manager supervises in addition to direct reports. */
  managedTeams?: Team[];
  /** Customer identities only: the accounts the portal user may see. */
  accountIds?: string[];
  accent: string;
};

export type AccountStage =
  | "Prospect"
  | "Qualified"
  | "Sampled"
  | "Opening order"
  | "Placed"
  | "Reordered"
  | "At risk";

export type AccountHealth = "Strong" | "Watch" | "New" | "At risk";
export type CustomerAccountType = "Independent" | "Chain / franchise" | "Distributor" | "Other";
export type PremiseType = "On-premise" | "Off-premise" | "Hybrid" | "Unclassified";
export type PricingTier = "A" | "B" | "C";

/** The billing entity above one or more selling locations (`Account`). */
export type CustomerAccount = {
  id: string;
  name: string;
  accountType: CustomerAccountType;
  billingContactName?: string;
  billingEmail?: string;
  billingPhone?: string;
  notes?: string;
  createdAt: string;
};

export type Account = {
  id: string;
  name: string;
  location: string;
  channel: string;
  stage: AccountStage;
  ownerId: string;
  contactName: string;
  contactRole: string;
  phone: string;
  email: string;
  lastActivity: string;
  nextAction: string;
  nextActionDate: string;
  health: AccountHealth;
  lifetimeCases: number;
  reorderCount: number;
  notes: string;
  /** Billing parent. Absent for single-location accounts that have not been grouped yet. */
  customerId?: string;
  locationName?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  /** Rep who originated the relationship; retained for attribution after a transfer. */
  originatorId?: string;
  accountManagerId?: string;
  closerId?: string;
  responsibilityStartedAt?: string;
  premiseType?: PremiseType;
  businessType?: string;
  categoryReviewDate?: string;
  pricingTier?: PricingTier;
  pricingUpdatedAt?: string;
  pricingUpdatedBy?: string;
  /**
   * Coordinates for this location, filled in after the address is geocoded.
   *
   * Territory matching and field geofencing both read these, but they remain separate controls: one
   * decides authorization to work a location, the other decides whether a device is at an appointment.
   */
  latitude?: number;
  longitude?: number;
  geocodePrecision?: "rooftop" | "street" | "locality" | "postal" | "unknown";
  geocodeProvider?: string;
  geocodedAt?: string;
  /** Fingerprint of the address these coordinates came from, so a material change can be detected. */
  geocodeFingerprint?: string;
  geocodeStatus?: "ok" | "not-found" | "pending-provider" | "error";
  /** Derived: the territory this location last resolved to. The engine remains the authority. */
  territoryId?: string;
  /** Strategic or national account, owned by management outside normal territory ownership. */
  strategic?: boolean;
};

export type ActivityType = "call" | "visit" | "sample" | "order" | "placement" | "note";

export type Activity = {
  id: string;
  accountId?: string;
  type: ActivityType;
  title: string;
  detail: string;
  at: string;
  /** A workspace user id, or `"system"` for engine-generated entries. */
  userId: string;
};

export type AppointmentType = "First visit" | "Revisit" | "Sample drop" | "Placement check" | "Reorder" | "Delivery";

export type AppointmentStatus =
  | "Scheduled"
  | "Dispatched"
  | "En route"
  | "Arrived"
  | "Completed"
  | "Needs follow-up";

export type AppointmentOutcome =
  | "Order placed"
  | "Follow-up scheduled"
  | "Placement verified"
  | "No decision"
  | "Closed lost"
  | "Delivery completed";

export type AppointmentPriority = "Normal" | "High" | "Urgent";

export type Appointment = {
  id: string;
  accountId: string;
  /** Unassigned work stays on the dispatch board with no owner. */
  ownerId?: string;
  /** Mirrored from the account so customer-portal filtering never needs a join. */
  customerId?: string;
  date: string;
  startTime: string;
  duration: number;
  type: AppointmentType;
  status: AppointmentStatus;
  objective: string;
  location: string;
  outcome?: AppointmentOutcome;
  closeoutNote?: string;
  nextAction?: string;
  nextActionDate?: string;
  completedAt?: string;
  priority?: AppointmentPriority;
  tags?: string[];
  requiredSkills?: string[];
  confirmed?: boolean;
  arrivalWindow?: string;
  assignedBy?: string;
  assignedAt?: string;
  /** Field-tracking evidence captured by the location engine. */
  arrivalVerifiedAt?: string;
  arrivalLatitude?: number;
  arrivalLongitude?: number;
  arrivalAccuracyMeters?: number;
  arrivalDistanceMiles?: number;
  geofenceDepartureAt?: string;
  geofenceDepartureLatitude?: number;
  geofenceDepartureLongitude?: number;
  geofenceDepartureAccuracyMeters?: number;
  geofenceDepartureDistanceMiles?: number;
  geofenceExceptionAt?: string;
  geofenceExceptionBy?: string;
  geofenceExceptionReason?: string;
};

export type OrderStatus =
  | "Draft"
  | "Awaiting approval"
  | "Approved"
  | "Allocated"
  | "Out for delivery"
  | "Delivered"
  | "Paid";

export type PaymentStatus = "Not invoiced" | "Open" | "Partially paid" | "Paid";

export type Order = {
  id: string;
  number: string;
  accountId: string;
  cases: number;
  pricePerCase: number;
  /** Always `cases * pricePerCase`; the normalizer rejects drifted totals. */
  amount: number;
  status: OrderStatus;
  placedAt: string;
  ownerId: string;
  paidAt?: string;
  /** First cash application. Required evidence before `paymentStatus` may be "Paid". */
  firstSettledAt?: string;
  priceBasis: string;
  paymentStatus: PaymentStatus;
  product?: string;
  /** Sales Representative credited for commission, when different from the owner. */
  creditedRepId?: string;
  sourcePlacementId?: string;
  inventoryAvailableAtOrder?: number;
  lowStockApprovalRequired?: boolean;
};

export type PlacementSource = "Physical count" | "Customer estimate" | "Demo POS feed";
export type PlacementStatus = "Healthy" | "Check soon" | "Out of stock";

export type Placement = {
  id: string;
  accountId: string;
  product: string;
  casesDelivered: number;
  facings: number;
  location: string;
  cold: boolean;
  shelfPrice: number;
  observedStock: number;
  lastChecked: string;
  nextCheck: string;
  source: PlacementSource;
  status: PlacementStatus;
};

export type InventoryStatus = "Available" | "Quality hold" | "Low stock";

export type InventoryLot = {
  id: string;
  lotCode: string;
  product: string;
  receivedAt: string;
  bestBy: string;
  onHand: number;
  reserved: number;
  /** Derived: `onHand - reserved`, forced to 0 while a quality hold is open. */
  available: number;
  status: InventoryStatus;
  location: string;
  holdReason?: string;
  holdDecision?: string;
  holdResolvedAt?: string;
  holdResolvedBy?: string;
};

export type ApprovalType =
  | "Order"
  | "Low stock sale"
  | "Territory exception"
  | "Timecard"
  | "Price exception"
  | "Inventory adjustment"
  | "Leave"
  | "Expense"
  | "Marketing spend"
  | "Compensation";

export type ApprovalPriority = "Normal" | "High" | "Urgent";
export type ApprovalStatus = "Pending" | "Approved" | "Returned";

export type Approval = {
  id: string;
  type: ApprovalType;
  title: string;
  detail: string;
  requestedBy: string;
  requesterId?: string;
  /** Id of the underlying order, account, timecard, or lot this decision concerns. */
  recordId?: string;
  team?: Team;
  submittedAt: string;
  dueAt: string;
  priority: ApprovalPriority;
  status: ApprovalStatus;
};

export type TimeEntrySource = "Demo mobile" | "Demo desktop" | "Manual correction";

/** Immutable before-image kept whenever a punch is edited. */
export type TimeEntryCorrection = {
  at: string;
  by: string;
  reason: string;
  before: {
    clockIn: string;
    mealStart?: string;
    mealEnd?: string;
    clockOut?: string;
    breakMinutes: number;
  };
};

export type TimeEntry = {
  id: string;
  userId: string;
  date: string;
  clockIn: string;
  clockOut?: string;
  mealStart?: string;
  mealEnd?: string;
  breakMinutes: number;
  source: TimeEntrySource;
  note?: string;
  corrections?: TimeEntryCorrection[];
};

export type TimecardStatus = "Open" | "Submitted" | "Manager approved" | "Returned" | "Payroll ready";

export type Timecard = {
  id: string;
  userId: string;
  weekStart: string;
  weekEnd: string;
  status: TimecardStatus;
  submittedAt?: string;
  approvedAt?: string;
  approverId?: string;
  attested: boolean;
  returnedAt?: string;
  returnedBy?: string;
  returnReason?: string;
};

export type NotificationTone = "info" | "warning" | "success";

export type Notification = {
  id: string;
  title: string;
  detail: string;
  at: string;
  readBy: string[];
  tone: NotificationTone;
  /** Absent means every employee sees it. */
  audienceUserIds?: string[];
};

export type BulletinAudience = "Company" | "Team";
export type BulletinPriority = "Update" | "Important" | "Urgent";

export type Bulletin = {
  id: string;
  title: string;
  body: string;
  audience: BulletinAudience;
  /** Required when `audience` is "Team". */
  team?: Team;
  priority: BulletinPriority;
  authorId: string;
  publishedAt: string;
  expiresAt?: string;
  acknowledgedBy: string[];
};

export type TerritoryStatus = "Draft" | "Active" | "Suspended";

export type SalesTerritory = {
  id: string;
  name: string;
  /** Suggested representative for this geographic coverage. This does not lock account ownership. */
  ownerId?: string;
  postalCodes: string[];
  status: TerritoryStatus;
  notes?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
};

export type WorkspaceData = {
  users: WorkspaceUser[];
  /** Billing parents. Optional so pre-CRM workspaces still load. */
  customers?: CustomerAccount[];
  accounts: Account[];
  activities: Activity[];
  appointments: Appointment[];
  orders: Order[];
  placements: Placement[];
  inventory: InventoryLot[];
  approvals: Approval[];
  timeEntries: TimeEntry[];
  timecards: Timecard[];
  notifications: Notification[];
  bulletins: Bulletin[];
  /** Owned by the territory engine; optional so pre-territory workspaces still load. */
  territories?: SalesTerritory[];
};