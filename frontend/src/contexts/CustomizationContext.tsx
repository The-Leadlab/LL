import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuthStore } from '../store/auth';
import { toast } from 'react-hot-toast';

// Customization types
export interface UICustomization {
  theme: 'light' | 'dark' | 'system' | 'custom';
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  borderRadius: number;
  spacing: number;
  animationSpeed: number;
  customCSS?: string;
}

export interface TaskCustomization {
  statuses: Array<{
    id: string;
    name: string;
    color: string;
    icon: string;
    order: number;
  }>;
  priorities: Array<{
    id: string;
    name: string;
    color: string;
    level: number;
  }>;
  categories: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  defaultDueDays: number;
  allowCustomFields: boolean;
  customFields: Array<{
    id: string;
    name: string;
    type: 'text' | 'number' | 'date' | 'select' | 'boolean';
    required: boolean;
    options?: string[];
  }>;
}

export interface DealCustomization {
  stages: Array<{
    id: string;
    name: string;
    color: string;
    probability: number;
    order: number;
  }>;
  values: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  sources: Array<{
    id: string;
    name: string;
    color: string;
  }>;
  defaultCurrency: string;
  allowCustomPipelines: boolean;
  customFields: Array<{
    id: string;
    name: string;
    type: 'text' | 'number' | 'date' | 'select' | 'boolean';
    required: boolean;
    options?: string[];
  }>;
}

export interface LayoutCustomization {
  sidebarPosition: 'left' | 'right';
  sidebarWidth: number;
  headerHeight: number;
  footerVisible: boolean;
  gridDensity: 'compact' | 'comfortable' | 'spacious';
  animationsEnabled: boolean;
  reducedMotion: boolean;
}

export interface PlatformCustomization {
  ui: UICustomization;
  tasks: TaskCustomization;
  deals: DealCustomization;
  layout: LayoutCustomization;
  branding: {
    logoUrl?: string;
    faviconUrl?: string;
    companyName: string;
    supportEmail: string;
    termsUrl?: string;
    privacyUrl?: string;
  };
}

interface CustomizationContextType {
  customization: PlatformCustomization;
  isLoading: boolean;
  isSaving: boolean;
  updateCustomization: (updates: Partial<PlatformCustomization>) => Promise<void>;
  resetToDefault: () => Promise<void>;
  exportCustomization: () => string;
  importCustomization: (json: string) => Promise<void>;
}

const defaultCustomization: PlatformCustomization = {
  ui: {
    theme: 'light',
    primaryColor: '#1976d2',
    secondaryColor: '#dc004e',
    accentColor: '#ff6b35',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    borderRadius: 8,
    spacing: 4,
    animationSpeed: 1,
    customCSS: ''
  },
  tasks: {
    statuses: [
      { id: 'todo', name: 'To Do', color: '#6b7280', icon: '📝', order: 0 },
      { id: 'in-progress', name: 'In Progress', color: '#f59e0b', icon: '⚡', order: 1 },
      { id: 'review', name: 'Review', color: '#8b5cf6', icon: '👀', order: 2 },
      { id: 'done', name: 'Done', color: '#10b981', icon: '✅', order: 3 }
    ],
    priorities: [
      { id: 'low', name: 'Low', color: '#6b7280', level: 1 },
      { id: 'medium', name: 'Medium', color: '#f59e0b', level: 2 },
      { id: 'high', name: 'High', color: '#ef4444', level: 3 },
      { id: 'urgent', name: 'Urgent', color: '#dc2626', level: 4 }
    ],
    categories: [
      { id: 'general', name: 'General', color: '#3b82f6' },
      { id: 'development', name: 'Development', color: '#8b5cf6' },
      { id: 'design', name: 'Design', color: '#ec4899' },
      { id: 'marketing', name: 'Marketing', color: '#f59e0b' }
    ],
    defaultDueDays: 7,
    allowCustomFields: true,
    customFields: []
  },
  deals: {
    stages: [
      { id: 'prospect', name: 'Prospect', color: '#6b7280', probability: 10, order: 0 },
      { id: 'qualification', name: 'Qualification', color: '#f59e0b', probability: 25, order: 1 },
      { id: 'proposal', name: 'Proposal', color: '#8b5cf6', probability: 50, order: 2 },
      { id: 'negotiation', name: 'Negotiation', color: '#ec4899', probability: 75, order: 3 },
      { id: 'closed-won', name: 'Closed Won', color: '#10b981', probability: 100, order: 4 },
      { id: 'closed-lost', name: 'Closed Lost', color: '#ef4444', probability: 0, order: 5 }
    ],
    values: [
      { id: 'small', name: 'Small (<$1k)', color: '#6b7280' },
      { id: 'medium', name: 'Medium ($1k-$10k)', color: '#f59e0b' },
      { id: 'large', name: 'Large ($10k-$50k)', color: '#8b5cf6' },
      { id: 'enterprise', name: 'Enterprise (>$50k)', color: '#ec4899' }
    ],
    sources: [
      { id: 'website', name: 'Website', color: '#3b82f6' },
      { id: 'referral', name: 'Referral', color: '#10b981' },
      { id: 'social', name: 'Social Media', color: '#ec4899' },
      { id: 'email', name: 'Email Campaign', color: '#f59e0b' },
      { id: 'event', name: 'Event', color: '#8b5cf6' }
    ],
    defaultCurrency: 'USD',
    allowCustomPipelines: true,
    customFields: []
  },
  layout: {
    sidebarPosition: 'left',
    sidebarWidth: 240,
    headerHeight: 64,
    footerVisible: true,
    gridDensity: 'comfortable',
    animationsEnabled: true,
    reducedMotion: false
  },
  branding: {
    companyName: 'LeadLab',
    supportEmail: 'support@leadlab.com'
  }
};

const CustomizationContext = createContext<CustomizationContextType | undefined>(undefined);

export const CustomizationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [customization, setCustomization] = useState<PlatformCustomization>(defaultCustomization);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { user } = useAuthStore();

  useEffect(() => {
    loadCustomization();
  }, []);

  const loadCustomization = async () => {
    try {
      setIsLoading(true);
      // Load from localStorage or API
      const saved = localStorage.getItem('platform-customization');
      if (saved) {
        const parsed = JSON.parse(saved);
        setCustomization({ ...defaultCustomization, ...parsed });
      }
    } catch (error) {
      console.error('Error loading customization:', error);
      toast.error('Failed to load customization settings');
    } finally {
      setIsLoading(false);
    }
  };

  const updateCustomization = async (updates: Partial<PlatformCustomization>) => {
    try {
      setIsSaving(true);
      const newCustomization = { ...customization, ...updates };
      setCustomization(newCustomization);
      
      // Save to localStorage or API
      localStorage.setItem('platform-customization', JSON.stringify(newCustomization));
      
      // Apply UI changes immediately
      applyUICustomization(newCustomization.ui);
      
      toast.success('Customization updated successfully');
    } catch (error) {
      console.error('Error updating customization:', error);
      toast.error('Failed to update customization');
    } finally {
      setIsSaving(false);
    }
  };

  const resetToDefault = async () => {
    try {
      setIsSaving(true);
      setCustomization(defaultCustomization);
      localStorage.removeItem('platform-customization');
      applyUICustomization(defaultCustomization.ui);
      toast.success('Customization reset to default');
    } catch (error) {
      console.error('Error resetting customization:', error);
      toast.error('Failed to reset customization');
    } finally {
      setIsSaving(false);
    }
  };

  const exportCustomization = (): string => {
    return JSON.stringify(customization, null, 2);
  };

  const importCustomization = async (json: string) => {
    try {
      setIsSaving(true);
      const imported = JSON.parse(json);
      setCustomization({ ...defaultCustomization, ...imported });
      localStorage.setItem('platform-customization', json);
      applyUICustomization(imported.ui || defaultCustomization.ui);
      toast.success('Customization imported successfully');
    } catch (error) {
      console.error('Error importing customization:', error);
      toast.error('Invalid customization file');
    } finally {
      setIsSaving(false);
    }
  };

  const applyUICustomization = (ui: UICustomization) => {
    // Color mode is owned by DarkModeProvider / leadlab-theme — do not flip html.dark here.
    // Custom brand tokens only (not light/dark class switching).
    if (ui.theme === 'custom') {
      document.documentElement.style.setProperty('--primary', ui.primaryColor);
      document.documentElement.style.setProperty('--secondary', ui.secondaryColor);
      document.documentElement.style.setProperty('--accent', ui.accentColor);
      document.documentElement.style.setProperty('--radius', `${ui.borderRadius}px`);
      document.documentElement.style.setProperty('--spacing', `${ui.spacing * 0.25}rem`);
    }

    if (ui.customCSS) {
      let styleElement = document.getElementById('custom-platform-css');
      if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'custom-platform-css';
        document.head.appendChild(styleElement);
      }
      styleElement.textContent = ui.customCSS;
    }
  };

  const value: CustomizationContextType = {
    customization,
    isLoading,
    isSaving,
    updateCustomization,
    resetToDefault,
    exportCustomization,
    importCustomization
  };

  return (
    <CustomizationContext.Provider value={value}>
      {children}
    </CustomizationContext.Provider>
  );
};

export const useCustomization = () => {
  const context = useContext(CustomizationContext);
  if (context === undefined) {
    throw new Error('useCustomization must be used within a CustomizationProvider');
  }
  return context;
};