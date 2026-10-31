import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { territoriesAPI, Territory } from '@/services/api/territories';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { useToast } from '@/hooks/use-toast';
import {
  MapPin, Plus, Edit, Trash2, Users, Target, TrendingUp,
  ChevronRight, ChevronDown, MoreVertical, Award, Loader2
} from 'lucide-react';
import { PageContainer } from '@/components/ui/PageContainer';
import { Badge } from '@/components/ui/Badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface TerritoryTreeNodeProps {
  territory: Territory;
  level: number;
  onEdit: (territory: Territory) => void;
  onDelete: (territoryId: number) => void;
  onAddChild: (parentId: number) => void;
  onViewDetails: (territory: Territory) => void;
}

const TerritoryTreeNode: React.FC<TerritoryTreeNodeProps> = ({
  territory,
  level,
  onEdit,
  onDelete,
  onAddChild,
  onViewDetails
}) => {
  const { t } = useTranslation('modules');
  const [isExpanded, setIsExpanded] = useState(level === 0);
  const hasChildren = territory.children && territory.children.length > 0;

  return (
    <div className="border-l-2 border-border ml-4">
      <div
        className={`flex items-center gap-2 p-3 hover:bg-muted rounded-lg cursor-pointer transition-colors ${
          !territory.is_active ? 'opacity-50' : ''
        }`}
        style={{ marginLeft: `${level * 20}px` }}
      >
        {hasChildren && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 hover:bg-muted rounded"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        )}

        {!hasChildren && <div className="w-6" />}

        <MapPin className="h-5 w-5 text-blue-600" />

        <div
          className="flex-1 flex items-center gap-3"
          onClick={() => onViewDetails(territory)}
        >
          <span className="font-medium">{territory.name}</span>
          {!territory.is_active && (
            <Badge variant="secondary">{t('territories.inactive')}</Badge>
          )}
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            <span>{territory.members_count}</span>
          </div>
          <div className="flex items-center gap-1">
            <Target className="h-4 w-4" />
            <span>{territory.children_count}</span>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(territory)}>
              <Edit className="h-4 w-4 mr-2" />
              {t('territories.edit')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAddChild(territory.id)}>
              <Plus className="h-4 w-4 mr-2" />
              {t('territories.addSub')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(territory.id)}
              className="text-red-600"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('territories.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isExpanded && hasChildren && (
        <div className="ml-2">
          {territory.children?.map((child) => (
            <TerritoryTreeNode
              key={child.id}
              territory={child}
              level={level + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onViewDetails={onViewDetails}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const TerritoryList: React.FC = () => {
  const { t } = useTranslation('modules');
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedTerritory, setSelectedTerritory] = useState<Territory | null>(null);
  const [parentId, setParentId] = useState<number | undefined>();
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });

  // Fetch territory hierarchy
  const { data: territories, isLoading } = useQuery({
    queryKey: ['territories', 'hierarchy'],
    queryFn: territoriesAPI.getHierarchy
  });

  // Fetch flat list for parent selection
  const { data: allTerritories } = useQuery({
    queryKey: ['territories', 'all'],
    queryFn: territoriesAPI.getAll
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: territoriesAPI.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['territories'] });
      setIsCreateDialogOpen(false);
      setFormData({ name: '', description: '' });
      setParentId(undefined);
      toast({
        title: t('territories.toast.success'),
        description: t('territories.toast.created')
      });
    },
    onError: () => {
      toast({
        title: t('territories.toast.error'),
        description: t('territories.toast.createFailed'),
        variant: 'destructive'
      });
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: territoriesAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['territories'] });
      toast({
        title: t('territories.toast.success'),
        description: t('territories.toast.deleted')
      });
    },
    onError: () => {
      toast({
        title: t('territories.toast.error'),
        description: t('territories.toast.deleteFailed'),
        variant: 'destructive'
      });
    }
  });

  const handleCreate = () => {
    if (!formData.name.trim()) {
      toast({
        title: t('territories.toast.validationTitle'),
        description: t('territories.toast.nameRequired'),
        variant: 'destructive'
      });
      return;
    }

    createMutation.mutate({
      ...formData,
      parent_id: parentId
    });
  };

  const handleAddChild = (parent_id: number) => {
    setParentId(parent_id);
    setIsCreateDialogOpen(true);
  };

  const handleViewDetails = (territory: Territory) => {
    setSelectedTerritory(territory);
  };

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">{t('territories.title')}</h1>
            <p className="text-muted-foreground mt-1">
              {t('territories.subtitle')}
            </p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => setParentId(undefined)}>
                <Plus className="h-4 w-4 mr-2" />
                {t('territories.create')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('territories.createTitle')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">{t('territories.name')}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t('territories.namePlaceholder')}
                  />
                </div>
                <div>
                  <Label htmlFor="description">{t('territories.description')}</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={t('territories.descriptionPlaceholder')}
                  />
                </div>
                <div>
                  <Label htmlFor="parent">{t('territories.parent')}</Label>
                  <Select
                    value={parentId?.toString() || ''}
                    onValueChange={(value) => setParentId(value ? parseInt(value) : undefined)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('territories.noneRoot')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">{t('territories.noneRoot')}</SelectItem>
                      {allTerritories?.map((territory) => (
                        <SelectItem key={territory.id} value={territory.id.toString()}>
                          {territory.full_path}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                  className="w-full"
                >
                  {createMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {t('territories.create')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Territory Tree */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {t('territories.hierarchy')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {territories && territories.length > 0 ? (
              <div className="space-y-2">
                {territories.map((territory) => (
                  <TerritoryTreeNode
                    key={territory.id}
                    territory={territory}
                    level={0}
                    onEdit={setSelectedTerritory}
                    onDelete={(id) => {
                      if (confirm(t('territories.confirmDelete'))) {
                        deleteMutation.mutate(id);
                      }
                    }}
                    onAddChild={handleAddChild}
                    onViewDetails={handleViewDetails}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('territories.empty')}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <MapPin className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('territories.total')}</p>
                  <p className="text-2xl font-bold">{allTerritories?.length || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Users className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('territories.members')}</p>
                  <p className="text-2xl font-bold">
                    {allTerritories?.reduce((sum, t) => sum + t.members_count, 0) || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('territories.activeCount')}</p>
                  <p className="text-2xl font-bold">
                    {allTerritories?.filter(t => t.is_active).length || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
};

export default TerritoryList;
