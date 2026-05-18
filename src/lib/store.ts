import { create } from 'zustand';
import { ViewType, OverviewReport, AppUser, BatchJob, AccessLevel, PracticeType } from './types';

interface AppState {
  // Navigation
  currentView: ViewType;
  selectedDenialId: string | null;
  selectedReportId: string | null;
  sidebarOpen: boolean;

  // Auth & Access
  contractSigned: boolean;
  currentUser: AppUser | null;
  sessionToken: string | null;

  // Practice Type (Medical / Dental)
  practiceType: PracticeType | null;

  // Access Level (1, 2, 3)
  accessLevel: AccessLevel | null;

  // Batch Processing
  activeBatchJobs: BatchJob[];

  // Notifications
  notifications: Notification[];

  // Actions
  setCurrentView: (view: ViewType) => void;
  setSelectedDenialId: (id: string | null) => void;
  setSelectedReportId: (id: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  setContractSigned: (signed: boolean) => void;
  setCurrentUser: (user: AppUser | null) => void;
  setSessionToken: (token: string | null) => void;
  setPracticeType: (type: PracticeType) => void;
  setAccessLevel: (level: AccessLevel) => void;
  addBatchJob: (job: BatchJob) => void;
  updateBatchJob: (id: string, updates: Partial<BatchJob>) => void;
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => void;
  dismissNotification: (id: string) => void;
  navigateToDenial: (id: string) => void;
  navigateToReport: (id: string) => void;
  navigateBack: () => void;
}

interface Notification {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  createdAt: string;
  dismissed: boolean;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentView: 'landing',
  selectedDenialId: null,
  selectedReportId: null,
  sidebarOpen: true,
  contractSigned: true,
  currentUser: null,
  sessionToken: null,
  practiceType: 'medical',
  accessLevel: 3,
  activeBatchJobs: [],
  notifications: [],

  setCurrentView: (view) =>
    set({
      currentView: view,
      selectedDenialId: view !== 'denial-detail' ? null : get().selectedDenialId,
      selectedReportId: view !== 'overview-report' ? null : get().selectedReportId,
    }),
  setSelectedDenialId: (id) => set({ selectedDenialId: id }),
  setSelectedReportId: (id) => set({ selectedReportId: id }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setContractSigned: (signed) => set({ contractSigned: signed }),
  setCurrentUser: (user) => set({ currentUser: user }),
  setSessionToken: (token) => set({ sessionToken: token }),
  setPracticeType: (type) => set({ practiceType: type }),
  setAccessLevel: (level) => set({ accessLevel: level }),

  addBatchJob: (job) =>
    set((state) => ({ activeBatchJobs: [...state.activeBatchJobs, job] })),
  updateBatchJob: (id, updates) =>
    set((state) => ({
      activeBatchJobs: state.activeBatchJobs.map((j) =>
        j.id === id ? { ...j, ...updates } : j
      ),
    })),

  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        {
          ...notification,
          id: `notif-${Date.now()}`,
          createdAt: new Date().toISOString(),
          dismissed: false,
        },
      ],
    })),
  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, dismissed: true } : n
      ),
    })),

  navigateToDenial: (id) => set({ currentView: 'denial-detail', selectedDenialId: id }),
  navigateToReport: (id) => set({ currentView: 'overview-report', selectedReportId: id }),
  navigateBack: () => {
    const current = get().currentView;
    if (current === 'denial-detail') {
      set({ currentView: 'denials', selectedDenialId: null });
    } else if (current === 'overview-report') {
      set({ currentView: 'upload', selectedReportId: null });
    } else if (current === 'prevention') {
      set({ currentView: 'dashboard' });
    } else {
      set({ currentView: 'dashboard' });
    }
  },
}));
