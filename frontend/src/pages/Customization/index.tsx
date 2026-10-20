import React, { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/Select';
import { Switch } from '../../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { useCustomization } from '../../contexts/CustomizationContext';
import { toast } from 'react-hot-toast';
import { Download, Upload, RefreshCw, Palette, Layout, Briefcase, ListTodo } from 'lucide-react';
import { ColorPicker } from '../../components/ui/ColorPicker';
import { useTranslation } from 'react-i18next';

const CustomizationPage: React.FC = () => {
  const { t } = useTranslation('modules');
  const {
    customization,
    isLoading,
    isSaving,
    updateCustomization,
    resetToDefault,
    exportCustomization,
    importCustomization
  } = useCustomization();

  const [importData, setImportData] = useState('');

  const handleUIChange = (field: keyof typeof customization.ui, value: any) => {
    updateCustomization({
      ui: { ...customization.ui, [field]: value }
    });
  };

  const handleTaskChange = (field: keyof typeof customization.tasks, value: any) => {
    updateCustomization({
      tasks: { ...customization.tasks, [field]: value }
    });
  };

  const handleDealChange = (field: keyof typeof customization.deals, value: any) => {
    updateCustomization({
      deals: { ...customization.deals, [field]: value }
    });
  };

  const handleLayoutChange = (field: keyof typeof customization.layout, value: any) => {
    updateCustomization({
      layout: { ...customization.layout, [field]: value }
    });
  };

  const handleBrandingChange = (field: keyof typeof customization.branding, value: any) => {
    updateCustomization({
      branding: { ...customization.branding, [field]: value }
    });
  };

  const handleImport = () => {
    if (!importData.trim()) {
      toast.error(t('customizationPage.toastPaste'));
      return;
    }
    importCustomization(importData);
    setImportData('');
  };

  const handleExport = () => {
    const data = exportCustomization();
    navigator.clipboard.writeText(data);
    toast.success(t('customizationPage.toastCopied'));
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('customizationPage.title')}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={isSaving}>
            <Download className="h-4 w-4 mr-2" />
            {t('customizationPage.export')}
          </Button>
          <Button variant="outline" onClick={resetToDefault} disabled={isSaving}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('customizationPage.reset')}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="ui" className="space-y-6">
        <TabsList>
          <TabsTrigger value="ui">
            <Palette className="h-4 w-4 mr-2" />
            {t('customizationPage.tabUi')}
          </TabsTrigger>
          <TabsTrigger value="tasks">
            <ListTodo className="h-4 w-4 mr-2" />
            {t('customizationPage.tabTasks')}
          </TabsTrigger>
          <TabsTrigger value="deals">
            <Briefcase className="h-4 w-4 mr-2" />
            {t('customizationPage.tabDeals')}
          </TabsTrigger>
          <TabsTrigger value="layout">
            <Layout className="h-4 w-4 mr-2" />
            {t('customizationPage.tabLayout')}
          </TabsTrigger>
          <TabsTrigger value="branding">
            <Briefcase className="h-4 w-4 mr-2" />
            {t('customizationPage.tabBranding')}
          </TabsTrigger>
          <TabsTrigger value="import-export">
            <Upload className="h-4 w-4 mr-2" />
            {t('customizationPage.tabImportExport')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ui">
          <Card>
            <CardHeader>
              <CardTitle>{t('customizationPage.uiTitle')}</CardTitle>
              <CardDescription>{t('customizationPage.uiDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">{t('customizationPage.theme')}</label>
                  <Select
                    value={customization.ui.theme}
                    onValueChange={(value) => handleUIChange('theme', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('customizationPage.selectTheme')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">{t('customizationPage.light')}</SelectItem>
                      <SelectItem value="dark">{t('customizationPage.dark')}</SelectItem>
                      <SelectItem value="system">{t('customizationPage.system')}</SelectItem>
                      <SelectItem value="custom">{t('customizationPage.custom')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {customization.ui.theme === 'custom' && (
                  <>
                    <div>
                      <label className="text-sm font-medium">{t('customizationPage.primaryColor')}</label>
                      <ColorPicker
                        value={customization.ui.primaryColor}
                        onChange={(value) => handleUIChange('primaryColor', value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">{t('customizationPage.secondaryColor')}</label>
                      <ColorPicker
                        value={customization.ui.secondaryColor}
                        onChange={(value) => handleUIChange('secondaryColor', value)}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">{t('customizationPage.accentColor')}</label>
                      <ColorPicker
                        value={customization.ui.accentColor}
                        onChange={(value) => handleUIChange('accentColor', value)}
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="text-sm font-medium">{t('customizationPage.borderRadius')}</label>
                  <Input
                    type="number"
                    value={customization.ui.borderRadius}
                    onChange={(e) => handleUIChange('borderRadius', parseInt(e.target.value))}
                    min="0"
                    max="24"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">{t('customizationPage.spacingScale')}</label>
                  <Input
                    type="number"
                    value={customization.ui.spacing}
                    onChange={(e) => handleUIChange('spacing', parseInt(e.target.value))}
                    min="1"
                    max="8"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">{t('customizationPage.animationSpeed')}</label>
                  <Input
                    type="number"
                    value={customization.ui.animationSpeed}
                    onChange={(e) => handleUIChange('animationSpeed', parseFloat(e.target.value))}
                    min="0.1"
                    max="2"
                    step="0.1"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">{t('customizationPage.customCss')}</label>
                <textarea
                  className="w-full h-32 p-2 border rounded-md font-mono text-sm"
                  value={customization.ui.customCSS}
                  onChange={(e) => handleUIChange('customCSS', e.target.value)}
                  placeholder={t('customizationPage.cssPh')}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks">
          <Card>
            <CardHeader>
              <CardTitle>{t('customizationPage.taskTitle')}</CardTitle>
              <CardDescription>{t('customizationPage.taskDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">{t('customizationPage.defaultDueDays')}</label>
                  <Input
                    type="number"
                    value={customization.tasks.defaultDueDays}
                    onChange={(e) => handleTaskChange('defaultDueDays', parseInt(e.target.value))}
                    min="1"
                    max="365"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    checked={customization.tasks.allowCustomFields}
                    onCheckedChange={(checked) => handleTaskChange('allowCustomFields', checked)}
                  />
                  <label className="text-sm font-medium">{t('customizationPage.allowCustomFields')}</label>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-2">{t('customizationPage.taskStatuses')}</h3>
                <div className="space-y-2">
                  {customization.tasks.statuses.map((status, index) => (
                    <div key={status.id} className="flex items-center gap-2 p-2 border rounded">
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: status.color }}
                      />
                      <span className="flex-1">{status.name}</span>
                      <span>{status.icon}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-2">{t('customizationPage.taskPriorities')}</h3>
                <div className="space-y-2">
                  {customization.tasks.priorities.map((priority) => (
                    <div key={priority.id} className="flex items-center gap-2 p-2 border rounded">
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: priority.color }}
                      />
                      <span className="flex-1">{priority.name}</span>
                      <span>{t('customizationPage.level',{level:priority.level})}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deals">
          <Card>
            <CardHeader>
              <CardTitle>{t('customizationPage.dealTitle')}</CardTitle>
              <CardDescription>{t('customizationPage.dealDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">{t('customizationPage.defaultCurrency')}</label>
                  <Input
                    value={customization.deals.defaultCurrency}
                    onChange={(e) => handleDealChange('defaultCurrency', e.target.value)}
                    placeholder="USD"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    checked={customization.deals.allowCustomPipelines}
                    onCheckedChange={(checked) => handleDealChange('allowCustomPipelines', checked)}
                  />
                  <label className="text-sm font-medium">{t('customizationPage.allowCustomPipelines')}</label>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-medium mb-2">{t('customizationPage.dealStages')}</h3>
                <div className="space-y-2">
                  {customization.deals.stages.map((stage) => (
                    <div key={stage.id} className="flex items-center gap-2 p-2 border rounded">
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: stage.color }}
                      />
                      <span className="flex-1">{stage.name}</span>
                      <span>{stage.probability}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="layout">
          <Card>
            <CardHeader>
              <CardTitle>{t('customizationPage.layoutTitle')}</CardTitle>
              <CardDescription>{t('customizationPage.layoutDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">{t('customizationPage.sidebarPosition')}</label>
                  <Select
                    value={customization.layout.sidebarPosition}
                    onValueChange={(value) => handleLayoutChange('sidebarPosition', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('customizationPage.selectPosition')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="left">{t('customizationPage.left')}</SelectItem>
                      <SelectItem value="right">{t('customizationPage.right')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium">{t('customizationPage.sidebarWidth')}</label>
                  <Input
                    type="number"
                    value={customization.layout.sidebarWidth}
                    onChange={(e) => handleLayoutChange('sidebarWidth', parseInt(e.target.value))}
                    min="200"
                    max="400"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">{t('customizationPage.headerHeight')}</label>
                  <Input
                    type="number"
                    value={customization.layout.headerHeight}
                    onChange={(e) => handleLayoutChange('headerHeight', parseInt(e.target.value))}
                    min="48"
                    max="96"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    checked={customization.layout.footerVisible}
                    onCheckedChange={(checked) => handleLayoutChange('footerVisible', checked)}
                  />
                  <label className="text-sm font-medium">{t('customizationPage.footerVisible')}</label>
                </div>

                <div>
                  <label className="text-sm font-medium">{t('customizationPage.gridDensity')}</label>
                  <Select
                    value={customization.layout.gridDensity}
                    onValueChange={(value) => handleLayoutChange('gridDensity', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('customizationPage.selectDensity')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compact">{t('customizationPage.compact')}</SelectItem>
                      <SelectItem value="comfortable">{t('customizationPage.comfortable')}</SelectItem>
                      <SelectItem value="spacious">{t('customizationPage.spacious')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    checked={customization.layout.animationsEnabled}
                    onCheckedChange={(checked) => handleLayoutChange('animationsEnabled', checked)}
                  />
                  <label className="text-sm font-medium">{t('customizationPage.animationsEnabled')}</label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    checked={customization.layout.reducedMotion}
                    onCheckedChange={(checked) => handleLayoutChange('reducedMotion', checked)}
                  />
                  <label className="text-sm font-medium">{t('customizationPage.reducedMotion')}</label>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding">
          <Card>
            <CardHeader>
              <CardTitle>{t('customizationPage.tabBranding')}</CardTitle>
              <CardDescription>{t('customizationPage.brandingDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">{t('customizationPage.companyName')}</label>
                  <Input
                    value={customization.branding.companyName}
                    onChange={(e) => handleBrandingChange('companyName', e.target.value)}
                    placeholder={t('customizationPage.companyPh')}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">{t('customizationPage.supportEmail')}</label>
                  <Input
                    type="email"
                    value={customization.branding.supportEmail}
                    onChange={(e) => handleBrandingChange('supportEmail', e.target.value)}
                    placeholder="support@company.com"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">{t('customizationPage.logoUrl')}</label>
                  <Input
                    value={customization.branding.logoUrl || ''}
                    onChange={(e) => handleBrandingChange('logoUrl', e.target.value)}
                    placeholder="https://example.com/logo.png"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">{t('customizationPage.faviconUrl')}</label>
                  <Input
                    value={customization.branding.faviconUrl || ''}
                    onChange={(e) => handleBrandingChange('faviconUrl', e.target.value)}
                    placeholder="https://example.com/favicon.ico"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">{t('customizationPage.termsUrl')}</label>
                  <Input
                    value={customization.branding.termsUrl || ''}
                    onChange={(e) => handleBrandingChange('termsUrl', e.target.value)}
                    placeholder="https://example.com/terms"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">{t('customizationPage.privacyUrl')}</label>
                  <Input
                    value={customization.branding.privacyUrl || ''}
                    onChange={(e) => handleBrandingChange('privacyUrl', e.target.value)}
                    placeholder="https://example.com/privacy"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="import-export">
          <Card>
            <CardHeader>
              <CardTitle>{t('customizationPage.ieTitle')}</CardTitle>
              <CardDescription>{t('customizationPage.ieDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">{t('customizationPage.importLabel')}</label>
                <textarea
                  className="w-full h-32 p-2 border rounded-md font-mono text-sm"
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  placeholder={t('customizationPage.importPh')}
                />
                <Button onClick={handleImport} disabled={isSaving} className="mt-2">
                  <Upload className="h-4 w-4 mr-2" />
                  {t('customizationPage.import')}
                </Button>
              </div>

              <div>
                <label className="text-sm font-medium">{t('customizationPage.exportLabel')}</label>
                <div className="p-4 bg-gray-100 rounded-md font-mono text-sm whitespace-pre-wrap">
                  {exportCustomization()}
                </div>
                <Button onClick={handleExport} disabled={isSaving} className="mt-2">
                  <Download className="h-4 w-4 mr-2" />
                  {t('customizationPage.copy')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CustomizationPage;