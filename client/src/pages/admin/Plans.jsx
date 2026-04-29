import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Page, Card, Text, Badge, Button, Modal, FormLayout,
  TextField, Select, BlockStack, InlineStack, Box, Divider, List, Spinner, Checkbox,
} from '@shopify/polaris';
import { adminApi } from '../../api';

// ── Feature definitions ──────────────────────────────────────────────────────
const FEATURES = [
  { key: 'ga4',             label: 'GA4 Analytics',             group: 'Analytics' },
  { key: 'searchConsole',   label: 'Google Search Console',      group: 'Analytics' },
  { key: 'googleAds',       label: 'Google Ads Campaigns',       group: 'Analytics' },
  { key: 'sitemapManager',  label: 'Sitemap Manager',            group: 'Analytics' },
  { key: 'basicDashboard',  label: 'Basic Dashboard',            group: 'Dashboard' },
  { key: 'advDashboard',    label: 'Advanced Dashboard',         group: 'Dashboard' },
  { key: 'csvExport',       label: 'CSV Export',                 group: 'Data' },
  { key: 'customReports',   label: 'Custom Reports',             group: 'Data' },
  { key: 'stockAlerts',     label: 'Stock Alerts',               group: 'Insights' },
  { key: 'productSeoReport',label: 'Product SEO Report',         group: 'Insights' },
  { key: 'seoSuggestions',  label: 'SEO Suggestions',            group: 'Insights' },
  { key: 'adsOrders',       label: 'Ads → Orders Attribution',   group: 'Insights' },
  { key: 'siteAudit',       label: 'Site Audit',                 group: 'AI & Site' },
  { key: 'aiVisibility',    label: 'AI Visibility',              group: 'AI & Site' },
  { key: 'contentCreation', label: 'Content Creation',           group: 'AI & Site' },
  { key: 'productFaqs',     label: 'Product FAQs',               group: 'AI & Site' },
  { key: 'structuredMarkup',label: 'Structured Markup',          group: 'AI & Site' },
  { key: 'autoSitemap',     label: 'Auto Sitemap Submission',    group: 'SEO Tools' },
  { key: 'brandSplit',      label: 'Brand vs Non-Brand Split',   group: 'SEO Tools' },
  { key: 'prioritySupport', label: 'Priority Support',           group: 'Support' },
];

const GROUPS = ['Analytics', 'Dashboard', 'Insights', 'Data', 'AI & Site', 'SEO Tools', 'Support'];

const EMPTY_CHECKED = Object.fromEntries(FEATURES.map(f => [f.key, false]));
// Ensure sitemapManager parses correctly from features string

const EMPTY_LIMITS  = { keywords: '', products: '', orders: '' };
const EMPTY_FORM    = { name: '', slug: '', price: '0', interval: 'monthly', trial_days: '14', is_active: true };

// Convert structured state → display string array
function buildFeatures(checked, limits) {
  const lines = [];
  for (const f of FEATURES) {
    if (!checked[f.key]) continue;
    if (f.key === 'searchConsole') {
      const kw = parseInt(limits.keywords) || 0;
      lines.push(kw > 0 ? `Google Search Console (${kw} keywords)` : 'Google Search Console (Unlimited keywords)');
    } else {
      lines.push(f.label);
    }
  }
  const prod = parseInt(limits.products) || 0;
  if (prod > 0) lines.push(`${prod} products/month`);
  const ord = parseInt(limits.orders) || 0;
  if (ord > 0) lines.push(`${ord} orders/month`);
  return lines;
}

// Reverse: parse existing string array back to checked + limits
function parseFeatures(arr = []) {
  const checked = { ...EMPTY_CHECKED };
  const limits  = { ...EMPTY_LIMITS };

  for (const f of FEATURES) {
    if (f.key === 'searchConsole') {
      const hit = arr.find(s => /search console/i.test(s));
      if (hit) {
        checked.searchConsole = true;
        const m = hit.match(/(\d+)\s*keyword/i);
        if (m) limits.keywords = m[1];
      }
    } else {
      checked[f.key] = arr.some(s => s.toLowerCase().includes(f.label.toLowerCase()));
    }
  }
  const prodLine = arr.find(s => /product.*month/i.test(s));
  if (prodLine) { const m = prodLine.match(/(\d+)/); if (m) limits.products = m[1]; }
  const ordLine = arr.find(s => /order.*month/i.test(s));
  if (ordLine) { const m = ordLine.match(/(\d+)/); if (m) limits.orders = m[1]; }

  return { checked, limits };
}

// ── Plan card ────────────────────────────────────────────────────────────────
function PlanCard({ plan, onEdit, onToggle }) {
  const priceColor = parseFloat(plan.price) === 0 ? '#108043' : '#1a1a1a';
  let features = [];
  try { features = Array.isArray(plan.features) ? plan.features : JSON.parse(plan.features || '[]'); } catch {}

  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="start">
            <Text variant="headingMd">{plan.name}</Text>
            <Badge tone={plan.is_active ? 'success' : 'subdued'}>
              {plan.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </InlineStack>

          <Text variant="heading2xl" as="p">
            <span style={{ color: priceColor }}>
              ${parseFloat(plan.price).toFixed(2)}
            </span>
            <span style={{ fontSize: 14, color: '#6d7175', fontWeight: 400 }}>/{plan.interval}</span>
          </Text>

          <Text variant="bodySm" tone="subdued">{plan.trial_days} days free trial</Text>

          <Divider />

          <List>
            {features.map((f, i) => <List.Item key={i}>{f}</List.Item>)}
          </List>

          <InlineStack gap="200">
            <Button size="slim" onClick={() => onEdit(plan)}>Edit</Button>
            <Button size="slim" tone={plan.is_active ? 'critical' : undefined} onClick={() => onToggle(plan)}>
              {plan.is_active ? 'Deactivate' : 'Activate'}
            </Button>
          </InlineStack>
        </BlockStack>
      </Box>
    </Card>
  );
}

// ── Checkbox row ─────────────────────────────────────────────────────────────
function FeatureCheckbox({ checked, label, onChange }) {
  return <Checkbox checked={checked} label={label} onChange={onChange} />;
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function AdminPlans() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen]   = useState(false);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [checked, setChecked]       = useState(EMPTY_CHECKED);
  const [limits, setLimits]         = useState(EMPTY_LIMITS);

  const { data: plans, isLoading } = useQuery('admin-plans', adminApi.plans);

  const saveMutation = useMutation(
    () => {
      const features = buildFeatures(checked, limits);
      const payload  = {
        ...form,
        price: parseFloat(form.price) || 0,
        trial_days: parseInt(form.trial_days) || 0,
        features,
      };
      return form.id ? adminApi.updatePlan(form.id, payload) : adminApi.createPlan(payload);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('admin-plans');
        setModalOpen(false);
      },
    }
  );

  const toggleMutation = useMutation(
    (plan) => adminApi.updatePlan(plan.id, { is_active: !plan.is_active }),
    { onSuccess: () => queryClient.invalidateQueries('admin-plans') }
  );

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setChecked(EMPTY_CHECKED);
    setLimits(EMPTY_LIMITS);
    setModalOpen(true);
  };

  const openEdit = (plan) => {
    let featsArray = [];
    try { featsArray = Array.isArray(plan.features) ? plan.features : JSON.parse(plan.features || '[]'); } catch {}
    const { checked: c, limits: l } = parseFeatures(featsArray);
    setForm({ ...plan, price: String(plan.price), trial_days: String(plan.trial_days) });
    setChecked(c);
    setLimits(l);
    setModalOpen(true);
  };

  const setF = (key) => (val) => setForm(f => ({ ...f, [key]: val }));
  const setCheckedKey = (key) => (val) => setChecked(c => {
    const next = { ...c, [key]: val };
    // Basic and Advanced Dashboard are mutually exclusive — picking one
    // unchecks the other so a plan only ever ships one dashboard tier.
    if (val && key === 'basicDashboard') next.advDashboard = false;
    if (val && key === 'advDashboard')   next.basicDashboard = false;
    return next;
  });
  const setLimit = (key) => (val) => setLimits(l => ({ ...l, [key]: val }));

  return (
    <Page
      title="Billing Plans"
      primaryAction={{ content: '+ New Plan', onAction: openCreate }}
    >
      {isLoading ? (
        <Box padding="800"><InlineStack align="center"><Spinner /></InlineStack></Box>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
          {(plans || []).map(plan => (
            <PlanCard key={plan.id} plan={plan} onEdit={openEdit} onToggle={(p) => toggleMutation.mutate(p)} />
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? `Edit Plan — ${form.name}` : 'Create New Plan'}
        primaryAction={{
          content: saveMutation.isLoading ? 'Saving...' : 'Save Plan',
          onAction: () => saveMutation.mutate(),
          loading: saveMutation.isLoading,
        }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setModalOpen(false) }]}
        large
      >
        <Modal.Section>
          <FormLayout>
            {/* Basic info */}
            <FormLayout.Group>
              <TextField label="Plan Name" value={form.name} onChange={setF('name')} placeholder="e.g. Growth" autoComplete="off" />
              <TextField label="Slug" value={form.slug} onChange={setF('slug')} placeholder="e.g. growth" helpText="Unique identifier, lowercase" autoComplete="off" />
            </FormLayout.Group>
            <FormLayout.Group>
              <TextField label="Price (USD)" type="number" value={String(form.price)} onChange={setF('price')} prefix="$" autoComplete="off" />
              <TextField label="Trial Days" type="number" value={String(form.trial_days)} onChange={setF('trial_days')} autoComplete="off" />
              <Select
                label="Billing Interval"
                value={form.interval}
                onChange={setF('interval')}
                options={[
                  { label: 'Monthly', value: 'monthly' },
                  { label: 'Annual',  value: 'annual'  },
                ]}
              />
            </FormLayout.Group>
          </FormLayout>
        </Modal.Section>

        <Modal.Section>
          {/* Feature checkboxes grouped */}
          <BlockStack gap="400">
            <Text variant="headingMd" fontWeight="semibold">Features</Text>
            <Text variant="bodySm" tone="subdued">Check the features included in this plan. These appear as bullet points on the billing page.</Text>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 32px' }}>
              {GROUPS.map(group => {
                const groupFeatures = FEATURES.filter(f => f.group === group);
                return (
                  <div key={group}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6d7175', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, marginTop: 8 }}>
                      {group}
                    </div>
                    {groupFeatures.map(f => (
                      <FeatureCheckbox
                        key={f.key}
                        checked={!!checked[f.key]}
                        label={f.label}
                        onChange={setCheckedKey(f.key)}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </BlockStack>
        </Modal.Section>

        <Modal.Section>
          {/* Limits */}
          <BlockStack gap="300">
            <Text variant="headingMd" fontWeight="semibold">Limits</Text>
            <Text variant="bodySm" tone="subdued">Set to 0 for unlimited. Non-zero values are displayed as bullet points and enforced in the app.</Text>

            <FormLayout.Group condensed>
              {[
                { key: 'keywords', label: 'Keyword Limit',  placeholder: '0 = unlimited', hint: 'Max keywords tracked via Search Console' },
                { key: 'products', label: 'Products/month', placeholder: '0 = unlimited', hint: 'Max products synced per month' },
                { key: 'orders',   label: 'Orders/month',   placeholder: '0 = unlimited', hint: 'Max orders synced per month' },
              ].map(lim => (
                <TextField
                  key={lim.key}
                  type="number"
                  min={0}
                  label={lim.label}
                  value={String(limits[lim.key] ?? '')}
                  onChange={(v) => setLimit(lim.key)(v)}
                  placeholder={lim.placeholder}
                  helpText={lim.hint}
                  autoComplete="off"
                />
              ))}
            </FormLayout.Group>
          </BlockStack>
        </Modal.Section>

        {/* Live preview */}
        <Modal.Section>
          <BlockStack gap="200">
            <Text variant="headingMd" fontWeight="semibold">Feature Preview</Text>
            <Text variant="bodySm" tone="subdued">This is what users will see on the billing page:</Text>
            <div style={{ background: '#f6f6f7', borderRadius: 8, padding: '12px 16px' }}>
              {buildFeatures(checked, limits).length === 0 ? (
                <Text variant="bodySm" tone="subdued">No features selected yet.</Text>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {buildFeatures(checked, limits).map((f, i) => (
                    <li key={i} style={{ fontSize: 13, color: '#202223', padding: '2px 0' }}>{f}</li>
                  ))}
                </ul>
              )}
            </div>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
