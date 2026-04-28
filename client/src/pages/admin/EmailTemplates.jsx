import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Page, Layout, Card, Text, BlockStack, InlineStack, Box, Banner,
  Button, TextField, Spinner, Tag, Modal,
} from '@shopify/polaris';
import { adminApi } from '../../api';

export default function AdminEmailTemplates() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery(
    'admin-email-templates',
    adminApi.emailTemplates,
    { refetchOnWindowFocus: false },
  );

  const events = data?.events || [];
  const [selectedKey, setSelectedKey] = useState(null);
  const [draft, setDraft] = useState({ subject: '', header_html: '', body_html: '', footer_html: '' });
  const [savedFlash, setSavedFlash] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  // Auto-select the first template when the list loads
  useEffect(() => {
    if (!selectedKey && events.length) setSelectedKey(events[0].key);
  }, [events, selectedKey]);

  const selected = events.find(e => e.key === selectedKey);

  // When the selected template changes, populate the editor with its current
  // saved layout (or the default if nothing has been saved yet).
  useEffect(() => {
    if (!selected) return;
    setDraft({
      subject: selected.subject || '',
      header_html: selected.header_html || '',
      body_html: selected.body_html || '',
      footer_html: selected.footer_html || '',
    });
  }, [selectedKey, selected?.saved]);

  const save = useMutation(
    () => adminApi.saveEmailTemplate({ event_key: selectedKey, ...draft }),
    {
      onSuccess: () => {
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 2500);
        qc.invalidateQueries('admin-email-templates');
      },
    },
  );

  const preview = useMutation(
    () => adminApi.previewEmailTemplate({ event_key: selectedKey, ...draft }),
    {
      onSuccess: (res) => {
        setPreviewHtml(res?.html || '');
        setPreviewOpen(true);
      },
    },
  );

  if (isLoading) {
    return (
      <Page title="Email Templates">
        <Box padding="1600"><InlineStack align="center"><Spinner /></InlineStack></Box>
      </Page>
    );
  }

  if (error) {
    return (
      <Page title="Email Templates">
        <Banner tone="critical" title="Failed to load templates"
          action={{ content: 'Retry', onAction: () => refetch() }}>
          <p>{error?.error || error?.message || 'Could not load templates.'}</p>
        </Banner>
      </Page>
    );
  }

  // Insert a {{token}} at the end of the named field
  const insertToken = (field, token) => {
    const wrap = (token === 'plan_features' || token === 'plan_usage') ? `{{{${token}}}}` : `{{${token}}}`;
    setDraft(d => ({ ...d, [field]: (d[field] || '') + wrap }));
  };

  return (
    <Page
      title="Email Templates"
      subtitle="Pick an email and edit its header, content, and footer. Use the variables below to insert dynamic shop and plan data."
    >
      <Layout>
        {/* Left rail: list of templates */}
        <Layout.Section variant="oneThird">
          <Card padding="0">
            <Box paddingInline="400" paddingBlock="300" borderBlockEndWidth="025" borderColor="border">
              <Text variant="headingSm" as="h2">Templates</Text>
            </Box>
            <BlockStack gap="0">
              {events.map(ev => {
                const isSelected = ev.key === selectedKey;
                return (
                  <button
                    key={ev.key}
                    onClick={() => setSelectedKey(ev.key)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '12px 16px', cursor: 'pointer',
                      background: isSelected ? 'var(--p-color-bg-surface-selected)' : 'transparent',
                      borderLeft: isSelected ? '3px solid var(--p-color-text)' : '3px solid transparent',
                      border: 'none',
                      borderBottom: '1px solid var(--p-color-border-secondary)',
                      font: 'inherit',
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: isSelected ? 600 : 500, color: 'var(--p-color-text)' }}>
                      {ev.label}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--p-color-text-secondary)', marginTop: 2 }}>
                      {ev.saved ? 'Custom layout' : 'Default layout'}
                    </div>
                  </button>
                );
              })}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Right pane: editor */}
        <Layout.Section>
          {!selected ? (
            <Card>
              <Box padding="800">
                <Text variant="bodyMd" as="p" tone="subdued" alignment="center">
                  Pick a template on the left to start editing.
                </Text>
              </Box>
            </Card>
          ) : (
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="100">
                    <Text variant="headingLg" as="h2">{selected.label}</Text>
                    <Text variant="bodyMd" as="p" tone="subdued">{selected.description}</Text>
                  </BlockStack>

                  {savedFlash && <Banner tone="success">Saved</Banner>}
                  {save.error && <Banner tone="critical"><p>{save.error?.error || 'Save failed'}</p></Banner>}

                  <TextField
                    label="Subject"
                    value={draft.subject}
                    onChange={(v) => setDraft(d => ({ ...d, subject: v }))}
                    autoComplete="off"
                    helpText="Plain text. Use {{shop_name}}, {{plan_name}}, etc."
                  />

                  <TextField
                    label="Header (HTML)"
                    value={draft.header_html}
                    onChange={(v) => setDraft(d => ({ ...d, header_html: v }))}
                    multiline={4}
                    autoComplete="off"
                    helpText="Leave blank to use the default app header."
                  />
                  <InlineStack gap="100" wrap>
                    {selected.availableTokens.map(t => (
                      <Tag key={`h-${t}`} onClick={() => insertToken('header_html', t)}>{`{{${t}}}`}</Tag>
                    ))}
                  </InlineStack>

                  <TextField
                    label="Content (HTML)"
                    value={draft.body_html}
                    onChange={(v) => setDraft(d => ({ ...d, body_html: v }))}
                    multiline={14}
                    autoComplete="off"
                    helpText="The main email body. Insert variables from below."
                  />
                  <InlineStack gap="100" wrap>
                    {selected.availableTokens.map(t => (
                      <Tag key={`b-${t}`} onClick={() => insertToken('body_html', t)}>{`{{${t}}}`}</Tag>
                    ))}
                  </InlineStack>

                  <TextField
                    label="Footer (HTML)"
                    value={draft.footer_html}
                    onChange={(v) => setDraft(d => ({ ...d, footer_html: v }))}
                    multiline={3}
                    autoComplete="off"
                  />

                  <InlineStack gap="200">
                    <Button variant="primary" onClick={() => save.mutate()} loading={save.isLoading}>
                      Save layout
                    </Button>
                    <Button onClick={() => preview.mutate()} loading={preview.isLoading}>
                      Preview
                    </Button>
                  </InlineStack>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm" as="h3">Available variables</Text>
                  <Text variant="bodyMd" as="p" tone="subdued">
                    Click a tag above to insert. <code>{'{{shop_name}}'}</code> renders escaped text;
                    <code>{' {{{plan_features}}} '}</code> and <code>{'{{{plan_usage}}}'}</code> render as
                    HTML lists (use the triple-brace form for those two).
                  </Text>
                  <BlockStack gap="100">
                    <Text variant="bodyMd" as="p"><strong>shop_name</strong> — the merchant's store name</Text>
                    <Text variant="bodyMd" as="p"><strong>plan_name</strong> — current plan (e.g. Growth)</Text>
                    <Text variant="bodyMd" as="p"><strong>plan_price</strong> — monthly price</Text>
                    <Text variant="bodyMd" as="p"><strong>plan_features</strong> — bullet list of what's included in this plan</Text>
                    <Text variant="bodyMd" as="p"><strong>plan_usage</strong> — bullet list of usage vs plan limits this month</Text>
                    <Text variant="bodyMd" as="p"><strong>app_url</strong> — the app's public URL</Text>
                    {selected.availableTokens.filter(t => !['shop_name','plan_name','plan_price','plan_features','plan_usage','app_url'].includes(t)).map(t => (
                      <Text key={t} variant="bodyMd" as="p"><strong>{t}</strong> — event-specific value</Text>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          )}
        </Layout.Section>
      </Layout>

      <Modal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Preview"
        large
      >
        <Modal.Section>
          <iframe
            title="Email preview"
            srcDoc={previewHtml}
            style={{ width: '100%', height: 600, border: '1px solid var(--p-color-border)', borderRadius: 8 }}
          />
        </Modal.Section>
      </Modal>
    </Page>
  );
}
