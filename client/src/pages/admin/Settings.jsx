import React from 'react';
import {
  Page, Layout, Card, Text, BlockStack, Box, Divider, Banner, Badge, InlineStack,
} from '@shopify/polaris';

const ENV_VARS = [
  {
    section: 'Shopify',
    vars: [
      { key: 'SHOPIFY_API_KEY', desc: 'Shopify Partner App API Key', required: true },
      { key: 'SHOPIFY_API_SECRET', desc: 'Shopify Partner App API Secret', required: true },
      { key: 'SHOPIFY_SCOPES', desc: 'Comma-separated OAuth permission scopes', required: true },
      { key: 'SHOPIFY_HOST', desc: 'App public URL (used for OAuth redirect)', required: true },
    ],
  },
  {
    section: 'Google (Fallback)',
    vars: [
      { key: 'GOOGLE_CLIENT_ID', desc: 'Global fallback OAuth Client ID (shops use their own from Settings)', required: false },
      { key: 'GOOGLE_CLIENT_SECRET', desc: 'Global fallback OAuth Client Secret', required: false },
      { key: 'GOOGLE_REDIRECT_URI', desc: 'OAuth redirect URI — must be registered in Google Cloud', required: true },
    ],
  },
  {
    section: 'Database',
    vars: [
      { key: 'DB_HOST', desc: 'MySQL host (use "database" in Lando)', required: true },
      { key: 'DB_NAME', desc: 'MySQL database name', required: true },
      { key: 'DB_USER', desc: 'MySQL username', required: true },
      { key: 'DB_PASSWORD', desc: 'MySQL password', required: true },
    ],
  },
  {
    section: 'Security',
    vars: [
      { key: 'ENCRYPTION_KEY', desc: 'Exactly 32 characters — used to encrypt Google tokens in DB', required: true },
      { key: 'JWT_ADMIN_SECRET', desc: 'Secret for signing admin JWT tokens', required: true },
      { key: 'SESSION_SECRET', desc: 'Express session secret', required: true },
    ],
  },
  {
    section: 'Admin',
    vars: [
      { key: 'SUPER_ADMIN_EMAIL', desc: 'Email for the super admin seeded on first run', required: true },
      { key: 'SUPER_ADMIN_PASSWORD', desc: 'Password for the super admin seeded on first run', required: true },
    ],
  },
];

function EnvRow({ envKey, desc, required }) {
  return (
    <Box paddingBlockStart="200" paddingBlockEnd="200">
      <InlineStack align="space-between" blockAlign="start" gap="400">
        <BlockStack gap="050">
          <InlineStack gap="200" blockAlign="center">
            <code style={{
              background: '#f6f6f7', border: '1px solid #e1e3e5',
              borderRadius: 4, padding: '2px 8px', fontSize: 12, fontFamily: 'monospace',
            }}>
              {envKey}
            </code>
            {required && <Badge tone="critical" size="small">Required</Badge>}
          </InlineStack>
          <Text variant="bodySm" tone="subdued">{desc}</Text>
        </BlockStack>
      </InlineStack>
    </Box>
  );
}

export default function AdminSettings() {
  return (
    <Page title="Settings" subtitle="Environment configuration reference for the application">
      <Layout>
        <Layout.Section>
          <Banner tone="info" title="How to apply changes">
            <p>
              Edit the <code>.env</code> file in the project root and restart the server with{' '}
              <code>lando restart</code> or <code>lando stop && lando start</code>.
              The database auto-syncs on startup — no manual migration needed after adding columns.
            </p>
          </Banner>
        </Layout.Section>

        {ENV_VARS.map(group => (
          <Layout.Section key={group.section}>
            <Card>
              <Box padding="400">
                <BlockStack gap="300">
                  <Text variant="headingMd">{group.section}</Text>
                  <Divider />
                  {group.vars.map((v, i) => (
                    <React.Fragment key={v.key}>
                      <EnvRow {...v} envKey={v.key} />
                      {i < group.vars.length - 1 && <Divider borderColor="border-subdued" />}
                    </React.Fragment>
                  ))}
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>
        ))}

        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="300">
                <Text variant="headingMd">Lando Commands Reference</Text>
                <Divider />
                {[
                  ['lando start', 'Start all services (Node, MySQL, Redis, Vite)'],
                  ['lando stop', 'Stop all services'],
                  ['lando restart', 'Stop then start all services'],
                  ['lando migrate', 'Create / update all database tables'],
                  ['lando seed', 'Seed billing plans and super admin'],
                  ['lando install', 'Run npm install in the server container'],
                  ['lando client-install', 'Run npm install in the Vite client container'],
                  ['lando logs -s node', 'View Express server logs'],
                  ['lando logs -s client', 'View Vite client logs'],
                  ['lando mysql', 'Open MySQL CLI in the database container'],
                ].map(([cmd, desc]) => (
                  <InlineStack key={cmd} align="space-between" blockAlign="start">
                    <code style={{
                      background: '#1a1a2e', color: '#7c83fd',
                      borderRadius: 4, padding: '2px 10px', fontSize: 12, fontFamily: 'monospace', flexShrink: 0,
                    }}>
                      {cmd}
                    </code>
                    <Text variant="bodySm" tone="subdued">{desc}</Text>
                  </InlineStack>
                ))}
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
