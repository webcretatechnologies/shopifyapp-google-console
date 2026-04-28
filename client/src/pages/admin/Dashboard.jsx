import React from 'react';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import {
  Page, Layout, Card, Text, BlockStack, InlineStack, Box,
  Button, Divider, SkeletonBodyText, Badge,
} from '@shopify/polaris';
import { adminApi } from '../../api';

function StatCard({ label, value, tone = 'base', description }) {
  const toneColors = {
    base: { bg: '#f6f6f7', text: '#202223', accent: '#1a1a1a' },
    success: { bg: '#f1f8f5', text: '#108043', accent: '#108043' },
    warning: { bg: '#fef9ed', text: '#8a6116', accent: '#f49342' },
    info: { bg: '#f4f6f8', text: '#0870d9', accent: '#0870d9' },
    purple: { bg: '#f5f0ff', text: '#1a1a1a', accent: '#404040' },
  };
  const colors = toneColors[tone] || toneColors.base;

  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="200">
          <Text variant="bodySm" tone="subdued">{label}</Text>
          <Text variant="heading2xl" as="p" fontWeight="bold">
            <span style={{ color: colors.accent }}>{value ?? '—'}</span>
          </Text>
          {description && <Text variant="bodySm" tone="subdued">{description}</Text>}
        </BlockStack>
      </Box>
    </Card>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useQuery('admin-stats', adminApi.stats, { refetchInterval: 60000 });

  const quickActions = [
    { label: 'View All Shops', desc: 'Manage installed stores', url: '/admin/shops', badge: stats?.totalShops },
    { label: 'Billing Plans', desc: 'Create and manage plans', url: '/admin/plans' },
    { label: 'Subscriptions', desc: 'View all subscriptions', url: '/admin/subscriptions', badge: stats?.activeSubscriptions },
    { label: 'Admin Users', desc: 'Manage admin accounts', url: '/admin/admins' },
  ];

  return (
    <Page title="Dashboard" subtitle="Google Console Analytics — Admin Overview">
      <Layout>
        {/* Stats row */}
        <Layout.Section>
          {isLoading ? (
            <Card><Box padding="400"><SkeletonBodyText lines={2} /></Box></Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <StatCard label="Total Shops" value={stats?.totalShops} tone="base" />
              <StatCard label="Active Shops" value={stats?.activeShops} tone="success" />
              <StatCard label="Active Subscriptions" value={stats?.activeSubscriptions} tone="info" />
              <StatCard label="On Trial" value={stats?.trialShops} tone="warning" />
              <StatCard label="New Shops (30d)" value={stats?.newShops} tone="purple" />
            </div>
          )}
        </Layout.Section>

        {/* Quick Actions + System Info */}
        <Layout.Section>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text variant="headingMd">Quick Actions</Text>
                  <Divider />
                  {quickActions.map(action => (
                    <div
                      key={action.url}
                      onClick={() => navigate(action.url)}
                      style={{ cursor: 'pointer', padding: '10px 0', borderBottom: '1px solid #f1f1f1' }}
                    >
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text variant="bodyMd" fontWeight="semibold">{action.label}</Text>
                          <Text variant="bodySm" tone="subdued">{action.desc}</Text>
                        </BlockStack>
                        <InlineStack gap="200" blockAlign="center">
                          {action.badge !== undefined && (
                            <Badge>{String(action.badge)}</Badge>
                          )}
                          <Text variant="bodySm" tone="subdued">→</Text>
                        </InlineStack>
                      </InlineStack>
                    </div>
                  ))}
                </BlockStack>
              </Box>
            </Card>

            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text variant="headingMd">System Info</Text>
                  <Divider />
                  {[
                    ['Environment', import.meta.env.MODE],
                    ['API URL', import.meta.env.VITE_API_URL || '/api'],
                    ['Date', new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })],
                    ['App Version', '1.0.0'],
                  ].map(([key, val]) => (
                    <InlineStack key={key} align="space-between">
                      <Text variant="bodySm" tone="subdued">{key}</Text>
                      <Text variant="bodySm" fontWeight="semibold">{val}</Text>
                    </InlineStack>
                  ))}
                </BlockStack>
              </Box>
            </Card>
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
