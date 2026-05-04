import React from 'react';
import {
  Card, Text, Button, BlockStack, Box, Spinner, Badge,
} from '@shopify/polaris';
import { LockIcon } from '@shopify/polaris-icons';
import { useNavigate } from 'react-router-dom';
import { usePlan } from '../hooks/usePlan';

const PLAN_LABEL = {
  growth: 'Growth Plan',
  pro:    'Pro Plan',
};

/**
 * Wraps content that requires a higher plan.
 * Props:
 *   feature   — key from usePlan().features to check (e.g. 'ads')
 *   required  — plan slug required: 'growth' | 'pro'
 *   children  — content shown when user has access
 *   compact   — render inline badge instead of full upgrade card (for buttons)
 */
export default function PlanGate({ feature, required = 'growth', children, compact = false }) {
  const { can, slug, loading } = usePlan();
  const navigate = useNavigate();
  const qs = window.location.search;

  // While the subscription is still loading from the API, don't flash the
  // upgrade card — the slug defaults to 'starter' until the response arrives,
  // which would briefly gate Pro users out of their own pages.
  if (loading) {
    if (compact) return null;
    return (
      <Box paddingBlock="800">
        <BlockStack gap="200" inlineAlign="center">
          <Spinner size="small" />
        </BlockStack>
      </Box>
    );
  }

  // If user has access, render children normally
  if (can(feature)) return children;

  const requiredLabel = PLAN_LABEL[required] || PLAN_LABEL.growth;

  // Compact mode — small inline badge (used inside buttons / cells)
  if (compact) {
    return (
      <Box>
        <Button
          variant="plain"
          icon={LockIcon}
          onClick={() => navigate('/billing' + qs)}
        >
          {children} — {requiredLabel}
        </Button>
      </Box>
    );
  }

  // Full upgrade card — always rendered in normal flow so it works regardless
  // of whether children is empty/dummy or contains real content.
  return (
    <Card>
      <Box paddingBlock="800" paddingInline="400">
        <BlockStack gap="400" inlineAlign="center">
          <Box>
            <Badge tone="attention" icon={LockIcon}>{requiredLabel} required</Badge>
          </Box>
          <Text variant="headingLg" as="h2" alignment="center">
            {requiredLabel} required
          </Text>
          <Box maxWidth="440px">
            <Text variant="bodyMd" as="p" tone="subdued" alignment="center">
              This feature isn't available on your current <strong>{slug}</strong> plan.
              Upgrade to {requiredLabel} to unlock it.
            </Text>
          </Box>
          <Button
            variant="primary"
            onClick={() => navigate('/billing' + qs)}
          >
            View plans &amp; upgrade
          </Button>
        </BlockStack>
      </Box>
    </Card>
  );
}
