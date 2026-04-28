import React, { useState } from 'react';
import {
  Page, Card, BlockStack, InlineStack, InlineGrid, Box, Text,
  Badge, Button, Divider, Banner, Collapsible,
} from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';

const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin;

const steps = [
  {
    number: 1,
    title: 'Create a Google Cloud Project',
    badge: 'Google Cloud Console',
    badgeTone: 'info',
    description: 'A Google Cloud Project gives you API access. You only do this once.',
    actions: [
      'Go to console.cloud.google.com',
      'Click "Select a project" → "New Project"',
      'Name it (e.g. "My Shopify Analytics App") → click "Create"',
      'Make sure the new project is selected in the top bar',
    ],
    tip: 'One Google Cloud project per Shopify app is good practice.',
  },
  {
    number: 2,
    title: 'Enable Required Google APIs',
    badge: 'APIs & Services',
    badgeTone: 'info',
    description: 'Enable the specific APIs this app uses.',
    actions: [
      'In the sidebar click "APIs & Services" → "Library"',
      'Search and enable: Google Analytics Data API',
      'Search and enable: Google Analytics Admin API',
      'Search and enable: Google Search Console API',
      'Search and enable: Google Ads API (optional — only if you use Google Ads)',
    ],
    tip: 'Each API may take up to 1 minute to activate.',
  },
  {
    number: 3,
    title: 'Configure OAuth Consent Screen',
    badge: 'Required before credentials',
    badgeTone: 'warning',
    description: 'This is the screen users see when connecting their Google account.',
    actions: [
      'Go to "APIs & Services" → "OAuth consent screen"',
      'Select "External" → click "Create"',
      'Fill in: App name, Support email, Developer contact email',
      'Click "Save and Continue"',
      'On Scopes page add: .../auth/analytics.readonly, .../auth/webmasters.readonly, .../auth/adwords, .../auth/userinfo.email',
      'Click "Save and Continue" twice → "Back to Dashboard"',
      'Click "Publish App" to allow any Google account to connect',
    ],
    tip: 'While in "Testing" mode only test users you add can connect. Publish to allow everyone.',
  },
  {
    number: 4,
    title: 'Create OAuth 2.0 Credentials',
    badge: 'Get Client ID & Secret',
    badgeTone: 'success',
    description: 'These credentials let the app authenticate with Google on behalf of your users.',
    actions: [
      'Go to "APIs & Services" → "Credentials"',
      'Click "+ Create Credentials" → "OAuth client ID"',
      'Application type: "Web application"',
      'Name it: "Shopify App OAuth"',
      'Under "Authorized redirect URIs" add the URI shown below',
      'Click "Create"',
      'Copy both the Client ID and Client Secret shown in the popup',
    ],
    redirectUri: true,
    tip: 'The redirect URI must match exactly — including https:// and no trailing slash.',
  },
  {
    number: 5,
    title: 'Save Credentials & Connect',
    badge: 'Final step',
    badgeTone: 'success',
    description: 'Paste your credentials into the app, then authorize your Google account.',
    actions: [
      'Go to API Settings (in the sidebar)',
      'Paste your Google OAuth Client ID',
      'Paste your Google OAuth Client Secret',
      'Click "Save Credentials"',
      'Go to Connect Google → click "Connect Google Account"',
      'Sign in and grant the requested permissions',
      'You are connected! Go to API Settings and enter your GA4 Property ID and Search Console URL',
    ],
    tip: 'After connecting, set your GA4 Property ID and Search Console property URL in API Settings for data to appear.',
  },
];

function StepCard({ step, isExpanded, onToggle }) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="300" blockAlign="center">
            <div style={{
              width: 38, height: 38, borderRadius: '50%',
              background: isExpanded ? '#008060' : '#e1e3e5',
              color: isExpanded ? '#fff' : '#6d7175',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 16, flexShrink: 0,
              transition: 'background 0.2s',
            }}>
              {step.number}
            </div>
            <BlockStack gap="100">
              <Text variant="headingMd" fontWeight="semibold">{step.title}</Text>
              <Badge tone={step.badgeTone}>{step.badge}</Badge>
            </BlockStack>
          </InlineStack>
          <Button variant="plain" onClick={onToggle}>
            {isExpanded ? 'Collapse ▲' : 'Expand ▼'}
          </Button>
        </InlineStack>

        <Collapsible open={isExpanded} id={`step-${step.number}`}>
          <BlockStack gap="300">
            <Divider />
            <Text variant="bodyMd">{step.description}</Text>

            <BlockStack gap="150">
              {step.actions.map((action, i) => (
                <InlineStack key={i} gap="200" blockAlign="start">
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    background: '#f4f5fa', color: '#1a1a1a',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 11, marginTop: 1,
                  }}>
                    {i + 1}
                  </div>
                  <Text variant="bodySm">{action}</Text>
                </InlineStack>
              ))}
            </BlockStack>

            {step.redirectUri && (
              <Box background="bg-surface-secondary" padding="400" borderRadius="200">
                <BlockStack gap="100">
                  <Text variant="bodySm" fontWeight="bold" tone="subdued">Authorized Redirect URI — copy this exactly:</Text>
                  <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#008060', wordBreak: 'break-all' }}>
                    {APP_URL}/api/google/callback
                  </div>
                </BlockStack>
              </Box>
            )}

            <Box background="bg-surface-secondary" padding="300" borderRadius="200">
              <InlineStack gap="200" blockAlign="start">
                <Text variant="bodySm">💡</Text>
                <Text variant="bodySm" tone="subdued">{step.tip}</Text>
              </InlineStack>
            </Box>
          </BlockStack>
        </Collapsible>
      </BlockStack>
    </Card>
  );
}

export default function SetupGuide() {
  const navigate = useNavigate();
  const qs = window.location.search;
  const [expanded, setExpanded] = useState({ 1: true });
  const toggle = (n) => setExpanded(e => ({ ...e, [n]: !e[n] }));

  return (
    <Page
      title="Google Setup Guide"
      subtitle="Connect Google Analytics, Search Console & Ads to this app"
      primaryAction={{ content: 'Go to API Settings', onAction: () => navigate('/settings' + qs) }}
      secondaryActions={[{ content: 'Help & Guide', onAction: () => navigate('/help' + qs) }]}
    >
      <BlockStack gap="500">

        <Banner tone="info" title="Do I need my own Google credentials?">
          <Text variant="bodySm">
            The app includes built-in Google credentials — you can just click <strong>Connect Google</strong> and sign in without any setup. This guide is only needed if you want to use your own Google Cloud project (for higher API quota or custom branding on the consent screen).
          </Text>
        </Banner>

        {/* Quick links */}
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" fontWeight="semibold">Useful Links</Text>
            <Divider />
            <InlineGrid columns={2} gap="300">
              {[
                { label: 'Google Cloud Console', url: 'https://console.cloud.google.com', desc: 'Create project & credentials' },
                { label: 'Google Analytics (GA4)', url: 'https://analytics.google.com', desc: 'Find Property ID in Admin → Property Settings' },
                { label: 'Google Search Console', url: 'https://search.google.com/search-console', desc: 'Verify your domain — use the URL as property' },
                { label: 'Google Ads', url: 'https://ads.google.com', desc: 'Customer ID shown in top-right corner' },
              ].map(link => (
                <Box key={link.label} background="bg-surface-secondary" padding="300" borderRadius="200">
                  <BlockStack gap="100">
                    <a href={link.url} target="_blank" rel="noreferrer" style={{ color: '#1a1a1a', fontWeight: 600, fontSize: 13 }}>
                      {link.label} ↗
                    </a>
                    <Text variant="bodySm" tone="subdued">{link.desc}</Text>
                  </BlockStack>
                </Box>
              ))}
            </InlineGrid>
          </BlockStack>
        </Card>

        {/* Step by step */}
        <BlockStack gap="300">
          <Text variant="headingMd" fontWeight="semibold">Step-by-Step Setup</Text>
          {steps.map(step => (
            <StepCard
              key={step.number}
              step={step}
              isExpanded={!!expanded[step.number]}
              onToggle={() => toggle(step.number)}
            />
          ))}
        </BlockStack>

        {/* Done CTA */}
        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="100">
              <Text variant="headingSm" fontWeight="bold">Ready to connect?</Text>
              <Text variant="bodySm" tone="subdued">Save your credentials in API Settings, then connect your Google account.</Text>
            </BlockStack>
            <InlineStack gap="200">
              <Button onClick={() => navigate('/settings' + qs)}>API Settings</Button>
              <Button variant="primary" onClick={() => navigate('/connect-google' + qs)}>Connect Google →</Button>
            </InlineStack>
          </InlineStack>
        </Card>

      </BlockStack>
    </Page>
  );
}
