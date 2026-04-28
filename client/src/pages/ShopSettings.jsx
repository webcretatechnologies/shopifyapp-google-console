import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Page, Card, Layout, Button, FormLayout, TextField, Banner,
  Text, Divider, InlineStack, BlockStack, Box, Link, Tabs,
  Checkbox, Select, Badge,
} from '@shopify/polaris';
import { settingsApi, googleApi } from '../api';

const TABS = [
  { id: 'general',       content: 'General',       accessibilityLabel: 'General',       panelID: 'general-panel' },
  { id: 'notifications', content: 'Notifications', accessibilityLabel: 'Notifications', panelID: 'notifications-panel' },
  { id: 'google',        content: 'Google API',    accessibilityLabel: 'Google API',    panelID: 'google-panel' },
];

// Only events the merchant can opt out of. Welcome / Google connected /
// Subscription updates are system events controlled by the super admin and
// always send (they don't appear here).
const EMAIL_EVENTS = [
  { key: 'audit',        label: 'Site Audit complete',        help: 'After every Site Audit run finishes' },
  { key: 'aiVisibility', label: 'AI Visibility run complete', help: 'After every AI Visibility analysis finishes' },
  { key: 'stockAlerts',  label: 'Critical stock alerts',      help: 'When a high-traffic product goes out of stock' },
  { key: 'weeklyReport', label: 'Weekly performance report',  help: 'Weekly summary digest — pick which day it lands below' },
];

const WEEKDAY_OPTIONS = [
  { label: 'Sunday',    value: '0' },
  { label: 'Monday',    value: '1' },
  { label: 'Tuesday',   value: '2' },
  { label: 'Wednesday', value: '3' },
  { label: 'Thursday',  value: '4' },
  { label: 'Friday',    value: '5' },
  { label: 'Saturday',  value: '6' },
];

const DATE_RANGE_OPTIONS = [
  { label: 'Last 7 days',  value: '7d'  },
  { label: 'Last 28 days', value: '28d' },
  { label: 'Last 90 days', value: '90d' },
];

// ── General tab ─────────────────────────────────────────────────────────────
function GeneralTab({ settings, onSave }) {
  const [brandKeywords, setBrandKeywords] = useState('');
  const [aiBrandName,   setAiBrandName]   = useState('');
  const [defaultRange,  setDefaultRange]  = useState('28d');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setBrandKeywords(settings.brand_keywords || '');
      setAiBrandName(settings.ai_brand_name || '');
      setDefaultRange(settings.default_date_range || '28d');
    }
  }, [settings]);

  const save = useMutation(() => onSave({
    brand_keywords: brandKeywords,
    ai_brand_name: aiBrandName,
    default_date_range: defaultRange,
  }), {
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2500); },
  });

  return (
    <BlockStack gap="500">
      {saved && <Banner tone="success" title="General settings saved" />}

      <Card>
        <BlockStack gap="400">
          <BlockStack gap="100">
            <Text variant="headingMd" as="h2">Brand Name (for AI Visibility)</Text>
            <Text variant="bodySm" as="p" tone="subdued">
              The exact brand name to look for in AI assistant responses (Gemini, Llama, GPT-OSS).
              Defaults to your Shopify store name.
            </Text>
          </BlockStack>
          <TextField
            label="AI brand name"
            labelHidden
            value={aiBrandName}
            onChange={setAiBrandName}
            placeholder="e.g. Plantex"
            helpText="Used by the AI Visibility analyzer to count how often your brand is mentioned."
            autoComplete="off"
          />
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="400">
          <BlockStack gap="100">
            <Text variant="headingMd" as="h2">Brand Keywords (for SEO)</Text>
            <Text variant="bodySm" as="p" tone="subdued">
              Used to split search queries into Brand vs Non-Brand on the SEO page. Comma-separated.
            </Text>
          </BlockStack>
          <TextField
            label="Brand keywords"
            labelHidden
            value={brandKeywords}
            onChange={setBrandKeywords}
            placeholder="e.g. plantex, plantex india, plantex wash basin"
            helpText="Any search query containing these terms will be classified as Branded."
            autoComplete="off"
          />
          {brandKeywords && (
            <InlineStack gap="100" wrap>
              {brandKeywords.split(',').map(s => s.trim()).filter(Boolean).map((kw, i) => (
                <Badge key={i} tone="success">{kw}</Badge>
              ))}
            </InlineStack>
          )}
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="400">
          <BlockStack gap="100">
            <Text variant="headingMd" as="h2">Display Preferences</Text>
            <Text variant="bodySm" as="p" tone="subdued">
              Defaults that apply across dashboards.
            </Text>
          </BlockStack>
          <Select
            label="Default date range"
            options={DATE_RANGE_OPTIONS}
            value={defaultRange}
            onChange={setDefaultRange}
            helpText="What period the Dashboard, SEO and Analytics pages open with."
          />
        </BlockStack>
      </Card>

      <InlineStack>
        <Button variant="primary" onClick={() => save.mutate()} loading={save.isLoading}>
          Save General Settings
        </Button>
      </InlineStack>
    </BlockStack>
  );
}

// ── Notifications tab ───────────────────────────────────────────────────────
function NotificationsTab({ settings, onSave }) {
  const [email, setEmail] = useState('');
  const [prefs, setPrefs] = useState({});
  const [weeklyDay, setWeeklyDay] = useState('1');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setEmail(settings.notification_email || settings.shop_email || '');
      setPrefs(settings.email_prefs || {});
      setWeeklyDay(String(settings.weekly_report_day != null ? settings.weekly_report_day : 1));
    }
  }, [settings]);

  const save = useMutation(() => onSave({
    notification_email: email,
    email_prefs: prefs,
    weekly_report_day: parseInt(weeklyDay, 10),
  }), {
    onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2500); },
  });

  const togglePref = (key) => (val) => setPrefs(p => ({ ...p, [key]: val }));
  const useStoreEmail = () => setEmail(settings?.shop_email || '');

  return (
    <BlockStack gap="500">
      {saved && <Banner tone="success" title="Notification settings saved" />}

      <Card>
        <BlockStack gap="400">
          <BlockStack gap="100">
            <Text variant="headingMd" as="h2">Notification Email</Text>
            <Text variant="bodySm" as="p" tone="subdued">
              Where transactional and report emails are delivered. Defaults to the email Shopify has on file for your store.
            </Text>
          </BlockStack>
          <FormLayout>
            <TextField
              label="Email address"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              autoComplete="email"
              helpText={settings?.shop_email && email !== settings.shop_email
                ? `Different from your Shopify store email (${settings.shop_email})`
                : 'Same as your Shopify store email'}
              connectedRight={
                settings?.shop_email && email !== settings.shop_email && (
                  <Button onClick={useStoreEmail}>Use store email</Button>
                )
              }
            />
          </FormLayout>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="400">
          <BlockStack gap="100">
            <Text variant="headingMd" as="h2">Which emails do you want to receive?</Text>
            <Text variant="bodySm" as="p" tone="subdued">
              Toggle each event individually. You can always change these later.
            </Text>
          </BlockStack>
          <Divider />
          <BlockStack gap="300">
            {EMAIL_EVENTS.map(ev => (
              <Box key={ev.key} paddingBlock="200" borderBlockEndWidth="025" borderColor="border">
                <InlineStack align="space-between" blockAlign="start" wrap={false}>
                  <Box maxWidth="80%">
                    <BlockStack gap="050">
                      <Text variant="bodyMd" as="p" fontWeight="semibold">{ev.label}</Text>
                      <Text variant="bodySm" as="p" tone="subdued">{ev.help}</Text>
                    </BlockStack>
                  </Box>
                  <Checkbox
                    label={prefs[ev.key] === false ? 'Off' : 'On'}
                    labelHidden
                    checked={prefs[ev.key] !== false}
                    onChange={togglePref(ev.key)}
                  />
                </InlineStack>
              </Box>
            ))}
          </BlockStack>
        </BlockStack>
      </Card>

      {/* Weekly report — pick which day it lands */}
      {prefs.weeklyReport !== false && (
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text variant="headingMd" as="h2">Weekly report — delivery day</Text>
              <Text variant="bodySm" as="p" tone="subdued">
                Which day of the week should the weekly performance report be sent? Sent at 08:00 UTC on that day.
              </Text>
            </BlockStack>
            <Box maxWidth="240px">
              <Select
                label="Day of week"
                labelHidden
                options={WEEKDAY_OPTIONS}
                value={weeklyDay}
                onChange={setWeeklyDay}
              />
            </Box>
          </BlockStack>
        </Card>
      )}

      <InlineStack>
        <Button variant="primary" onClick={() => save.mutate()} loading={save.isLoading}>
          Save Notification Settings
        </Button>
      </InlineStack>
    </BlockStack>
  );
}

// ── Google API tab (existing credential form) ───────────────────────────────
function GoogleApiTab({ settings, googleStatus, onSave, onClear }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ google_client_id: '', google_client_secret: '', google_ads_developer_token: '' });
  const [showSecret, setShowSecret] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = useMutation(() => onSave({
    google_client_id:           form.google_client_id           || undefined,
    google_client_secret:       form.google_client_secret       || undefined,
    google_ads_developer_token: form.google_ads_developer_token || undefined,
    setup_step: 4,
  }), {
    onSuccess: () => {
      setSaved(true);
      setForm({ google_client_id: '', google_client_secret: '', google_ads_developer_token: '' });
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const clear = useMutation(onClear);

  const set = (key) => (val) => setForm(f => ({ ...f, [key]: val }));
  const goConnect = () => navigate(`/connect-google${window.location.search}`);

  return (
    <BlockStack gap="500">
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

      {saved && <Banner tone="success" title="Credentials saved successfully! You can now connect your Google account." />}

      <Card>
        <BlockStack gap="400">
          <Text variant="headingMd" as="h2">Google OAuth Credentials</Text>
          <Text variant="bodySm" as="p" tone="subdued">
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
              helpText="Click the button to show/hide. This is stored encrypted."
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
              onClick={() => save.mutate()}
              loading={save.isLoading}
              disabled={!form.google_client_id && !form.google_client_secret}
            >
              Save Credentials
            </Button>
            {settings?.has_credentials && (
              <Button tone="critical" onClick={() => clear.mutate()} loading={clear.isLoading}>
                Clear Credentials
              </Button>
            )}
          </InlineStack>
        </BlockStack>
      </Card>

      {settings?.has_credentials && !googleStatus?.connected && (
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">Connect Your Google Account</Text>
            <Text as="p">Your credentials are saved. Now connect your Google account to authorize access to Search Console, GA4, and Ads data.</Text>
            <Box>
              <Button variant="primary" onClick={goConnect}>Connect Google Account</Button>
            </Box>
          </BlockStack>
        </Card>
      )}
    </BlockStack>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function ShopSettings() {
  const queryClient = useQueryClient();
  const [tabIndex, setTabIndex] = useState(0);

  const { data: settings, isLoading } = useQuery('shop-settings', settingsApi.get);
  const { data: googleStatus } = useQuery('google-status', googleApi.status);

  const onSave = async (patch) => {
    const r = await settingsApi.save(patch);
    queryClient.invalidateQueries('shop-settings');
    return r;
  };
  const onClear = async () => {
    const r = await settingsApi.clearCredentials();
    queryClient.invalidateQueries('shop-settings');
    return r;
  };

  return (
    <Page
      title="Settings"
      subtitle="Notifications, brand, and Google API configuration"
      secondaryActions={[{ content: 'Setup Guide', url: '/setup-guide' }]}
    >
      <Layout>
        <Layout.Section>
          <Tabs tabs={TABS} selected={tabIndex} onSelect={setTabIndex}>
            <Box paddingBlockStart="400">
              {TABS[tabIndex].id === 'general'       && <GeneralTab        settings={settings} onSave={onSave} />}
              {TABS[tabIndex].id === 'notifications' && <NotificationsTab  settings={settings} onSave={onSave} />}
              {TABS[tabIndex].id === 'google'        && <GoogleApiTab      settings={settings} googleStatus={googleStatus} onSave={onSave} onClear={onClear} />}
            </Box>
          </Tabs>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
