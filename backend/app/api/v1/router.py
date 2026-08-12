from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth, leads, admin, deals, activities, notes, users,
    leads_import, dashboard, tasks, events, reports, advanced_reports,
    information_requests, organizations, tags, linkedin,
    tokens, notifications, contact, lead_stages, health, settings, psychometrics, files, ai_insights, messages, credits, invoices, team_invitations, email, ml, calendar_integrations,
    territories, cpq, email_sequences, workflows, conversations, data_import, forecasting, dashboards,
    marketing_forms, currencies, clients,
)
import logging

logger = logging.getLogger(__name__)

api_router = APIRouter()

# Auth routes
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])

# LinkedIn OAuth routes
from app.api.routes.linkedin_auth import router as linkedin_auth_router
api_router.include_router(linkedin_auth_router, prefix="/auth/linkedin", tags=["linkedin-auth"])

# Lead routes - import routes must come before generic routes to avoid conflicts
api_router.include_router(leads_import.router, prefix="/leads", tags=["leads"])
api_router.include_router(leads.router, prefix="/leads", tags=["leads"])

# Lead Stages routes (ACTIVELY USED - 13 records in DB)
api_router.include_router(lead_stages.router, prefix="/lead-stages", tags=["lead-stages"])

# Tag routes
api_router.include_router(tags.router, prefix="/tags", tags=["tags"])

# Client routes (lead containers / branches)
api_router.include_router(clients.router, prefix="/clients", tags=["clients"])

# Information Request routes
api_router.include_router(information_requests.router, prefix="/information-requests", tags=["information-requests"])

# Organization routes
api_router.include_router(organizations.router, prefix="/organizations", tags=["organizations"])

# Deal routes
api_router.include_router(deals.router, prefix="/deals", tags=["deals"])

# Currencies (deal amounts, org settings)
api_router.include_router(currencies.router, prefix="/currencies", tags=["currencies"])

# Activity routes
api_router.include_router(activities.router, prefix="/activities", tags=["activities"])

# Note routes
api_router.include_router(notes.router, prefix="/notes", tags=["notes"])

# File routes (DATABASE READY - table exists)
api_router.include_router(files.router, prefix="/files", tags=["files"])

# Credit routes (PROFESSIONAL FEATURE - newly activated)
api_router.include_router(credits.router, prefix="/credits", tags=["credits"])

# Admin routes (keep for future use)
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])

# Users routes
api_router.include_router(users.router, prefix="/users", tags=["users"])

# Dashboard routes
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])

# Tasks routes
api_router.include_router(tasks.router, prefix="/tasks", tags=["tasks"])

# Events routes
api_router.include_router(events.router, prefix="/events", tags=["events"])

# Reports routes (keep for future use)
api_router.include_router(reports.router, prefix="/reports", tags=["reports"])

# Advanced Reports routes (detailed analytics)
logger.info(f"Adding advanced reports router with {len(advanced_reports.router.routes)} routes")
api_router.include_router(advanced_reports.router, prefix="/advanced-reports", tags=["advanced-reports"])
logger.info("Advanced reports router added successfully")

# LinkedIn routes (ACTIVELY USED)
api_router.include_router(linkedin.router, prefix="/linkedin", tags=["linkedin"])

# Token routes (ACTIVELY USED)
api_router.include_router(tokens.router, prefix="/tokens", tags=["tokens"])

# Notification routes (available in api.py)
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])

# Contact routes (available in api.py)
api_router.include_router(contact.router, prefix="/contact", tags=["contact"])

# Public marketing forms (landing page — no auth)
api_router.include_router(marketing_forms.router, prefix="/lead-forms", tags=["lead-forms"])

# Health routes (FRONTEND USES /api/v1/health)
api_router.include_router(health.router, prefix="/health", tags=["health"])

# Settings routes (FRONTEND USES settingsAPI)
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])

# Psychometrics routes (FRONTEND USES psychometrics service)
api_router.include_router(psychometrics.router, prefix="/psychometrics", tags=["psychometrics"])

# AI Insights routes (NEW - ML powered lead analysis)
# Lead-specific insights: /api/v1/leads/{id}/insights
api_router.include_router(ai_insights.router, prefix="/leads", tags=["ai-insights"])
# Analytics endpoints: /api/v1/ai-insights/analytics, /api/v1/ai-insights/high-priority
api_router.include_router(ai_insights.router, prefix="/ai-insights", tags=["ai-insights"])

# Messages routes (Team messaging system)
api_router.include_router(messages.router, prefix="/messages", tags=["messages"])

# Invoice routes (NEW - Invoice management and email sending)
api_router.include_router(invoices.router, prefix="/invoices", tags=["invoices"])

# Team Invitations routes (NEW - Team member invitation system)
api_router.include_router(team_invitations.router, prefix="/team-invitations", tags=["team-invitations"])

# Email routes (Email account management and calendar sync)
api_router.include_router(email.router, prefix="/email", tags=["email"])

# Calendar integrations (Google OAuth foundation + provider registry)
api_router.include_router(calendar_integrations.router, prefix="/calendar-integrations", tags=["calendar-integrations"])

# ML routes (Machine Learning predictions and model management)
api_router.include_router(ml.router, prefix="/ml", tags=["ml"])

# ==================== ENTERPRISE FEATURES ====================

# Territory Management (Enterprise Sales Territory Hierarchy)
api_router.include_router(territories.router, prefix="/territories", tags=["territories"])

# CPQ - Configure, Price, Quote (Product Catalog & Quote Management)
api_router.include_router(cpq.router, prefix="/cpq", tags=["cpq"])

# Email Sequences (Automated Email Campaigns)
api_router.include_router(email_sequences.router, prefix="/email-sequences", tags=["email-sequences"])

# Workflow Automation (Visual Workflow Builder & Approvals)
api_router.include_router(workflows.router, prefix="/workflows", tags=["workflows"])

# Conversation Intelligence (Call Recording & Analysis)
api_router.include_router(conversations.router, prefix="/conversations", tags=["conversations"])

# Forecasting (Collaborative Forecasting & Quota Management)
api_router.include_router(forecasting.router, prefix="/forecasts", tags=["forecasts"])

# Dashboard Builder (Custom Dashboards with Widgets)
api_router.include_router(dashboards.router, prefix="/dashboards", tags=["dashboards"])

# Data Import/Export (Salesforce, HubSpot, Pipedrive, CSV)
api_router.include_router(data_import.router, prefix="/data-import", tags=["data-import"])
