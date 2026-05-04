import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Page, Layout, Card, Text, BlockStack, Box, Divider, Banner, Badge,
  InlineStack, Tabs, TextField, Button, FormLayout, Spinner, Modal, List, Link as PolarisLink,
} from '@shopify/polaris';
import { adminApi } from '../../api';

const TABS = [
  { id: 'live',  content: 'Live Setup',  accessibilityLabel: 'Live Setup',  panelID: 'live-panel'  },
  { id: 'local', content: 'Local Setup', accessibilityLabel: 'Local Setup', panelID: 'local-panel' },
];

// ── Local Setup tab — reference-only env that lives in .env (cannot be moved
//    to DB because the DB itself / encryption / sessions need them at boot)
const LOCAL_VARS = [
  {
    section: 'Bootstrap (cannot be DB-managed)',
    note: 'These are read at boot before the database is reachable, so they must stay in the .env file.',
    vars: [
      { key: 'DB_HOST',         desc: 'MySQL host (use "database" in Lando)' },
      { key: 'DB_PORT',         desc: 'MySQL port' },
      { key: 'DB_NAME',         desc: 'MySQL database name' },
      { key: 'DB_USER',         desc: 'MySQL username' },
      { key: 'DB_PASSWORD',     desc: 'MySQL password' },
      { key: 'REDIS_HOST',      desc: 'Redis host' },
      { key: 'REDIS_PORT',      desc: 'Redis port' },
      { key: 'ENCRYPTION_KEY',  desc: '32-byte hex — encrypts every secret in the DB. Cannot be rotated.' },
      { key: 'JWT_SECRET',      desc: 'Signs Shopify session JWTs' },
      { key: 'JWT_ADMIN_SECRET',desc: 'Signs super-admin login JWTs' },
      { key: 'SESSION_SECRET',  desc: 'Express session secret' },
      { key: 'NODE_ENV',        desc: '"development" | "production"' },
      { key: 'PORT',            desc: 'HTTP port the Express server listens on' },
      { key: 'APP_URL',         desc: 'Public HTTPS URL of the app (used by emails for deep links)' },
    ],
  },
];

const LANDO_COMMANDS = [
  ['lando start',           'Start all services (Node, MySQL, Redis, Vite)'],
  ['lando stop',            'Stop all services'],
  ['lando restart',         'Stop then start all services'],
  ['lando restart -s node', 'Restart only the Express server (picks up code/env changes)'],
  ['lando ssh node -c "node server/database/migrate.js"', 'Create / update all database tables'],
  ['lando ssh node -c "node server/database/seed.js"',    'Seed billing plans and super admin'],
  ['lando mysql',           'Open MySQL CLI in the database container'],
  ['lando logs -s node',    'Stream Express server logs'],
  ['lando logs -s client',  'Stream Vite client logs'],
];

// ── How-to-get-this-key modal — shown when admin clicks "How to get key" ────
function KeySetupModal({ field, onClose }) {
  if (!field) return null;
  return (
    <Modal
      open={!!field}
      onClose={onClose}
      title={`Get your ${field.label}`}
      primaryAction={field.signupUrl
        ? { content: 'Open provider site', external: true, url: field.signupUrl }
        : { content: 'Done', onAction: onClose }}
      secondaryActions={[{ content: 'Close', onAction: onClose }]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          {field.help && <Text as="p" tone="subdued">{field.help}</Text>}
          {Array.isArray(field.steps) && field.steps.length > 0 && (
            <BlockStack gap="200">
              <Text as="p" fontWeight="semibold">Steps:</Text>
              <List type="number">
                {field.steps.map((s, i) => <List.Item key={i}>{s}</List.Item>)}
              </List>
            </BlockStack>
          )}
          {field.signupUrl && (
            <Text as="p" tone="subdued" variant="bodySm">
              Provider site: <PolarisLink url={field.signupUrl} external>{field.signupUrl}</PolarisLink>
            </Text>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

// ── Live Setup tab — every editable runtime config ──────────────────────────
function LiveSetupTab({ data, isLoading, onSave }) {
  // Local edit state mirrors the form — initialized from server values, then
  // diffed at save time so we only PUT fields the admin actually changed.
  const [draft, setDraft] = useState({});
  const [revealSecret, setRevealSecret] = useState({});
  const [savedAt, setSavedAt] = useState(null);
  const [setupField, setSetupField] = useState(null);

  useEffect(() => {
    if (!data?.groups) return;
    const next = {};
    for (const group of Object.values(data.groups)) {
      for (const k of group.keys) next[k.key] = k.value || '';
    }
    setDraft(next);
  }, [data]);

  const save = useMutation(onSave, {
    onSuccess: () => { setSavedAt(new Date()); setTimeout(() => setSavedAt(null), 3000); },
  });

  const dirtyPatch = useMemo(() => {
    if (!data?.groups) return {};
    const patch = {};
    for (const group of Object.values(data.groups)) {
      for (const k of group.keys) {
        const orig = k.value || '';
        const cur  = draft[k.key] || '';
        if (cur !== orig) patch[k.key] = cur;
      }
    }
    return patch;
  }, [data, draft]);
  const dirtyCount = Object.keys(dirtyPatch).length;

  if (isLoading) return <Box padding="800"><InlineStack align="center"><Spinner /></InlineStack></Box>;
  if (!data?.groups) return <Banner tone="critical">Failed to load config.</Banner>;

  const setField = (key) => (val) => setDraft(d => ({ ...d, [key]: val }));
  const toggleReveal = (key) => () => setRevealSecret(s => ({ ...s, [key]: !s[key] }));

  return (
    <BlockStack gap="500">
      <Banner tone="info" title="How this works">
        <p>
          Saved values are stored in the database (secrets encrypted with <code>ENCRYPTION_KEY</code>).
          They override the matching <code>.env</code> entry. Clearing a field reverts to the <code>.env</code> fallback.
          Changes apply within ~5 seconds — no server restart needed.
        </p>
      </Banner>

      {savedAt && <Banner tone="success" title={`Saved ${dirtyCount === 0 ? 'successfully' : `${dirtyCount} change(s)`}`} />}
      {save.error && <Banner tone="critical" title="Save failed"><Text as="p">{save.error?.error || 'Unknown error'}</Text></Banner>}

      {Object.entries(data.groups).map(([groupId, group]) => (
        <Card key={groupId}>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text variant="headingMd" as="h2">{group.label}</Text>
              {group.description && (
                <Text variant="bodySm" tone="subdued" as="p">{group.description}</Text>
              )}
            </BlockStack>
            <Divider />
            <FormLayout>
              {group.keys.map(k => (
                <TextField
                  key={k.key}
                  label={
                    <InlineStack gap="200" blockAlign="center">
                      <span>{k.label}</span>
                      <code style={{ background: 'var(--p-color-bg-surface-secondary)', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>{k.key}</code>
                      {k.required && <Badge tone="critical" size="small">Required</Badge>}
                      {k.source === 'db'  && <Badge tone="success" size="small">DB override</Badge>}
                      {k.source === 'env' && <Badge size="small">From .env</Badge>}
                      {k.source === 'unset' && <Badge tone="warning" size="small">Unset</Badge>}
                      {(k.signupUrl || (Array.isArray(k.steps) && k.steps.length > 0)) && (
                        <Button variant="plain" size="micro" onClick={() => setSetupField(k)}>How to get key</Button>
                      )}
                    </InlineStack>
                  }
                  type={k.secret && !revealSecret[k.key] ? 'password' : 'text'}
                  value={draft[k.key] || ''}
                  onChange={setField(k.key)}
                  helpText={k.help || k.defaultHint || ''}
                  placeholder={k.defaultHint ? `e.g. ${k.defaultHint}` : ''}
                  autoComplete="off"
                  connectedRight={k.secret && (
                    <Button onClick={toggleReveal(k.key)}>
                      {revealSecret[k.key] ? 'Hide' : 'Show'}
                    </Button>
                  )}
                />
              ))}
            </FormLayout>
          </BlockStack>
        </Card>
      ))}

      <KeySetupModal field={setupField} onClose={() => setSetupField(null)} />

      <InlineStack gap="200">
        <Button
          variant="primary"
          onClick={() => save.mutate(dirtyPatch)}
          loading={save.isLoading}
          disabled={dirtyCount === 0}
        >
          {dirtyCount === 0 ? 'No changes to save' : `Save ${dirtyCount} change${dirtyCount === 1 ? '' : 's'}`}
        </Button>
        {dirtyCount > 0 && (
          <Button onClick={() => {
            // Reset draft to original server values
            const next = {};
            for (const group of Object.values(data.groups)) {
              for (const k of group.keys) next[k.key] = k.value || '';
            }
            setDraft(next);
          }}>Discard changes</Button>
        )}
      </InlineStack>
    </BlockStack>
  );
}

// ── Local Setup tab — reference for the bootstrap .env values + Lando ────────
function LocalSetupTab() {
  return (
    <BlockStack gap="500">
      <Banner tone="info" title="What lives here vs. in Live Setup">
        <p>
          The <strong>Live Setup</strong> tab manages every API key the running app uses
          (Shopify, Google, AI, SMTP) — those are stored in the database and editable here.
          This tab is reference-only for the few values that <strong>must</strong> live in <code>.env</code>:
          database connection, encryption key, JWT/session secrets. Editing those needs file
          access + a restart.
        </p>
      </Banner>

      {LOCAL_VARS.map(group => (
        <Card key={group.section}>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">{group.section}</Text>
            {group.note && <Text variant="bodySm" as="p" tone="subdued">{group.note}</Text>}
            <Divider />
            {group.vars.map((v, i) => (
              <Box key={v.key} paddingBlock="200" borderBlockEndWidth={i < group.vars.length - 1 ? '025' : '0'} borderColor="border">
                <InlineStack align="space-between" blockAlign="start" gap="400">
                  <BlockStack gap="050">
                    <code style={{
                      background: 'var(--p-color-bg-surface-secondary)',
                      border: '1px solid var(--p-color-border)',
                      borderRadius: 4, padding: '2px 8px', fontSize: 12, alignSelf: 'flex-start',
                    }}>{v.key}</code>
                    <Text variant="bodySm" as="p" tone="subdued">{v.desc}</Text>
                  </BlockStack>
                </InlineStack>
              </Box>
            ))}
          </BlockStack>
        </Card>
      ))}

      <Card>
        <BlockStack gap="300">
          <Text variant="headingMd" as="h2">Lando Commands Reference</Text>
          <Divider />
          {LANDO_COMMANDS.map(([cmd, desc]) => (
            <InlineStack key={cmd} align="space-between" blockAlign="center" wrap>
              <code style={{
                background: '#1a1a2e', color: '#a8b3cf',
                borderRadius: 4, padding: '4px 10px', fontSize: 12,
              }}>{cmd}</code>
              <Text variant="bodySm" as="span" tone="subdued">{desc}</Text>
            </InlineStack>
          ))}
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function AdminSettings() {
  const qc = useQueryClient();
  const [tabIndex, setTabIndex] = useState(0);

  const { data, isLoading } = useQuery('admin-config', adminApi.config);

  const saveConfig = (patch) => adminApi.saveConfig(patch).then(r => {
    qc.invalidateQueries('admin-config');
    return r;
  });

  return (
    <Page title="Settings" subtitle="Runtime configuration for the application">
      <Layout>
        <Layout.Section>
          <Tabs tabs={TABS} selected={tabIndex} onSelect={setTabIndex}>
            <Box paddingBlockStart="400">
              {TABS[tabIndex].id === 'live'  && <LiveSetupTab data={data} isLoading={isLoading} onSave={saveConfig} />}
              {TABS[tabIndex].id === 'local' && <LocalSetupTab />}
            </Box>
          </Tabs>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
