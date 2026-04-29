import React, { useState } from 'react';
import {
  Page, Card, BlockStack, InlineStack, InlineGrid, Box, Text,
  Badge, Button, Divider, Icon, Collapsible, Banner,
} from '@shopify/polaris';
import {
  HomeIcon, ProductIcon, AlertCircleIcon, SearchIcon,
  ChartVerticalIcon, MegaphoneIcon, ConnectIcon, SettingsIcon,
  ChevronDownIcon, ChevronUpIcon, QuestionCircleIcon,
  MagicIcon, EditIcon, CodeIcon, EmailIcon, CreditCardIcon,
  CheckCircleIcon,
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
  {
    icon: CheckCircleIcon,
    title: 'Site Audit',
    color: '#1a1a1a',
    bg: '#f4f5fa',
    description: 'Crawls your storefront and scores it for SEO problems — broken links, missing tags, slow pages, duplicates. Comes back with a numeric score and a list of issues split by severity.',
    howTo: [
      'Open Site Audit and click "Run Audit" — the crawler visits every public page on your storefront.',
      'For password-protected stores, enter the storefront password first so the crawler can get in.',
      'Once the run finishes, browse the Issues tab to see every problem; click any issue type to see the affected pages.',
      'Re-run anytime after fixing things to track your score going up.',
    ],
  },
  {
    icon: MagicIcon,
    title: 'AI Visibility',
    color: '#1a1a1a',
    bg: '#f4f5fa',
    description: 'Asks AI assistants (ChatGPT, Gemini, Perplexity) questions related to your store and tracks how often your store gets mentioned in their answers — a measure of your visibility in AI-driven search.',
    howTo: [
      'Open AI Visibility — the app comes with a default set of prompts based on your products. You can edit, add, or remove prompts in the Prompts tab.',
      'Click "Run analysis" to ask every AI provider every prompt. Results take a minute or two.',
      'See your score, mentions count, citations, and per-provider breakdown in the Overview tab.',
      'History tab keeps every past run so you can track trends over time.',
    ],
  },
  {
    icon: EditIcon,
    title: 'Content & Schema',
    color: '#1a1a1a',
    bg: '#f4f5fa',
    description: 'Three tools in one tabbed page — generate AI product copy, generate product FAQs, and add Google-ready JSON-LD structured markup to your pages.',
    howTo: [
      'Pick any product from the searchable picker at the top — this product is the subject of all three tabs.',
      'Content Creation — generate fresh product description, title, meta title, or meta description with AI. Edit any draft, approve it, then publish back to Shopify.',
      'FAQs — generate frequently-asked questions for the product, edit/reorder them, and publish them to the storefront.',
      'Structured Markup — choose which schemas to emit (Product, FAQ, Breadcrumb, Organization). Either copy-paste the snippet or let the app inject it automatically via Shopify Script Tag.',
    ],
  },
  {
    icon: CodeIcon,
    title: 'Sitemap Manager',
    color: '#1a1a1a',
    bg: '#f4f5fa',
    description: 'Submit, list, and remove sitemaps in Google Search Console without leaving Shopify. Optional auto-submission keeps your sitemap fresh in Google\'s index.',
    howTo: [
      'Open Sitemap Manager — it lists every sitemap currently submitted to Search Console for your verified property.',
      'Paste a sitemap URL and click Submit to register it. Remove any old sitemap with one click.',
      'Turn on auto-submission in Settings if you want the app to re-submit your sitemap automatically each day.',
    ],
  },
  {
    icon: CreditCardIcon,
    title: 'Plan & Billing',
    color: '#1a1a1a',
    bg: '#f4f5fa',
    description: 'See available plans, switch plans, and start a free trial. Each plan unlocks different features (Site Audit, AI Visibility, content tools, etc.) and sets per-month limits on products, orders, and keywords tracked.',
    howTo: [
      'Open Plan & Billing from the top bar to see all plans side-by-side. Your current plan has a bold border.',
      'Click "Start Free Trial" or "Upgrade" on any plan — paid plans go through Shopify\'s billing approval, free plans activate instantly.',
      'After picking a plan you\'ll be sent back to the dashboard automatically with your new feature set unlocked.',
      'Locked features show a "Plan Required" card with a one-click upgrade button.',
    ],
  },
  {
    icon: EmailIcon,
    title: 'Email Notifications',
    color: '#1a1a1a',
    bg: '#f4f5fa',
    description: 'The app emails you on key events — Site Audit complete, AI Visibility complete, critical stock alerts, and a weekly performance summary. You choose which to receive.',
    howTo: [
      'Open Settings → Notifications to opt in or out of each event-based email.',
      'Pick the day of the week you want the weekly report to arrive (Sunday–Saturday).',
      'Set a specific email address if you want notifications going somewhere other than your Shopify store email.',
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
  {
    q: 'How does the Site Audit work and how long does it take?',
    a: 'Site Audit crawls every public page on your storefront and checks each one for SEO problems — missing meta tags, broken links, slow pages, duplicate content, missing image alt text, and more. Crawl time depends on store size: small stores (under 100 pages) finish in 1–2 minutes; larger catalogs (1000+ pages) can take 10+ minutes. The score (0–100) is weighted by how many critical/high issues are found versus pages crawled.',
  },
  {
    q: 'My store is password-protected — can I still run Site Audit?',
    a: 'Yes. Enter your storefront password in Site Audit before running. The password is stored encrypted and only used by the crawler. Without it the audit will fail because it can\'t reach your pages.',
  },
  {
    q: 'What is AI Visibility and which AI providers are used?',
    a: 'AI Visibility measures how often your store appears when people ask AI assistants product-related questions. The app asks each AI provider a set of prompts (you can edit them) and counts mentions and citations to your store. Built-in providers are Google Gemini, Groq, and OpenRouter — all using free-tier models. If one provider is down or rate-limited, the system automatically falls back to the next one.',
  },
  {
    q: 'Can I edit the questions asked of the AI?',
    a: 'Yes. Open AI Visibility → Prompts tab and add, edit, or remove any prompt. Default prompts are seeded based on your products and category. The more specific your prompts, the more useful the visibility score becomes.',
  },
  {
    q: 'Will the AI-generated content overwrite my existing product copy?',
    a: 'No — generated content always lands as a draft first. You can edit it as much as you want, and only when you click "Publish" does it get pushed back to Shopify. Until then your original product copy stays untouched.',
  },
  {
    q: 'What is Structured Markup and do I need it?',
    a: 'Structured Markup (also called JSON-LD or Schema) is invisible code that tells Google what your pages are about — product info, prices, ratings, FAQs, breadcrumbs, your company. Google uses it to show rich results (star ratings, FAQs, prices) directly in search. You don\'t strictly need it, but stores that have it usually see noticeably better click-through rates from Google.',
  },
  {
    q: 'Should I use "paste" or "auto-inject" mode for Structured Markup?',
    a: 'Auto-inject (via Shopify Script Tag) is the easiest — flip it on and the markup appears on your storefront without touching your theme. Paste mode is for stores that want full control: you copy a code snippet from the app and paste it into your theme.liquid manually. Both produce the same markup.',
  },
  {
    q: 'How do plan limits work? What happens if I have more than the limit?',
    a: 'Limits cap what the app shows — they don\'t delete data. Webhooks keep syncing every product and order in the background, so nothing is lost. If your plan caps products at 100 and you have 500, the app shows the first 100 in lists and counts. An upgrade banner appears in the affected sections so you know what\'s being hidden.',
  },
  {
    q: 'A feature is showing a "Plan Required" lock — what do I do?',
    a: 'That feature isn\'t included in your current plan. Click "Upgrade" on the lock card or open Plan & Billing from the top bar to see which plan unlocks it. Paid plans always start with a 14-day free trial, so you can try it before committing.',
  },
  {
    q: 'Can I get a single feature without upgrading my whole plan?',
    a: 'Yes — the super admin can grant any individual feature to your shop as a one-off add-on (typically for a small extra fee). Reach out via the email listed in your billing receipts to request it.',
  },
  {
    q: 'How do I stop receiving the weekly report or other emails?',
    a: 'Go to Settings → Notifications. You can toggle off any non-critical email (Site Audit complete, AI Visibility complete, stock alerts, weekly report) and pick which day of the week you want the weekly report to arrive.',
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
              { step: 2, title: 'Pick a plan',               done: false, desc: 'Open Plan & Billing and start your free trial. Some features (Site Audit, AI Visibility, Content tools) require a paid plan.', action: { label: 'Plan & Billing', path: '/billing' } },
              { step: 3, title: 'Connect Google Account',    done: false, desc: 'Go to Connect Google → click "Connect Google Account" and sign in.', action: { label: 'Connect Google', path: '/connect-google' } },
              { step: 4, title: 'Enter API Settings',        done: false, desc: 'Go to Settings → enter your GA4 Property ID and Search Console property URL.', action: { label: 'Open Settings', path: '/settings' } },
              { step: 5, title: 'Sync your Products',        done: false, desc: 'Go to Products → click "Sync from Shopify" to import all products.', action: { label: 'Go to Products', path: '/products' } },
              { step: 6, title: 'Run your first Site Audit', done: false, desc: 'Go to Site Audit → click "Run Audit" to scan your storefront for SEO issues.', action: { label: 'Site Audit', path: '/site-audit' } },
              { step: 7, title: 'Wait for first data sync',  done: false, desc: 'Analytics data syncs daily at 2 AM UTC. Check back tomorrow to see your dashboards populated.' },
              { step: 8, title: 'Explore Insights',          done: false, desc: 'Go to Insights to see stock alerts, SEO suggestions, and order attribution.', action: { label: 'Open Insights', path: '/insights' } },
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
