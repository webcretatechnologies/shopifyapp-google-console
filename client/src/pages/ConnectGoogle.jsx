import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Page, Card, Button, Banner, Text, BlockStack, InlineStack,
  Badge, Box, Divider, SkeletonBodyText, Select,
} from '@shopify/polaris';
import { googleApi } from '../api';
import { useShop } from '../context/ShopContext';

export default function ConnectGoogle() {
  const queryClient = useQueryClient();
  const { googleStatus, refreshGoogleStatus } = useShop();
  const [setupRequired, setSetupRequired] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [authError, setAuthError] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [settings, setSettings] = useState({
    search_console_property: '',
    ga4_property_id: '',
    google_ads_customer_id: '',
  });

  const isConnected = googleStatus?.connected;

  // Fetch SC sites and GA4 properties only when connected
  const { data: scSites = [], isLoading: scLoading } = useQuery(
    'sc-sites', googleApi.searchConsoleSites,
    { enabled: !!isConnected, retry: false }
  );
  const { data: ga4Props = [], isLoading: ga4Loading } = useQuery(
    'ga4-properties', googleApi.ga4Properties,
    { enabled: !!isConnected, retry: false }
  );

  // Always refresh status on mount so the page reflects current state
  useEffect(() => {
    refreshGoogleStatus();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_connected')) {
      refreshGoogleStatus();
      const clean = new URL(window.location.href);
      clean.searchParams.delete('google_connected');
      window.history.replaceState({}, '', clean.toString());
    }
    if (params.get('google_error')) {
      setAuthError('Google sign-in failed or was cancelled. Please try again.');
      const clean = new URL(window.location.href);
      clean.searchParams.delete('google_error');
      window.history.replaceState({}, '', clean.toString());
    }
  }, []);

  useEffect(() => {
    if (googleStatus?.account) {
      setSettings({
        search_console_property: googleStatus.account.search_console_property || '',
        ga4_property_id: googleStatus.account.ga4_property_id || '',
        google_ads_customer_id: googleStatus.account.google_ads_customer_id || '',
      });
    }
  }, [googleStatus]);

  const handleConnect = async () => {
    if (!loginEmail.trim()) {
      setAuthError('Please enter your Google account email to continue.');
      return;
    }
    setConnecting(true);
    setSetupRequired(false);
    setAuthError('');
    try {
      const data = await googleApi.getConnectUrl(loginEmail.trim());
      if (data?.url) window.top.location.href = data.url;
      else setAuthError('Failed to get Google sign-in URL. Please try again.');
    } catch (err) {
      if (err?.setup_required) setSetupRequired(true);
      else setAuthError(err?.message || 'Could not start Google sign-in. Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  const saveMutation = useMutation(() => googleApi.updateSettings(settings), {
    onSuccess: () => {
      setSaved(true);
      refreshGoogleStatus();
      queryClient.invalidateQueries('google-status');
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const disconnectMutation = useMutation(googleApi.disconnect, {
    onSuccess: () => {
      refreshGoogleStatus();
      queryClient.invalidateQueries();
    },
  });

  // Build Select options
  const scOptions = [
    { label: 'Select a property...', value: '' },
    ...scSites.map(s => ({ label: s.url, value: s.url })),
  ];
  const ga4Options = [
    { label: 'Select a property...', value: '' },
    ...ga4Props.map(p => ({ label: `${p.name} (${p.id})`, value: p.id })),
  ];

  return (
    <Page title="Google Integration" subtitle="Connect your Google account to fetch Analytics, Search Console & Ads data">
      <BlockStack gap="500">

        {/* Connection card */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingMd">Google Account</Text>
              <Badge tone={isConnected ? 'success' : 'subdued'}>
                {isConnected ? 'Connected' : 'Not Connected'}
              </Badge>
            </InlineStack>
            <Divider />

            {authError && (
              <Banner tone="critical" title="Google sign-in failed" onDismiss={() => setAuthError('')}>
                <Text variant="bodySm">{authError}</Text>
              </Banner>
            )}

            {setupRequired && (
              <Banner tone="critical" title="Google OAuth not configured">
                <Text variant="bodySm">The app's Google OAuth credentials are not set up. Contact the app administrator.</Text>
              </Banner>
            )}

            {isConnected ? (
              <BlockStack gap="300">
                <Box background="bg-surface-success" padding="400" borderRadius="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Text variant="bodySm">✓</Text>
                    <BlockStack gap="050">
                      <Text variant="bodyMd" fontWeight="semibold">Google account connected</Text>
                      <Text variant="bodySm" tone="subdued">Signed in as: <strong>{googleStatus.account?.google_email}</strong></Text>
                    </BlockStack>
                  </InlineStack>
                </Box>
                <Text variant="bodySm" tone="subdued">
                  To connect a different Google account, disconnect first and then enter the new email below.
                </Text>
                <Button
                  tone="critical"
                  onClick={() => disconnectMutation.mutate()}
                  loading={disconnectMutation.isLoading}
                >
                  Disconnect Google Account
                </Button>
              </BlockStack>
            ) : (
              <BlockStack gap="400">
                <Text variant="bodySm" tone="subdued">
                  Enter the Google account email you want to connect, then click the button to sign in.
                </Text>

                <BlockStack gap="100">
                  <Text variant="bodyMd" fontWeight="semibold">
                    Google Account Email <span style={{ color: '#d82c0d' }}>*</span>
                  </Text>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    placeholder="e.g. owner@gmail.com"
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 8,
                      border: '1px solid #c4cdd5', fontSize: 14, background: '#fff',
                      color: '#202223', boxSizing: 'border-box',
                    }}
                  />
                  <Text variant="bodySm" tone="subdued">
                    Enter the Google account that has access to your Search Console, GA4, and Google Ads. All data will be fetched from this account.
                  </Text>
                </BlockStack>

                <Button variant="primary" onClick={handleConnect} loading={connecting} disabled={!loginEmail.trim()}>
                  Connect Google Account →
                </Button>
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        {/* Property configuration — only when connected */}
        {isConnected && (
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Configure Your Properties</Text>
              <Text variant="bodySm" tone="subdued">
                Select the Google properties for your store. These are auto-loaded from your connected account.
              </Text>
              <Divider />

              {saved && (
                <Banner tone="success" title="Settings saved successfully!" />
              )}

              {/* Search Console */}
              <BlockStack gap="200">
                <Text variant="bodyMd" fontWeight="semibold">Search Console Property</Text>
                <Text variant="bodySm" tone="subdued">
                  Select the website URL you want to track. All verified sites on <strong>{googleStatus.account?.google_email}</strong> are listed below.
                </Text>
                {scLoading ? (
                  <SkeletonBodyText lines={1} />
                ) : scSites.length === 0 ? (
                  <Banner tone="warning">
                    <Text variant="bodySm">No Search Console properties found. Make sure your site is verified at search.google.com/search-console.</Text>
                  </Banner>
                ) : (
                  <select
                    value={settings.search_console_property}
                    onChange={e => setSettings(s => ({ ...s, search_console_property: e.target.value }))}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 8,
                      border: '1px solid #c4cdd5', fontSize: 14, background: '#fff',
                      color: '#202223', cursor: 'pointer',
                    }}
                  >
                    {scOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
              </BlockStack>

              {/* GA4 — shown after SC URL is selected */}
              <BlockStack gap="200">
                <Text variant="bodyMd" fontWeight="semibold">Google Analytics 4 Property</Text>
                <Text variant="bodySm" tone="subdued">
                  {settings.search_console_property
                    ? <>Select the GA4 property for <strong>{settings.search_console_property}</strong></>
                    : 'Select a Search Console URL above first, then pick the matching GA4 property.'}
                </Text>
                {ga4Loading ? (
                  <SkeletonBodyText lines={1} />
                ) : ga4Props.length === 0 ? (
                  <Banner tone="warning">
                    <Text variant="bodySm">No GA4 properties found. Make sure Google Analytics Admin API is enabled in your Google Cloud project.</Text>
                  </Banner>
                ) : (
                  <select
                    value={settings.ga4_property_id}
                    onChange={e => setSettings(s => ({ ...s, ga4_property_id: e.target.value }))}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 8,
                      border: '1px solid #c4cdd5', fontSize: 14, background: '#fff',
                      color: '#202223', cursor: 'pointer',
                    }}
                  >
                    {ga4Options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
                {ga4Props.length > 0 && (
                  <Text variant="bodySm" tone="subdued">
                    {ga4Props.length} GA4 propert{ga4Props.length === 1 ? 'y' : 'ies'} found — pick the one matching your store website.
                  </Text>
                )}
              </BlockStack>

              {/* Google Ads Customer ID — manual input (can't list via API easily) */}
              <BlockStack gap="200">
                <Text variant="bodyMd" fontWeight="semibold">Google Ads Customer ID <span style={{ fontWeight: 400, color: '#6d7175', fontSize: 13 }}>(optional)</span></Text>
                <input
                  type="text"
                  value={settings.google_ads_customer_id}
                  onChange={e => setSettings(s => ({ ...s, google_ads_customer_id: e.target.value }))}
                  placeholder="1234567890"
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 8,
                    border: '1px solid #c4cdd5', fontSize: 14, background: '#fff',
                    color: '#202223', boxSizing: 'border-box',
                  }}
                />
                <Text variant="bodySm" tone="subdued">10-digit number from top-right of your Google Ads account (no dashes)</Text>
              </BlockStack>

              <Button
                variant="primary"
                onClick={() => saveMutation.mutate()}
                loading={saveMutation.isLoading}
                disabled={!settings.search_console_property && !settings.ga4_property_id}
              >
                Save Settings
              </Button>
            </BlockStack>
          </Card>
        )}

        {/* Info card */}
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" fontWeight="semibold">What gets connected?</Text>
            <Divider />
            {[
              { emoji: '🔍', title: 'Google Search Console', desc: 'Keyword rankings, impressions, clicks, and CTR for your store pages.' },
              { emoji: '📊', title: 'Google Analytics 4', desc: 'Sessions, users, traffic sources, top pages, and countries.' },
              { emoji: '📢', title: 'Google Ads', desc: 'Campaign performance, spend, conversions, and ROAS. (Requires Customer ID)' },
            ].map(f => (
              <InlineStack key={f.title} gap="300" blockAlign="start">
                <Text variant="bodyMd">{f.emoji}</Text>
                <BlockStack gap="050">
                  <Text variant="bodyMd" fontWeight="semibold">{f.title}</Text>
                  <Text variant="bodySm" tone="subdued">{f.desc}</Text>
                </BlockStack>
              </InlineStack>
            ))}
          </BlockStack>
        </Card>

      </BlockStack>
    </Page>
  );
}
