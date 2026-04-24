import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Page, Card, Layout, Button, FormLayout, TextField, Banner,
  Badge, Text, Divider, InlineStack, BlockStack, Box, Link,
} from '@shopify/polaris';
import { settingsApi, googleApi } from '../api';

export default function ShopSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    google_client_id: '',
    google_client_secret: '',
    google_ads_developer_token: '',
  });
  const [showSecret, setShowSecret]     = useState(false);
  const [saved, setSaved]               = useState(false);
  const [brandKeywords, setBrandKeywords] = useState('');
  const [brandSaved, setBrandSaved]     = useState(false);

  const { data: settings, isLoading } = useQuery('shop-settings', settingsApi.get);
  const { data: googleStatus } = useQuery('google-status', googleApi.status);

  useEffect(() => {
    if (settings?.brand_keywords !== undefined) {
      setBrandKeywords(settings.brand_keywords || '');
    }
  }, [settings]);

  const saveMutation = useMutation(
    () => settingsApi.save({
      google_client_id: form.google_client_id || undefined,
      google_client_secret: form.google_client_secret || undefined,
      google_ads_developer_token: form.google_ads_developer_token || undefined,
      setup_step: 4,
    }),
    {
      onSuccess: () => {
        setSaved(true);
        setForm({ google_client_id: '', google_client_secret: '', google_ads_developer_token: '' });
        queryClient.invalidateQueries('shop-settings');
        setTimeout(() => setSaved(false), 3000);
      },
    }
  );

  const brandSaveMutation = useMutation(
    () => settingsApi.save({ brand_keywords: brandKeywords }),
    {
      onSuccess: () => {
        setBrandSaved(true);
        queryClient.invalidateQueries('shop-settings');
        setTimeout(() => setBrandSaved(false), 3000);
      },
    }
  );

  const clearMutation = useMutation(settingsApi.clearCredentials, {
    onSuccess: () => queryClient.invalidateQueries('shop-settings'),
  });

  const goConnect = () => navigate(`/connect-google${window.location.search}`);

  const set = (key) => (val) => setForm(f => ({ ...f, [key]: val }));

  return (
    <Page
      title="Google API Settings"
      subtitle="Enter your Google OAuth credentials to connect your Google account"
      secondaryActions={[{ content: 'Setup Guide', url: '/setup-guide' }]}
    >
      <Layout>

        {/* Status banner */}
        <Layout.Section>
          {settings?.has_credentials ? (
            <Banner tone="success" title="Google credentials configured">
              <p>
                Client ID: <strong>{settings.google_client_id_preview}</strong>
                {' '}— {googleStatus?.connected
                  ? <span>Google account connected as <strong>{googleStatus.account?.google_email}</strong></span>
                  : <span>Google account not yet connected. <Button variant="plain" onClick={goConnect}>Connect now →</Button></span>
                }
              </p>
            </Banner>
          ) : (
            <Banner tone="warning" title="No credentials saved yet">
              <p>You need to enter your Google Cloud OAuth credentials before you can connect your Google account. Follow the <Link url="/setup-guide">Setup Guide</Link> to create them.</p>
            </Banner>
          )}
        </Layout.Section>

        {saved && (
          <Layout.Section>
            <Banner tone="success" title="Credentials saved successfully! You can now connect your Google account." />
          </Layout.Section>
        )}

        {/* Credentials form */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd">Google OAuth Credentials</Text>
              <Text variant="bodySm" tone="subdued">
                These are your own credentials from Google Cloud Console. Each store uses its own credentials so your data stays private and within your quota.
              </Text>
              <Divider />
              <FormLayout>
                <TextField
                  label="Google OAuth Client ID"
                  value={form.google_client_id}
                  onChange={set('google_client_id')}
                  placeholder="123456789-abc...apps.googleusercontent.com"
                  helpText="From Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs"
                  autoComplete="off"
                />
                <TextField
                  label="Google OAuth Client Secret"
                  value={form.google_client_secret}
                  onChange={set('google_client_secret')}
                  placeholder="GOCSPX-..."
                  type={showSecret ? 'text' : 'password'}
                  helpText="Click the eye icon to show/hide. This is stored encrypted."
                  autoComplete="off"
                  connectedRight={
                    <Button onClick={() => setShowSecret(v => !v)}>
                      {showSecret ? 'Hide' : 'Show'}
                    </Button>
                  }
                />
                <TextField
                  label="Google Ads Developer Token (optional)"
                  value={form.google_ads_developer_token}
                  onChange={set('google_ads_developer_token')}
                  placeholder="AbCdEf-..."
                  helpText="Only needed for Google Ads data. Found in Google Ads → Tools → API Center"
                  autoComplete="off"
                />
              </FormLayout>

              <InlineStack gap="300">
                <Button
                  variant="primary"
                  onClick={() => saveMutation.mutate()}
                  loading={saveMutation.isLoading}
                  disabled={!form.google_client_id && !form.google_client_secret}
                >
                  Save Credentials
                </Button>
                {settings?.has_credentials && (
                  <Button
                    tone="critical"
                    onClick={() => clearMutation.mutate()}
                    loading={clearMutation.isLoading}
                  >
                    Clear Credentials
                  </Button>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Connect Google account */}
        {settings?.has_credentials && !googleStatus?.connected && (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd">Connect Your Google Account</Text>
                <Text>Your credentials are saved. Now connect your Google account to authorize access to Search Console, GA4, and Ads data.</Text>
                <Button variant="primary" onClick={goConnect}>
                  Connect Google Account
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Brand Keywords */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <div>
                <Text variant="headingMd">Brand Keywords</Text>
                <Text variant="bodySm" tone="subdued">
                  Used to split search queries into Brand vs Non-Brand on the SEO page. Enter your brand name(s), comma-separated.
                </Text>
              </div>
              <Divider />
              {brandSaved && <Banner tone="success" title="Brand keywords saved!" />}
              <TextField
                label="Brand keyword(s)"
                value={brandKeywords}
                onChange={setBrandKeywords}
                placeholder="e.g. plantex, plantex india, plantex wash basin"
                helpText="Comma-separated. Any search query containing these terms will be classified as Branded."
                autoComplete="off"
              />
              {brandKeywords && (
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {brandKeywords.split(',').map(s => s.trim()).filter(Boolean).map((kw, i) => (
                    <span key={i} style={{ background:'#e3f1df', color:'#008060', padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:600 }}>
                      {kw}
                    </span>
                  ))}
                </div>
              )}
              <InlineStack gap="300">
                <Button
                  variant="primary"
                  onClick={() => brandSaveMutation.mutate()}
                  loading={brandSaveMutation.isLoading}
                  disabled={!brandKeywords.trim()}
                >
                  Save Brand Keywords
                </Button>
                {settings?.brand_keywords && (
                  <Button onClick={() => { setBrandKeywords(''); brandSaveMutation.mutate(); }} tone="critical">
                    Clear
                  </Button>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Quick reference */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd">Where to find each value</Text>
              <Box>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: '#f6f6f7' }}>
                      <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #e1e3e5' }}>Field</th>
                      <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #e1e3e5' }}>Where to find it</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['Client ID', 'Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs'],
                      ['Client Secret', 'Same page as Client ID — click the pencil icon next to your credential'],
                      ['Ads Developer Token', 'Google Ads → Tools & Settings (wrench icon) → API Center'],
                    ].map(([field, where]) => (
                      <tr key={field} style={{ borderBottom: '1px solid #f1f1f1' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{field}</td>
                        <td style={{ padding: '8px 12px', color: '#6d7175' }}>{where}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
              <Button variant="plain" url="/setup-guide">View full step-by-step setup guide →</Button>
            </BlockStack>
          </Card>
        </Layout.Section>

      </Layout>
    </Page>
  );
}
