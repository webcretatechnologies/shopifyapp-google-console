import React from 'react';
import { Banner, Text } from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';

const KIND_NOUN = {
  products: 'products',
  orders:   'orders',
  keywords: 'keywords',
};

// Inline upgrade banner shown when a list has been capped to the plan's limit.
// `limit` — the per-plan cap (0/null = no cap → renders nothing)
// `total` — total available in DB (omit if unknown)
// `kind`  — 'products' | 'orders' | 'keywords'
export default function PlanLimitBanner({ limit, total, kind = 'products' }) {
  const navigate = useNavigate();
  const noun = KIND_NOUN[kind] || kind;
  if (!limit || limit <= 0) return null;
  if (typeof total === 'number' && total <= limit) return null;
  const qs = window.location.search;
  return (
    <Banner
      tone="info"
      title={`Showing first ${limit} ${noun} (your plan limit)`}
      action={{ content: 'Upgrade plan', onAction: () => navigate('/billing' + qs) }}
    >
      <Text as="p">
        {typeof total === 'number'
          ? `You have ${total.toLocaleString()} ${noun} synced. Upgrade to see all.`
          : `Upgrade to see more than ${limit} ${noun}.`}
      </Text>
    </Banner>
  );
}
