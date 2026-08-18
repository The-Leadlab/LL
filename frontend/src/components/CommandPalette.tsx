/**
 * Command Palette - CMD+K to search anything
 *
 * THIS IS HOW YOU DESTROY SALESFORCE:
 * - Salesforce: Click through 10 menus to find anything
 * - LeadLab: Press CMD+K, type, done in 2 seconds
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Users,
  DollarSign,
  CalendarDays,
  CheckSquare,
  Plus,
  Settings,
  Home,
  BarChart3,
  FileText,
  Mail,
  Phone,
  TrendingUp,
  Workflow,
  Zap,
  Database
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { featureFlags } from '@/config/featureFlags';

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  action: () => void;
  shortcut?: string;
  category: 'navigation' | 'actions' | 'search' | 'recent';
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filteredCommands, setFilteredCommands] = useState<CommandItem[]>([]);

  // All available commands
  const commands: CommandItem[] = [
    // Navigation
    {
      id: 'nav-dashboard',
      title: 'Go to Dashboard',
      icon: <Home className="w-4 h-4" />,
      action: () => navigate('/dashboard'),
      shortcut: 'G D',
      category: 'navigation',
    },
    {
      id: 'nav-leads',
      title: 'Go to Leads',
      icon: <Users className="w-4 h-4" />,
      action: () => navigate('/leads'),
      shortcut: 'G L',
      category: 'navigation',
    },
    {
      id: 'nav-deals',
      title: 'Go to Deals',
      icon: <DollarSign className="w-4 h-4" />,
      action: () => navigate('/deals'),
      shortcut: 'G O',
      category: 'navigation',
    },
    {
      id: 'nav-tasks',
      title: 'Go to Tasks',
      icon: <CheckSquare className="w-4 h-4" />,
      action: () => navigate('/tasks'),
      shortcut: 'G T',
      category: 'navigation',
    },
    {
      id: 'nav-calendar',
      title: 'Go to Calendar',
      icon: <CalendarDays className="w-4 h-4" />,
      action: () => navigate('/calendar'),
      shortcut: 'G C',
      category: 'navigation',
    },
    {
      id: 'nav-reports',
      title: 'Go to Reports',
      icon: <BarChart3 className="w-4 h-4" />,
      action: () => navigate('/reports'),
      shortcut: 'G R',
      category: 'navigation',
    },
    {
      id: 'nav-territories',
      title: 'Go to Territories',
      icon: <TrendingUp className="w-4 h-4" />,
      action: () => navigate('/settings/territories'),
      category: 'navigation',
    },
    {
      id: 'nav-cpq',
      title: 'Go to CPQ (Quotes)',
      icon: <FileText className="w-4 h-4" />,
      action: () => navigate('/cpq/quotes'),
      category: 'navigation',
    },
    ...(featureFlags.navigation.showForecasting
      ? [{
          id: 'nav-forecasting',
          title: 'Go to Forecasting',
          icon: <TrendingUp className="w-4 h-4" />,
          action: () => navigate('/forecasting'),
          category: 'navigation' as const,
        }]
      : []),
    ...(featureFlags.navigation.showMindMapping
      ? [{
          id: 'nav-mind-mapping',
          title: 'Go to Mind Mapping',
          icon: <Workflow className="w-4 h-4" />,
          action: () => navigate('/workflows'),
          category: 'navigation' as const,
        }]
      : []),
    ...(featureFlags.navigation.showDataImport
      ? [{
          id: 'nav-data-import',
          title: 'Go to Data Import',
          icon: <Database className="w-4 h-4" />,
          action: () => navigate('/data-import/wizard'),
          category: 'navigation' as const,
        }]
      : []),
    {
      id: 'nav-settings',
      title: 'Go to Settings',
      icon: <Settings className="w-4 h-4" />,
      action: () => navigate('/settings'),
      category: 'navigation',
    },

    // Quick Actions
    {
      id: 'action-new-lead',
      title: 'Create New Lead',
      icon: <Plus className="w-4 h-4" />,
      action: () => navigate('/leads/new'),
      shortcut: 'CMD+N',
      category: 'actions',
    },
    {
      id: 'action-new-deal',
      title: 'Create New Deal',
      icon: <Plus className="w-4 h-4" />,
      action: () => navigate('/deals/new'),
      shortcut: 'CMD+D',
      category: 'actions',
    },
    {
      id: 'action-new-task',
      title: 'Create New Task',
      icon: <Plus className="w-4 h-4" />,
      action: () => navigate('/tasks/new'),
      shortcut: 'CMD+T',
      category: 'actions',
    },
    ...(featureFlags.navigation.showEmail
      ? [
          {
            id: 'action-send-email',
            title: 'Send Email',
            icon: <Mail className="w-4 h-4" />,
            action: () => navigate('/emails'),
            category: 'actions' as const,
          },
          {
            id: 'action-cold-outreach',
            title: 'Cold Outreach',
            icon: <Mail className="w-4 h-4" />,
            action: () => navigate('/emails/outreach'),
            category: 'actions' as const,
          },
        ]
      : []),
  ];

  // Filter commands based on query
  useEffect(() => {
    const query_lower = query.toLowerCase().trim();

    if (!query_lower) {
      // Show all commands when no query
      setFilteredCommands(commands);
      setSelectedIndex(0);
      return;
    }

    const filtered = commands.filter(cmd =>
      cmd.title.toLowerCase().includes(query_lower) ||
      cmd.subtitle?.toLowerCase().includes(query_lower) ||
      cmd.shortcut?.toLowerCase().includes(query_lower)
    );

    setFilteredCommands(filtered);
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
          onClose();
          setQuery('');
        }
        break;
      case 'Escape':
        onClose();
        setQuery('');
        break;
    }
  }, [filteredCommands, selectedIndex, onClose]);

  // Group commands by category
  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) {
      acc[cmd.category] = [];
    }
    acc[cmd.category].push(cmd);
    return acc;
  }, {} as Record<string, CommandItem[]>);

  const categoryLabels = {
    navigation: 'Navigation',
    actions: 'Quick Actions',
    search: 'Search Results',
    recent: 'Recent',
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search for anything... (type to filter)"
              className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
              autoFocus
            />
            <kbd className="hidden sm:inline-block px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted rounded">
              ESC
            </kbd>
          </div>
        </div>

        <div className="max-h-[400px] overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No results found for "{query}"
            </div>
          ) : (
            <>
              {Object.entries(groupedCommands).map(([category, items]) => (
                <div key={category} className="mb-4 last:mb-0">
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {categoryLabels[category as keyof typeof categoryLabels]}
                  </div>
                  <div className="space-y-1">
                    {items.map((cmd, index) => {
                      const globalIndex = filteredCommands.indexOf(cmd);
                      const isSelected = globalIndex === selectedIndex;

                      return (
                        <button
                          key={cmd.id}
                          onClick={() => {
                            cmd.action();
                            onClose();
                            setQuery('');
                          }}
                          onMouseEnter={() => setSelectedIndex(globalIndex)}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                            isSelected
                              ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-accent hover:text-accent-foreground'
                          )}
                        >
                          <div className={cn(
                            'flex-shrink-0',
                            isSelected ? 'text-primary-foreground' : 'text-muted-foreground'
                          )}>
                            {cmd.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{cmd.title}</div>
                            {cmd.subtitle && (
                              <div className={cn(
                                'text-xs truncate',
                                isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                              )}>
                                {cmd.subtitle}
                              </div>
                            )}
                          </div>
                          {cmd.shortcut && (
                            <kbd className={cn(
                              'hidden sm:inline-block px-2 py-1 text-xs font-semibold rounded',
                              isSelected
                                ? 'bg-primary-foreground/20 text-primary-foreground'
                                : 'bg-muted text-muted-foreground'
                            )}>
                              {cmd.shortcut}
                            </kbd>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="border-t border-border px-4 py-2 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-muted rounded">↓</kbd>
              to navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded">↵</kbd>
              to select
            </span>
          </div>
          <span>Press <kbd className="px-1.5 py-0.5 bg-muted rounded">?</kbd> for keyboard shortcuts</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hook to use command palette
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // CMD+K or CTRL+K to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { open, setOpen };
}
