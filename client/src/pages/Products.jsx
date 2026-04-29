import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Page, Card, Button, TextField, Badge, Text, BlockStack, InlineGrid,
  InlineStack, Box, Spinner, Banner, Thumbnail, Icon,
  Select, Pagination, EmptyState, Collapsible,
} from '@shopify/polaris';
import { SearchIcon, ImageIcon } from '@shopify/polaris-icons';
import { productsApi } from '../api';
import { usePlan } from '../hooks/usePlan';
import PlanLimitBanner from '../components/PlanLimitBanner';

// Map our internal status → Polaris Badge tone (matches Shopify admin pills:
// "Active" = success-green, "Draft" = info-blue, "Archived" = subdued)
function statusTone(status) {
  if (status === 'active')   return 'success';
  if (status === 'draft')    return 'info';
  if (status === 'archived') return 'subdued';
  return 'subdued';
}

// "1,129 in stock for 25 variants" / "0 in stock for 20 variants" / "Inventory not tracked"
function inventoryDisplay(variants) {
  if (!variants?.length) return { text: 'No variants', tone: 'subdued', total: 0 };
  // If every variant has inventory_quantity null AND inventory_management null → not tracked
  const tracked = variants.filter(v => v.inventory_quantity != null);
  if (!tracked.length) return { text: 'Inventory not tracked', tone: 'subdued', total: null };
  const total = tracked.reduce((s, v) => s + (v.inventory_quantity || 0), 0);
  const variantWord = variants.length === 1 ? 'variant' : 'variants';
  if (total <= 0) return { text: `0 in stock for ${variants.length} ${variantWord}`, tone: 'critical', total: 0 };
  return { text: `${total.toLocaleString()} in stock for ${variants.length} ${variantWord}`, tone: 'normal', total };
}

// ── Real <table> styles ─────────────────────────────────────────────────────
// Using a real <table> guarantees columns auto-align between header and rows
// (the grid-based layout was drifting). All visual tokens come from Polaris
// CSS variables so the colors/fonts stay consistent with the theme.
const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  tableLayout: 'auto',
};
const thStyle = {
  textAlign: 'left',
  padding: '12px 16px',
  background: 'var(--p-color-bg-surface-secondary)',
  color: 'var(--p-color-text-secondary)',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
  borderBottom: '1px solid var(--p-color-border)',
  whiteSpace: 'nowrap',
  verticalAlign: 'middle',
};
const tdStyle = {
  padding: '12px 16px',
  verticalAlign: 'top',
  borderBottom: '1px solid var(--p-color-border-secondary)',
};

// Variant detail table (used in the collapsible expansion)
const vTableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '13px' };
const vthStyle = {
  textAlign: 'left', padding: '8px 12px', color: 'var(--p-color-text-secondary)',
  fontWeight: 600, borderBottom: '1px solid var(--p-color-border)', whiteSpace: 'nowrap',
  fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px',
};
const vtdStyle = {
  padding: '8px 12px', verticalAlign: 'middle',
  borderBottom: '1px solid var(--p-color-border-secondary)',
};

function ProductRow({ product }) {
  const [open, setOpen] = useState(false);
  const thumb = product.images?.[0]?.src;
  const variantCount = product.variants?.length || 0;
  const inv = inventoryDisplay(product.variants);
  // Shopify category isn't in our DB yet — fall back to "—" so the column stays
  // aligned. (We can backfill from the GraphQL Admin API later.)
  const category = product.category || '—';

  const invTone = inv.tone === 'critical' ? 'critical' : inv.tone === 'subdued' ? 'subdued' : undefined;

  return (
    <>
      <tr>
        {/* PRODUCT — image + title (title wraps when long, like Shopify admin) */}
        <td style={tdStyle}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
            <div style={{ flexShrink: 0 }}>
              {thumb
                ? <Thumbnail source={thumb} alt={product.title} size="small" />
                : <Thumbnail source={ImageIcon} alt={product.title} size="small" />}
            </div>
            <div style={{ minWidth: 0, paddingTop: 2 }}>
              <Text variant="bodyMd" as="p" fontWeight="semibold" breakWord>{product.title}</Text>
            </div>
          </div>
        </td>

        {/* STATUS */}
        <td style={tdStyle}>
          <Badge tone={statusTone(product.status)}>
            {product.status?.charAt(0).toUpperCase() + product.status?.slice(1)}
          </Badge>
        </td>

        {/* INVENTORY */}
        <td style={tdStyle}>
          <Text variant="bodySm" as="p" tone={invTone}>{inv.text}</Text>
        </td>

        {/* CATEGORY */}
        <td style={tdStyle}>
          <Text variant="bodySm" as="p" tone={category === '—' ? 'subdued' : undefined}>{category}</Text>
        </td>

        {/* PRODUCT TYPE */}
        <td style={tdStyle}>
          <Text variant="bodySm" as="p" tone={product.product_type ? undefined : 'subdued'}>
            {product.product_type || '—'}
          </Text>
        </td>

        {/* VARIANTS — replaces the Vendor column per the spec */}
        <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
          {variantCount > 0 ? (
            <Button size="slim" variant="plain" onClick={() => setOpen(v => !v)}>
              {open ? 'Hide variants' : `Show ${variantCount} variant${variantCount !== 1 ? 's' : ''}`}
            </Button>
          ) : (
            <Text variant="bodySm" as="span" tone="subdued">—</Text>
          )}
        </td>
      </tr>

      {/* Expanded variants — a sub-table that spans all 6 columns */}
      {open && (
        <tr>
          <td colSpan={6} style={{ padding: 0, background: 'var(--p-color-bg-surface-secondary)', borderBottom: '1px solid var(--p-color-border-secondary)' }}>
            <Collapsible open={open} id={`variants-${product.id}`}>
              <div style={{ padding: '12px 24px' }}>
                <table style={vTableStyle}>
                  <thead>
                    <tr>
                      {['Variant', 'SKU', 'Price', 'Stock', 'Barcode'].map(h => (
                        <th key={h} style={vthStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {product.variants?.map(v => (
                      <tr key={v.id}>
                        <td style={vtdStyle}>{v.title}</td>
                        <td style={vtdStyle}>{v.sku || '—'}</td>
                        <td style={vtdStyle}>₹{parseFloat(v.price || 0).toFixed(2)}</td>
                        <td style={{
                          ...vtdStyle,
                          color: (v.inventory_quantity ?? 0) < 1 ? 'var(--p-color-text-critical)' : 'var(--p-color-text-success)',
                          fontWeight: 600,
                        }}>
                          {v.inventory_quantity ?? '—'}
                        </td>
                        <td style={{ ...vtdStyle, color: 'var(--p-color-text-secondary)' }}>{v.barcode || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Collapsible>
          </td>
        </tr>
      )}
    </>
  );
}

export default function Products() {
  const queryClient = useQueryClient();
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [syncMsg, setSyncMsg] = useState(null);

  const { features } = usePlan();
  const productsLimit = features.productsLimit || 0; // 0 = unlimited

  const { data, isLoading } = useQuery(
    ['products', page, search, status],
    () => productsApi.list({ page, limit: 20, search, status }),
    { keepPreviousData: true }
  );

  const { data: stats } = useQuery('product-stats', productsApi.stats);

  // Cap pagination + visible rows so the user only ever sees the first
  // `productsLimit` products. The DB still has everything (synced via webhook)
  // but the UI honours the plan.
  const dbTotal = data?.total ?? 0;
  const cappedTotal = productsLimit > 0 ? Math.min(dbTotal, productsLimit) : dbTotal;
  const cappedPages = productsLimit > 0
    ? Math.max(1, Math.ceil(cappedTotal / 20))
    : (data?.pages || 1);
  const allRows = data?.products || [];
  // Slice the current page's rows so the very last page doesn't overflow the cap.
  const visibleRows = (() => {
    if (productsLimit <= 0) return allRows;
    const startIdx = (page - 1) * 20;
    const remaining = productsLimit - startIdx;
    return remaining <= 0 ? [] : allRows.slice(0, remaining);
  })();
  const cappedStatsTotal = productsLimit > 0 && stats?.total
    ? Math.min(stats.total, productsLimit)
    : stats?.total;

  const syncMutation = useMutation(productsApi.sync, {
    onSuccess: () => {
      setSyncMsg('Sync started! Products will appear shortly. Refresh in a few seconds.');
      setTimeout(() => {
        queryClient.invalidateQueries('products');
        queryClient.invalidateQueries('product-stats');
        setSyncMsg(null);
      }, 5000);
    },
    onError: () => setSyncMsg('Sync failed. Please try again.'),
  });

  return (
    <Page
      title="Products"
      subtitle="Synced from your Shopify store — kept up to date automatically via webhooks"
      primaryAction={{
        content: 'Sync from Shopify',
        onAction: () => syncMutation.mutate(),
        loading: syncMutation.isLoading,
      }}
    >
      <BlockStack gap="400">
        {syncMsg && (
          <Banner tone={syncMsg.includes('failed') ? 'critical' : 'success'} onDismiss={() => setSyncMsg(null)}>
            <Text as="p">{syncMsg}</Text>
          </Banner>
        )}

        {/* KPI cards */}
        {stats && (
          <InlineGrid columns={{ xs: 2, sm: 4 }} gap="400">
            {[
              { label: 'Total Products', value: cappedStatsTotal ?? stats.total },
              { label: 'Active',         value: stats.active },
              { label: 'Draft',          value: stats.draft },
              { label: 'Total Variants', value: stats.variants },
            ].map(s => (
              <Card key={s.label}>
                <BlockStack gap="100" inlineAlign="center">
                  <Text variant="headingXl" as="p" fontWeight="bold">{s.value ?? 0}</Text>
                  <Text variant="bodySm" as="p" tone="subdued">{s.label}</Text>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        )}

        <PlanLimitBanner kind="products" limit={productsLimit} total={dbTotal} />

        {/* Product list — Shopify-admin-style table */}
        <Card padding="0">
          {/* Toolbar */}
          <Box padding="400" borderBlockEndWidth="025" borderColor="border">
            <InlineStack gap="300" blockAlign="center" wrap={false}>
              <div style={{ flex: 1 }}>
                <TextField
                  label="Search"
                  labelHidden
                  placeholder="Search and filter"
                  value={search}
                  onChange={v => { setSearch(v); setPage(1); }}
                  clearButton
                  onClearButtonClick={() => { setSearch(''); setPage(1); }}
                  autoComplete="off"
                  prefix={<Icon source={SearchIcon} />}
                />
              </div>
              <div style={{ minWidth: '160px' }}>
                <Select
                  label="Status"
                  labelHidden
                  options={[
                    { label: 'All statuses', value: '' },
                    { label: 'Active',       value: 'active' },
                    { label: 'Draft',        value: 'draft' },
                    { label: 'Archived',     value: 'archived' },
                  ]}
                  value={status}
                  onChange={v => { setStatus(v); setPage(1); }}
                />
              </div>
              {data?.total != null && (
                <Text variant="bodySm" as="span" tone="subdued">
                  {cappedTotal.toLocaleString()} product{cappedTotal !== 1 ? 's' : ''}
                </Text>
              )}
            </InlineStack>
          </Box>

          {isLoading ? (
            <Box padding="800"><InlineStack align="center"><Spinner /></InlineStack></Box>
          ) : !data?.products?.length ? (
            <EmptyState
              heading="No products found"
              action={{ content: 'Sync from Shopify', onAction: () => syncMutation.mutate(), loading: syncMutation.isLoading }}
              image="https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-2_large.png"
            >
              <p>{search || status ? 'Try a different search or filter.' : 'Click "Sync from Shopify" to import all your products and variants.'}</p>
            </EmptyState>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Product</th>
                      <th style={{ ...thStyle, width: 110 }}>Status</th>
                      <th style={{ ...thStyle, width: 220 }}>Inventory</th>
                      <th style={{ ...thStyle, width: 160 }}>Category</th>
                      <th style={{ ...thStyle, width: 160 }}>Product type</th>
                      <th style={{ ...thStyle, width: 160, textAlign: 'right' }}>Variants</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map(p => <ProductRow key={p.id} product={p} />)}
                  </tbody>
                </table>
              </div>
              {cappedPages > 1 && (
                <Box padding="400" borderBlockStartWidth="025" borderColor="border">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="bodySm" as="span" tone="subdued">
                      Page {page} of {cappedPages}
                    </Text>
                    <Pagination
                      hasPrevious={page > 1}
                      onPrevious={() => setPage(p => p - 1)}
                      hasNext={page < cappedPages}
                      onNext={() => setPage(p => p + 1)}
                    />
                  </InlineStack>
                </Box>
              )}
            </>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
