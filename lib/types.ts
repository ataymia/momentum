export type Role = "Administrator" | "Sales Manager" | "Sales Representative" | "Operations" | "Warehouse" | "Delivery Driver" | "Marketing" | "Customer" | "Brand Ambassador";
export type Team = "Leadership" | "Sales" | "Operations" | "Marketing" | "Customer";

export type PageKey =
  | "home"
  | "work"
  | "actions"
  | "accounts"
  | "quickVisit"
  | "salesMap"
  | "accountSetup"
  | "accountHealth"
  | "crmTools"
  | "dispatch"
  | "retail"
  | "orders"
  | "orderCash"
  | "inventory"
  | "inventoryLedger"
  | "products"
  | "marketing"
  | "brandAmbassadors"
  | "people"
  | "employees"
  | "newHire"
  | "onboarding"
  | "trainingAdmin"
  | "timekeeping"
  | "materials"
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
  /** Login alias. Work e-mail remains a valid sign-in and recovery identifier for the same Firebase uid. */
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
export type CreditStatus = "COD" | "Credit Requested" | "Credit Under Review" | "Net 30 Approved" | "Credit Declined" | "Personal Guaranty Required";
export type TaxExemptionStatus = "Not exempt" | "Requested" | "Received" | "Verified" | "Missing";
export type OnboardingPackageStatus = "Not started" | "Prepared" | "Awaiting provider" | "Sent externally" | "Complete";
export type ProgramPricingStatus = "Draft" | "Scheduled" | "Active" | "Expired" | "Cancelled";

/** The billing entity above one or more selling locations (`Account`). */
export type CustomerAccount = {
  id: string;
  name: string;
  accountType: CustomerAccountType;
  billingContactName?: string;
  billingEmail?: string;
  billingPhone?: string;
  ein?: string;
  accountsPayableContactName?: string;
  accountsPayableExtension?: string;
  accountsPayablePhone?: string;
  accountsPayableEmail?: string;
  az5000Number?: string;
  taxExemptionStatus?: TaxExemptionStatus;
  creditStatus?: CreditStatus;
  /** Displayed on invoices. COD remains the default unless an authorized approval changes this. */
  paymentTerms?: "COD" | "Net 30" | "Custom";
  customPaymentTerms?: string;
  onboardingPackageStatus?: OnboardingPackageStatus;
  onboardingPackagePreparedAt?: string;
  onboardingPackagePreparedBy?: string;
  onboardingProviderStatus?: "Provider not selected" | "Ready to connect" | "Connected";
  notes?: string;
  createdAt: string;
};

export type Account = {
  id: string;
  name: string;
  location: string;
  channel: string;
  stage: AccountStage;
  /** Empty string means an intentionally released/unassigned prospect. */
  ownerId: string;
  contactName: string;
  contactRole: string;
  phone: string;
  mobilePhone?: string;
  fax?: string;
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
  programPricingLabel?: string;
  programPricePerCase?: number;
  programPricingEffectiveDate?: string;
  programPricingExpirationDate?: string;
  programPricingStatus?: ProgramPricingStatus;
  programPricingOwnerId?: string;
  lastMeaningfulBusinessAt?: string;
  /** Coordinates for this location, filled in after the address is geocoded. */
  latitude?: number;
  longitude?: number;
  geocodePrecision?: "rooftop" | "street" | "locality" | "postal" | "unknown";
  geocodeProvider?: string;
  geocodedAt?: string;
  /** Fingerprint of the address these coordinates came from, so a material change can be detected. */
  geocodeFingerprint?: string;
  geofenceRadiusMiles?: number;
  geofenceOverrideRequired?: boolean;
};

export type Activity = {
  id: string;
  accountId: string;
  type: "call" | "visit" | "sample" | "order" | "placement" | "note";
  title: string;
  detail: string;
  at: string;
  userId: string;
};

export type AppointmentType = "First visit" | "Revisit" | "Sample drop" | "Placement check" | "Reorder" | "Delivery";
export type AppointmentStatus = "Scheduled" | "Dispatched" | "En route" | "Arrived" | "Completed" | "Needs follow-up";
export type AppointmentOutcome = "Order placed" | "Follow-up scheduled" | "Placement verified" | "No decision" | "Closed lost" | "Delivery completed";

export type Appointment = {
  id: string;
  accountId: string;
  customerId?: string;
  ownerId?: string;
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
  priority?: "Normal" | "High" | "Urgent";
  tags?: string[];
  arrivalWindow?: string;
  assignedBy?: string;
  assignedAt?: string;
  dispatchedAt?: string;
  arrivedAt?: string;
  departedAt?: string;
  arrivalLatitude?: number;
  arrivalLongitude?: number;
  departureLatitude?: number;
  departureLongitude?: number;
  arrivalDistanceMiles?: number;
  departureDistanceMiles?: number;
  geofenceOverrideReason?: string;
};

export type OrderStatus = "Draft" | "Awaiting approval" | "Approved" | "Allocated" | "Out for delivery" | "Delivered" | "Paid" | "Cancelled";
export type OrderPaymentStatus = "Not invoiced" | "Open" | "Partially paid" | "Paid";
export type OrderLine = { id: string; product: string; cases: number; pricePerCase: number; amount: number };
export type Order = {
  id: string;
  number: string;
  accountId: string;
  cases: number;
  pricePerCase: number;
  amount: number;
  status: OrderStatus;
  placedAt: string;
  ownerId: string;
  paidAt?: string;
  firstSettledAt?: string;
  priceBasis: string;
  paymentStatus: OrderPaymentStatus;
  product?: string;
  creditedRepId?: string;
  sourcePlacementId?: string;
  inventoryAvailableAtOrder: number;
  lowStockApprovalRequired?: boolean;
  lines?: OrderLine[];
};

export type Placement = {
  id: string;
  accountId: string;
  product: string;
  casesDelivered: number;
  facings: number;
  location: string;
  observedStock: number;
  shelfPrice: number;
  cold: boolean;
  status: "Healthy" | "Watch" | "Action";
  lastChecked: string;
  checkedBy: string;
  photoName?: string;
};

export type InventoryLot = {
  id: string;
  product: string;
  lotCode: string;
  expiresAt: string;
  onHand: number;
  reserved: number;
  available: number;
  location: string;
  status: "Available" | "Quality hold" | "Low stock";
  custody: string;
  holdReason?: string;
  barcode?: string;
};

export type Approval = {
  id: string;
  type: "Order" | "Low stock sale" | "Territory exception";
  title: string;
  detail: string;
  requestedBy: string;
  requesterId: string;
  recordId: string;
  team: Team;
  submittedAt: string;
  dueAt: string;
  priority: "Normal" | "High" | "Urgent";
  status: "Pending" | "Approved" | "Returned";
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
};

export type TimeEntry = {
  id: string;
  userId: string;
  date: string;
  clockIn: string;
  mealStart?: string;
  mealEnd?: string;
  clockOut?: string;
  breakMinutes: number;
  source: string;
};

export type Timecard = {
  id: string;
  userId: string;
  weekStart: string;
  hours: number;
  status: "Open" | "Submitted" | "Approved" | "Returned" | "Payroll ready";
  submittedAt?: string;
  attested?: boolean;
  source: string;
  correctionNote?: string;
  exception?: string;
  reviewedBy?: string;
  reviewedAt?: string;
};

export type Notification = {
  id: string;
  userId: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  tone: "info" | "warning" | "urgent";
};

export type Bulletin = {
  id: string;
  title: string;
  body: string;
  authorId: string;
  audienceType: "company" | "team";
  audienceTeam?: Team;
  priority: "Update" | "Important" | "Urgent";
  publishedAt: string;
  expiresAt?: string;
  acknowledgedBy: string[];
};

export type WorkspaceData = {
  users: WorkspaceUser[];
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
  territories?: SalesTerritory[];
};

export type SalesTerritory = {
  id: string;
  name: string;
  ownerId?: string;
  postalCodes: string[];
  active: boolean;
  notes?: string;
};
