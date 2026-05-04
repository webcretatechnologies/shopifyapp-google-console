import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Page, Card, IndexTable, Text, Badge, Button, TextField,
  Select, InlineStack, Box, Pagination, BlockStack, Spinner,
  Modal, Checkbox, Banner, Divider,
} from '@shopify/polaris';
import { adminApi } from '../../api';

// Feature catalog — keep in sync with admin/Plans.jsx FEATURES list.
// These are the labels admins can grant as add-ons to any shop.
const FEATURE_CATALOG = [
  { label: 'GA4 Analytics',           group: 'Analytics' },
  { label: 'Google Search Console',    group: 'Analytics' },
  { label: 'Google Ads Campaigns',     group: 'Analytics' },
  { label: 'Sitemap Manager',          group: 'Analytics' },
  { label: 'Basic Dashboard',          group: 'Dashboard' },
  { label: 'Advanced Dashboard',       group: 'Dashboard' },
  { label: 'CSV Export',               group: 'Data' },
  { label: 'Custom Reports',           group: 'Data' },
  { label: 'Stock Alerts',             group: 'Insights' },
  { label: 'Product SEO Report',       group: 'Insights' },
  { label: 'SEO Suggestions',          group: 'Insights' },
  { label: 'Ads → Orders Attribution', group: 'Insights' },
  { label: 'Site Audit',               group: 'AI & Site' },
  { label: 'AI Visibility',            group: 'AI & Site' },
  { label: 'Content Creation',         group: 'AI & Site' },
  { label: 'Product FAQs',             group: 'AI & Site' },
  { label: 'Structured Markup',        group: 'AI & Site' },
  { label: 'Auto Sitemap Submission',  group: 'SEO Tools' },
  { label: 'Brand vs Non-Brand Split', group: 'SEO Tools' },
  { label: 'Priority Support',         group: 'Support' },
  // AI Advanced add-ons
  { label: 'AI Audit Fix-It Panel',    group: 'AI Advanced' },
  { label: 'AI Priority Action Plan',  group: 'AI Advanced' },
  { label: 'AI Score Trend Insights',  group: 'AI Advanced' },
  { label: 'One-Click Auto-Fix to Shopify', group: 'AI Advanced' },
  { label: 'AI Visibility — Why-Not-Mentioned', group: 'AI Advanced' },
  { label: 'AI Prompt Auto-Suggestions', group: 'AI Advanced' },
  { label: 'Competitor AI Tracking',   group: 'AI Advanced' },
  { label: 'AI Quick-Win Keywords',    group: 'AI Advanced' },
  { label: 'AI Cannibalization Detector', group: 'AI Advanced' },
  { label: 'AI Meta Tag Rewriter',     group: 'AI Advanced' },
  { label: 'AI Weekly Digest',         group: 'AI Advanced' },
  { label: 'AI Anomaly Detection',     group: 'AI Advanced' },
  { label: 'AI Ads Wasted-Spend Detector', group: 'AI Advanced' },
  { label: 'AI Restock Prioritization',group: 'AI Advanced' },
  { label: 'Bulk AI Content Generation', group: 'AI Advanced' },
  { label: 'Brand-Voice Consistency Check', group: 'AI Advanced' },
  { label: 'AI Chat Assistant',        group: 'AI Advanced' },
  { label: 'Daily AI Briefing Email',  group: 'AI Advanced' },
];

function ExtraFeaturesModal({ shopId, open, onClose }) {
  const queryClient = useQueryClient();
  const { data: shop, isLoading } = useQuery(
    ['admin-shop', shopId],
    () => adminApi.shop(shopId),
    { enabled: open && !!shopId },
  );

  const [extras, setExtras] = useState([]); // [{ label, amount, note }]

  useEffect(() => {
    if (!open) return;
    setExtras(Array.isArray(shop?.extra_features) ? shop.extra_features : []);
  }, [shop, open]);

  // Labels already included in the shop's current plan (read-only).
  let planFeatures = [];
  try {
    const raw = shop?.subscription?.plan?.features;
    planFeatures = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
  } catch {}
  const planSet = new Set(planFeatures.map(s => s.toLowerCase()));

  const saveMutation = useMutation(
    () => adminApi.updateShop(shopId, { extra_features: extras }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('admin-shops');
        queryClient.invalidateQueries(['admin-shop', shopId]);
        onClose();
      },
    },
  );

  const toggleExtra = (label, on) => {
    setExtras(curr => {
      if (!on) return curr.filter(e => e.label.toLowerCase() !== label.toLowerCase());
      if (curr.some(e => e.label.toLowerCase() === label.toLowerCase())) return curr;
      return [...curr, { label, amount: 0, note: '' }];
    });
  };
  const updateExtra = (label, patch) => {
    setExtras(curr => curr.map(e =>
      e.label.toLowerCase() === label.toLowerCase() ? { ...e, ...patch } : e,
    ));
  };

  const groups = [...new Set(FEATURE_CATALOG.map(f => f.group))];

  const totalExtras = extras.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={shop ? `Manage features — ${shop.shop_domain}` : 'Manage features'}
      primaryAction={{
        content: saveMutation.isLoading ? 'Saving…' : 'Save',
        onAction: () => saveMutation.mutate(),
        loading: saveMutation.isLoading,
      }}
      secondaryActions={[{ content: 'Cancel', onAction: onClose }]}
      large
    >
      <Modal.Section>
        {isLoading ? (
          <Box padding="800"><InlineStack align="center"><Spinner /></InlineStack></Box>
        ) : (
          <BlockStack gap="400">
            <Banner tone="info">
              <Text variant="bodySm" as="p">
                Plan-included features are checked but locked. Toggle any extras the merchant has paid for —
                set the amount they were charged. Extras unlock the feature on top of their current plan.
              </Text>
            </Banner>

            <Text variant="bodyMd" tone="subdued" as="p">
              Current plan: <strong>{shop?.subscription?.plan?.name || 'No plan'}</strong>
              {extras.length > 0 && ` · Extras total: $${totalExtras.toFixed(2)}`}
            </Text>

            <Divider />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 32px' }}>
              {groups.map(group => (
                <div key={group}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: '#6d7175',
                    textTransform: 'uppercase', letterSpacing: '0.5px',
                    marginBottom: 6, marginTop: 8,
                  }}>
                    {group}
                  </div>
                  {FEATURE_CATALOG.filter(f => f.group === group).map(f => {
                    const inPlan = planSet.has(f.label.toLowerCase());
                    const extra = extras.find(e => e.label.toLowerCase() === f.label.toLowerCase());
                    const isExtra = !!extra;
                    return (
                      <div key={f.label} style={{ marginBottom: 6 }}>
                        <Checkbox
                          label={
                            <span>
                              {f.label}{' '}
                              {inPlan && <span style={{ fontSize: 11, color: '#6d7175' }}>(in plan)</span>}
                              {isExtra && !inPlan && <span style={{ fontSize: 11, color: '#108043' }}> · extra</span>}
                            </span>
                          }
                          checked={inPlan || isExtra}
                          disabled={inPlan}
                          onChange={(val) => toggleExtra(f.label, val)}
                        />
                        {isExtra && !inPlan && (
                          <div style={{ paddingLeft: 28, marginTop: 4 }}>
                            <InlineStack gap="200" blockAlign="center">
                              <div style={{ width: 110 }}>
                                <TextField
                                  label="Amount"
                                  labelHidden
                                  type="number"
                                  prefix="$"
                                  value={String(extra.amount ?? 0)}
                                  onChange={(v) => updateExtra(f.label, { amount: parseFloat(v) || 0 })}
                                  autoComplete="off"
                                />
                              </div>
                              <div style={{ flex: 1 }}>
                                <TextField
                                  label="Note"
                                  labelHidden
                                  placeholder="Note (optional)"
                                  value={extra.note || ''}
                                  onChange={(v) => updateExtra(f.label, { note: v })}
                                  autoComplete="off"
                                />
                              </div>
                            </InlineStack>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </BlockStack>
        )}
      </Modal.Section>
    </Modal>
  );
}

function statusBadge(isActive) {
  return <Badge tone={isActive ? 'success' : 'critical'}>{isActive ? 'Active' : 'Inactive'}</Badge>;
}

function planBadge(sub) {
  if (!sub) return <Text variant="bodySm" tone="subdued">No Plan</Text>;
  const tones = { active: 'success', trial: 'info', cancelled: 'critical', pending: 'warning', expired: 'subdued', frozen: 'attention' };
  return (
    <Badge tone={tones[sub.status] || 'base'}>
      {sub.plan?.name} · {sub.status}
    </Badge>
  );
}

export default function AdminShops() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [extrasShopId, setExtrasShopId] = useState(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(
    ['admin-shops', page, search, status],
    () => adminApi.shops({ page, limit: 20, search, status }),
    { keepPreviousData: true }
  );

  const toggleMutation = useMutation(
    ({ id, is_active }) => adminApi.updateShop(id, { is_active }),
    { onSuccess: () => queryClient.invalidateQueries('admin-shops') }
  );

  const shops = data?.shops || [];
  const total = data?.total || 0;

  const headings = [
    { title: 'Shop Domain' },
    { title: 'Email' },
    { title: 'Plan' },
    { title: 'Google' },
    { title: 'Status' },
    { title: 'Installed' },
    { title: 'Actions' },
  ];

  return (
    <Page title="Shops / Users" subtitle={`${total} total stores installed`}>
      <BlockStack gap="400">
        {/* Filters */}
        <Card>
          <Box padding="300">
            <InlineStack gap="300" blockAlign="end">
              <div style={{ flex: 1 }}>
                <TextField
                  label="Search"
                  labelHidden
                  value={search}
                  onChange={v => { setSearch(v); setPage(1); }}
                  placeholder="Search by domain, email or name..."
                  clearButton
                  onClearButtonClick={() => { setSearch(''); setPage(1); }}
                  autoComplete="off"
                />
              </div>
              <div style={{ minWidth: 160 }}>
                <Select
                  label="Status"
                  labelHidden
                  value={status}
                  onChange={v => { setStatus(v); setPage(1); }}
                  options={[
                    { label: 'All Status', value: '' },
                    { label: 'Active', value: 'active' },
                    { label: 'Inactive', value: 'inactive' },
                  ]}
                />
              </div>
            </InlineStack>
          </Box>
        </Card>

        {/* Table */}
        <Card padding="0">
          {isLoading ? (
            <Box padding="800"><InlineStack align="center"><Spinner /></InlineStack></Box>
          ) : (
            <IndexTable
              resourceName={{ singular: 'shop', plural: 'shops' }}
              itemCount={shops.length}
              headings={headings}
              selectable={false}
            >
              {shops.map((shop, index) => (
                <IndexTable.Row id={String(shop.id)} key={shop.id} position={index}>
                  <IndexTable.Cell>
                    <Text variant="bodyMd" fontWeight="semibold">{shop.shop_domain}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text variant="bodySm" tone="subdued">{shop.email || '—'}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{planBadge(shop.subscription)}</IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={shop.googleAccount?.is_active ? 'success' : 'subdued'}>
                      {shop.googleAccount?.is_active ? 'Connected' : 'Not connected'}
                    </Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{statusBadge(shop.is_active)}</IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text variant="bodySm" tone="subdued">
                      {new Date(shop.installed_at).toLocaleDateString()}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <InlineStack gap="100">
                      <Button size="slim" onClick={() => setExtrasShopId(shop.id)}>
                        Features{Array.isArray(shop.extra_features) && shop.extra_features.length > 0
                          ? ` (+${shop.extra_features.length})` : ''}
                      </Button>
                      <Button
                        size="slim"
                        tone={shop.is_active ? 'critical' : undefined}
                        onClick={() => toggleMutation.mutate({ id: shop.id, is_active: !shop.is_active })}
                        loading={toggleMutation.isLoading}
                      >
                        {shop.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </InlineStack>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}

          {/* Pagination */}
          <Box padding="300" borderBlockStartWidth="025" borderColor="border">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="bodySm" tone="subdued">
                {total} total · Page {page}
              </Text>
              <Pagination
                hasPrevious={page > 1}
                onPrevious={() => setPage(p => p - 1)}
                hasNext={shops.length === 20}
                onNext={() => setPage(p => p + 1)}
              />
            </InlineStack>
          </Box>
        </Card>
      </BlockStack>

      <ExtraFeaturesModal
        shopId={extrasShopId}
        open={!!extrasShopId}
        onClose={() => setExtrasShopId(null)}
      />
    </Page>
  );
}
