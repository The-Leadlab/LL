/**
 * Modern Email Campaigns
 * Beautiful email builder & campaign manager
 */

import React, { useState } from 'react';
import {
  Mail,
  Send,
  Users,
  TrendingUp,
  Eye,
  MousePointer,
  Plus,
  Calendar,
  Clock,
  CheckCircle2,
  Pause,
  Play,
  MoreVertical,
  Edit,
  Copy,
  Trash2,
  BarChart3
} from 'lucide-react';

interface Campaign {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent';
  subject: string;
  recipients: number;
  sentDate?: string;
  scheduledDate?: string;
  stats: {
    sent: number;
    opened: number;
    clicked: number;
    bounced: number;
  };
}

const mockCampaigns: Campaign[] = [
  {
    id: '1',
    name: 'Q4 Product Launch',
    status: 'sent',
    subject: '🚀 Introducing our new features',
    recipients: 2450,
    sentDate: '2 days ago',
    stats: {
      sent: 2450,
      opened: 1568,
      clicked: 654,
      bounced: 12,
    },
  },
  {
    id: '2',
    name: 'Customer Success Stories',
    status: 'scheduled',
    subject: 'See how companies like yours succeed',
    recipients: 3200,
    scheduledDate: 'Tomorrow, 10:00 AM',
    stats: {
      sent: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
    },
  },
  {
    id: '3',
    name: 'Weekly Newsletter',
    status: 'draft',
    subject: 'This week in sales & marketing',
    recipients: 5000,
    stats: {
      sent: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
    },
  },
];

export function ModernEmailCampaigns() {
  const [view, setView] = useState<'campaigns' | 'create'>('campaigns');

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6 md:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Email Campaigns
            </h1>
            <p className="text-muted-foreground dark:text-muted-foreground">
              Create and manage your email marketing campaigns
            </p>
          </div>
          <button
            onClick={() => setView('create')}
            className="flex items-center space-x-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            <span>New Campaign</span>
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            {
              title: 'Total Sent',
              value: '12.4K',
              change: '+8.2%',
              icon: Mail,
              color: 'blue',
            },
            {
              title: 'Open Rate',
              value: '64.2%',
              change: '+12.5%',
              icon: Eye,
              color: 'green',
            },
            {
              title: 'Click Rate',
              value: '26.7%',
              change: '+5.3%',
              icon: MousePointer,
              color: 'purple',
            },
            {
              title: 'Subscribers',
              value: '8.9K',
              change: '+15.8%',
              icon: Users,
              color: 'orange',
            },
          ].map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div
                key={index}
                className="bg-card rounded-xl p-6 shadow-sm border border-border"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-3 rounded-lg bg-${stat.color}-50 dark:bg-${stat.color}-900/20`}>
                    <Icon className={`w-6 h-6 text-${stat.color}-600 dark:text-${stat.color}-400`} />
                  </div>
                  <div className="flex items-center text-sm font-medium text-green-600">
                    <TrendingUp className="w-4 h-4 mr-1" />
                    {stat.change}
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-foreground mb-1">
                  {stat.value}
                </h3>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground">{stat.title}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Campaigns List */}
      <div className="space-y-4">
        {mockCampaigns.map((campaign) => {
          const openRate = campaign.stats.sent > 0
            ? ((campaign.stats.opened / campaign.stats.sent) * 100).toFixed(1)
            : '0';
          const clickRate = campaign.stats.sent > 0
            ? ((campaign.stats.clicked / campaign.stats.sent) * 100).toFixed(1)
            : '0';

          return (
            <div
              key={campaign.id}
              className="bg-card rounded-xl p-6 shadow-sm border border-border hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-semibold text-foreground">
                      {campaign.name}
                    </h3>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        campaign.status === 'sent'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                          : campaign.status === 'scheduled'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                          : campaign.status === 'sending'
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400'
                          : 'bg-muted text-foreground dark:bg-muted dark:text-muted-foreground'
                      }`}
                    >
                      {campaign.status}
                    </span>
                  </div>
                  <p className="text-muted-foreground dark:text-muted-foreground mb-2">
                    {campaign.subject}
                  </p>
                  <div className="flex items-center space-x-6 text-sm text-muted-foreground dark:text-muted-foreground">
                    <span className="flex items-center space-x-1">
                      <Users className="w-4 h-4" />
                      <span>{campaign.recipients.toLocaleString()} recipients</span>
                    </span>
                    {campaign.sentDate && (
                      <span className="flex items-center space-x-1">
                        <Calendar className="w-4 h-4" />
                        <span>Sent {campaign.sentDate}</span>
                      </span>
                    )}
                    {campaign.scheduledDate && (
                      <span className="flex items-center space-x-1">
                        <Clock className="w-4 h-4" />
                        <span>Scheduled: {campaign.scheduledDate}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center space-x-2">
                  {campaign.status === 'draft' && (
                    <button className="p-2 hover:bg-muted dark:hover:bg-muted rounded-lg transition-colors">
                      <Edit className="w-5 h-5 text-muted-foreground dark:text-muted-foreground" />
                    </button>
                  )}
                  {campaign.status === 'scheduled' && (
                    <button className="p-2 hover:bg-muted dark:hover:bg-muted rounded-lg transition-colors">
                      <Pause className="w-5 h-5 text-muted-foreground dark:text-muted-foreground" />
                    </button>
                  )}
                  <button className="p-2 hover:bg-muted dark:hover:bg-muted rounded-lg transition-colors">
                    <Copy className="w-5 h-5 text-muted-foreground dark:text-muted-foreground" />
                  </button>
                  <button className="p-2 hover:bg-muted dark:hover:bg-muted rounded-lg transition-colors">
                    <MoreVertical className="w-5 h-5 text-muted-foreground dark:text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* Stats */}
              {campaign.stats.sent > 0 && (
                <div className="grid grid-cols-4 gap-4 pt-4 border-t border-border">
                  <div>
                    <p className="text-sm text-muted-foreground dark:text-muted-foreground mb-1">Sent</p>
                    <p className="text-xl font-semibold text-foreground">
                      {campaign.stats.sent.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground dark:text-muted-foreground mb-1">Opened</p>
                    <div className="flex items-baseline space-x-2">
                      <p className="text-xl font-semibold text-foreground">
                        {campaign.stats.opened.toLocaleString()}
                      </p>
                      <span className="text-sm text-green-600 font-medium">{openRate}%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground dark:text-muted-foreground mb-1">Clicked</p>
                    <div className="flex items-baseline space-x-2">
                      <p className="text-xl font-semibold text-foreground">
                        {campaign.stats.clicked.toLocaleString()}
                      </p>
                      <span className="text-sm text-purple-600 font-medium">{clickRate}%</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground dark:text-muted-foreground mb-1">Bounced</p>
                    <p className="text-xl font-semibold text-foreground">
                      {campaign.stats.bounced}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
