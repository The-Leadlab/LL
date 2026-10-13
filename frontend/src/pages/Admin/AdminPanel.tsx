import React from 'react';
import { Users, Building2, Info, FileSpreadsheet, Tag, Receipt, ClipboardList } from 'lucide-react';
import { LeadManagement } from './LeadManagement';
import { UserManagement } from './UserManagement';
import { OrganizationManagement } from './OrganizationManagement';
import { InformationRequests } from './InformationRequests';
import TagManagement from './TagManagement';
import { InvoiceMaker } from './InvoiceMaker';
import { MarketingFormSubmissions } from './MarketingFormSubmissions';

type Tab = {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  component: React.ComponentType;
};

const tabs: Tab[] = [
  {
    id: 'leads',
    title: 'Lead Management',
    description: 'Add and manage leads in the system.',
    icon: FileSpreadsheet,
    component: LeadManagement,
  },
  {
    id: 'users',
    title: 'Admin Users',
    description: 'Manage system users and their permissions.',
    icon: Users,
    component: UserManagement,
  },
  {
    id: 'tags',
    title: 'Tag Management',
    description: 'Create and manage tags for leads.',
    icon: Tag,
    component: TagManagement,
  },
  {
    id: 'organizations',
    title: 'Organization Management',
    description: 'Manage organizations and their settings.',
    icon: Building2,
    component: OrganizationManagement,
  },
  {
    id: 'invoices',
    title: 'Invoice Maker',
    description: 'Create and manage professional invoices.',
    icon: Receipt,
    component: InvoiceMaker,
  },
  {
    id: 'information-requests',
    title: 'Information Requests',
    description: 'View and manage information requests.',
    icon: Info,
    component: InformationRequests,
  },
  {
    id: 'marketing-forms',
    title: 'Marketing forms',
    description: 'Business diagnostic, data request, and pitch-your-idea submissions.',
    icon: ClipboardList,
    component: MarketingFormSubmissions,
  },
];

export function AdminPanel() {
  const [activeTab, setActiveTab] = React.useState(tabs[0].id);
  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component || tabs[0].component;

  return (
    <div className="p-4 sm:p-6 min-w-0 overflow-x-hidden">
      <h1 className="text-2xl font-bold mb-6">Admin Panel</h1>
      
      {/* Tabs */}
      <div className="flex space-x-4 mb-6 overflow-x-auto pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center px-4 py-2 rounded-lg transition-colors min-w-max
                ${isActive 
                  ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' 
                  : 'bg-white text-gray-600 hover:bg-gray-50'}
              `}
            >
              <Icon className={`w-5 h-5 mr-2 ${isActive ? 'text-blue-700' : 'text-gray-500'}`} />
              <span className="font-medium">{tab.title}</span>
            </button>
          );
        })}
      </div>

      {/* Active Component */}
      <div className="bg-white rounded-lg">
        <ActiveComponent />
      </div>
    </div>
  );
}
