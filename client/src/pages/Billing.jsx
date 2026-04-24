import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'react-query';
import {
  Page, Layout, Card, Text, Button, Badge, BlockStack,
  InlineStack, Box, Divider, Spinner, Banner,
} from '@shopify/polaris';
import { billingApi } from '../api';

function PlanCard({ plan, currentSub, onSelect, loading }) {
  const isCurrent = currentSub?.plan?.slug === plan.slug;
  const isFree = parseFloat(plan.price) === 0;

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
            variant={isCurrent ? 'secondary' : 'primary'}
            disabled={isCurrent}
            loading={loading}
            onClick={() => !isCurrent && onSelect(plan)}
            fullWidth
          >
            {isCurrent ? 'Current Plan' : isFree ? 'Start for Free' : `Start ${plan.trial_days > 0 ? 'Free Trial' : 'Plan'}`}
          </Button>
        </BlockStack>
      </Box>
    </Card>
  );
}

export default function Billing() {
  const [activating, setActivating] = useState(null);
  const [error, setError] = useState(null);

  const { data: plans = [], isLoading: plansLoading } = useQuery(
    'billing-plans',
    billingApi.plans,
  );

  const { data: currentSub, isLoading: subLoading } = useQuery(
    'billing-subscription',
    billingApi.subscription,
    { retry: false },
  );

  const hasActive = currentSub && ['active', 'trial'].includes(currentSub.status);

  // Auto-redirect to dashboard if already subscribed
  useEffect(() => {
    if (!hasActive) return;
    const shop = new URLSearchParams(window.location.search).get('shop') || sessionStorage.getItem('shop');
    const host = new URLSearchParams(window.location.search).get('host') || '';
    const timer = setTimeout(() => {
      window.location.href = `/?shop=${shop}&host=${host}`;
    }, 1500);
    return () => clearTimeout(timer);
  }, [hasActive]);

  const subscribeMutation = useMutation(
    (plan_id) => billingApi.subscribe(plan_id),
    {
      onSuccess: (data) => {
        if (data?.confirmationUrl) {
          // Paid plan — redirect to Shopify billing confirmation
          window.top.location.href = data.confirmationUrl;
        } else {
          // Free plan — reload app
          const shop = new URLSearchParams(window.location.search).get('shop')
            || sessionStorage.getItem('shop');
          const host = new URLSearchParams(window.location.search).get('host') || '';
          window.location.href = `/?shop=${shop}&host=${host}`;
        }
      },
      onError: (err) => setError(err?.error || 'Failed to activate plan. Please try again.'),
      onSettled: () => setActivating(null),
    }
  );

  const handleSelect = (plan) => {
    setError(null);
    setActivating(plan.id);
    subscribeMutation.mutate(plan.id);
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

  // Already subscribed — show redirect message
  if (hasActive) {
    const shop = new URLSearchParams(window.location.search).get('shop') || sessionStorage.getItem('shop');
    const host = new URLSearchParams(window.location.search).get('host') || '';
    return (
      <Page>
        <Box padding="1600">
          <BlockStack gap="400" align="center">
            <InlineStack align="center">
              <div style={{ textAlign: 'center' }}>
                <Text variant="headingLg" fontWeight="bold">You're already on the {currentSub.plan?.name} plan</Text>
                <Box paddingBlockStart="200">
                  <Text variant="bodySm" tone="subdued">Redirecting to your dashboard...</Text>
                </Box>
              </div>
            </InlineStack>
            <InlineStack align="center">
              <Button variant="primary" onClick={() => { window.location.href = `/?shop=${shop}&host=${host}`; }}>
                Go to Dashboard
              </Button>
            </InlineStack>
          </BlockStack>
        </Box>
      </Page>
    );
  }

  return (
    <Page
      title="Choose Your Plan"
      subtitle="Get started free — upgrade anytime. No credit card required for the free plan."
    >
      <BlockStack gap="500">
        {error && (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            <Text>{error}</Text>
          </Banner>
        )}

        {hasActive && (
          <Banner tone="success" title={`You're on the ${currentSub.plan?.name} plan`}>
            <Text variant="bodySm">
              Status: <strong>{currentSub.status}</strong>
              {currentSub.trial_ends_at && ` · Trial ends ${new Date(currentSub.trial_ends_at).toLocaleDateString()}`}
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
