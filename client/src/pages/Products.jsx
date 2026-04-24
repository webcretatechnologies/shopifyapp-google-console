import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Page, Card, Button, TextField, Badge, Text, BlockStack, InlineGrid,
  InlineStack, Box, Spinner, Banner, Thumbnail, Icon,
  Select, Pagination, EmptyState, Collapsible,
} from '@shopify/polaris';
import { SearchIcon } from '@shopify/polaris-icons';
import { productsApi } from '../api';

function statusTone(status) {
  if (status === 'active')   return 'success';
  if (status === 'draft')    return 'attention';
  if (status === 'archived') return 'subdued';
  return 'subdued';
}

const variantTableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '13px',
};
const thStyle = {
  textAlign: 'left',
  padding: '8px 12px',
  color: '#6d7175',
  fontWeight: 600,
  borderBottom: '1px solid #e1e3e5',
  whiteSpace: 'nowrap',
};
const tdStyle = { padding: '8px 12px', verticalAlign: 'middle', borderBottom: '1px solid #f1f2f3' };

function ProductRow({ product }) {
  const [open, setOpen] = useState(false);
  const thumb = product.images?.[0]?.src;
  const variantCount = product.variants?.length || 0;

  return (
    <Box borderBlockEndWidth="025" borderColor="border">
      <Box padding="300">
        <InlineStack align="space-between" blockAlign="center" wrap={false} gap="300">
          {/* Left: image + title */}
          <InlineStack gap="300" blockAlign="center">
            <Thumbnail
              source={thumb || 'https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-2_large.png'}
              alt={product.title}
              size="small"
            />
            <BlockStack gap="050">
              <Text variant="bodyMd" fontWeight="semibold">{product.title}</Text>
              <InlineStack gap="100">
                {product.vendor && <Text variant="bodySm" tone="subdued">{product.vendor}</Text>}
                {product.product_type && <Text variant="bodySm" tone="subdued">· {product.product_type}</Text>}
              </InlineStack>
            </BlockStack>
          </InlineStack>
          {/* Right: badge + count + button */}
          <InlineStack gap="300" blockAlign="center">
            <Badge tone={statusTone(product.status)}>{product.status}</Badge>
            <Text variant="bodySm" tone="subdued">{variantCount} variant{variantCount !== 1 ? 's' : ''}</Text>
            {variantCount > 0 && (
              <Button size="slim" variant="plain" onClick={() => setOpen(v => !v)}>
                {open ? 'Hide variants' : 'Show variants'}
              </Button>
            )}
          </InlineStack>
        </InlineStack>
      </Box>

      <Collapsible open={open} id={`variants-${product.id}`}>
        <Box background="bg-surface-secondary" paddingInline="400" paddingBlock="300">
          <table style={variantTableStyle}>
            <thead>
              <tr>
                {['Variant', 'SKU', 'Price', 'Stock', 'Barcode'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {product.variants?.map(v => (
                <tr key={v.id}>
                  <td style={tdStyle}>{v.title}</td>
                  <td style={tdStyle}>{v.sku || '—'}</td>
                  <td style={tdStyle}>₹{parseFloat(v.price || 0).toFixed(2)}</td>
                  <td style={{ ...tdStyle, color: (v.inventory_quantity ?? 0) < 1 ? '#d82c0d' : '#008060', fontWeight: 600 }}>
                    {v.inventory_quantity ?? '—'}
                  </td>
                  <td style={{ ...tdStyle, color: '#6d7175' }}>{v.barcode || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      </Collapsible>
    </Box>
  );
}

export default function Products() {
  const queryClient = useQueryClient();
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [syncMsg, setSyncMsg] = useState(null);

  const { data, isLoading } = useQuery(
    ['products', page, search, status],
    () => productsApi.list({ page, limit: 20, search, status }),
    { keepPreviousData: true }
  );

  const { data: stats } = useQuery('product-stats', productsApi.stats);

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
            <Text>{syncMsg}</Text>
          </Banner>
        )}

        {/* Stats — 4 cards in one row */}
        {stats && (
          <InlineGrid columns={4} gap="400">
            {[
              { label: 'Total Products', value: stats.total },
              { label: 'Active',         value: stats.active },
              { label: 'Draft',          value: stats.draft },
              { label: 'Total Variants', value: stats.variants },
            ].map(s => (
              <Card key={s.label}>
                <BlockStack gap="100" inlineAlign="center">
                  <Text variant="headingXl" fontWeight="bold">{s.value ?? 0}</Text>
                  <Text variant="bodySm" tone="subdued">{s.label}</Text>
                </BlockStack>
              </Card>
            ))}
          </InlineGrid>
        )}

        {/* Product list + filters in one card */}
        <Card padding="0">
          {/* Toolbar */}
          <Box padding="400" borderBlockEndWidth="025" borderColor="border">
            <InlineStack gap="300" blockAlign="center" wrap={false}>
              {/* Search takes all remaining space */}
              <div style={{ flex: 1 }}>
                <TextField
                  label="Search"
                  labelHidden
                  placeholder="Search by title, vendor, type..."
                  value={search}
                  onChange={v => { setSearch(v); setPage(1); }}
                  clearButton
                  onClearButtonClick={() => { setSearch(''); setPage(1); }}
                  autoComplete="off"
                  prefix={<Icon source={SearchIcon} />}
                />
              </div>
              {/* Status filter — fixed width */}
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
              {/* Result count */}
              {data?.total != null && (
                <Text variant="bodySm" tone="subdued" whiteSpace="nowrap">
                  {data.total} product{data.total !== 1 ? 's' : ''}
                </Text>
              )}
            </InlineStack>
          </Box>

          {isLoading ? (
            <Box padding="800" textAlign="center"><Spinner /></Box>
          ) : !data?.products?.length ? (
            <EmptyState
              heading="No products found"
              action={{ content: 'Sync from Shopify', onAction: () => syncMutation.mutate(), loading: syncMutation.isLoading }}
              image="https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-collection-2_large.png"
            >
              <Text>{search || status ? 'Try a different search or filter.' : 'Click "Sync from Shopify" to import all your products and variants.'}</Text>
            </EmptyState>
          ) : (
            <>
              {data.products.map(p => <ProductRow key={p.id} product={p} />)}
              {data.pages > 1 && (
                <Box padding="400" borderBlockStartWidth="025" borderColor="border">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="bodySm" tone="subdued">
                      Page {page} of {data.pages}
                    </Text>
                    <Pagination
                      hasPrevious={page > 1}
                      onPrevious={() => setPage(p => p - 1)}
                      hasNext={page < data.pages}
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
