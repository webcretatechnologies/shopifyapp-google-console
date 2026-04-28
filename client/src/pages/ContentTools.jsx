import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Page, Layout, Card, Tabs, Text, BlockStack, InlineStack, Box, Banner,
  Button, ButtonGroup, TextField, Select, Spinner, Badge, EmptyState,
  Checkbox, Divider, Autocomplete, Icon, Thumbnail,
} from '@shopify/polaris';
import { SearchIcon, ImageIcon } from '@shopify/polaris-icons';
import { productsApi, contentApi, faqsApi, markupApi } from '../api';

const TABS = [
  { id: 'content',  content: 'Content Creation',   accessibilityLabel: 'Content Creation',   panelID: 'content-panel'  },
  { id: 'faqs',     content: 'FAQs',               accessibilityLabel: 'FAQs',               panelID: 'faqs-panel'     },
  { id: 'markup',   content: 'Structured Markup',  accessibilityLabel: 'Structured Markup',  panelID: 'markup-panel'   },
];

const KIND_LABEL = {
  description:      'Product description',
  title:            'Product title',
  meta_title:       'SEO meta title',
  meta_description: 'SEO meta description',
};

// ── Shared product picker — searchable Autocomplete with image thumbnails ──
function ProductPicker({ value, onChange }) {
  const { data: payload, isLoading } = useQuery('products-list', () => productsApi.list({ limit: 1000 }));
  const list = useMemo(() => {
    if (!payload) return [];
    return Array.isArray(payload) ? payload : (payload.products || []);
  }, [payload]);

  // Build all options once. Each option's `media` is a small thumbnail.
  const allOptions = useMemo(() => list.map(p => {
    const imgUrl = Array.isArray(p.images) && p.images.length ? (p.images[0]?.src || p.images[0]?.url) : null;
    return {
      value: String(p.id),
      label: p.title,
      media: imgUrl
        ? <Thumbnail source={imgUrl} alt={p.title} size="small" />
        : <Thumbnail source={ImageIcon}    alt={p.title} size="small" />,
      // Keep the searchable text on the option for our local filter
      _searchText: `${p.title || ''} ${p.vendor || ''} ${p.product_type || ''}`.toLowerCase(),
    };
  }), [list]);

  const [inputValue, setInputValue] = useState('');
  const [filtered, setFiltered] = useState([]);

  // Reset/sync the visible filter list when the underlying product list changes
  useEffect(() => { setFiltered(allOptions); }, [allOptions]);

  // When the selected `value` changes externally (e.g. on first mount), show
  // the matching product's title in the input.
  useEffect(() => {
    if (!value) { setInputValue(''); return; }
    const match = allOptions.find(o => o.value === String(value));
    if (match) setInputValue(match.label);
  }, [value, allOptions]);

  const updateText = useCallback((text) => {
    setInputValue(text);
    if (!text) { setFiltered(allOptions); return; }
    const q = text.toLowerCase();
    setFiltered(allOptions.filter(o => o._searchText.includes(q)));
  }, [allOptions]);

  // Polaris Autocomplete passes selected as an array (length 1 in single mode)
  const handleSelect = useCallback((selected) => {
    const sel = selected[0];
    if (!sel) return;
    const match = allOptions.find(o => o.value === sel);
    if (match) {
      setInputValue(match.label);
      onChange(parseInt(sel, 10));
    }
  }, [allOptions, onChange]);

  return (
    <Autocomplete
      options={filtered}
      selected={value ? [String(value)] : []}
      onSelect={handleSelect}
      loading={isLoading}
      emptyState={
        <Box padding="400">
          <Text variant="bodySm" as="p" tone="subdued" alignment="center">
            {isLoading ? 'Loading products…' : `No products match "${inputValue}"`}
          </Text>
        </Box>
      }
      textField={
        <Autocomplete.TextField
          label="Product"
          labelHidden
          value={inputValue}
          onChange={updateText}
          placeholder={list.length ? `Search ${list.length} product${list.length === 1 ? '' : 's'}…` : 'Loading products…'}
          prefix={<Icon source={SearchIcon} />}
          autoComplete="off"
          clearButton
          onClearButtonClick={() => { setInputValue(''); setFiltered(allOptions); onChange(null); }}
        />
      }
    />
  );
}

// ── Tab 1: Content Creation ──────────────────────────────────────────────────
function ContentTab({ productId }) {
  const qc = useQueryClient();
  const [selectedKinds, setSelectedKinds] = useState({
    description: true, title: false, meta_title: true, meta_description: true,
  });

  const { data: drafts = [], isLoading } = useQuery(
    ['content-drafts', productId],
    () => contentApi.drafts(productId),
    { enabled: !!productId },
  );

  const generate = useMutation(
    () => contentApi.generate({
      product_id: productId,
      kinds: Object.entries(selectedKinds).filter(([, v]) => v).map(([k]) => k),
    }),
    { onSuccess: () => qc.invalidateQueries(['content-drafts', productId]) },
  );

  const updateDraft = useMutation(
    ({ id, data }) => contentApi.updateDraft(id, data),
    { onSuccess: () => qc.invalidateQueries(['content-drafts', productId]) },
  );
  const publishDraft = useMutation(
    (id) => contentApi.publishDraft(id),
    { onSuccess: () => qc.invalidateQueries(['content-drafts', productId]) },
  );
  const deleteDraft = useMutation(
    (id) => contentApi.deleteDraft(id),
    { onSuccess: () => qc.invalidateQueries(['content-drafts', productId]) },
  );

  if (!productId) {
    return (
      <Card>
        <EmptyState heading="Pick a product to begin" image="">
          <p>Select a product above. The AI will generate a fresh description, SEO title, and meta tags you can edit and publish back to Shopify.</p>
        </EmptyState>
      </Card>
    );
  }

  return (
    <BlockStack gap="400">
      {/* Generation controls */}
      <Card>
        <BlockStack gap="300">
          <Text variant="headingMd" as="h2">Generate new copy</Text>
          <Text variant="bodySm" as="p" tone="subdued">
            Pick which fields to (re)generate. Each runs through one of the platform's free AI models.
          </Text>
          <InlineStack gap="400" wrap>
            {Object.entries(KIND_LABEL).map(([k, label]) => (
              <Checkbox
                key={k}
                label={label}
                checked={selectedKinds[k]}
                onChange={(v) => setSelectedKinds(s => ({ ...s, [k]: v }))}
              />
            ))}
          </InlineStack>
          <InlineStack>
            <Button
              variant="primary"
              loading={generate.isLoading}
              disabled={!Object.values(selectedKinds).some(Boolean)}
              onClick={() => generate.mutate()}
            >Generate with AI</Button>
          </InlineStack>
          {generate.error && <Banner tone="critical"><Text as="p">{generate.error?.error || 'Generation failed'}</Text></Banner>}
        </BlockStack>
      </Card>

      {/* Drafts */}
      {isLoading && <Box padding="800"><InlineStack align="center"><Spinner /></InlineStack></Box>}
      {!isLoading && drafts.length === 0 && (
        <Card>
          <EmptyState heading="No drafts yet" image="">
            <p>Click "Generate with AI" above to create your first draft for this product.</p>
          </EmptyState>
        </Card>
      )}

      {drafts.map(d => (
        <DraftCard
          key={d.id}
          draft={d}
          onSave={(text) => updateDraft.mutate({ id: d.id, data: { edited_text: text } })}
          onApprove={() => updateDraft.mutate({ id: d.id, data: { status: 'approved' } })}
          onPublish={() => publishDraft.mutate(d.id)}
          onDiscard={() => updateDraft.mutate({ id: d.id, data: { status: 'discarded' } })}
          onDelete={() => deleteDraft.mutate(d.id)}
          publishLoading={publishDraft.isLoading}
        />
      ))}
    </BlockStack>
  );
}

function DraftCard({ draft, onSave, onApprove, onPublish, onDiscard, onDelete, publishLoading }) {
  const [text, setText] = useState(draft.edited_text || draft.generated_text || '');
  const [dirty, setDirty] = useState(false);

  const statusTone = {
    draft: undefined, approved: 'attention', published: 'success', discarded: 'critical',
  }[draft.status];

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center" wrap>
          <InlineStack gap="200" blockAlign="center" wrap>
            <Text variant="headingSm" as="h3">{KIND_LABEL[draft.kind] || draft.kind}</Text>
            <Badge tone={statusTone}>{draft.status}</Badge>
            {draft.provider && <Badge>{draft.provider}</Badge>}
          </InlineStack>
          <Text variant="bodySm" as="span" tone="subdued">
            {new Date(draft.created_at).toLocaleString()}
          </Text>
        </InlineStack>

        <TextField
          label="Generated text"
          labelHidden
          multiline={draft.kind === 'description' || draft.kind === 'meta_description' ? 6 : 2}
          value={text}
          onChange={(v) => { setText(v); setDirty(true); }}
          autoComplete="off"
        />

        {draft.publish_error && (
          <Banner tone="critical" title="Last publish failed">
            <Text as="p">{draft.publish_error}</Text>
          </Banner>
        )}

        <InlineStack gap="200">
          <Button onClick={() => { onSave(text); setDirty(false); }} disabled={!dirty}>
            {dirty ? 'Save edit' : 'Saved'}
          </Button>
          {draft.status !== 'approved' && draft.status !== 'published' && (
            <Button onClick={() => { onSave(text); onApprove(); setDirty(false); }}>Approve</Button>
          )}
          {draft.status !== 'published' && (
            <Button variant="primary" loading={publishLoading} onClick={() => { onSave(text); onPublish(); setDirty(false); }}>
              Publish to Shopify
            </Button>
          )}
          <Button onClick={onDiscard}>Discard</Button>
          <Button tone="critical" variant="plain" onClick={() => { if (window.confirm('Delete this draft?')) onDelete(); }}>
            Delete
          </Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

// ── Tab 2: FAQs ──────────────────────────────────────────────────────────────
function FaqsTab({ productId }) {
  const qc = useQueryClient();
  const [newQ, setNewQ] = useState('');
  const [newA, setNewA] = useState('');

  const { data: faqs = [], isLoading } = useQuery(
    ['faqs', productId],
    () => faqsApi.forProduct(productId),
    { enabled: !!productId },
  );

  const generate = useMutation(
    (replace) => faqsApi.generate({ product_id: productId, replace }),
    { onSuccess: () => qc.invalidateQueries(['faqs', productId]) },
  );
  const update = useMutation(
    ({ id, data }) => faqsApi.update(id, data),
    { onSuccess: () => qc.invalidateQueries(['faqs', productId]) },
  );
  const create = useMutation(
    () => faqsApi.create({ product_id: productId, question: newQ, answer: newA }),
    { onSuccess: () => { qc.invalidateQueries(['faqs', productId]); setNewQ(''); setNewA(''); } },
  );
  const remove = useMutation(
    (id) => faqsApi.delete(id),
    { onSuccess: () => qc.invalidateQueries(['faqs', productId]) },
  );

  if (!productId) {
    return (
      <Card>
        <EmptyState heading="Pick a product to manage FAQs" image="">
          <p>Generate Q&amp;A pairs with AI or write them manually. Approved FAQs power the FAQ schema in the next tab.</p>
        </EmptyState>
      </Card>
    );
  }

  return (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center">
            <Text variant="headingMd" as="h2">Auto-generate FAQs</Text>
            <ButtonGroup>
              <Button onClick={() => generate.mutate(false)} loading={generate.isLoading}>
                Append 6 FAQs
              </Button>
              <Button
                tone="critical"
                variant="secondary"
                onClick={() => { if (window.confirm('Delete existing AI-generated FAQs and regenerate?')) generate.mutate(true); }}
              >Replace AI FAQs</Button>
            </ButtonGroup>
          </InlineStack>
          <Text variant="bodySm" as="p" tone="subdued">
            We'll send your product details to one of the free LLMs and generate 6 shopper-style Q&amp;As.
          </Text>
          {generate.error && <Banner tone="critical"><Text as="p">{generate.error?.error || 'Generation failed'}</Text></Banner>}
        </BlockStack>
      </Card>

      {isLoading && <Box padding="800"><InlineStack align="center"><Spinner /></InlineStack></Box>}

      {!isLoading && faqs.length === 0 && (
        <Card>
          <EmptyState heading="No FAQs yet" image="">
            <p>Click "Append 6 FAQs" above to generate, or add your own below.</p>
          </EmptyState>
        </Card>
      )}

      {faqs.map(f => (
        <FaqRow
          key={f.id}
          faq={f}
          onSave={(data) => update.mutate({ id: f.id, data })}
          onDelete={() => { if (window.confirm('Delete this FAQ?')) remove.mutate(f.id); }}
        />
      ))}

      <Card>
        <BlockStack gap="300">
          <Text variant="headingMd" as="h2">Add manual FAQ</Text>
          <TextField label="Question" value={newQ} onChange={setNewQ} autoComplete="off" />
          <TextField label="Answer" value={newA} onChange={setNewA} multiline={3} autoComplete="off" />
          <InlineStack>
            <Button
              variant="primary"
              disabled={!newQ.trim() || !newA.trim()}
              loading={create.isLoading}
              onClick={() => create.mutate()}
            >Add FAQ</Button>
          </InlineStack>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

function FaqRow({ faq, onSave, onDelete }) {
  const [q, setQ] = useState(faq.question);
  const [a, setA] = useState(faq.answer);
  const dirty = q !== faq.question || a !== faq.answer;

  return (
    <Card>
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="200" blockAlign="center">
            <Badge tone={faq.source === 'ai' ? 'info' : undefined}>{faq.source}</Badge>
            <Badge tone={faq.status === 'approved' ? 'success' : undefined}>{faq.status}</Badge>
            {faq.provider && <Text variant="bodySm" as="span" tone="subdued">{faq.provider}</Text>}
          </InlineStack>
          <Button tone="critical" variant="plain" onClick={onDelete}>Delete</Button>
        </InlineStack>
        <TextField label="Question" value={q} onChange={setQ} autoComplete="off" />
        <TextField label="Answer" value={a} onChange={setA} multiline={3} autoComplete="off" />
        <InlineStack gap="200">
          <Button onClick={() => onSave({ question: q, answer: a })} disabled={!dirty}>
            {dirty ? 'Save edits' : 'Saved'}
          </Button>
          {faq.status !== 'approved' && (
            <Button onClick={() => onSave({ status: 'approved' })}>Approve</Button>
          )}
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

// ── Tab 3: Structured Markup ─────────────────────────────────────────────────
function MarkupTab({ productId }) {
  const qc = useQueryClient();

  const { data: cfg, isLoading: cfgL } = useQuery('markup-config', markupApi.config);
  const { data: preview, isLoading: prevL } = useQuery(
    ['markup-preview', productId],
    () => markupApi.preview(productId),
    { enabled: !!productId },
  );

  const saveConfig = useMutation(markupApi.saveConfig, {
    onSuccess: () => { qc.invalidateQueries('markup-config'); qc.invalidateQueries(['markup-preview', productId]); },
  });
  const installTag   = useMutation(markupApi.installScriptTag,   { onSuccess: () => qc.invalidateQueries('markup-config') });
  const uninstallTag = useMutation(markupApi.uninstallScriptTag, { onSuccess: () => qc.invalidateQueries('markup-config') });

  if (cfgL) return <Box padding="800"><InlineStack align="center"><Spinner /></InlineStack></Box>;

  return (
    <BlockStack gap="400">
      {/* Schema-type toggles */}
      <Card>
        <BlockStack gap="300">
          <Text variant="headingMd" as="h2">Which schemas to emit</Text>
          {['product', 'faq', 'breadcrumb', 'organization'].map(t => (
            <Checkbox
              key={t}
              label={
                t === 'product'      ? 'Product (price, brand, image)' :
                t === 'faq'          ? 'FAQPage (from approved FAQs)' :
                t === 'breadcrumb'   ? 'BreadcrumbList' :
                                       'Organization (logo, social profiles)'
              }
              checked={!!cfg?.enabled_types?.[t]}
              onChange={(v) => saveConfig.mutate({
                enabled_types: { ...cfg.enabled_types, [t]: v },
              })}
            />
          ))}
        </BlockStack>
      </Card>

      {/* Organization details (only if enabled) */}
      {cfg?.enabled_types?.organization && (
        <OrgConfigCard cfg={cfg} onSave={(p) => saveConfig.mutate(p)} />
      )}

      {/* Injection mode */}
      <Card>
        <BlockStack gap="300">
          <Text variant="headingMd" as="h2">How to deliver the JSON-LD</Text>
          <BlockStack gap="200">
            <InlineStack gap="200" blockAlign="center">
              <Badge tone={cfg?.injection_mode === 'paste' ? 'success' : undefined}>Manual paste</Badge>
              <Text variant="bodySm" as="span">Default. Copy the script blocks below and paste into your theme's product template.</Text>
            </InlineStack>
            <InlineStack gap="200" blockAlign="center">
              <Badge tone={cfg?.injection_mode === 'script_tag' ? 'success' : undefined}>Auto-inject</Badge>
              <Text variant="bodySm" as="span">We install a Shopify Script Tag that detects product pages and injects per-page JSON-LD.</Text>
            </InlineStack>
          </BlockStack>
          <Divider />
          <InlineStack gap="200">
            {cfg?.script_tag_installed ? (
              <Button tone="critical" loading={uninstallTag.isLoading} onClick={() => {
                if (window.confirm('Remove the Shopify Script Tag? Your storefront will stop emitting auto-injected JSON-LD.')) {
                  uninstallTag.mutate();
                }
              }}>Uninstall Script Tag</Button>
            ) : (
              <Button variant="primary" loading={installTag.isLoading} onClick={() => installTag.mutate()}>
                Install Script Tag (auto-inject mode)
              </Button>
            )}
          </InlineStack>
          {(installTag.error || uninstallTag.error) && (
            <Banner tone="critical">
              <Text as="p">{(installTag.error || uninstallTag.error)?.error || 'Operation failed'}</Text>
            </Banner>
          )}
        </BlockStack>
      </Card>

      {/* Per-product preview */}
      {!productId && (
        <Card>
          <EmptyState heading="Pick a product to preview the schema output" image="">
            <p>Once you select a product, you'll see exactly what JSON-LD blocks will be emitted on its page.</p>
          </EmptyState>
        </Card>
      )}

      {productId && (
        prevL ? <Box padding="800"><InlineStack align="center"><Spinner /></InlineStack></Box> :
        preview?.blocks?.length ? (
          <BlockStack gap="300">
            {preview.blocks.map(b => (
              <Card key={b.key}>
                <BlockStack gap="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingSm" as="h3">{b.type}</Text>
                    <Button variant="plain" onClick={() => {
                      navigator.clipboard.writeText(`<script type="application/ld+json">\n${JSON.stringify(b.json, null, 2)}\n</script>`);
                    }}>Copy block</Button>
                  </InlineStack>
                  <Box background="bg-surface-secondary" padding="300" borderRadius="200" borderWidth="025" borderColor="border">
                    <pre style={{ margin: 0, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
{JSON.stringify(b.json, null, 2)}
                    </pre>
                  </Box>
                </BlockStack>
              </Card>
            ))}
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingSm" as="h3">All blocks combined (paste into theme)</Text>
                  <Button variant="primary" onClick={() => navigator.clipboard.writeText(preview.html)}>
                    Copy all
                  </Button>
                </InlineStack>
                <Box background="bg-surface-secondary" padding="300" borderRadius="200" borderWidth="025" borderColor="border" maxHeight="240px" overflow="auto">
                  <pre style={{ margin: 0, fontSize: 11, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{preview.html}</pre>
                </Box>
              </BlockStack>
            </Card>
          </BlockStack>
        ) : (
          <Card><EmptyState heading="No schema blocks for this product" image=""><p>Enable at least one schema type above.</p></EmptyState></Card>
        )
      )}
    </BlockStack>
  );
}

function OrgConfigCard({ cfg, onSave }) {
  const [logo, setLogo] = useState(cfg?.org_logo_url || '');
  const [socials, setSocials] = useState((cfg?.org_social_profiles || []).join('\n'));
  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingMd" as="h2">Organization details</Text>
        <Text variant="bodySm" as="p" tone="subdued">
          These appear in the Organization JSON-LD block on every product page.
        </Text>
        <TextField
          label="Logo URL"
          value={logo}
          onChange={setLogo}
          placeholder="https://yourstore.com/logo.png"
          autoComplete="off"
        />
        <TextField
          label="Social profile URLs (one per line)"
          value={socials}
          onChange={setSocials}
          multiline={4}
          placeholder="https://twitter.com/yourbrand
https://instagram.com/yourbrand"
          autoComplete="off"
        />
        <InlineStack>
          <Button variant="primary" onClick={() => onSave({
            org_logo_url: logo,
            org_social_profiles: socials.split('\n').map(s => s.trim()).filter(Boolean),
          })}>Save organization details</Button>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function ContentTools() {
  const [tabIndex, setTabIndex] = useState(0);
  const [productId, setProductId] = useState(null);

  return (
    <Page
      title="Content & Schema"
      subtitle="AI-generated product copy, FAQs, and JSON-LD structured markup"
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text variant="headingMd" as="h2">Product</Text>
              <Text variant="bodySm" as="p" tone="subdued">
                All three tabs operate on the product you select here.
              </Text>
              <ProductPicker value={productId} onChange={setProductId} />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Tabs tabs={TABS} selected={tabIndex} onSelect={setTabIndex}>
            <Box paddingBlockStart="400">
              {TABS[tabIndex].id === 'content' && <ContentTab productId={productId} />}
              {TABS[tabIndex].id === 'faqs'    && <FaqsTab    productId={productId} />}
              {TABS[tabIndex].id === 'markup'  && <MarkupTab  productId={productId} />}
            </Box>
          </Tabs>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
