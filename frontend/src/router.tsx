import { createBrowserRouter } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { IntakeSelectPage } from './pages/IntakeSelectPage'
import { IntakeFormPage } from './pages/IntakeFormPage'
import { SignIn } from './pages/SignIn'
import { SignUp } from './pages/SignUp'
import { ForgotPassword } from './pages/ForgotPassword'
import { ResetPassword } from './pages/ResetPassword'
import { Legal } from './pages/Legal'
import { Contact } from './pages/Contact'
import { ModernLayout } from './components/ModernLayout'
import PrivateRoute from './components/PrivateRoute'
import { AdminRoute } from './components/AdminRoute'
import { ModernLeads } from './pages/ModernLeads'
import { ModernLeadDetail } from './pages/ModernLeadDetail'
import { ModernLeadForm } from './pages/ModernLeadForm'
import { ModernDashboard } from './pages/ModernDashboard'
import { ModernTasks } from './pages/ModernTasks'
import { ModernNewTask } from './pages/ModernNewTask'
import { ModernTaskDetail } from './pages/ModernTaskDetail'
import { ModernDeals } from './pages/ModernDeals'
import { ModernDealDetail } from './pages/ModernDealDetail'
import { ModernNewDeal } from './pages/ModernNewDeal'
import { ModernAIInsights } from './pages/ModernAIInsights'
import { NotFound } from './pages/NotFound'
import { ModernProfile } from './pages/ModernProfile'
import { AdminPanel } from './pages/Admin/AdminPanel'
import { Navigate } from 'react-router-dom'
import { LinkedInCallback } from './pages/Linkedin/Callback'
import { ModernMessages } from './pages/ModernMessages'
import { ModernReports } from './pages/ModernReports'
import { ModernCalendar } from './pages/ModernCalendar'
import { ModernCredits } from './pages/ModernCredits'
import { ModernSettings } from './pages/ModernSettings'
import { ModernEmails } from './pages/ModernEmails'
import { ColdOutreachPage } from './pages/Emails/ColdOutreach'
import { ModernCustomization } from './pages/ModernCustomization'
import { ModernTerritories } from './pages/ModernTerritories'
import { ModernEmailSequences } from './pages/ModernEmailSequences'
import { ModernQuoteList, ModernProductList } from './pages/ModernCPQ'
import { ModernQuoteNewPage, ModernQuoteDetailPage } from './pages/ModernQuotePages'
import { ModernForecasting } from './pages/ModernForecasting'
import { ModernWorkflows } from './pages/ModernWorkflows'
import { ModernConversations } from './pages/ModernConversations'
import { ModernImportWizard, ModernImportHistory } from './pages/ModernDataImport'
import { ModernTeam } from './pages/ModernTeam'
import { ModernWorkflowNew } from './pages/ModernWorkflowNew'
import { ModernConversationUpload } from './pages/ModernConversationUpload'
import { SequenceBuilder } from './pages/EmailSequences'
import { ModernNotifications } from './pages/ModernNotifications'
import TeamManagement from './pages/TeamManagement'
import AcceptInvitation from './pages/AcceptInvitation'
import { InvoiceMaker } from './pages/Admin/InvoiceMaker'
import RecordingDetail from './pages/ConversationIntelligence/RecordingDetail'
import { GoogleAuthCallback } from './pages/GoogleAuthCallback'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/signin',
    element: <SignIn />,
  },
  {
    path: '/signin/google/callback',
    element: <GoogleAuthCallback />,
  },
  {
    path: '/signup',
    element: <SignUp />,
  },
  {
    path: '/forgot-password',
    element: <ForgotPassword />,
  },
  {
    path: '/reset-password',
    element: <ResetPassword />,
  },
  {
    path: '/legal',
    element: <Legal />,
  },
  {
    path: '/contact',
    element: <Contact />,
  },
  {
    path: '/intake',
    element: <IntakeSelectPage />,
  },
  {
    path: '/intake/:formSlug',
    element: <IntakeFormPage />,
  },
  {
    element: <PrivateRoute />,
    children: [
      {
        element: <ModernLayout />,
        children: [
          {
            path: '/dashboard',
            element: <ModernDashboard />
          },
          {
            path: '/admin',
            element: <AdminRoute><AdminPanel /></AdminRoute>
          },
          {
            path: '/leads',
            element: <ModernLeads />
          },
          {
            path: '/leads/form',
            element: <ModernLeadForm />
          },
          {
            path: '/leads/new',
            element: <Navigate to="/leads/form" replace />
          },
          {
            path: '/leads/:id',
            element: <ModernLeadDetail />
          },
          {
            path: '/tasks',
            children: [
              { index: true, element: <ModernTasks /> },
              { path: 'new', element: <ModernNewTask /> },
              { path: ':id', element: <ModernTaskDetail /> },
            ]
          },
          {
            path: '/deals/new',
            element: <ModernNewDeal />
          },
          {
            path: '/deals/:id',
            element: <ModernDealDetail />
          },
          {
            path: '/deals',
            element: <ModernDeals />
          },
          {
            path: '/profile',
            element: <ModernProfile />
          },
          {
            path: '/messages',
            element: <ModernMessages />
          },
          {
            path: '/reports',
            element: <ModernReports />
          },
          {
            path: '/calendar',
            element: <ModernCalendar />
          },
          {
            path: '/ai-insights',
            element: <ModernAIInsights />
          },
          {
            path: '/credits',
            element: <ModernCredits />
          },
          {
            path: '/settings',
            element: <ModernSettings />
          },
          {
            path: '/settings/territories',
            element: <ModernTerritories />
          },
          {
            path: '/settings/organization',
            element: <Navigate to="/settings/company" replace />
          },
          {
            path: '/settings/general',
            element: <Navigate to="/settings/company" replace />
          },
          {
            path: '/settings/:tab',
            element: <ModernSettings />
          },
          {
            path: '/team',
            element: <ModernTeam />
          },
          {
            path: '/team-management',
            element: <TeamManagement />
          },
          {
            path: '/invoices/new',
            element: <InvoiceMaker />
          },
          {
            path: '/emails',
            element: <ModernEmails />
          },
          {
            path: '/emails/outreach',
            element: <ColdOutreachPage />
          },
          {
            path: '/customization',
            element: <ModernCustomization />
          },
          {
            path: '/organization',
            element: <Navigate to="/settings/company" replace />
          },
          {
            path: '/territories',
            element: <Navigate to="/settings/territories" replace />
          },
          {
            path: '/email-sequences',
            element: <ModernEmailSequences />
          },
          {
            path: '/email-sequences/create',
            element: <SequenceBuilder />
          },
          {
            path: '/email-sequences/:id',
            element: <SequenceBuilder />
          },
          {
            path: '/quotes',
            element: <Navigate to="/cpq/quotes" replace />
          },
          {
            path: '/cpq/quotes/new',
            element: <ModernQuoteNewPage />
          },
          {
            path: '/cpq/quotes/:id/edit',
            element: <ModernQuoteDetailPage />
          },
          {
            path: '/cpq/quotes/:id',
            element: <ModernQuoteDetailPage />
          },
          {
            path: '/cpq/quotes',
            element: <ModernQuoteList />
          },
          {
            path: '/cpq/products',
            element: <ModernProductList />
          },
          {
            path: '/forecasting',
            element: <ModernForecasting />
          },
          {
            path: '/workflows',
            element: <ModernWorkflows />
          },
          {
            path: '/workflows/new',
            element: <ModernWorkflowNew />
          },
          {
            path: '/workflows/:id',
            element: <ModernWorkflowNew />
          },
          {
            path: '/conversations',
            element: <ModernConversations />
          },
          {
            path: '/conversations/recordings/:id',
            element: <RecordingDetail />
          },
          {
            path: '/conversations/upload',
            element: <ModernConversationUpload />
          },
          {
            path: '/data-import/wizard',
            element: <ModernImportWizard />
          },
          {
            path: '/data-import/history',
            element: <ModernImportHistory />
          },
          {
            path: '/notifications',
            element: <ModernNotifications />
          }
        ]
      }
    ]
  },
  {
    path: '/invite/:token',
    element: <AcceptInvitation />
  },
  {
    path: '/linkedin/callback',
    element: <LinkedInCallback />
  },
  {
    path: '*',
    element: <NotFound />,
  }
], {
  future: {
    v7_normalizeFormMethod: true,
  },
  basename: '/'
});
