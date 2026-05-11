import { create } from 'zustand';
import { ViewType, OverviewReport } from './types';

interface AppState {
  currentView: ViewType;
  selectedDenialId: string | null;
  selectedReportId: string | null;
  sidebarOpen: boolean;
  contractSigned: boolean;
  setCurrentView: (view: ViewType) => void;
  setSelectedDenialId: (id: string | null) => void;
  setSelectedReportId: (id: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  setContractSigned: (signed: boolean) => void;
  navigateToDenial: (id: string) => void;
  navigateToReport: (id: string) => void;
  navigateBack: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  currentView: 'upload',
  selectedDenialId: null,
  selectedReportId: null,
  sidebarOpen: true,
  contractSigned: false,
  setCurrentView: (view) => set({ currentView: view, selectedDenialId: view !== 'denial-detail' ? null : get().selectedDenialId, selectedReportId: view !== 'overview-report' ? null : get().selectedReportId }),
  setSelectedDenialId: (id) => set({ selectedDenialId: id }),
  setSelectedReportId: (id) => set({ selectedReportId: id }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setContractSigned: (signed) => set({ contractSigned: signed }),
  navigateToDenial: (id) => set({ currentView: 'denial-detail', selectedDenialId: id }),
  navigateToReport: (id) => set({ currentView: 'overview-report', selectedReportId: id }),
  navigateBack: () => {
    const current = get().currentView;
    if (current === 'denial-detail') {
      set({ currentView: 'denials', selectedDenialId: null });
    } else if (current === 'overview-report') {
      set({ currentView: 'upload', selectedReportId: null });
    } else {
      set({ currentView: 'upload', selectedDenialId: null });
    }
  },
}));
