import React, { useState } from 'react';
import {
  Page, Card, BlockStack, InlineStack, InlineGrid, Box, Text,
  Badge, Button, Divider, Icon, Collapsible, Banner,
} from '@shopify/polaris';
import {
  HomeIcon, ProductIcon, AlertCircleIcon, SearchIcon,
  ChartVerticalIcon, MegaphoneIcon, ConnectIcon, SettingsIcon,
  ChevronDownIcon, ChevronUpIcon, QuestionCircleIcon,
} from '@shopify/polaris-icons';
import { useNavigate, Link } from 'react-router-dom';

// ── Feature cards ─────────────────────────────────────────────────────────────
const features = [
  {
    icon: HomeIcon,
    title: 'Dashboard',
    color: '#1a1a1a',
    bg: '#f4f5fa',
    description: 'Overview of your store performance. Shows total sessions, users, and ranked keywords from Google Analytics & Search Console.',
    howTo: 'Connect your Google account first. Once connected, the dashboard auto-refreshes daily with the latest 30-day data.',
  },
  {
    icon: ProductIcon,
    title: 'Products',
    color: '#008060',
    bg: '#f1f8f5',
    description: 'All your Shopify products synced into the app with full variant details — SKU, price, inventory, barcode.',
    howTo: 'Click "Sync from Shopify" to import all products. After that, any product created, updated or deleted in Shopify automatically syncs via webhooks in real time.',
  },
  {
    icon: AlertCircleIcon,
    title: 'Insights',
    color: '#de3618',
    bg: '#fdf3f1',
    description: '4 powerful insight tabs: Stock Alerts, Product SEO Report, SEO Suggestions, and Ads→Orders attribution.',
    howTo: [
      'Stock Alerts — auto-generated from your inventory + Search Console traffic. No setup needed after products are synced.',
      'Product SEO Report — requires Google Search Console connected + daily sync run.',
      'SEO Suggestions — same as above, suggests title/description improvements.',
      'Ads→Orders — click "Sync Orders from Shopify" to import orders, then Google Ads campaigns with UTM tracking will show revenue attribution.',
    ],
  },
  {
    icon: SearchIcon,
    title: 'SEO',
    color: '#1a1a1a',
    bg: '#f4f5fa',
    description: 'Keyword rankings and search traffic from Google Search Console. See which keywords bring traffic to your store.',
    howTo: 'Connect Google → enter your Search Console property URL in API Settings → wait for the daily sync at 2 AM UTC (or reconnect Google to trigger a sync).',
  },
  {
    icon: ChartVerticalIcon,
    title: 'Analytics',
    color: '#50b83c',
    bg: '#f2faf0',
    description: 'Google Analytics 4 data — sessions, users, new users, top pages, countries, and traffic sources.',
    howTo: 'Connect Google → enter your GA4 Property ID in API Settings (found in GA4 Admin → Property Settings).',
  },
  {
    icon: MegaphoneIcon,
    title: 'Google Ads',
    color: '#f49342',
    bg: '#fef7f0',
    description: 'Campaign performance from Google Ads — impressions, clicks, cost, conversions, and ROAS.',
    howTo: 'Connect Google → enter your Google Ads Customer ID (10-digit number shown in the top-right of your Ads account).',
  },
  {
    icon: ConnectIcon,
    title: 'Connect Google',
    color: '#47c1bf',
    bg: '#f0fafb',
    description: 'Link your Google account to the app. One-click OAuth connects Analytics, Search Console, and Ads.',
    howTo: 'Click "Connect Google Account" → sign in with your Google account → grant permissions. Your account stays connected until you disconnect.',
  },
  {
    icon: SettingsIcon,
    title: 'API Settings',
    color: '#6d7175',
    bg: '#f9fafb',
    description: 'Configure your GA4 Property ID, Search Console URL, and Google Ads Customer ID so data can be fetched.',
    howTo: [
      'GA4 Property ID — e.g. 123456789 (found in GA4 Admin → Property Settings)',
      'Search Console Property URL — e.g. https://yourstore.com (must be verified in Search Console)',
      'Google Ads Customer ID — 10-digit number (top-right of Google Ads account)',
    ],
  },
];

// ── FAQ ───────────────────────────────────────────────────────────────────────
const faqs = [
  {
    q: 'Why is my data showing 0 / empty?',
    a: 'Data is fetched from Google APIs and cached once per day at 2 AM UTC. If you just connected your account, wait for the next sync or reconnect Google to trigger an immediate fetch. Also make sure your GA4 Property ID and Search Console URL are saved in API Settings.',
  },
  {
    q: 'Why does order sync show 403 error?',
    a: 'The app needs the "read_orders" permission. Click "Sync Orders from Shopify" — a yellow banner will appear with a "Re-authorize App" button. Click it, approve the new permission in Shopify, and then sync again.',
  },
  {
    q: 'How often does data update automatically?',
    a: 'Google Analytics, Search Console, and Ads data syncs once daily at 2 AM UTC. Products sync in real time via Shopify webhooks (create/update/delete). New Shopify orders sync via webhook as soon as they are placed.',
  },
  {
    q: 'What is the Stock Alerts feature?',
    a: 'Stock Alerts cross-references your product inventory (from Shopify) with Google Search Console click data. If a product is getting Google traffic but has low or zero inventory, it shows as an alert — so you know which products to restock first to maximize your SEO investment.',
  },
  {
    q: 'How does Ads→Orders attribution work?',
    a: 'When a customer clicks a Google Ad and lands on your store, Shopify records the landing URL including UTM parameters (utm_source=google, utm_medium=cpc, utm_campaign=...). The app reads these from each order and groups revenue by campaign, so you can see which Google Ads campaigns actually generate sales.',
  },
  {
    q: 'Do I need to set up my own Google Cloud project?',
    a: 'The app comes with built-in Google credentials — you do NOT need to create your own Google Cloud project unless you want to use custom credentials. Just click "Connect Google" and sign in. If you want per-shop credentials for more quota, follow the Setup Guide.',
  },
  {
    q: 'Why does Search Console show no data for some products?',
    a: 'Search Console only shows data for pages Google has crawled and indexed. If a product page has never appeared in Google search results, it will have no data. New products typically take 4–12 weeks to get indexed and accumulate data.',
  },
  {
    q: 'How do I disconnect Google?',
    a: 'Go to Connect Google → click "Disconnect". This removes your Google account from the app. Your historical cached data is kept but live data fetching stops until you reconnect.',
  },
  {
    q: 'Can multiple team members use this app?',
    a: 'Yes — anyone with access to the Shopify admin can use the app. The Google connection is per-store (not per-user), so all admins see the same Google data.',
  },
  {
    q: 'What data does this app store?',
    a: 'The app stores: your Shopify products and variants (for insights), orders (for ads attribution), and a daily cache of your Google Analytics/Search Console/Ads data. No personal customer data beyond what Shopify provides in the order record is stored.',
  },
];

function FAQItem({ faq, index }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid #e1e3e5' }}>
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          padding: '14px 20px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          background: open ? '#f9fafb' : 'transparent',
          transition: 'background 0.15s',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 14, color: '#202223', flex: 1 }}>{faq.q}</span>
        <span style={{ flexShrink: 0, color: '#6d7175', fontSize: 18, lineHeight: 1 }}>
          {open ? '−' : '+'}
        </span>
      </div>
      <Collapsible open={open} id={`faq-${index}`}>
        <div style={{ padding: '4px 20px 16px', color: '#6d7175', fontSize: 13, lineHeight: 1.7, borderTop: '1px solid #f1f2f3' }}>
          {faq.a}
        </div>
      </Collapsible>
    </div>
  );
}

function FeatureCard({ feature }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack gap="300" blockAlign="center">
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: feature.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Icon source={feature.icon} />
          </div>
          <BlockStack gap="050">
            <Text variant="headingSm" fontWeight="bold">{feature.title}</Text>
            <Text variant="bodySm" tone="subdued">{feature.description}</Text>
          </BlockStack>
        </InlineStack>
        <Button size="slim" variant="plain" onClick={() => setOpen(v => !v)}>
          {open ? 'Hide how to use' : 'How to use →'}
        </Button>
        <Collapsible open={open} id={`feat-${feature.title.replace(/\s+/g, '-').toLowerCase()}`}>
          <Box background="bg-surface-secondary" padding="300" borderRadius="200">
            {Array.isArray(feature.howTo) ? (
              <BlockStack gap="150">
                {feature.howTo.map((step, i) => (
                  <InlineStack key={i} gap="200" blockAlign="start">
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: feature.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                      {i + 1}
                    </div>
                    <Text variant="bodySm">{step}</Text>
                  </InlineStack>
                ))}
              </BlockStack>
            ) : (
              <Text variant="bodySm">{feature.howTo}</Text>
            )}
          </Box>
        </Collapsible>
      </BlockStack>
    </Card>
  );
}

export default function Help() {
  const navigate = useNavigate();
  const qs = window.location.search;

  return (
    <Page title="Help & Guide" subtitle="Learn how to use every feature of this app">
      <BlockStack gap="600">

        {/* What is this app */}
        <Card>
          <BlockStack gap="400">
            <InlineStack gap="300" blockAlign="center">
              <div style={{ width: 48, height: 48, borderRadius: 12, background: '#f4f5fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon source={QuestionCircleIcon} />
              </div>
              <BlockStack gap="050">
                <Text variant="headingLg" fontWeight="bold">What does this app do?</Text>
                <Text variant="bodySm" tone="subdued">Google Analytics + Search Console + Ads — all inside Shopify</Text>
              </BlockStack>
            </InlineStack>
            <Divider />
            <Text variant="bodyMd">
              This app connects your Shopify store to your Google account and brings all your marketing performance data into one place inside Shopify admin. Instead of switching between Google Analytics, Search Console, and Google Ads tabs, you see everything together — alongside your actual product inventory.
            </Text>
            <InlineGrid columns={3} gap="400">
              {[
                { emoji: '📊', title: 'Google Analytics 4', desc: 'Sessions, users, traffic sources, top pages, countries' },
                { emoji: '🔍', title: 'Search Console', desc: 'Keyword rankings, impressions, CTR, position in Google' },
                { emoji: '📢', title: 'Google Ads', desc: 'Campaign performance, ROAS, cost, conversions' },
              ].map(f => (
                <Box key={f.title} background="bg-surface-secondary" padding="400" borderRadius="300">
                  <BlockStack gap="200" inlineAlign="center">
                    <Text variant="headingXl">{f.emoji}</Text>
                    <Text variant="headingSm" fontWeight="bold" alignment="center">{f.title}</Text>
                    <Text variant="bodySm" tone="subdued" alignment="center">{f.desc}</Text>
                  </BlockStack>
                </Box>
              ))}
            </InlineGrid>
            <Banner tone="info">
              <Text variant="bodySm">
                <strong>Quick start:</strong> Go to <strong>Connect Google</strong> → sign in with your Google account → then go to <strong>API Settings</strong> and enter your GA4 Property ID and Search Console URL. Data will appear within 24 hours.
              </Text>
            </Banner>
          </BlockStack>
        </Card>

        {/* How to get started — checklist */}
        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" fontWeight="bold">Getting Started Checklist</Text>
            <Divider />
            {[
              { step: 1, title: 'Install the app',           done: true,  desc: 'You are here! The app is installed on your Shopify store.' },
              { step: 2, title: 'Connect Google Account',    done: false, desc: 'Go to Connect Google → click "Connect Google Account" and sign in.', action: { label: 'Connect Google', path: '/connect-google' } },
              { step: 3, title: 'Enter API Settings',        done: false, desc: 'Go to API Settings → enter your GA4 Property ID and Search Console property URL.', action: { label: 'Open Settings', path: '/settings' } },
              { step: 4, title: 'Sync your Products',        done: false, desc: 'Go to Products → click "Sync from Shopify" to import all products.', action: { label: 'Go to Products', path: '/products' } },
              { step: 5, title: 'Wait for first data sync',  done: false, desc: 'Analytics data syncs daily at 2 AM UTC. Check back tomorrow to see your data.' },
              { step: 6, title: 'Explore Insights',          done: false, desc: 'Go to Insights to see stock alerts, SEO suggestions, and order attribution.', action: { label: 'Open Insights', path: '/insights' } },
            ].map(item => (
              <InlineStack key={item.step} align="space-between" blockAlign="center" gap="300">
                <InlineStack gap="300" blockAlign="center">
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: item.done ? '#008060' : '#e1e3e5',
                    color: item.done ? '#fff' : '#6d7175',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 13,
                  }}>
                    {item.done ? '✓' : item.step}
                  </div>
                  <BlockStack gap="050">
                    <Text variant="bodyMd" fontWeight={item.done ? 'regular' : 'semibold'} tone={item.done ? 'subdued' : undefined}>
                      {item.title}
                    </Text>
                    <Text variant="bodySm" tone="subdued">{item.desc}</Text>
                  </BlockStack>
                </InlineStack>
                {item.action && (
                  <Link to={item.action.path + qs} style={{ textDecoration: 'none' }}>
                    <Button size="slim">{item.action.label}</Button>
                  </Link>
                )}
              </InlineStack>
            ))}
          </BlockStack>
        </Card>

        {/* Feature guide */}
        <BlockStack gap="300">
          <Text variant="headingMd" fontWeight="bold">Feature Guide</Text>
          <Text variant="bodySm" tone="subdued">Click "How to use →" on any feature to see setup steps.</Text>
          <InlineGrid columns={2} gap="400">
            {features.map(f => <FeatureCard key={f.title} feature={f} />)}
          </InlineGrid>
        </BlockStack>

        {/* FAQ */}
        <BlockStack gap="300">
          <Text variant="headingMd" fontWeight="bold">Frequently Asked Questions</Text>
          <Card padding="0">
            {faqs.map((faq, i) => <FAQItem key={i} faq={faq} index={i} />)}
          </Card>
        </BlockStack>

        {/* Setup guide link */}
        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="100">
              <Text variant="headingSm" fontWeight="bold">Need to set up Google credentials?</Text>
              <Text variant="bodySm" tone="subdued">Follow the step-by-step guide to create your Google Cloud project and OAuth credentials.</Text>
            </BlockStack>
            <Link to={'/setup-guide' + qs} style={{ textDecoration: 'none' }}>
              <Button variant="primary">Open Setup Guide</Button>
            </Link>
          </InlineStack>
        </Card>

      </BlockStack>
    </Page>
  );
}
