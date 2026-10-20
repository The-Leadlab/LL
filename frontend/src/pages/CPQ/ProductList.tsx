import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cpqAPI, Product } from '@/services/api/cpq';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useToast } from '@/hooks/use-toast';
import { Package, Plus, Edit, Trash2, Loader2, DollarSign, Tag } from 'lucide-react';
import { PageContainer } from '@/components/ui/PageContainer';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';

export const ProductList: React.FC = () => {
  const { t } = useTranslation('modules');
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sku: '',
    base_price: '',
    category: '',
    currency: 'USD'
  });

  // Fetch products
  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => cpqAPI.getProducts()
  });

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      editingProduct
        ? cpqAPI.updateProduct(editingProduct.id, data)
        : cpqAPI.createProduct(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: t('cpq.common.success'),
        description: editingProduct ? t('cpq.products.toast.updated') : t('cpq.products.toast.created')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('cpq.common.error'),
        description: error.response?.data?.detail || t('cpq.products.toast.saveFailed'),
        variant: 'destructive'
      });
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: cpqAPI.deleteProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({
        title: t('cpq.common.success'),
        description: t('cpq.products.toast.deleted')
      });
    }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      sku: '',
      base_price: '',
      category: '',
      currency: 'USD'
    });
    setEditingProduct(null);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || '',
      sku: product.sku,
      base_price: product.base_price.toString(),
      category: product.category || '',
      currency: product.currency
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.sku || !formData.base_price) {
      toast({
        title: t('cpq.products.toast.validationTitle'),
        description: t('cpq.products.toast.validation'),
        variant: 'destructive'
      });
      return;
    }

    saveMutation.mutate({
      ...formData,
      base_price: parseFloat(formData.base_price),
      is_active: true
    });
  };

  const stats = React.useMemo(() => {
    if (!products) return { total: 0, active: 0, categories: 0, totalValue: 0 };
    const categories = new Set(products.map(p => p.category).filter(Boolean));
    return {
      total: products.length,
      active: products.filter(p => p.is_active).length,
      categories: categories.size,
      totalValue: products.reduce((sum, p) => sum + p.base_price, 0)
    };
  }, [products]);

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
            <h1 className="text-3xl font-bold">{t('cpq.products.title')}</h1>
            <p className="text-gray-600 mt-1">
              {t('cpq.products.subtitle')}
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="h-4 w-4 mr-2" />
                {t('cpq.products.add')}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingProduct ? t('cpq.products.editTitle') : t('cpq.products.addTitle')}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">{t('cpq.products.name')}</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder={t('cpq.products.namePlaceholder')}
                  />
                </div>
                <div>
                  <Label htmlFor="sku">{t('cpq.products.sku')}</Label>
                  <Input
                    id="sku"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    placeholder={t('cpq.products.skuPlaceholder')}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="price">{t('cpq.products.basePrice')}</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      value={formData.base_price}
                      onChange={(e) => setFormData({ ...formData, base_price: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <Label htmlFor="currency">{t('cpq.products.currency')}</Label>
                    <Input
                      id="currency"
                      value={formData.currency}
                      onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                      placeholder="USD"
                      maxLength={3}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="category">{t('cpq.products.category')}</Label>
                  <Input
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder={t('cpq.products.categoryPlaceholder')}
                  />
                </div>
                <div>
                  <Label htmlFor="description">{t('cpq.products.description')}</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder={t('cpq.products.descriptionPlaceholder')}
                  />
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={saveMutation.isPending}
                  className="w-full"
                >
                  {saveMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {editingProduct ? t('cpq.products.update') : t('cpq.products.create')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Package className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">{t('cpq.products.total')}</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Package className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">{t('cpq.products.active')}</p>
                  <p className="text-2xl font-bold">{stats.active}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <Tag className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">{t('cpq.products.categories')}</p>
                  <p className="text-2xl font-bold">{stats.categories}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-orange-100 rounded-lg">
                  <DollarSign className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">{t('cpq.products.catalogValue')}</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(stats.totalValue)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products && products.length > 0 ? (
            products.map((product) => (
              <Card key={product.id} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Package className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{product.name}</h3>
                        <p className="text-sm text-gray-600">{t('cpq.products.skuLabel', { sku: product.sku })}</p>
                      </div>
                    </div>
                    {product.is_active ? (
                      <Badge className="bg-green-100 text-green-800">{t('cpq.products.active')}</Badge>
                    ) : (
                      <Badge variant="secondary">{t('cpq.products.inactive')}</Badge>
                    )}
                  </div>
                  {product.description && (
                    <p className="text-sm text-gray-600 mb-3">{product.description}</p>
                  )}
                  {product.category && (
                    <Badge variant="outline" className="mb-3">
                      {product.category}
                    </Badge>
                  )}
                  <div className="flex items-center justify-between pt-3 border-t">
                    <div>
                      <p className="text-2xl font-bold text-blue-600">
                        {formatCurrency(product.base_price, product.currency)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(product)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (confirm(t('cpq.products.confirmDelete'))) {
                            deleteMutation.mutate(product.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="col-span-full">
              <CardContent className="py-12 text-center">
                <Package className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-semibold mb-2">{t('cpq.products.emptyTitle')}</h3>
                <p className="text-gray-600 mb-4">
                  {t('cpq.products.emptyBody')}
                </p>
                <Button onClick={() => setIsDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('cpq.products.add')}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PageContainer>
  );
};

export default ProductList;
