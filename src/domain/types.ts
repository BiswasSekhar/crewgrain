export type Role = "worker" | "captain" | "admin";
export type EntryStatus = "pending" | "approved" | "rejected" | "void";
export type Unit = { id: string; name: string; code: string; active: boolean };
export type Line = { id: string; unitId: string; name: string };
export type Employee = {
  id: string;
  employeeId: string;
  name: string;
  role: Role;
  unitId: string;
  lineId?: string;
  operation: string;
  phone?: string;
  active: boolean;
  authReady: boolean;
  deletedAt?: string;
};
export type Style = {
  id: string;
  name: string;
  code: string;
  color: string;
  notes: string;
  /** Reusable group such as Sleepsuit or Cap. */
  category?: string;
  /** Rate per minute for this style. Falls back to the factory rate. */
  perMinutePaise?: number;
  material?: string;
};
export type Operation = {
  id: string;
  styleId: string;
  name: string;
  sequence: number;
  code?: string;
  /** Actions sharing one OP code and one standard time. */
  steps?: string[];
  ratePaise: number;
  /** Seconds one piece takes. Used to price the task automatically. */
  seconds?: number;
  /** True when the rate was typed in and must not be recalculated. */
  manual?: boolean;
  prerequisiteIds: string[];
};
export type Lot = {
  id: string;
  styleId: string;
  unitId: string;
  lineId: string;
  code: string;
  totalPieces: number;
  status: "active" | "closed";
  material?: string;
};
export type Assignment = {
  id: string;
  employeeId: string;
  operationId: string;
  lotId: string;
  active: boolean;
  workDate?: string;
  assignedBy?: string;
  /** Cloth chosen for this dated operation assignment. */
  material?: string;
};
export type DailyCount = {
  id: string;
  assignmentId: string;
  employeeId: string;
  unitId: string;
  workDate: string;
  quantity: number;
  ratePaise: number;
  version: number;
  updatedAt: string;
};
export type CheckedTask = {
  assignmentId: string;
  enteredQuantity: number;
  captainQuantity: number;
  finalQuantity: number;
  ratePaise: number;
  reason: string;
};
export type DayApproval = {
  id: string;
  employeeId: string;
  unitId: string;
  workDate: string;
  captainId: string;
  checkedAt: string;
  attendance: "present" | "absent";
  status: "approved" | "needs_admin" | "admin_approved";
  tasks: CheckedTask[];
  adminId?: string;
  adminDecision?: "captain" | "employee";
  adminNote?: string;
  reviewedAt?: string;
};
export type DeviceGrant = {
  id: string;
  profileId: string;
  createdAt: string;
  revokedAt?: string;
  expiresAt: string;
};
export type CounterChange = {
  id: string;
  employeeId: string;
  assignmentId: string;
  operationId: string;
  lotId: string;
  workDate: string;
  delta: number;
  capturedAt: string;
  capture?: CountCapture;
};
export type CountCapture = {
  source: "add" | "subtract" | "correction";
  sessionId: string;
  previousEventId?: string;
  /** Monotonic time between additions, not measured active sewing time. */
  intervalMs?: number;
  timing: "first" | "between_additions" | "interrupted" | "correction";
  context: {
    lineId: string;
    styleId: string;
    styleCode: string;
    material: string;
    operationCode: string;
    operationName: string;
    standardSeconds?: number;
  };
};
export type OperationDefault = {
  employeeId: string;
  styleId: string;
  operationIds: string[];
};
export type ProductionEntry = {
  id: string;
  employeeId: string;
  unitId: string;
  operationId: string;
  lotId: string;
  quantity: number;
  workDate: string;
  ratePaise: number;
  status: EntryStatus;
  createdAt: string;
  reason?: string;
};
export type EmployeeRequest = {
  id: string;
  employeeId: string;
  name: string;
  unitId: string;
  operation: string;
  phone?: string;
  status: "pending" | "approved" | "rejected";
  requestedBy: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reason?: string;
};
export type CaptainReport = {
  id: string;
  unitId: string;
  captainId: string;
  workDate: string;
  completed: number;
  packed: number;
  scheduled: number;
  present: number;
  blockers: string;
  notes: string;
  status: "submitted" | "reviewed" | "changes_requested";
  submittedAt: string;
  reviewerNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  revision: number;
};
export type Audit = {
  id: string;
  actorId: string;
  action: string;
  entityId: string;
  at: string;
  detail: string;
};
export type FlowFlag = {
  id: string;
  unitId: string;
  lotId: string;
  operationId: string;
  message: string;
  status: "open" | "resolved";
  resolution?: string;
};
export type UnitActivity = {
  unitId: string;
  workDate: string;
  activity: string;
};
export type DayPlanItem = {
  unitId: string;
  workDate: string;
  styleId: string;
  position: number;
  /** Optional bundle or piece count for this style on this day. */
  count?: number;
};
export type Snapshot = {
  actorId?: string;
  /** Present only while the provider shows a notice (state "warning"). */
  service?: { state: string; message: string };
  units: Unit[];
  lines: Line[];
  employees: Employee[];
  styles: Style[];
  operations: Operation[];
  lots: Lot[];
  assignments: Assignment[];
  entries: ProductionEntry[];
  requests: EmployeeRequest[];
  reports: CaptainReport[];
  audit: Audit[];
  flags: FlowFlag[];
  counts?: DailyCount[];
  days?: DayApproval[];
  devices?: DeviceGrant[];
  corrections?: CorrectionRequest[];
  adjustments?: WageAdjustment[];
  settings?: FactorySettings;
  /** Styles each line works on each day, in order. */
  dayPlan?: DayPlanItem[];
  operationDefaults?: OperationDefault[];
  /** Factory default pay rate per minute (admin only). */
  rateSettings?: { perMinutePaise: number };
  /** Unit-level piece-rate total for captain dashboards; never employee-level. */
  teamMoney?: { workDate: string; amountPaise: number }[];
  /** Per employee and day amount for a captain's own line (computed amount only,
   *  the piece rate itself stays hidden from captains). */
  employeeMoney?: {
    employeeId: string;
    workDate: string;
    amountPaise: number;
  }[];
  /** Admin only: when each staff member's app last talked to the server. */
  presence?: { profileId: string; lastSeenAt: string }[];
};
export type FactorySettings = {
  name: string;
  phone: string;
  payPeriod: "weekly" | "fortnightly" | "monthly";
};
export type CorrectionRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  unitId: string;
  assignmentId: string;
  workDate: string;
  originalQuantity: number;
  requestedQuantity: number;
  reason: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
};
export type WageAdjustment = {
  id: string;
  requestId: string;
  employeeId: string;
  unitId: string;
  assignmentId: string;
  workDate: string;
  quantityDelta: number;
  ratePaise: number;
  amountPaise: number;
  createdBy: string;
  createdAt: string;
};
export type EntryInput = {
  id: string;
  employeeId: string;
  operationId: string;
  lotId: string;
  quantity: number;
  workDate: string;
  capturedAt: string;
};
export type OutboxRow = EntryInput & {
  capture?: CountCapture;
  kind?: "counter";
  assignmentId?: string;
  delta?: number;
  localOrder?: number;
  state: "pending" | "attention";
  error?: string;
  attempts: number;
  nextAttemptAt: number;
};
export type Action =
  | {
      type: "update_employee";
      id: string;
      name: string;
      unitId: string;
      lineId?: string;
      operation: string;
      phone?: string;
      reason: string;
    }
  | {
      type: "add_employee";
      employeeId: string;
      name: string;
      unitId: string;
      lineId?: string;
      operation: string;
      phone?: string;
      role: Role;
    }
  | {
      type: "request_employee";
      employeeId: string;
      name: string;
      unitId: string;
      operation: string;
      phone?: string;
    }
  | {
      type: "review_request";
      id: string;
      decision: "approved" | "rejected";
      reason: string;
    }
  | { type: "set_employee_active"; id: string; active: boolean; reason: string }
  | {
      type: "submit_report";
      workDate: string;
      unitId: string;
      completed: number;
      packed: number;
      scheduled: number;
      present: number;
      blockers: string;
      notes: string;
    }
  | {
      type: "review_report";
      id: string;
      decision: "reviewed" | "changes_requested";
      reason: string;
    }
  | {
      type: "review_entry";
      id: string;
      decision: "approved" | "rejected";
      reason: string;
    }
  | { type: "edit_entry"; id: string; quantity: number; reason: string }
  | { type: "void_entry"; id: string; reason: string }
  | { type: "create_style"; name: string; code: string; notes: string }
  | {
      type: "create_operation";
      styleId: string;
      name: string;
      ratePaise: number;
      sequence: number;
      prerequisiteIds: string[];
    }
  | { type: "set_rate"; id: string; ratePaise: number; reason: string }
  | {
      type: "create_lot";
      code: string;
      styleId: string;
      unitId: string;
      lineId: string;
      totalPieces: number;
    }
  | {
      type: "assign_work";
      employeeId: string;
      operationId: string;
      lotId: string;
    }
  | { type: "create_unit"; name: string; code: string }
  | { type: "create_line"; name: string; unitId: string }
  | { type: "resolve_flag"; id: string; reason: string };
