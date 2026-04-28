import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Page, Card, Text, Badge, BlockStack, InlineStack, InlineGrid, Box,
  Banner, Button, Divider, Spinner, Tabs, EmptyState, Icon, Toast, TextField, Pagination,
} from '@shopify/polaris';
import { AlertCircleIcon, SearchIcon, ChartVerticalIcon } from '@shopify/polaris-icons';
import { insightsApi } from '../api';
import PlanGate from '../components/PlanGate';

function SeverityBadge({ severity }) {
  const map = { critical: 'critical', high: 'warning', medium: 'attention', low: 'info' };
  return <Badge tone={map[severity] || 'subdued'}>{severity?.toUpperCase()}</Badge>;
}

function PriorityBadge({ priority }) {
  const map = { high: 'critical', medium: 'warning', low: 'info' };
  return <Badge tone={map[priority] || 'subdued'}>{priority?.toUpperCase()}</Badge>;
}

const PAGE_SIZE = 10;

// ── Low Stock Alerts tab ──────────────────────────────────────────────────────
function AlertsTab() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data: alerts = [], isLoading } = useQuery('insights-alerts', insightsApi.alerts);

  if (isLoading) return <Box padding="800" textAlign="center"><Spinner /></Box>;

  if (!alerts.length) return (
    <EmptyState heading="No stock alerts" image="">
      <Text>All active products have sufficient inventory relative to their traffic. Great job!</Text>
    </EmptyState>
  );

  const filtered = search.trim()
    ? alerts.filter(a =>
        a.product_title?.toLowerCase().includes(search.toLowerCase()) ||
        a.variant_title?.toLowerCase().includes(search.toLowerCase()) ||
        a.sku?.toLowerCase().includes(search.toLowerCase())
      )
    : alerts;

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSearch = (v) => { setSearch(v); setPage(1); };

  return (
    <BlockStack gap="300">
      <Banner tone="info">
        <Text variant="bodySm">
          These alerts show products getting significant Google traffic but with low or zero inventory.
          Restocking these first maximises your return from SEO and Ads spend.
        </Text>
      </Banner>

      <TextField
        placeholder="Search by product name, variant or SKU..."
        value={search}
        onChange={handleSearch}
        clearButton
        onClearButtonClick={() => handleSearch('')}
        autoComplete="off"
        prefix={<Icon source={SearchIcon} />}
      />

      <InlineStack align="space-between" blockAlign="center">
        <Text variant="bodySm" tone="subdued">
          {filtered.length === 0
            ? 'No matching alerts'
            : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length} alert${filtered.length !== 1 ? 's' : ''}${search ? ` for "${search}"` : ''}`}
        </Text>
        {totalPages > 1 && (
          <Text variant="bodySm" tone="subdued">Page {page} of {totalPages}</Text>
        )}
      </InlineStack>

      {filtered.length === 0 && (
        <EmptyState heading="No matching alerts" image="">
          <Text>Try a different product name or SKU.</Text>
        </EmptyState>
      )}

      {paginated.map((alert, i) => (
        <Card key={i}>
          <Box padding="400">
            <InlineStack align="space-between" blockAlign="start" wrap={false}>
              <BlockStack gap="200">
                <InlineStack gap="200" blockAlign="center">
                  <SeverityBadge severity={alert.severity} />
                  <Text variant="bodyMd" fontWeight="semibold">{alert.product_title}</Text>
                </InlineStack>
                <Text variant="bodySm" tone="subdued">
                  Variant: {alert.variant_title}{alert.sku ? ` · SKU: ${alert.sku}` : ''}
                </Text>
                <Text variant="bodySm" tone={alert.type === 'out_of_stock' ? 'critical' : 'caution'}>
                  {alert.message}
                </Text>
              </BlockStack>
              <BlockStack gap="100" inlineAlign="end">
                <Text variant="headingLg" fontWeight="bold" tone={alert.inventory <= 0 ? 'critical' : 'caution'}>
                  {Math.max(0, alert.inventory)}
                </Text>
                <Text variant="bodySm" tone="subdued">units left</Text>
                <Text variant="bodySm"><strong>{alert.monthly_clicks}</strong> monthly clicks</Text>
              </BlockStack>
            </InlineStack>
          </Box>
        </Card>
      ))}

      {totalPages > 1 && (
        <Box paddingBlock="300">
          <InlineStack align="center">
            <Pagination
              hasPrevious={page > 1}
              onPrevious={() => setPage(p => p - 1)}
              hasNext={page < totalPages}
              onNext={() => setPage(p => p + 1)}
              label={`Page ${page} of ${totalPages}`}
            />
          </InlineStack>
        </Box>
      )}
    </BlockStack>
  );
}

// ── Product SEO Report tab ────────────────────────────────────────────────────
function ProductSeoTab() {
  const { data: report = [], isLoading } = useQuery('insights-product-seo', insightsApi.productSeo);

  if (isLoading) return <Box padding="800" textAlign="center"><Spinner /></Box>;

  if (!report.length) return (
    <EmptyState heading="No SEO data yet" image="">
      <Text>Connect Google Search Console and configure your property URL, then wait for the daily sync to run.</Text>
    </EmptyState>
  );

  return (
    <BlockStack gap="300">
      <Banner tone="info">
        <Text variant="bodySm">
          Shows which product pages are ranking in Google and which keywords drive traffic to them.
          Focus on products with high impressions but low clicks — their titles need improvement.
        </Text>
      </Banner>
      {report.map((p, i) => (
        <Card key={i}>
          <Box padding="400">
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="bodyMd" fontWeight="semibold">{p.product_title}</Text>
                <InlineStack gap="400">
                  <BlockStack inlineAlign="center" gap="050">
                    <Text variant="headingMd" fontWeight="bold">{p.total_clicks}</Text>
                    <Text variant="bodySm" tone="subdued">Clicks</Text>
                  </BlockStack>
                  <BlockStack inlineAlign="center" gap="050">
                    <Text variant="headingMd" fontWeight="bold">{p.total_impressions}</Text>
                    <Text variant="bodySm" tone="subdued">Impressions</Text>
                  </BlockStack>
                  <BlockStack inlineAlign="center" gap="050">
                    <Text variant="headingMd" fontWeight="bold">#{p.avg_position}</Text>
                    <Text variant="bodySm" tone="subdued">Avg Position</Text>
                  </BlockStack>
                  <BlockStack inlineAlign="center" gap="050">
                    <Text variant="headingMd" fontWeight="bold">{p.avg_ctr}%</Text>
                    <Text variant="bodySm" tone="subdued">CTR</Text>
                  </BlockStack>
                </InlineStack>
              </InlineStack>
              {p.top_keywords?.length > 0 && (
                <>
                  <Divider />
                  <Text variant="bodySm" tone="subdued" fontWeight="semibold">TOP KEYWORDS</Text>
                  <InlineStack gap="200" wrap>
                    {p.top_keywords.map((kw, ki) => (
                      <Box key={ki} background="bg-surface-secondary" borderRadius="200" padding="150">
                        <InlineStack gap="200">
                          <Text variant="bodySm" fontWeight="semibold">{kw.keyword}</Text>
                          <Text variant="bodySm" tone="subdued">#{kw.position} · {kw.clicks} clicks</Text>
                        </InlineStack>
                      </Box>
                    ))}
                  </InlineStack>
                </>
              )}
            </BlockStack>
          </Box>
        </Card>
      ))}
    </BlockStack>
  );
}

// ── SEO Suggestions tab ───────────────────────────────────────────────────────
function SuggestionsTab() {
  const { data: suggestions = [], isLoading } = useQuery('insights-suggestions', insightsApi.seoSuggestions);

  if (isLoading) return <Box padding="800" textAlign="center"><Spinner /></Box>;

  if (!suggestions.length) return (
    <EmptyState heading="No suggestions yet" image="">
      <Text>Suggestions appear once Search Console data is synced and products are imported.</Text>
    </EmptyState>
  );

  const typeLabel = { position_improvement: 'Improve Ranking', low_ctr: 'Fix Low CTR', keyword_not_in_title: 'Add to Title', no_data: 'No Data', info: 'Info' };
  const typeColor = { position_improvement: '#eff6ff', low_ctr: '#fef2f2', keyword_not_in_title: '#fefce8', no_data: '#f9fafb' };

  return (
    <BlockStack gap="300">
      {suggestions.map((s, i) => (
        <Box key={i} background="bg-surface" borderWidth="025" borderColor="border" borderRadius="300" padding="400">
          <BlockStack gap="200">
            <InlineStack gap="200" blockAlign="center">
              <PriorityBadge priority={s.priority} />
              <Badge>{typeLabel[s.type] || s.type}</Badge>
              <Text variant="bodySm" fontWeight="semibold">{s.product_title}</Text>
            </InlineStack>
            <Text variant="bodySm">{s.message}</Text>
            {s.action && (
              <Box background="bg-surface-secondary" borderRadius="200" padding="300">
                <Text variant="bodySm" tone="success"><strong>Action:</strong> {s.action}</Text>
              </Box>
            )}
          </BlockStack>
        </Box>
      ))}
    </BlockStack>
  );
}

// ── Ads Correlation tab ───────────────────────────────────────────────────────
function AdsCorrelationTab() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [needsPcdApproval, setNeedsPcdApproval] = useState(false);
  const { data, isLoading } = useQuery('insights-ads', insightsApi.adsCorrelation);

  const syncMutation = useMutation(insightsApi.syncOrders, {
    onSuccess: (result) => {
      setNeedsReauth(false);
      setNeedsPcdApproval(false);
      setToast({ message: result?.message || 'Orders synced successfully', error: false });
      queryClient.invalidateQueries('insights-ads');
    },
    onError: (err) => {
      if (err?.error === 'protected_customer_data') {
        setNeedsPcdApproval(true);
      } else if (err?.error === 'needs_reauth') {
        setNeedsReauth(true);
      } else {
        setToast({ message: err?.message || 'Sync failed — check server logs', error: true });
      }
    },
  });

  const handleReauth = () => {
    const shop = new URLSearchParams(window.location.search).get('shop')
      || sessionStorage.getItem('shop');
    if (shop) {
      window.top.location.href = `/api/auth/install?shop=${shop}`;
    }
  };

  if (isLoading) return <Box padding="800" textAlign="center"><Spinner /></Box>;

  const totalInDb = data?.total_in_db ?? 0;
  const summary = data?.summary;
  const campaigns = data?.by_campaign || [];
  const products = data?.top_products_from_ads || [];

  return (
    <BlockStack gap="400">
      {toast && (
        <Toast
          content={toast.message}
          error={toast.error}
          onDismiss={() => setToast(null)}
        />
      )}

      {needsPcdApproval && (
        <Banner
          tone="critical"
          title="Shopify Protected Customer Data approval required"
        >
          <BlockStack gap="200">
            <Text variant="bodySm">
              Shopify requires apps to receive explicit approval before accessing order data that contains customer information (emails, addresses). This is a one-time approval process in your Shopify Partner Dashboard.
            </Text>
            <Text variant="bodySm" fontWeight="semibold">Steps to fix:</Text>
            <Text variant="bodySm">
              1. Go to <strong>Shopify Partner Dashboard</strong> → Apps → your app → <strong>Configuration</strong> tab
            </Text>
            <Text variant="bodySm">
              2. Scroll down to <strong>"Protected customer data access"</strong>
            </Text>
            <Text variant="bodySm">
              3. Click <strong>"Request access"</strong> and explain that your app needs order data to show Google Ads attribution and UTM tracking analytics
            </Text>
            <Text variant="bodySm">
              4. Once approved by Shopify, click "Sync Orders" again — no re-install needed
            </Text>
          </BlockStack>
        </Banner>
      )}

      {needsReauth && (
        <Banner
          tone="warning"
          title="Permission required to read orders"
          action={{ content: 'Re-authorize App', onAction: handleReauth }}
        >
          <Text variant="bodySm">
            The app needs the "read_orders" permission. Click Re-authorize App — Shopify will ask you to approve the new permission, then you'll be redirected back automatically.
          </Text>
        </Banner>
      )}

      <InlineStack align="space-between" blockAlign="center">
        <Text variant="bodySm" tone="subdued">
          {totalInDb > 0 ? `${totalInDb} orders in database` : 'No orders synced yet'}
        </Text>
        <Button
          onClick={() => syncMutation.mutate()}
          loading={syncMutation.isLoading}
          size="slim"
        >
          {syncMutation.isLoading ? 'Syncing...' : 'Sync Orders from Shopify'}
        </Button>
      </InlineStack>

      {totalInDb === 0 && !needsReauth && (
        <EmptyState heading="No orders synced yet" image="">
          <Text>Click "Sync Orders from Shopify" to import your last 30 days of orders. New orders will then auto-sync via webhooks.</Text>
        </EmptyState>
      )}

      {totalInDb > 0 && !summary && (
        <Banner tone="info">
          <Text variant="bodySm">
            {totalInDb} orders are in the database but none were paid/pending in the last 30 days.
          </Text>
        </Banner>
      )}

      {summary && (
        <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
          {[
            { label: 'Total Orders (30d)', value: summary.total_orders },
            { label: 'Google Ads Orders', value: summary.google_ads_orders },
            { label: 'Ads Revenue', value: `₹${summary.google_ads_revenue?.toFixed(2)}` },
            { label: 'Organic Orders', value: summary.organic_orders },
          ].map(s => (
            <Card key={s.label}>
              <Box padding="400" textAlign="center">
                <BlockStack gap="100">
                  <Text variant="headingXl" fontWeight="bold">{s.value ?? 0}</Text>
                  <Text variant="bodySm" tone="subdued">{s.label}</Text>
                </BlockStack>
              </Box>
            </Card>
          ))}
        </InlineGrid>
      )}

      {campaigns.length > 0 && (
        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <Text variant="headingMd">Orders by Google Ads Campaign</Text>
              <Divider />
              {campaigns.map((c, i) => (
                <InlineStack key={i} align="space-between">
                  <Text variant="bodySm">{c.campaign}</Text>
                  <InlineStack gap="400">
                    <Text variant="bodySm"><strong>{c.orders}</strong> orders</Text>
                    <Text variant="bodySm" tone="success"><strong>₹{c.revenue}</strong></Text>
                  </InlineStack>
                </InlineStack>
              ))}
            </BlockStack>
          </Box>
        </Card>
      )}

      {summary && campaigns.length === 0 && (
        <Banner tone="info">
          <Text variant="bodySm">
            No Google Ads orders found in the last 30 days. Google Ads orders are detected when the order's landing URL contains <strong>utm_source=google</strong> and <strong>utm_medium=cpc</strong>.
          </Text>
        </Banner>
      )}

      {products.length > 0 && (
        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <Text variant="headingMd">Top Products Sold via Google Ads</Text>
              <Divider />
              {products.map((p, i) => (
                <InlineStack key={i} align="space-between">
                  <Text variant="bodySm">{p.title}</Text>
                  <InlineStack gap="400">
                    <Text variant="bodySm"><strong>{p.quantity}</strong> units</Text>
                    <Text variant="bodySm" tone="success"><strong>₹{p.revenue}</strong></Text>
                  </InlineStack>
                </InlineStack>
              ))}
            </BlockStack>
          </Box>
        </Card>
      )}
    </BlockStack>
  );
}

// ── Main Insights page ────────────────────────────────────────────────────────
export default function Insights() {
  const [selected, setSelected] = useState(0);

  const tabs = [
    { id: 'alerts',      content: 'Stock Alerts',       panelID: 'alerts' },
    { id: 'product-seo', content: 'Product SEO Report', panelID: 'product-seo' },
    { id: 'suggestions', content: 'SEO Suggestions',    panelID: 'suggestions' },
    { id: 'ads',         content: 'Ads → Orders',       panelID: 'ads' },
  ];

  return (
    <Page
      title="Insights"
      subtitle="Product SEO rankings, stock alerts, SEO suggestions, and order attribution"
    >
      <Card padding="0">
        <Tabs tabs={tabs} selected={selected} onSelect={setSelected}>
          <Box padding="400">
            {selected === 0 && <AlertsTab />}
            {selected === 1 && <ProductSeoTab />}
            {selected === 2 && (
              <PlanGate feature="seoSuggestions" required="growth">
                <SuggestionsTab />
              </PlanGate>
            )}
            {selected === 3 && (
              <PlanGate feature="adsOrders" required="growth">
                <AdsCorrelationTab />
              </PlanGate>
            )}
          </Box>
        </Tabs>
      </Card>
    </Page>
  );
}
