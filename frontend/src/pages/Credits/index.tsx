import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Progress } from '../../components/ui/progress';
import { 
  CreditCard, 
  Zap, 
  CheckCircle, 
  Package, 
  Star, 
  Crown, 
  AlertTriangle 
} from 'lucide-react';
import { creditsAPI, CreditBalance, CreditPackage } from '../../services/api/credits';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

const CREDIT_USAGE_RATES = {
  'lead_import': 1,
  'email_sync': 2,
  'report_generation': 5,
  'ai_insights': 10,
  'advanced_analytics': 15
};

export function CreditsPage() {
  const { t } = useTranslation('modules');
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ['credits', 'balance'],
    queryFn: creditsAPI.getBalance,
  });

  const { data: packagesData, isLoading: packagesLoading } = useQuery({
    queryKey: ['credits', 'packages'],
    queryFn: creditsAPI.getPackages,
  });

  // Purchase credit package
  const purchasePackage = async (packageId: number) => {
    try {
      const response = await creditsAPI.purchasePackage(packageId);
      
      if (response.checkout_url) {
        // Redirect to Stripe checkout
        window.location.href = response.checkout_url;
      } else {
        toast.error(t('credits.toast.checkoutFailed'));
      }
    } catch (error: any) {
      toast.error(error.response?.data?.detail || t('credits.toast.purchaseFailed'));
    }
  };

  const consumeCredits = useMutation({
    mutationFn: ({ feature, credits }: { feature: string; credits: number }) =>
      creditsAPI.consumeCredits({ feature, credits }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credits', 'balance'] });
      toast.success(t('credits.toast.consumed'));
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || t('credits.toast.consumeFailed'));
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'trial': return 'bg-blue-100 text-blue-800';
      case 'inactive': return 'bg-red-100 text-red-800';
      default: return 'bg-muted text-foreground';
    }
  };

  const getPackageIcon = (index: number) => {
    switch (index) {
      case 0: return <Package className="h-6 w-6" />;
      case 1: return <Star className="h-6 w-6" />;
      case 2: return <Crown className="h-6 w-6" />;
      default: return <Zap className="h-6 w-6" />;
    }
  };

  const getPackageColor = (index: number) => {
    switch (index) {
      case 0: return 'border-blue-200 hover:border-blue-300';
      case 1: return 'border-purple-200 hover:border-purple-300';
      case 2: return 'border-yellow-200 hover:border-yellow-300';
      default: return 'border-border hover:border-border';
    }
  };

  const creditPercentage = balance ? Math.min((balance.credit_balance / 1000) * 100, 100) : 0;
  const isLowCredits = balance && balance.credit_balance < 100;

  if (balanceLoading || packagesLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-48"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">{t('credits.title')}</h1>
        <p className="text-muted-foreground">{t('credits.subtitle')}</p>
      </div>

      {/* Current Balance */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CreditCard className="h-6 w-6" />
              <span>{t('credits.currentBalance')}</span>
            </div>
            <Badge className={getStatusColor(balance?.subscription_status || 'trial')}>
              {t(`credits.status.${balance?.subscription_status || 'trial'}`, { defaultValue: balance?.subscription_status || 'Trial' })}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-4xl font-bold text-foreground">
              {balance?.credit_balance?.toLocaleString() || '0'}
            </span>
            {isLowCredits && (
              <Badge variant="destructive" className="animate-pulse">
                {t('credits.lowCredits')}
              </Badge>
            )}
          </div>
          
          <Progress value={creditPercentage} className="h-3" />
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
            {Object.entries(CREDIT_USAGE_RATES).map(([feature, cost]) => (
              <div key={feature} className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="font-semibold text-sm text-foreground">
                  {t(`credits.features.${feature}`, { defaultValue: feature.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()) })}
                </div>
                <div className="text-xs text-muted-foreground">{t('credits.creditsCount', { count: cost })}</div>
              </div>
            ))}
          </div>
          
          {balance?.subscription_status === 'trial' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-blue-600" />
                <span className="font-medium text-blue-900">{t('credits.trialTitle')}</span>
              </div>
              <p className="text-sm text-blue-700 mt-1">
                {t('credits.trialBody')}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Credit Packages */}
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-6">{t('credits.packages')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.isArray(packagesData) && packagesData.map((pkg, index) => (
            <Card 
              key={pkg.id} 
              className={`cursor-pointer transition-all duration-200 ${getPackageColor(index)} ${
                selectedPackage === pkg.id ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => setSelectedPackage(selectedPackage === pkg.id ? null : pkg.id)}
            >
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 p-3 bg-blue-100 rounded-full w-fit">
                  {getPackageIcon(index)}
                </div>
                <CardTitle className="text-xl">{pkg.name}</CardTitle>
                <div className="text-3xl font-bold text-foreground">
                  ${pkg.price}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {pkg.credits.toLocaleString()}
                  </div>
                  <div className="text-sm text-muted-foreground">{t('credits.creditsLabel')}</div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{t('credits.pricePerCredit')}</span>
                    <span>${(pkg.price / pkg.credits).toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>{t('credits.bestFor')}</span>
                    <span className="text-muted-foreground">
                      {index === 0 ? t('credits.bestForTiers.small') : index === 1 ? t('credits.bestForTiers.growing') : t('credits.bestForTiers.enterprise')}
                    </span>
                  </div>
                </div>

                <Button 
                  className="w-full" 
                  variant={selectedPackage === pkg.id ? "default" : "outline"}
                  onClick={(e) => {
                    e.stopPropagation();
                    purchasePackage(pkg.id);
                  }}
                >
                  {selectedPackage === pkg.id ? t('credits.purchaseNow') : t('credits.selectPackage')}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Feature Usage Testing (Development Only) */}
      {process.env.NODE_ENV === 'development' && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-amber-800">{t('credits.testTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-amber-700">
              {t('credits.testBody')}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(CREDIT_USAGE_RATES).map(([feature, cost]) => (
                <Button
                  key={feature}
                  variant="outline"
                  size="sm"
                  onClick={() => consumeCredits.mutate({ feature, credits: cost })}
                  disabled={consumeCredits.isPending}
                >
                  {t('credits.testFeature', { feature: t(`credits.features.${feature}`, { defaultValue: feature.replace('_', ' ') }), cost })}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
 