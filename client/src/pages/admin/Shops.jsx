import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Page, Card, IndexTable, Text, Badge, Button, TextField,
  Select, InlineStack, Box, Pagination, BlockStack, Spinner,
} from '@shopify/polaris';
import { adminApi } from '../../api';

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
                    <Button
                      size="slim"
                      tone={shop.is_active ? 'critical' : undefined}
                      onClick={() => toggleMutation.mutate({ id: shop.id, is_active: !shop.is_active })}
                      loading={toggleMutation.isLoading}
                    >
                      {shop.is_active ? 'Deactivate' : 'Activate'}
                    </Button>
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
    </Page>
  );
}
