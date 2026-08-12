"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createDemoData } from "./demo-data";
import type {
  Account,
  AppointmentStatus,
  OrderStatus,
  PageKey,
  WorkspaceData,
  WorkspaceUser,
} from "./types";

const DATA_KEY = "momentum-demo-workspace-v1";
const SESSION_KEY = "momentum-demo-session-v1";

type NewAccount = Pick<
  Account,
  "name" | "location" | "channel" | "contactName" | "contactRole" | "phone" | "email"
>;

type NewOrder = {
  accountId: string;
  cases: number;
  pricePerCase: number;
};

type WorkspaceContextValue = {
  data: WorkspaceData;
  currentUser: WorkspaceUser | null;
  ready: boolean;
  activePage: PageKey;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  navigate: (page: PageKey) => void;
  login: (email: string, password: string) => { ok: boolean; message?: string };
  logout: () => void;
  switchUser: (userId: string) => void;
  createAccount: (account: NewAccount) => string;
  advanceAppointment: (appointmentId: string) => void;
  reassignAppointment: (appointmentId: string, ownerId: string) => void;
  setOrderStatus: (orderId: string, status: OrderStatus) => void;
  createOrder: (order: NewOrder) => string;
  updatePlacement: (placementId: string, observedStock: number, facings: number, cold: boolean) => void;
  decideApproval: (approvalId: string, decision: "Approved" | "Returned") => void;
  toggleClock: () => void;
  submitTimecard: (timecardId: string) => void;
  decideTimecard: (timecardId: string, decision: "Manager approved" | "Returned") => void;
  markNotificationsRead: () => void;
  resetDemo: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const nowStamp = () => new Date().toISOString();
const todayKey = () => new Date().toISOString().slice(0, 10);
const localTime = () =>
  new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());

const nextAppointmentStatus: Record<AppointmentStatus, AppointmentStatus> = {
  Scheduled: "Dispatched",
  Dispatched: "En route",
  "En route": "Arrived",
  Arrived: "Completed",
  Completed: "Needs follow-up",
  "Needs follow-up": "Scheduled",
};

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<WorkspaceData>(() => createDemoData());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<PageKey>("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedData = window.localStorage.getItem(DATA_KEY);
        const savedSession = window.localStorage.getItem(SESSION_KEY);
        if (savedData) setData(JSON.parse(savedData) as WorkspaceData);
        if (savedSession) setCurrentUserId(savedSession);
      } catch {
        window.localStorage.removeItem(DATA_KEY);
        window.localStorage.removeItem(SESSION_KEY);
      } finally {
        setReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(DATA_KEY, JSON.stringify(data));
  }, [data, ready]);

  const currentUser = useMemo(
    () => data.users.find((user) => user.id === currentUserId) ?? null,
    [currentUserId, data.users],
  );

  const login = useCallback(
    (email: string, password: string) => {
      const user = data.users.find(
        (candidate) => candidate.email.toLowerCase() === email.trim().toLowerCase(),
      );
      if (!user || password !== "admin") {
        return { ok: false, message: "Use a demo email and the password admin." };
      }
      setCurrentUserId(user.id);
      window.localStorage.setItem(SESSION_KEY, user.id);
      return { ok: true };
    },
    [data.users],
  );

  const logout = useCallback(() => {
    setCurrentUserId(null);
    setActivePage("home");
    window.localStorage.removeItem(SESSION_KEY);
  }, []);

  const switchUser = useCallback((userId: string) => {
    setCurrentUserId(userId);
    setActivePage("home");
    window.localStorage.setItem(SESSION_KEY, userId);
  }, []);

  const navigate = useCallback((page: PageKey) => {
    setActivePage(page);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const createAccount = useCallback(
    (account: NewAccount) => {
      const id = `acc-${Date.now()}`;
      const ownerId = currentUserId ?? "usr-mia";
      setData((current) => ({
        ...current,
        accounts: [
          {
            ...account,
            id,
            stage: "Prospect",
            ownerId,
            lastActivity: "Account created",
            nextAction: "Qualify the decision-maker and buying process",
            nextActionDate: todayKey(),
            health: "New",
            lifetimeCases: 0,
            reorderCount: 0,
            notes: "Created in the local demo workspace.",
          },
          ...current.accounts,
        ],
        activities: [
          {
            id: `act-${Date.now()}`,
            accountId: id,
            type: "note",
            title: "Account created",
            detail: "New prospect added to the demo workspace.",
            at: nowStamp(),
            userId: ownerId,
          },
          ...current.activities,
        ],
      }));
      return id;
    },
    [currentUserId],
  );

  const advanceAppointment = useCallback(
    (appointmentId: string) => {
      const actorId = currentUserId ?? "usr-mia";
      setData((current) => {
        const appointment = current.appointments.find((item) => item.id === appointmentId);
        if (!appointment) return current;
        const status = nextAppointmentStatus[appointment.status];
        const account = current.accounts.find((item) => item.id === appointment.accountId);
        const completed = status === "Completed";
        return {
          ...current,
          appointments: current.appointments.map((item) =>
            item.id === appointmentId
              ? { ...item, status, completedAt: completed ? nowStamp() : item.completedAt }
              : item,
          ),
          activities: [
            {
              id: `act-${Date.now()}`,
              accountId: appointment.accountId,
              type: "visit",
              title: `${appointment.type} · ${status}`,
              detail: completed
                ? "Visit completed. A disposition and next action are still required."
                : `${account?.name ?? "Account"} moved to ${status.toLowerCase()}.`,
              at: nowStamp(),
              userId: actorId,
            },
            ...current.activities,
          ],
        };
      });
    },
    [currentUserId],
  );

  const reassignAppointment = useCallback(
    (appointmentId: string, ownerId: string) => {
      const actorId = currentUserId ?? "usr-mia";
      setData((current) => {
        const appointment = current.appointments.find((item) => item.id === appointmentId);
        const nextOwner = current.users.find((user) => user.id === ownerId);
        if (!appointment || !nextOwner) return current;
        return {
          ...current,
          appointments: current.appointments.map((item) =>
            item.id === appointmentId ? { ...item, ownerId } : item,
          ),
          activities: [
            {
              id: `act-${Date.now()}`,
              accountId: appointment.accountId,
              type: "note",
              title: "Appointment reassigned",
              detail: `Ownership moved to ${nextOwner.name}. Original history was preserved.`,
              at: nowStamp(),
              userId: actorId,
            },
            ...current.activities,
          ],
        };
      });
    },
    [currentUserId],
  );

  const setOrderStatus = useCallback((orderId: string, status: OrderStatus) => {
    setData((current) => ({
      ...current,
      orders: current.orders.map((order) =>
        order.id === orderId
          ? {
              ...order,
              status,
              paymentStatus: status === "Paid" ? "Paid" : order.paymentStatus,
            }
          : order,
      ),
    }));
  }, []);

  const createOrder = useCallback(
    ({ accountId, cases, pricePerCase }: NewOrder) => {
      const orderIndex = data.orders.length + 1050;
      const number = `GE-${orderIndex}`;
      const id = `ord-${Date.now()}`;
      const actorId = currentUserId ?? "usr-mia";
      const account = data.accounts.find((item) => item.id === accountId);
      setData((current) => ({
        ...current,
        orders: [
          {
            id,
            number,
            accountId,
            cases,
            pricePerCase,
            amount: cases * pricePerCase,
            status: "Awaiting approval",
            placedAt: todayKey(),
            ownerId: actorId,
            priceBasis: pricePerCase <= 24 ? "Demo introductory" : "Demo standard",
            paymentStatus: "Not invoiced",
          },
          ...current.orders,
        ],
        accounts: current.accounts.map((item) =>
          item.id === accountId
            ? { ...item, stage: "Opening order", lastActivity: `Draft ${number} created` }
            : item,
        ),
        approvals: [
          {
            id: `apr-${Date.now()}`,
            type: "Order",
            title: `Approve demo order ${number}`,
            detail: `${cases} cases · $${pricePerCase.toFixed(2)}/case · ${account?.name ?? "Account"}`,
            requestedBy: current.users.find((user) => user.id === actorId)?.name ?? "Demo user",
            submittedAt: nowStamp(),
            dueAt: nowStamp(),
            priority: "High",
            status: "Pending",
          },
          ...current.approvals,
        ],
      }));
      return id;
    },
    [currentUserId, data.accounts, data.orders.length],
  );

  const updatePlacement = useCallback(
    (placementId: string, observedStock: number, facings: number, cold: boolean) => {
      setData((current) => ({
        ...current,
        placements: current.placements.map((placement) =>
          placement.id === placementId
            ? {
                ...placement,
                observedStock,
                facings,
                cold,
                lastChecked: todayKey(),
                status: observedStock === 0 ? "Out of stock" : observedStock < 48 || !cold ? "Check soon" : "Healthy",
              }
            : placement,
        ),
      }));
    },
    [],
  );

  const decideApproval = useCallback(
    (approvalId: string, decision: "Approved" | "Returned") => {
      setData((current) => {
        const approval = current.approvals.find((item) => item.id === approvalId);
        if (!approval) return current;
        const orderNumber = approval.title.match(/GE-\d+/)?.[0];
        return {
          ...current,
          approvals: current.approvals.map((item) =>
            item.id === approvalId ? { ...item, status: decision } : item,
          ),
          orders: current.orders.map((order) =>
            order.number === orderNumber
              ? { ...order, status: decision === "Approved" ? "Approved" : "Draft" }
              : order,
          ),
          notifications: [
            {
              id: `note-${Date.now()}`,
              title: `${approval.type} ${decision.toLowerCase()}`,
              detail: approval.title,
              at: nowStamp(),
              read: false,
              tone: decision === "Approved" ? "success" : "warning",
            },
            ...current.notifications,
          ],
        };
      });
    },
    [],
  );

  const toggleClock = useCallback(() => {
    if (!currentUserId) return;
    setData((current) => {
      const active = current.timeEntries.find(
        (entry) => entry.userId === currentUserId && !entry.clockOut,
      );
      if (active) {
        return {
          ...current,
          timeEntries: current.timeEntries.map((entry) =>
            entry.id === active.id ? { ...entry, clockOut: localTime() } : entry,
          ),
        };
      }
      return {
        ...current,
        timeEntries: [
          {
            id: `te-${Date.now()}`,
            userId: currentUserId,
            date: todayKey(),
            clockIn: localTime(),
            breakMinutes: 0,
            source: "Demo desktop",
          },
          ...current.timeEntries,
        ],
      };
    });
  }, [currentUserId]);

  const submitTimecard = useCallback((timecardId: string) => {
    setData((current) => {
      const timecard = current.timecards.find((item) => item.id === timecardId);
      const employee = current.users.find((user) => user.id === timecard?.userId);
      if (!timecard || !employee) return current;
      const existingApproval = current.approvals.some(
        (approval) => approval.type === "Timecard" && approval.title.includes(employee.name),
      );
      return {
        ...current,
        timecards: current.timecards.map((item) =>
          item.id === timecardId
            ? { ...item, status: "Submitted", submittedAt: nowStamp(), attested: true }
            : item,
        ),
        approvals: existingApproval
          ? current.approvals
          : [
              {
                id: `apr-${Date.now()}`,
                type: "Timecard",
                title: `${employee.name} · weekly timecard`,
                detail: `${timecard.weekStart} through ${timecard.weekEnd} · employee attested`,
                requestedBy: employee.name,
                submittedAt: nowStamp(),
                dueAt: nowStamp(),
                priority: "Normal",
                status: "Pending",
              },
              ...current.approvals,
            ],
      };
    });
  }, []);

  const decideTimecard = useCallback(
    (timecardId: string, decision: "Manager approved" | "Returned") => {
      setData((current) => {
        const timecard = current.timecards.find((item) => item.id === timecardId);
        const employee = current.users.find((user) => user.id === timecard?.userId);
        return {
          ...current,
          timecards: current.timecards.map((item) =>
            item.id === timecardId
              ? {
                  ...item,
                  status: decision,
                  approvedAt: decision === "Manager approved" ? nowStamp() : undefined,
                  approverId: currentUserId ?? "usr-mia",
                }
              : item,
          ),
          approvals: current.approvals.map((approval) =>
            approval.type === "Timecard" && employee && approval.title.includes(employee.name)
              ? {
                  ...approval,
                  status: decision === "Manager approved" ? "Approved" : "Returned",
                }
              : approval,
          ),
        };
      });
    },
    [currentUserId],
  );

  const markNotificationsRead = useCallback(() => {
    setData((current) => ({
      ...current,
      notifications: current.notifications.map((notification) => ({
        ...notification,
        read: true,
      })),
    }));
  }, []);

  const resetDemo = useCallback(() => {
    setData(createDemoData());
    setActivePage("home");
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      data,
      currentUser,
      ready,
      activePage,
      sidebarOpen,
      setSidebarOpen,
      navigate,
      login,
      logout,
      switchUser,
      createAccount,
      advanceAppointment,
      reassignAppointment,
      setOrderStatus,
      createOrder,
      updatePlacement,
      decideApproval,
      toggleClock,
      submitTimecard,
      decideTimecard,
      markNotificationsRead,
      resetDemo,
    }),
    [
      data,
      currentUser,
      ready,
      activePage,
      sidebarOpen,
      navigate,
      login,
      logout,
      switchUser,
      createAccount,
      advanceAppointment,
      reassignAppointment,
      setOrderStatus,
      createOrder,
      updatePlacement,
      decideApproval,
      toggleClock,
      submitTimecard,
      decideTimecard,
      markNotificationsRead,
      resetDemo,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return context;
}
