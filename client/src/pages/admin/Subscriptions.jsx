import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Page, Card, IndexTable, Text, Badge, Select, InlineStack,
  Box, Pagination, BlockStack, Spinner, Toast,
} from '@shopify/polaris';
import { adminApi } from '../../api';

const STATUS_TONES = {
  active: 'success', trial: 'info', pending: 'warning',
  cancelled: 'critical', expired: 'subdued', frozen: 'attention',
};

const STATUS_OPTIONS = [
  { label: 'All Status', value: '' },
  { label: 'Active', value: 'active' },
  { label: 'Trial', value: 'trial' },
  { label: 'Pending', value: 'pending' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'Expired', value: 'expired' },
  { label: 'Frozen', value: 'frozen' },
];

export default function AdminSubscriptions() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [toast, setToast] = useState(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(
    ['admin-subscriptions', page, status],
    () => adminApi.subscriptions({ page, limit: 20, status }),
    { keepPreviousData: true }
  );

  const { data: plans = [] } = useQuery('admin-plans', adminApi.plans);

  const planOptions = [
    { label: 'Change plan...', value: '' },
    ...plans.map(p => ({ label: p.name, value: String(p.id) })),
  ];

  const updateStatusMutation = useMutation(
    ({ id, status: s }) => adminApi.updateSubscription(id, { status: s }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('admin-subscriptions');
        setToast({ message: 'Status updated', error: false });
      },
      onError: () => setToast({ message: 'Failed to update status', error: true }),
    }
  );

  const changePlanMutation = useMutation(
    ({ id, plan_id }) => adminApi.updateSubscription(id, { plan_id: parseInt(plan_id), status: 'active' }),
    {
      onSuccess: (_, vars) => {
        queryClient.invalidateQueries('admin-subscriptions');
        const planName = plans.find(p => String(p.id) === String(vars.plan_id))?.name || 'plan';
        setToast({ message: `Plan changed to ${planName}`, error: false });
      },
      onError: () => setToast({ message: 'Failed to change plan', error: true }),
    }
  );

  const subs = data?.subscriptions || [];
  const total = data?.total || 0;

  return (
    <Page title="Subscriptions" subtitle={`${total} total subscriptions`}>
      {toast && (
        <Toast
          content={toast.message}
          error={toast.error}
          onDismiss={() => setToast(null)}
        />
      )}

      <BlockStack gap="400">
        {/* Filter */}
        <Card>
          <Box padding="300">
            <InlineStack blockAlign="end">
              <div style={{ minWidth: 200 }}>
                <Select
                  label="Filter by status"
                  labelHidden
                  value={status}
                  onChange={v => { setStatus(v); setPage(1); }}
                  options={STATUS_OPTIONS}
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
              resourceName={{ singular: 'subscription', plural: 'subscriptions' }}
              itemCount={subs.length}
              headings={[
                { title: 'Shop' },
                { title: 'Plan' },
                { title: 'Status' },
                { title: 'Trial Ends' },
                { title: 'Period End' },
                { title: 'Change Plan' },
                { title: 'Change Status' },
              ]}
              selectable={false}
            >
              {subs.map((sub, index) => (
                <IndexTable.Row id={String(sub.id)} key={sub.id} position={index}>
                  <IndexTable.Cell>
                    <Text variant="bodyMd" fontWeight="semibold">
                      {sub.Shop?.shop_domain || '—'}
                    </Text>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <span style={{
                      display: 'inline-block', padding: '2px 10px', borderRadius: 20,
                      fontSize: 12, fontWeight: 600,
                      background: sub.plan?.slug === 'pro' ? '#fef7f0' : sub.plan?.slug === 'growth' ? '#f4f5fa' : '#f6f6f7',
                      color: sub.plan?.slug === 'pro' ? '#f49342' : sub.plan?.slug === 'growth' ? '#1a1a1a' : '#6d7175',
                      border: `1px solid ${sub.plan?.slug === 'pro' ? '#f49342' : sub.plan?.slug === 'growth' ? '#1a1a1a' : '#e1e3e5'}`,
                    }}>
                      {sub.plan?.name || '—'}
                    </span>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Badge tone={STATUS_TONES[sub.status] || 'base'}>
                      {sub.status}
                    </Badge>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Text variant="bodySm" tone="subdued">
                      {sub.trial_ends_at ? new Date(sub.trial_ends_at).toLocaleDateString() : '—'}
                    </Text>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Text variant="bodySm" tone="subdued">
                      {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : '—'}
                    </Text>
                  </IndexTable.Cell>

                  {/* Change Plan dropdown */}
                  <IndexTable.Cell>
                    <div style={{ minWidth: 160 }}>
                      <Select
                        label="Change plan"
                        labelHidden
                        value=""
                        onChange={v => {
                          if (v && String(v) !== String(sub.plan_id)) {
                            changePlanMutation.mutate({ id: sub.id, plan_id: v });
                          }
                        }}
                        options={planOptions.filter(o => !o.value || String(o.value) !== String(sub.plan_id))}
                        disabled={changePlanMutation.isLoading}
                      />
                    </div>
                  </IndexTable.Cell>

                  {/* Change Status dropdown */}
                  <IndexTable.Cell>
                    <div style={{ minWidth: 140 }}>
                      <Select
                        label="Change status"
                        labelHidden
                        value=""
                        onChange={v => { if (v) updateStatusMutation.mutate({ id: sub.id, status: v }); }}
                        options={[
                          { label: 'Change to...', value: '' },
                          ...STATUS_OPTIONS.filter(o => o.value && o.value !== sub.status),
                        ]}
                        disabled={updateStatusMutation.isLoading}
                      />
                    </div>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}

          <Box padding="300" borderBlockStartWidth="025" borderColor="border">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="bodySm" tone="subdued">{total} total · Page {page}</Text>
              <Pagination
                hasPrevious={page > 1}
                onPrevious={() => setPage(p => p - 1)}
                hasNext={subs.length === 20}
                onNext={() => setPage(p => p + 1)}
              />
            </InlineStack>
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}
