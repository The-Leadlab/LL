import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Label } from '../../components/ui/Label';
import { Textarea } from '../../components/ui/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { 
  FileText, 
  Download, 
  Send, 
  Plus, 
  Trash2, 
  Calendar,
  DollarSign,
  Building2,
  User,
  Calculator,
  Save,
  Eye,
  X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { buildInvoicePdf } from '../../lib/simplePdf';
import { leadsAPI, organizationsAPI } from '../../services/api';
import { invoiceService } from '../../services/invoices';

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface InvoiceData {
  invoiceNumber: string;
  date: string;
  dueDate: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  
  // Company Details
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyWebsite: string;
  
  // Client Details
  clientName: string;
  clientCompany: string;
  clientAddress: string;
  clientPhone: string;
  clientEmail: string;
  
  // Invoice Items
  items: InvoiceItem[];
  
  // Financial
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  currency: string;
  currencySymbol: string;
  
  // Additional
  notes: string;
  terms: string;
  paymentTerms: string;
}

const initialInvoiceData: InvoiceData = {
  invoiceNumber: `INV-${Date.now()}`,
  date: new Date().toISOString().split('T')[0],
  dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  status: 'draft',
  
  companyName: 'The Leadlab İş Geliştirme Yazılım ve Yapay Zeka Danışmanlığı Limited Şirketi',
  companyAddress: 'Küçükbakkalköy Mah. Selvili Sk. No: 4\nİç Kapı No: 20\nAtaşehir/İstanbul',
  companyPhone: '+90 (216) 555-0123',
  companyEmail: 'info@leadlab.com',
  companyWebsite: 'www.leadlab.com',
  
  clientName: '',
  clientCompany: '',
  clientAddress: '',
  clientPhone: '',
  clientEmail: '',
  
  items: [],
  
  subtotal: 0,
  taxRate: 18, // Default Turkish VAT rate
  taxAmount: 0,
  discountAmount: 0,
  total: 0,
  currency: 'TRY',
  currencySymbol: '₺',
  
  notes: '',
  terms: 'Payment is due within 30 days of invoice date.',
  paymentTerms: 'Net 30'
};

export function InvoiceMaker() {
  const { t } = useTranslation('modules');
  const [invoiceData, setInvoiceData] = useState<InvoiceData>(initialInvoiceData);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [selectedLead, setSelectedLead] = useState<string>('');
  const [savedInvoices, setSavedInvoices] = useState<InvoiceData[]>([]);
  const invoiceRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Load saved invoices on component mount
  React.useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('invoices') || '[]');
    setSavedInvoices(saved);
  }, []);

  // Fetch leads for client selection
  const { data: leads } = useQuery({
    queryKey: ['leads'],
    queryFn: () => leadsAPI.getAll(),
  });

  // Fetch organizations
  const { data: organizations } = useQuery({
    queryKey: ['organizations'],
    queryFn: () => organizationsAPI.getAll(),
  });

  // Generate new invoice number
  const generateInvoiceNumber = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
    return `INV-${year}${month}${day}-${random}`;
  };

  // Add new item
  const addItem = () => {
    const newItem: InvoiceItem = {
      id: Date.now().toString(),
      description: '',
      quantity: 1,
      unitPrice: 0,
      total: 0
    };
    setInvoiceData(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));
  };

  // Update item
  const updateItem = (id: string, field: keyof InvoiceItem, value: string | number) => {
    setInvoiceData(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value };
          // Recalculate total for this item
          if (field === 'quantity' || field === 'unitPrice') {
            updatedItem.total = Number(updatedItem.quantity) * Number(updatedItem.unitPrice);
          }
          return updatedItem;
        }
        return item;
      })
    }));
  };

  // Remove item
  const removeItem = (id: string) => {
    setInvoiceData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id)
    }));
  };

  // Populate client data from selected lead
  const populateFromLead = (leadId: string) => {
    const leadsArray = leads?.data?.results || [];
    const lead = leadsArray.find((l: any) => l.id === Number(leadId));
    if (lead) {
      setInvoiceData(prev => ({
        ...prev,
        clientName: `${lead.first_name} ${lead.last_name}`,
        clientCompany: lead.company || '',
        clientEmail: lead.email || '',
        clientPhone: lead.telephone || lead.mobile || '',
        clientAddress: lead.location || ''
      }));
    }
  };

  // Calculate totals
  React.useEffect(() => {
    const subtotal = invoiceData.items.reduce((sum, item) => sum + item.total, 0);
    const taxAmount = (subtotal * invoiceData.taxRate) / 100;
    const total = subtotal + taxAmount - invoiceData.discountAmount;

    setInvoiceData(prev => ({
      ...prev,
      subtotal,
      taxAmount,
      total: Math.max(0, total)
    }));
  }, [invoiceData.items, invoiceData.taxRate, invoiceData.discountAmount]);

  // Save invoice
  const saveInvoice = () => {
    try {
      // Validate required fields
      if (!invoiceData.clientName || !invoiceData.companyName) {
        toast.error(t('invoice.toast.requiredFields'));
        return;
      }
      
      if (invoiceData.items.length === 0) {
        toast.error(t('invoice.toast.needItem'));
        return;
      }
      
      // Save to localStorage (in real app, this would save to backend)
      const savedInvoices = JSON.parse(localStorage.getItem('invoices') || '[]');
      const existingIndex = savedInvoices.findIndex((inv: any) => inv.invoiceNumber === invoiceData.invoiceNumber);
      
      if (existingIndex >= 0) {
        savedInvoices[existingIndex] = { ...invoiceData, updatedAt: new Date().toISOString() };
      } else {
        savedInvoices.push({ ...invoiceData, createdAt: new Date().toISOString() });
      }
      
      localStorage.setItem('invoices', JSON.stringify(savedInvoices));
      setSavedInvoices(savedInvoices);
      toast.success(t('invoice.toast.saved'));
    } catch (error) {
      toast.error(t('invoice.toast.saveFailed'));
    }
  };

  const generatePDF = () => {
    try {
      const blob = buildInvoicePdf({
        invoiceNumber: invoiceData.invoiceNumber,
        date: invoiceData.date,
        dueDate: invoiceData.dueDate,
        status: invoiceData.status,
        paymentTerms: invoiceData.paymentTerms,
        companyName: invoiceData.companyName,
        companyAddress: invoiceData.companyAddress,
        companyPhone: invoiceData.companyPhone,
        companyEmail: invoiceData.companyEmail,
        companyWebsite: invoiceData.companyWebsite,
        clientName: invoiceData.clientName,
        clientCompany: invoiceData.clientCompany,
        clientAddress: invoiceData.clientAddress,
        clientPhone: invoiceData.clientPhone,
        clientEmail: invoiceData.clientEmail,
        items: invoiceData.items,
        subtotal: Number(invoiceData.subtotal) || 0,
        taxRate: Number(invoiceData.taxRate) || 0,
        taxAmount: Number(invoiceData.taxAmount) || 0,
        discountAmount: Number(invoiceData.discountAmount) || 0,
        total: Number(invoiceData.total) || 0,
        notes: invoiceData.notes,
        terms: invoiceData.terms,
        currencySymbol: invoiceData.currency === 'TRY' ? '₺' : invoiceData.currencySymbol,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${invoiceData.invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t('invoice.toast.pdfStarted'));
    } catch (error) {
      toast.error(t('invoice.toast.pdfFailed'));
    }
  };

  // Send invoice
  const sendInvoice = async () => {
    try {
      if (!invoiceData.clientEmail) {
        toast.error(t('invoice.toast.emailRequired'));
        return;
      }
      
      if (!invoiceData.clientName) {
        toast.error(t('invoice.toast.nameRequired'));
        return;
      }

      // Show loading state
      const loadingToast = toast.loading(t('invoice.toast.sending'));
      
      // Prepare invoice data for API
      const emailRequest = {
        to_email: invoiceData.clientEmail,
        invoice_number: invoiceData.invoiceNumber,
        client_name: invoiceData.clientName,
        company_name: invoiceData.companyName,
        invoice_data: {
          total: invoiceData.total,
          currency_symbol: invoiceData.currencySymbol,
          due_date: new Date(invoiceData.dueDate).toLocaleDateString(),
          items: invoiceData.items,
          subtotal: invoiceData.subtotal,
          tax_amount: invoiceData.taxAmount,
          discount_amount: invoiceData.discountAmount
        },
        message: `Thank you for your business! Please find attached your invoice ${invoiceData.invoiceNumber}.`
      };

      // Send email via API
      const response = await invoiceService.sendInvoiceEmail(emailRequest);
      
      // Dismiss loading toast
      toast.dismiss(loadingToast);
      
      if (response.success) {
        toast.success(t('invoice.toast.sent', { number: invoiceData.invoiceNumber, email: invoiceData.clientEmail }));
        setInvoiceData(prev => ({ ...prev, status: 'sent' }));
        
        // Save the updated status
        saveInvoice();
      } else {
        toast.error(response.message || t('invoice.toast.sendFailed'));
      }
      
    } catch (error: any) {
      toast.error(error.message || t('invoice.toast.sendFailed'));
      console.error('Send invoice error:', error);
    }
  };

  // Preview component
  const InvoicePreview = () => (
    <div id="invoice-preview" ref={invoiceRef} className="bg-white p-8 shadow-lg max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div className="flex items-center space-x-6">
          {/* LeadLab Logo */}
          <div className="flex items-center">
            <img 
              src="/images/leadlab-logo.png" 
              alt="LeadLab Logo" 
              className="h-12 w-auto"
            />
          </div>
          
          <div className="border-l border-gray-200 pl-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">INVOICE</h1>
            <div className="bg-gray-100 px-3 py-2 rounded border">
              <p className="text-sm text-gray-500 mb-1">Invoice Number</p>
              <p className="text-lg font-bold text-gray-900">{invoiceData.invoiceNumber}</p>
            </div>
          </div>
        </div>
        <div className="text-right">
          <Badge className={`
            ${invoiceData.status === 'paid' ? 'bg-green-100 text-green-800' : ''}
            ${invoiceData.status === 'sent' ? 'bg-blue-100 text-blue-800' : ''}
            ${invoiceData.status === 'draft' ? 'bg-gray-100 text-gray-800' : ''}
            ${invoiceData.status === 'overdue' ? 'bg-red-100 text-red-800' : ''}
          `}>
            {invoiceData.status.toUpperCase()}
          </Badge>
        </div>
      </div>

      {/* Company and Client Info */}
      <div className="grid grid-cols-2 gap-8 mb-8">
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">From:</h3>
          <div className="text-gray-600">
            <p className="font-medium">{invoiceData.companyName}</p>
            <div className="whitespace-pre-line">{invoiceData.companyAddress}</div>
            <p>{invoiceData.companyPhone}</p>
            <p>{invoiceData.companyEmail}</p>
            <p>{invoiceData.companyWebsite}</p>
          </div>
        </div>
        
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">To:</h3>
          <div className="text-gray-600">
            <p className="font-medium">{invoiceData.clientName}</p>
            {invoiceData.clientCompany && <p>{invoiceData.clientCompany}</p>}
            <div className="whitespace-pre-line">{invoiceData.clientAddress}</div>
            <p>{invoiceData.clientPhone}</p>
            <p>{invoiceData.clientEmail}</p>
          </div>
        </div>
      </div>

      {/* Invoice Details */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div>
          <p className="text-sm font-medium text-gray-500">Invoice Date</p>
          <p className="text-gray-900">{new Date(invoiceData.date).toLocaleDateString()}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500">Due Date</p>
          <p className="text-gray-900">{new Date(invoiceData.dueDate).toLocaleDateString()}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500">Payment Terms</p>
          <p className="text-gray-900">{invoiceData.paymentTerms}</p>
        </div>
      </div>

      {/* Items Table */}
      <div className="mb-8">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-3 font-semibold text-gray-900">Description</th>
              <th className="text-center py-3 font-semibold text-gray-900">Qty</th>
              <th className="text-right py-3 font-semibold text-gray-900">Unit Price</th>
              <th className="text-right py-3 font-semibold text-gray-900">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoiceData.items.map((item) => (
              <tr key={item.id} className="border-b border-gray-100">
                <td className="py-3 text-gray-900">{item.description}</td>
                <td className="py-3 text-center text-gray-600">{item.quantity}</td>
                <td className="py-3 text-right text-gray-600">{invoiceData.currencySymbol}{item.unitPrice.toFixed(2)}</td>
                <td className="py-3 text-right text-gray-900 font-medium">{invoiceData.currencySymbol}{item.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="flex justify-end mb-8">
        <div className="w-64">
          <div className="flex justify-between py-2">
            <span className="text-gray-600">Subtotal:</span>
            <span className="text-gray-900">{invoiceData.currencySymbol}{invoiceData.subtotal.toFixed(2)}</span>
          </div>
          {invoiceData.discountAmount > 0 && (
            <div className="flex justify-between py-2">
              <span className="text-gray-600">Discount:</span>
              <span className="text-gray-900">-{invoiceData.currencySymbol}{invoiceData.discountAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between py-2">
            <span className="text-gray-600">Tax ({invoiceData.taxRate}%):</span>
            <span className="text-gray-900">{invoiceData.currencySymbol}{invoiceData.taxAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between py-3 border-t-2 border-gray-200 font-bold text-lg">
            <span className="text-gray-900">Total:</span>
            <span className="text-gray-900">{invoiceData.currencySymbol}{invoiceData.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Notes and Terms */}
      {(invoiceData.notes || invoiceData.terms) && (
        <div className="border-t border-gray-200 pt-6">
          {invoiceData.notes && (
            <div className="mb-4">
              <h4 className="font-semibold text-gray-900 mb-2">Notes:</h4>
              <p className="text-gray-600 whitespace-pre-line">{invoiceData.notes}</p>
            </div>
          )}
          {invoiceData.terms && (
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Terms & Conditions:</h4>
              <p className="text-gray-600 whitespace-pre-line">{invoiceData.terms}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (isPreviewMode) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Preview Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="outline"
                onClick={() => setIsPreviewMode(false)}
                className="flex items-center space-x-2"
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline">{t('invoice.backToEdit')}</span>
              </Button>
              <h2 className="text-lg font-semibold text-gray-900 truncate">{t('invoice.previewTitle')}</h2>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <Button
                variant="outline"
                onClick={generatePDF}
                className="flex items-center space-x-2"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">{t('invoice.downloadPdf')}</span>
              </Button>
              <Button
                onClick={sendInvoice}
                className="flex items-center space-x-2"
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">{t('invoice.sendInvoice')}</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Preview Content */}
        <div className="py-8">
          <InvoicePreview />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div className="flex items-center space-x-3 min-w-0">
          <FileText className="h-8 w-8 shrink-0 text-blue-600" />
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-gray-900">{t('invoice.title')}</h2>
            <p className="text-gray-600">{t('invoice.subtitle')}</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Button
            variant="outline"
            onClick={() => setInvoiceData({ ...initialInvoiceData, invoiceNumber: generateInvoiceNumber() })}
            className="flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">{t('invoice.newInvoice')}</span>
          </Button>
          <Button
            variant="outline"
            onClick={saveInvoice}
            className="flex items-center space-x-2"
          >
            <Save className="h-4 w-4" />
            <span className="hidden sm:inline">{t('invoice.saveDraft')}</span>
          </Button>
          <Button
            onClick={() => setIsPreviewMode(true)}
            className="flex items-center space-x-2"
          >
            <Eye className="h-4 w-4" />
            <span className="hidden sm:inline">{t('invoice.preview')}</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice Form */}
        <div className="lg:col-span-2 space-y-6 min-w-0">
          {/* Basic Invoice Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="h-5 w-5" />
                <span>{t('invoice.details')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="invoiceNumber">{t('invoice.number')}</Label>
                  <div className="flex space-x-2">
                    <Input
                      id="invoiceNumber"
                      value={invoiceData.invoiceNumber}
                      onChange={(e) => setInvoiceData(prev => ({ ...prev, invoiceNumber: e.target.value }))}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setInvoiceData(prev => ({ ...prev, invoiceNumber: generateInvoiceNumber() }))}
                      className="px-3"
                      title={t('invoice.generateNumber')}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="date">{t('invoice.date')}</Label>
                  <Input
                    id="date"
                    type="date"
                    value={invoiceData.date}
                    onChange={(e) => setInvoiceData(prev => ({ ...prev, date: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="dueDate">{t('invoice.dueDate')}</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={invoiceData.dueDate}
                    onChange={(e) => setInvoiceData(prev => ({ ...prev, dueDate: e.target.value }))}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="status">{t('invoice.status')}</Label>
                  <Select
                    value={invoiceData.status}
                    onValueChange={(value) => setInvoiceData(prev => ({ ...prev, status: value as any }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">{t('invoice.statuses.draft')}</SelectItem>
                      <SelectItem value="sent">{t('invoice.statuses.sent')}</SelectItem>
                      <SelectItem value="paid">{t('invoice.statuses.paid')}</SelectItem>
                      <SelectItem value="overdue">{t('invoice.statuses.overdue')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="paymentTerms">{t('invoice.paymentTerms')}</Label>
                  <Select
                    value={invoiceData.paymentTerms}
                    onValueChange={(value) => setInvoiceData(prev => ({ ...prev, paymentTerms: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Net 15">Net 15</SelectItem>
                      <SelectItem value="Net 30">Net 30</SelectItem>
                      <SelectItem value="Net 45">Net 45</SelectItem>
                      <SelectItem value="Net 60">Net 60</SelectItem>
                      <SelectItem value="Due on Receipt">{t('invoice.dueOnReceipt')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Company Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Building2 className="h-5 w-5" />
                <span>{t('invoice.companyInfo')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="companyName">{t('invoice.companyName')}</Label>
                  <Input
                    id="companyName"
                    value={invoiceData.companyName}
                    onChange={(e) => setInvoiceData(prev => ({ ...prev, companyName: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="companyEmail">{t('invoice.email')}</Label>
                  <Input
                    id="companyEmail"
                    type="email"
                    value={invoiceData.companyEmail}
                    onChange={(e) => setInvoiceData(prev => ({ ...prev, companyEmail: e.target.value }))}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="companyPhone">{t('invoice.phone')}</Label>
                  <Input
                    id="companyPhone"
                    value={invoiceData.companyPhone}
                    onChange={(e) => setInvoiceData(prev => ({ ...prev, companyPhone: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="companyWebsite">{t('invoice.website')}</Label>
                  <Input
                    id="companyWebsite"
                    value={invoiceData.companyWebsite}
                    onChange={(e) => setInvoiceData(prev => ({ ...prev, companyWebsite: e.target.value }))}
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="companyAddress">{t('invoice.address')}</Label>
                <Textarea
                  id="companyAddress"
                  value={invoiceData.companyAddress}
                  onChange={(e) => setInvoiceData(prev => ({ ...prev, companyAddress: e.target.value }))}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Client Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <User className="h-5 w-5" />
                <span>{t('invoice.clientInfo')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Quick select from leads */}
              <div className="min-w-0 w-full">
                <Label htmlFor="selectLead">{t('invoice.quickSelect')}</Label>
                <Select
                  value={selectedLead}
                  onValueChange={(value) => {
                    setSelectedLead(value);
                    populateFromLead(value);
                  }}
                >
                  <SelectTrigger className="w-full min-w-0">
                    <SelectValue placeholder={t('invoice.selectLeadPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent className="max-w-[calc(100vw-2rem)]">
                    {(leads?.data?.results || []).map((lead: any) => (
                      <SelectItem key={lead.id} value={lead.id.toString()}>
                        {lead.first_name} {lead.last_name} - {lead.company || t('invoice.noCompany')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="clientName">{t('invoice.clientName')}</Label>
                  <Input
                    id="clientName"
                    value={invoiceData.clientName}
                    onChange={(e) => setInvoiceData(prev => ({ ...prev, clientName: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="clientCompany">{t('invoice.company')}</Label>
                  <Input
                    id="clientCompany"
                    value={invoiceData.clientCompany}
                    onChange={(e) => setInvoiceData(prev => ({ ...prev, clientCompany: e.target.value }))}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="clientEmail">{t('invoice.email')}</Label>
                  <Input
                    id="clientEmail"
                    type="email"
                    value={invoiceData.clientEmail}
                    onChange={(e) => setInvoiceData(prev => ({ ...prev, clientEmail: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="clientPhone">{t('invoice.phone')}</Label>
                  <Input
                    id="clientPhone"
                    value={invoiceData.clientPhone}
                    onChange={(e) => setInvoiceData(prev => ({ ...prev, clientPhone: e.target.value }))}
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="clientAddress">{t('invoice.address')}</Label>
                <Textarea
                  id="clientAddress"
                  value={invoiceData.clientAddress}
                  onChange={(e) => setInvoiceData(prev => ({ ...prev, clientAddress: e.target.value }))}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Invoice Items */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FileText className="h-5 w-5" />
                  <span>{t('invoice.items')}</span>
                </div>
                <Button onClick={addItem} size="sm" className="flex items-center space-x-2">
                  <Plus className="h-4 w-4" />
                  <span>{t('invoice.addItem')}</span>
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {invoiceData.items.map((item, index) => (
                  <div key={item.id} className="grid grid-cols-1 gap-3 p-4 bg-gray-50 rounded-lg sm:grid-cols-12 sm:gap-4">
                    <div className="min-w-0 sm:col-span-5">
                      <Label htmlFor={`description-${item.id}`}>{t('invoice.description')}</Label>
                      <Input
                        id={`description-${item.id}`}
                        value={item.description}
                        onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                        placeholder={t('invoice.itemDescription')}
                        className="w-full min-w-0"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:contents">
                      <div className="min-w-0 sm:col-span-2">
                        <Label htmlFor={`quantity-${item.id}`}>{t('invoice.quantity')}</Label>
                        <Input
                          id={`quantity-${item.id}`}
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, 'quantity', Number(e.target.value))}
                          className="w-full min-w-0"
                        />
                      </div>
                      <div className="min-w-0 sm:col-span-2">
                        <Label htmlFor={`unitPrice-${item.id}`}>{t('invoice.unitPrice', { symbol: invoiceData.currencySymbol })}</Label>
                        <Input
                          id={`unitPrice-${item.id}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(item.id, 'unitPrice', Number(e.target.value))}
                          className="w-full min-w-0"
                        />
                      </div>
                    </div>
                    <div className="min-w-0 sm:col-span-2">
                      <Label>{t('invoice.total')}</Label>
                      <div className="mt-2 p-2 bg-white rounded border text-right font-medium">
                        {invoiceData.currencySymbol}{item.total.toFixed(2)}
                      </div>
                    </div>
                    <div className="flex items-end sm:col-span-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeItem(item.id)}
                        className="w-full min-h-[40px]"
                        aria-label={t('invoice.removeItem')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                {invoiceData.items.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    {t('invoice.noItems')}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Additional Information */}
          <Card>
            <CardHeader>
              <CardTitle>{t('invoice.additionalInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="notes">{t('invoice.notes')}</Label>
                <Textarea
                  id="notes"
                  value={invoiceData.notes}
                  onChange={(e) => setInvoiceData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder={t('invoice.notesPlaceholder')}
                  rows={3}
                />
              </div>
              
              <div>
                <Label htmlFor="terms">{t('invoice.terms')}</Label>
                <Textarea
                  id="terms"
                  value={invoiceData.terms}
                  onChange={(e) => setInvoiceData(prev => ({ ...prev, terms: e.target.value }))}
                  placeholder={t('invoice.termsPlaceholder')}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary Sidebar */}
        <div className="space-y-6">
          {/* Financial Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calculator className="h-5 w-5" />
                <span>{t('invoice.financialSummary')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Currency Selection */}
              <div className="space-y-2">
                <Label htmlFor="currency">{t('invoice.currency')}</Label>
                <Select
                  value={invoiceData.currency}
                  onValueChange={(value) => {
                    const currencyMap: { [key: string]: string } = {
                      'TRY': '₺',
                      'USD': '$',
                      'EUR': '€',
                      'CHF': 'CHF',
                      'GBP': '£',
                      'JPY': '¥'
                    };
                    setInvoiceData(prev => ({ 
                      ...prev, 
                      currency: value,
                      currencySymbol: currencyMap[value] || value
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TRY">{t('invoice.currencies.TRY')}</SelectItem>
                    <SelectItem value="USD">{t('invoice.currencies.USD')}</SelectItem>
                    <SelectItem value="EUR">{t('invoice.currencies.EUR')}</SelectItem>
                      <SelectItem value="CHF">{t('invoice.currencies.CHF')}</SelectItem>
                    <SelectItem value="GBP">{t('invoice.currencies.GBP')}</SelectItem>
                    <SelectItem value="JPY">{t('invoice.currencies.JPY')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('invoice.subtotal')}</span>
                  <span className="font-medium">{invoiceData.currencySymbol}{invoiceData.subtotal.toFixed(2)}</span>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="taxRate">{t('invoice.taxRate')}</Label>
                  <Input
                    id="taxRate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={invoiceData.taxRate}
                    onChange={(e) => setInvoiceData(prev => ({ ...prev, taxRate: Number(e.target.value) }))}
                  />
                </div>
                
                <div className="flex justify-between">
                  <span className="text-gray-600">{t('invoice.tax', { rate: invoiceData.taxRate })}</span>
                  <span className="font-medium">{invoiceData.currencySymbol}{invoiceData.taxAmount.toFixed(2)}</span>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="discountAmount">{t('invoice.discountAmount', { symbol: invoiceData.currencySymbol })}</Label>
                  <Input
                    id="discountAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={invoiceData.discountAmount}
                    onChange={(e) => setInvoiceData(prev => ({ ...prev, discountAmount: Number(e.target.value) }))}
                  />
                </div>
                
                {invoiceData.discountAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t('invoice.discount')}</span>
                    <span className="font-medium text-red-600">-{invoiceData.currencySymbol}{invoiceData.discountAmount.toFixed(2)}</span>
                  </div>
                )}
                
                <div className="border-t pt-3">
                  <div className="flex justify-between text-lg font-bold">
                    <span>{t('invoice.totalColon')}</span>
                    <span className="text-blue-600">{invoiceData.currencySymbol}{invoiceData.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>{t('invoice.quickActions')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={() => setIsPreviewMode(true)}
                className="w-full flex items-center space-x-2"
              >
                <Eye className="h-4 w-4" />
                <span>{t('invoice.previewInvoice')}</span>
              </Button>
              
              <Button
                variant="outline"
                onClick={saveInvoice}
                className="w-full flex items-center space-x-2"
              >
                <Save className="h-4 w-4" />
                <span>{t('invoice.saveAsDraft')}</span>
              </Button>
              
              <Button
                variant="outline"
                onClick={generatePDF}
                className="w-full flex items-center space-x-2"
              >
                <Download className="h-4 w-4" />
                <span>{t('invoice.downloadPdf')}</span>
              </Button>
              
              <Button
                variant="outline"
                onClick={sendInvoice}
                disabled={!invoiceData.clientEmail}
                className="w-full flex items-center space-x-2"
              >
                <Send className="h-4 w-4" />
                <span>{t('invoice.sendToClient')}</span>
              </Button>
            </CardContent>
          </Card>

          {/* Invoice Status */}
          <Card>
            <CardHeader>
              <CardTitle>{t('invoice.invoiceStatus')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">{t('invoice.statusColon')}</span>
                  <Badge className={`
                    ${invoiceData.status === 'paid' ? 'bg-green-100 text-green-800' : ''}
                    ${invoiceData.status === 'sent' ? 'bg-blue-100 text-blue-800' : ''}
                    ${invoiceData.status === 'draft' ? 'bg-gray-100 text-gray-800' : ''}
                    ${invoiceData.status === 'overdue' ? 'bg-red-100 text-red-800' : ''}
                  `}>
                    {invoiceData.status.toUpperCase()}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">{t('invoice.itemsColon')}</span>
                  <span className="font-medium">{invoiceData.items.length}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">{t('invoice.createdColon')}</span>
                  <span className="font-medium">{new Date(invoiceData.date).toLocaleDateString()}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">{t('invoice.dueColon')}</span>
                  <span className="font-medium">{new Date(invoiceData.dueDate).toLocaleDateString()}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Saved Invoices */}
      {savedInvoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('invoice.saved')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">{t('invoice.cols.number')}</th>
                    <th className="text-left py-2">{t('invoice.cols.client')}</th>
                    <th className="text-left py-2">{t('invoice.cols.company')}</th>
                    <th className="text-left py-2">{t('invoice.cols.amount')}</th>
                    <th className="text-left py-2">{t('invoice.cols.status')}</th>
                    <th className="text-left py-2">{t('invoice.cols.date')}</th>
                    <th className="text-left py-2">{t('invoice.cols.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {savedInvoices.map((invoice, index) => (
                    <tr key={index} className="border-b">
                      <td className="py-2 font-medium">{invoice.invoiceNumber}</td>
                      <td className="py-2">{invoice.clientName || t('invoice.na')}</td>
                      <td className="py-2">{invoice.clientCompany || t('invoice.na')}</td>
                      <td className="py-2">{invoice.currencySymbol || '₺'}{invoice.total.toFixed(2)}</td>
                      <td className="py-2">
                        <Badge className={`
                          ${invoice.status === 'paid' ? 'bg-green-100 text-green-800' : ''}
                          ${invoice.status === 'sent' ? 'bg-blue-100 text-blue-800' : ''}
                          ${invoice.status === 'draft' ? 'bg-gray-100 text-gray-800' : ''}
                          ${invoice.status === 'overdue' ? 'bg-red-100 text-red-800' : ''}
                        `}>
                          {invoice.status.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2">{new Date(invoice.date).toLocaleDateString()}</td>
                      <td className="py-2">
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setInvoiceData(invoice)}
                          >
                            {t('invoice.edit')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setInvoiceData(invoice);
                              setIsPreviewMode(true);
                            }}
                          >
                            {t('invoice.view')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 