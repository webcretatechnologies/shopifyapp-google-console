import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import {
  Page, Text, Badge, BlockStack,
  InlineStack, Box, Spinner, Banner, Button,
} from '@shopify/polaris';
import { billingApi } from '../api';
import { useShop } from '../context/ShopContext';

const PLAN_RANK = { starter: 0, growth: 1, pro: 2 };

function planAction(plan, currentSlug) {
  if (plan.slug === currentSlug) return { label: 'Current Plan', kind: 'current' };
  const isFree = parseFloat(plan.price) === 0;
  if (!currentSlug || currentSlug === 'starter') {
    return {
      label: isFree ? 'Start for Free' : `Start ${plan.trial_days > 0 ? 'Free Trial' : 'Plan'}`,
      kind: 'subscribe',
    };
  }
  const currentRank = PLAN_RANK[currentSlug] ?? 0;
  const targetRank = PLAN_RANK[plan.slug] ?? 0;
  if (targetRank > currentRank) return { label: `Upgrade to ${plan.name}`, kind: 'upgrade' };
  return { label: `Downgrade to ${plan.name}`, kind: 'downgrade' };
}

// Map our action kinds → Polaris Button variants
const actionVariant = {
  current:   'secondary',  // disabled
  subscribe: 'primary',
  upgrade:   'primary',
  downgrade: 'secondary',
};

function PlanCard({ plan, currentSub, onSelect, loading }) {
  const isCurrent = currentSub?.plan?.slug === plan.slug;
  const isFree = parseFloat(plan.price) === 0;
  const action = planAction(plan, currentSub?.plan?.slug);

  let features = [];
  try {
    const raw = plan.features;
    features = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
  } catch { features = []; }

  const monthly = parseFloat(plan.price) || 0;

  return (
    <div
      style={{
        background: 'var(--p-color-bg-surface)',
        border: isCurrent
          ? '2px solid var(--p-color-text)'
          : '1px solid var(--p-color-border)',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxShadow: isCurrent ? '0 1px 0 rgba(0,0,0,0.04)' : 'none',
      }}
    >
      {/* Header / pricing / features */}
      <div style={{ padding: '20px 20px 24px', flex: 1 }}>
        <BlockStack gap="400">
          <BlockStack gap="200">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="bodyLg" fontWeight="medium" as="h3">{plan.name}</Text>
              {isCurrent && <Badge tone="success">Current plan</Badge>}
            </InlineStack>

            <InlineStack gap="100" blockAlign="baseline">
              <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1, color: 'var(--p-color-text)' }}>
                {isFree ? 'Free' : `$${monthly.toFixed(monthly % 1 ? 2 : 0)}`}
              </span>
              {!isFree && (
                <span style={{ fontSize: 14, color: 'var(--p-color-text-secondary)' }}>/ month</span>
              )}
            </InlineStack>

          </BlockStack>

          {/* Features */}
          <BlockStack gap="200">
            <Text variant="bodyMd" fontWeight="semibold" as="h4">Features</Text>
            <BlockStack gap="100">
              {features.length === 0 && (
                <Text variant="bodySm" tone="subdued">All core features included</Text>
              )}
              {features.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ color: 'var(--p-color-text)', fontSize: 13, lineHeight: '20px' }}>✓</span>
                  <span style={{ fontSize: 13, lineHeight: '20px', color: 'var(--p-color-text)' }}>{f}</span>
                </div>
              ))}
            </BlockStack>
          </BlockStack>

          {/* CTA — hidden if it's the current plan */}
          {!isCurrent && (
            <Button
              variant={actionVariant[action.kind]}
              loading={loading}
              onClick={() => onSelect(plan, action.kind)}
              fullWidth
            >
              {action.label}
            </Button>
          )}
        </BlockStack>
      </div>

      {/* Footer */}
      <div style={{
        padding: '14px 20px',
        borderTop: '1px solid var(--p-color-border-secondary)',
        background: 'var(--p-color-bg-surface-secondary)',
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
      }}>
        <span style={{ fontSize: 13, color: 'var(--p-color-text-secondary)' }}>
          {plan.trial_days > 0 ? `${plan.trial_days}-day free trial` : 'No free trial'}
        </span>
      </div>
    </div>
  );
}

export default function Billing() {
  const [activating, setActivating] = useState(null);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { refreshSubscription } = useShop();

  const { data: plans = [], isLoading: plansLoading } = useQuery(
    'billing-plans',
    billingApi.plans,
  );
  const { data: currentSub, isLoading: subLoading, refetch: refetchSub } = useQuery(
    'billing-subscription',
    billingApi.subscription,
    { retry: false },
  );

  const hasActive = currentSub && ['active', 'trial'].includes(currentSub.status);

  const subscribeMutation = useMutation(
    (plan_id) => billingApi.subscribe(plan_id),
    {
      onSuccess: async (data) => {
        if (data?.confirmationUrl) {
          // Paid plan — Shopify needs the user out of the iframe to approve.
          window.top.location.href = data.confirmationUrl;
          return;
        }
        // Free / trial plan activated immediately. Refresh both the local
        // billing query and the global ShopContext so the dashboard renders
        // against the new plan, then bounce to it.
        await refetchSub();
        try { await refreshSubscription(); } catch {}
        queryClient.invalidateQueries('billing-subscription');
        setActivating(null);
        setConfirm(null);
        navigate('/' + window.location.search);
      },
      onError: (err) => {
        setError(err?.error || 'Failed to update plan. Please try again.');
        setActivating(null);
        setConfirm(null);
      },
    }
  );

  const handleSelect = (plan, actionKind) => {
    setError(null);
    if (actionKind === 'downgrade') {
      setConfirm({ plan, actionKind });
      return;
    }
    setActivating(plan.id);
    subscribeMutation.mutate(plan.id);
  };

  const confirmDowngrade = () => {
    if (!confirm) return;
    setActivating(confirm.plan.id);
    subscribeMutation.mutate(confirm.plan.id);
  };

  if (plansLoading || subLoading) {
    return (
      <Page>
        <Box padding="1600">
          <InlineStack align="center"><Spinner size="large" /></InlineStack>
        </Box>
      </Page>
    );
  }

  return (
    <Page
      title="Plan & Billing"
      subtitle={hasActive
        ? `You're currently on the ${currentSub.plan?.name} plan. Upgrade for more features or downgrade anytime.`
        : 'Get started free — upgrade anytime. No credit card required for the free plan.'
      }
    >
      <BlockStack gap="500">
        {error && (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            <Text>{error}</Text>
          </Banner>
        )}

        {hasActive && (
          <Banner tone="success" title={`Active: ${currentSub.plan?.name} plan`}>
            <Text variant="bodySm">
              Status: <strong>{currentSub.status}</strong>
              {currentSub.trial_ends_at && ` · Trial ends ${new Date(currentSub.trial_ends_at).toLocaleDateString()}`}
              {currentSub.current_period_end && ` · Renews ${new Date(currentSub.current_period_end).toLocaleDateString()}`}
            </Text>
          </Banner>
        )}

        {confirm && (
          <Banner
            tone="warning"
            title={`Confirm downgrade to ${confirm.plan.name}?`}
            action={{
              content: activating ? 'Processing…' : `Yes, downgrade to ${confirm.plan.name}`,
              onAction: confirmDowngrade,
              disabled: !!activating,
            }}
            secondaryAction={{
              content: 'Cancel',
              onAction: () => setConfirm(null),
            }}
            onDismiss={() => setConfirm(null)}
          >
            <Text variant="bodySm">
              Features only available on {currentSub.plan?.name} will be locked. Your existing data is kept,
              but gated reports, exports, and integrations will show an upgrade prompt until you re-subscribe.
            </Text>
          </Banner>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(280px, 1fr))`,
          gap: 16,
          alignItems: 'stretch',
        }}>
          {plans.map(plan => (
            <PlanCard
              key={plan.id}
              plan={plan}
              currentSub={currentSub}
              onSelect={handleSelect}
              loading={activating === plan.id && subscribeMutation.isLoading}
            />
          ))}
        </div>

        <Text variant="bodySm" tone="subdued" alignment="center">
          All charges are billed in USD. Recurring charges renew every 30 days.
        </Text>
      </BlockStack>
    </Page>
  );
}
