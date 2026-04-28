import React, { useState } from 'react';
import { useQuery, useMutation } from 'react-query';
import {
  Page, Layout, Card, Text, Badge, BlockStack,
  InlineStack, Box, Divider, Spinner, Banner, Button,
} from '@shopify/polaris';
import { billingApi } from '../api';

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

  return (
    <Card>
      <Box padding="500">
        <BlockStack gap="400">
          <BlockStack gap="100">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingMd" fontWeight="bold">{plan.name}</Text>
              {isCurrent && <Badge tone="success">Current</Badge>}
            </InlineStack>
            <InlineStack gap="100" blockAlign="baseline">
              <Text variant="headingXl" fontWeight="bold">
                {isFree ? 'Free' : `$${parseFloat(plan.price).toFixed(2)}`}
              </Text>
              {!isFree && <Text variant="bodyMd" tone="subdued">/ month</Text>}
            </InlineStack>
            {plan.trial_days > 0 && !isCurrent && (
              <Text variant="bodySm" tone="success">{plan.trial_days}-day free trial included</Text>
            )}
          </BlockStack>

          <Divider />

          <BlockStack gap="150">
            {features.map((f, i) => (
              <InlineStack key={i} gap="150" blockAlign="start">
                <Text tone="success">✓</Text>
                <Text variant="bodySm">{f}</Text>
              </InlineStack>
            ))}
            {features.length === 0 && (
              <Text variant="bodySm" tone="subdued">All core features included</Text>
            )}
          </BlockStack>

          <Button
            variant={actionVariant[action.kind]}
            disabled={action.kind === 'current'}
            loading={loading}
            onClick={() => action.kind !== 'current' && onSelect(plan, action.kind)}
            fullWidth
          >
            {action.label}
          </Button>
        </BlockStack>
      </Box>
    </Card>
  );
}

export default function Billing() {
  const [activating, setActivating] = useState(null);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);

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
      onSuccess: (data) => {
        if (data?.confirmationUrl) {
          window.top.location.href = data.confirmationUrl;
        } else {
          refetchSub();
          setActivating(null);
          setConfirm(null);
        }
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

        <Layout>
          {plans.map(plan => (
            <Layout.Section key={plan.id} variant="oneThird">
              <PlanCard
                plan={plan}
                currentSub={currentSub}
                onSelect={handleSelect}
                loading={activating === plan.id && subscribeMutation.isLoading}
              />
            </Layout.Section>
          ))}
        </Layout>
      </BlockStack>
    </Page>
  );
}
