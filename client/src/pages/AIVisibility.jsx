import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Page, Card, Text, Banner, BlockStack, InlineStack, Box, Spinner, Badge,
  Button, ButtonGroup, Select, Tabs, EmptyState, Layout, InlineGrid,
} from '@shopify/polaris';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { aiVisibilityApi } from '../api';

const TABS = [
  { id: 'overview', content: 'Visibility Overview', accessibilityLabel: 'Visibility Overview', panelID: 'overview-panel' },
  { id: 'prompts',  content: 'Prompts',             accessibilityLabel: 'Prompts',             panelID: 'prompts-panel'  },
  { id: 'results',  content: 'Results',             accessibilityLabel: 'Results',             panelID: 'results-panel'  },
];

const fmt = (n) => (n || 0).toLocaleString();

// ── Provider initials avatar ─────────────────────────────────────────────────
// Small decorative chip — no Polaris equivalent, kept as a styled <div>.
function ProviderIcon({ icon, bg, size = 26 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 6, background: bg,
      color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size >= 26 ? 11 : 10, fontWeight: 700, letterSpacing: 0.5,
    }}>{icon}</div>
  );
}

// ── Score gauge (custom SVG; Polaris has no semicircle gauge) ───────────────
function VisibilityGauge({ score = 0 }) {
  const p = Math.max(0, Math.min(100, score));
  const stroke = p >= 70 ? 'var(--p-color-text-success)' :
                 p >= 40 ? 'var(--p-color-text-info)' :
                 p >= 20 ? 'var(--p-color-text-warning)' :
                           'var(--p-color-text-critical)';
  const label = p >= 70 ? 'Strong' : p >= 40 ? 'Medium' : p >= 20 ? 'Low' : 'Very Low';
  const r = 80, cx = 100, cy = 95;
  const arcLen = Math.PI * r;
  const dash = (p / 100) * arcLen;
  return (
    <BlockStack gap="200" inlineAlign="center">
      <div style={{ width: 220, height: 130, position: 'relative' }}>
        <svg viewBox="0 0 200 130" width="100%" height="100%">
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                fill="none" stroke="var(--p-color-border)" strokeWidth="14" strokeLinecap="round" />
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
                fill="none" stroke={stroke} strokeWidth="14" strokeLinecap="round"
                strokeDasharray={`${dash} ${arcLen}`} />
        </svg>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 18, textAlign: 'center' }}>
          <Text variant="heading2xl" as="p" fontWeight="bold">
            {p}<Text as="span" variant="bodyMd" tone="subdued">/100</Text>
          </Text>
          <Box paddingBlockStart="100">
            <Text variant="bodySm" fontWeight="semibold" tone={
              p >= 70 ? 'success' : p >= 40 ? 'magic' : p >= 20 ? 'caution' : 'critical'
            }>{label}</Text>
          </Box>
        </div>
      </div>
    </BlockStack>
  );
}

// ── Prompts tab ──────────────────────────────────────────────────────────────
function PromptsTab() {
  const { data: defaults, isLoading } = useQuery('aiv-prompts', aiVisibilityApi.defaultPrompts);
  if (isLoading) return <Box padding="800"><InlineStack align="center"><Spinner /></InlineStack></Box>;
  const prompts = defaults?.prompts || [];

  return (
    <Card padding="0">
      <Box padding="400" borderBlockEndWidth="025" borderColor="border">
        <BlockStack gap="100">
          <Text variant="headingMd" as="h2">Auto-generated prompts ({prompts.length})</Text>
          <Text variant="bodySm" as="p" tone="subdued">
            Built from your active products. Each is sent to every configured provider —
            we count how often <Text as="span" fontWeight="semibold">{defaults?.brand_name}</Text> appears
            in the response.
          </Text>
        </BlockStack>
      </Box>
      {prompts.map((p, i) => (
        <Box key={i} padding="400" borderBlockEndWidth={i === prompts.length - 1 ? '0' : '025'} borderColor="border">
          <BlockStack gap="100">
            <InlineStack gap="200" blockAlign="center">
              {p.topic && <Badge>{p.topic}</Badge>}
              {p.intent && <Text variant="bodySm" as="span" tone="subdued">{p.intent}</Text>}
            </InlineStack>
            <Text variant="bodyMd" as="p">{p.prompt}</Text>
          </BlockStack>
        </Box>
      ))}
      {!prompts.length && (
        <Box padding="500">
          <Text variant="bodySm" as="p" tone="subdued">
            No prompts could be generated yet — add active products to your store first.
          </Text>
        </Box>
      )}
    </Card>
  );
}

// ── Results tab ──────────────────────────────────────────────────────────────
function ResultsTab({ runId, providers }) {
  const { data: results = [], isLoading } = useQuery(
    ['aiv-results', runId],
    () => aiVisibilityApi.results(runId),
    { enabled: !!runId },
  );
  const [showFailed, setShowFailed] = useState(false);

  if (!runId) {
    return (
      <Card>
        <EmptyState heading="No run yet" image="">
          <p>Click "Run analysis" in the page header to start your first run.</p>
        </EmptyState>
      </Card>
    );
  }
  if (isLoading) return <Box padding="800"><InlineStack align="center"><Spinner /></InlineStack></Box>;

  const successful = results.filter(r => !r.error);
  const failed     = results.filter(r =>  r.error);
  const visible    = (successful.length > 0 && !showFailed) ? successful : results;

  const providerMap = {};
  for (const p of (providers || [])) providerMap[p.id] = p;

  return (
    <BlockStack gap="400">
      {failed.length > 0 && successful.length > 0 && (
        <Card>
          <InlineStack align="space-between" blockAlign="center">
            <Text variant="bodySm" as="span" tone="subdued">
              {failed.length} failed result{failed.length === 1 ? '' : 's'} hidden.
            </Text>
            <Button variant="plain" onClick={() => setShowFailed(s => !s)}>
              {showFailed ? 'Hide failed' : 'Show failed'}
            </Button>
          </InlineStack>
        </Card>
      )}
      {visible.map(r => {
        const p = providerMap[r.provider];
        return (
          <Card key={r.id}>
            <BlockStack gap="300">
              <InlineStack gap="200" blockAlign="center" wrap>
                {p && <ProviderIcon icon={p.icon} bg={p.iconBg} size={22} />}
                {p && <Text variant="bodySm" as="span" fontWeight="semibold">{p.name}</Text>}
                {r.topic && <Badge>{r.topic}</Badge>}
                {r.intent && <Text variant="bodySm" as="span" tone="subdued">{r.intent}</Text>}
                {r.brand_mentioned
                  ? <Badge tone="success">Mentioned ({r.brand_mention_count}×)</Badge>
                  : <Badge tone="critical">Not mentioned</Badge>}
                {r.brand_cited && <Badge tone="success">Brand cited</Badge>}
              </InlineStack>
              <Text variant="bodyMd" as="p" fontWeight="semibold">{r.prompt}</Text>
              {r.error && <Banner tone="critical"><Text as="p">{r.error}</Text></Banner>}
              {r.response_text && (
                <Box background="bg-surface-secondary" padding="400" borderRadius="200" borderWidth="025" borderColor="border">
                  <Text variant="bodySm" as="p" breakWord>
                    {r.response_text.split('\n').map((line, i) => (
                      <React.Fragment key={i}>{line}<br/></React.Fragment>
                    ))}
                  </Text>
                </Box>
              )}
              {r.citations?.length > 0 && (
                <BlockStack gap="100">
                  <Text variant="bodySm" as="p" fontWeight="semibold">Citations ({r.citations.length})</Text>
                  {r.citations.map((c, i) => (
                    <Text key={i} variant="bodySm" as="span" breakWord>
                      <a href={c.url} target="_blank" rel="noreferrer"
                         style={{ color: 'var(--p-color-text-link)' }}>{c.url}</a>
                    </Text>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        );
      })}
      {!results.length && (
        <Card>
          <EmptyState heading="No results yet" image="">
            <p>Once a run completes, individual prompt responses will appear here.</p>
          </EmptyState>
        </Card>
      )}
    </BlockStack>
  );
}

// ── Overview tab ─────────────────────────────────────────────────────────────
function OverviewTab({ run, results, onRun, runLoading, providers, configuredCount, history = [] }) {
  const [providerFilter, setProviderFilter] = useState('all');
  const [distMode, setDistMode] = useState('mentions');

  if (!configuredCount) {
    return (
      <Card>
        <EmptyState heading="AI Visibility unavailable" image="">
          <p>
            No AI models are currently active. The platform admin needs to set provider keys
            (<code>GEMINI_API_KEY</code>, <code>GROQ_API_KEY</code>, <code>OPENROUTER_API_KEY</code>)
            in the server environment.
          </p>
        </EmptyState>
      </Card>
    );
  }

  if (!run) {
    return (
      <Card>
        <EmptyState
          heading="Run your first analysis"
          action={{ content: 'Run analysis', onAction: onRun, loading: runLoading }}
          image=""
        >
          <p>
            We'll send 10–12 shopping queries to {configuredCount} AI{' '}
            {configuredCount === 1 ? 'model' : 'models'} in parallel and check how often your brand appears.
          </p>
        </EmptyState>
      </Card>
    );
  }

  const inProgress = ['queued', 'running'].includes(run.status);

  // Per-provider error classification
  const QUOTA_RE = /quota|billing|insufficient|payment_required|credit balance|out of credit|rate.?limit/i;
  const AUTH_RE  = /api key not valid|invalid.api.key|invalid_api_key|incorrect api key|unauthor|401|403|authentication/i;
  const errorByProvider = {};
  for (const r of results.filter(x => x.error)) {
    const pid = r.provider || 'unknown';
    if (errorByProvider[pid]) continue;
    const e = r.error || '';
    let kind = 'other';
    if (AUTH_RE.test(e))  kind = 'auth';
    else if (QUOTA_RE.test(e)) kind = 'quota';
    errorByProvider[pid] = { kind, message: e };
  }
  const erroredProviderIds = Object.keys(errorByProvider);
  const workingProviderIds = [...new Set(results.filter(r => !r.error && r.response_text).map(r => r.provider))];
  const anyWorking = workingProviderIds.length > 0;

  const filtered = providerFilter === 'all'
    ? results
    : results.filter(r => r.provider === providerFilter);

  const total = filtered.length || 1;
  const mentions   = filtered.reduce((s, r) => s + (r.brand_mention_count || 0), 0);
  const citations  = filtered.reduce((s, r) => s + (r.citation_count || 0), 0);
  const citedPages = filtered.filter(r => r.brand_cited).length;

  // Distribution by LLM
  const llmStats = {};
  for (const r of results) {
    const pid = r.provider || 'unknown';
    if (!llmStats[pid]) llmStats[pid] = { pid, mentions: 0, citedPages: 0, total: 0 };
    llmStats[pid].mentions += r.brand_mention_count || 0;
    if (r.brand_cited) llmStats[pid].citedPages++;
    llmStats[pid].total++;
  }
  const llmRows = (providers || [])
    .filter(p => llmStats[p.id])
    .map(p => ({ ...llmStats[p.id], name: p.name, label: p.label, color: p.color, icon: p.icon, iconBg: p.iconBg }));
  const totalLlmMetric = llmRows.reduce(
    (s, l) => s + (distMode === 'mentions' ? l.mentions : l.citedPages), 0,
  ) || 1;

  // Topic performance
  const topics = {};
  for (const r of filtered) {
    const t = r.topic || 'General';
    if (!topics[t]) topics[t] = { topic: t, count: 0, mentioned: 0 };
    topics[t].count++;
    if (r.brand_mentioned) topics[t].mentioned++;
  }
  const topicList = Object.values(topics).sort((a, b) => b.mentioned - a.mentioned);

  const series = useMemo(() => [...history]
    .filter(h => h.status === 'completed')
    .reverse()
    .map(h => ({
      date: new Date(h.completed_at || h.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      Mentions: h.mentions_total || 0,
      Citations: h.citations_total || 0,
      'Cited Pages': h.cited_pages_total || 0,
    })),
  [history]);

  // Provider filter options
  const filterOptions = [
    { label: 'All AI platforms', value: 'all' },
    ...(providers || []).filter(p => llmStats[p.id]).map(p => ({ label: p.name, value: p.id })),
  ];

  return (
    <BlockStack gap="400">
      {inProgress && (
        <Banner tone="info" title={`Run in progress: ${run.status}`}>
          <Text as="p">
            Completed {run.prompts_completed} of {run.prompts_total} prompt × provider runs. Page auto-refreshes.
          </Text>
        </Banner>
      )}
      {run.status === 'failed' && (
        <Banner tone="critical" title="Run failed">
          <Text as="p">{run.error_message}</Text>
        </Banner>
      )}

      {erroredProviderIds.length > 0 && anyWorking && (
        <Card padding="300">
          <BlockStack gap="100">
            {erroredProviderIds.map(pid => {
              const p = (providers || []).find(x => x.id === pid);
              const name = p?.name || pid;
              const { kind } = errorByProvider[pid];
              const reason = kind === 'auth'  ? 'API key invalid'
                           : kind === 'quota' ? 'free-tier limit reached'
                           : 'request failed';
              return (
                <InlineStack key={pid} gap="200" blockAlign="center" wrap>
                  <Badge tone="warning">{name}</Badge>
                  <Text variant="bodySm" as="span" tone="subdued">
                    not included — {reason}
                  </Text>
                </InlineStack>
              );
            })}
          </BlockStack>
        </Card>
      )}

      {erroredProviderIds.length > 0 && !anyWorking && erroredProviderIds.map(pid => {
        const p = (providers || []).find(x => x.id === pid);
        const name = p?.name || pid;
        const { kind, message } = errorByProvider[pid];
        return (
          <Banner key={pid} tone="critical" title={
            kind === 'auth'  ? `${name} key was rejected` :
            kind === 'quota' ? `${name} free-tier limit reached` :
            `${name} request failed`
          }>
            <Text as="p">
              {kind === 'auth'  && <>Your {p?.label || name} key is invalid or expired. Update it in the server <code>.env</code>.</>}
              {kind === 'quota' && <>You've hit {p?.label || name}'s free-tier rate limit. Wait an hour or add another provider.</>}
              {kind === 'other' && <em>"{message.slice(0, 200)}"</em>}
            </Text>
          </Banner>
        );
      })}

      {/* Filter bar */}
      <Card>
        <InlineStack gap="200" blockAlign="center" align="space-between">
          <InlineStack gap="200" blockAlign="center">
            <Button pressed>Worldwide</Button>
            <Box minWidth="220px">
              <Select
                label="Filter by AI platform"
                labelHidden
                options={filterOptions}
                value={providerFilter}
                onChange={setProviderFilter}
              />
            </Box>
          </InlineStack>
          <Text variant="bodySm" as="span" tone="subdued">
            {run.completed_at
              ? new Date(run.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
              : '—'}
          </Text>
        </InlineStack>
      </Card>

      {/* Top row: gauge + main metrics + chart */}
      <InlineGrid columns={{ xs: 1, md: ['oneThird', 'twoThirds'] }} gap="400">
        <Card>
          <BlockStack gap="200">
            <Text variant="headingMd" as="h2">AI Visibility</Text>
            <Box paddingBlockStart="300">
              <VisibilityGauge score={run.visibility_score || 0} />
            </Box>
            <Banner tone="info">
              <Text as="p">
                {run.visibility_score >= 70 ? 'Strong presence — your brand is regularly recommended by AI.' :
                 run.visibility_score >= 40 ? 'Occasionally mentioned in LLM outputs, but visibility can improve.' :
                 run.visibility_score >= 20 ? 'Rare mentions — significant SEO + brand work needed.' :
                 'Almost invisible to AI assistants today.'}
              </Text>
            </Banner>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text variant="headingMd" as="h2">Main Metrics</Text>
            <InlineGrid columns={3} gap="400">
              <KpiBlock label="Mentions"    value={mentions}   tone="info" />
              <KpiBlock label="Citations"   value={citations}  tone="success" />
              <KpiBlock label="Cited Pages" value={citedPages} tone="caution" />
            </InlineGrid>
            <Box minHeight="240px">
              {series.length < 2 ? (
                <Box background="bg-surface-secondary" borderRadius="200" borderWidth="025" borderColor="border" padding="800">
                  <BlockStack gap="100" inlineAlign="center">
                    <Text variant="bodySm" as="p" tone="subdued" alignment="center">
                      Trend chart appears after 2+ completed runs.
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued" alignment="center">
                      Currently {series.length} {series.length === 1 ? 'run' : 'runs'} with data.
                    </Text>
                  </BlockStack>
                </Box>
              ) : (
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--p-color-border-secondary)" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--p-color-text-secondary)' }} stroke="var(--p-color-border)" />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--p-color-text-secondary)' }} stroke="var(--p-color-border)" />
                      <Tooltip />
                      <Line type="monotone" dataKey="Mentions"    stroke="#5cb8e2" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Citations"   stroke="#3fb27f" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="Cited Pages" stroke="#e67e22" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Box>
          </BlockStack>
        </Card>
      </InlineGrid>

      {/* Distribution by LLM */}
      <Card>
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center">
            <Text variant="headingMd" as="h2">Distribution by LLM</Text>
            <ButtonGroup variant="segmented">
              <Button pressed={distMode === 'mentions'}    onClick={() => setDistMode('mentions')}>Mentions</Button>
              <Button pressed={distMode === 'cited_pages'} onClick={() => setDistMode('cited_pages')}>Cited Pages</Button>
            </ButtonGroup>
          </InlineStack>
          {llmRows.length === 0
            ? <Text variant="bodySm" as="p" tone="subdued">No provider data yet.</Text>
            : (
              <BlockStack gap="200">
                {llmRows.map(l => {
                  const value = distMode === 'mentions' ? l.mentions : l.citedPages;
                  const pct = totalLlmMetric > 0 ? (value / totalLlmMetric) * 100 : 0;
                  return (
                    <Box key={l.pid} paddingBlock="200" borderBlockEndWidth="025" borderColor="border">
                      <InlineGrid columns={['oneHalf', 'oneHalf', 'oneHalf', 'oneHalf']} gap="200" alignItems="center">
                        <InlineStack gap="200" blockAlign="center">
                          <ProviderIcon icon={l.icon} bg={l.iconBg} size={22} />
                          <Text variant="bodySm" as="span" fontWeight="medium">{l.name}</Text>
                        </InlineStack>
                        <Box>
                          <div style={{
                            height: 6, background: 'var(--p-color-bg-surface-secondary)',
                            borderRadius: 3, overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${Math.max(pct, value > 0 ? 5 : 0)}%`,
                              height: '100%', background: l.color, borderRadius: 3,
                            }} />
                          </div>
                        </Box>
                        <Text variant="bodySm" as="span" alignment="end">{pct.toFixed(1)}%</Text>
                        <Text variant="bodySm" as="span" alignment="end" fontWeight="semibold" tone="info">{fmt(value)}</Text>
                      </InlineGrid>
                    </Box>
                  );
                })}
              </BlockStack>
            )}
        </BlockStack>
      </Card>

      {/* Performance by topic */}
      <Card>
        <BlockStack gap="400">
          <Text variant="headingMd" as="h2">Performance by Topic</Text>
          {topicList.length === 0
            ? <Text variant="bodySm" as="p" tone="subdued">No data yet.</Text>
            : (
              <BlockStack gap="200">
                {topicList.map(t => {
                  const pct = t.count > 0 ? (t.mentioned / t.count) * 100 : 0;
                  const tone = t.mentioned > 0 ? 'var(--p-color-bg-fill-success)' : 'var(--p-color-bg-fill-critical)';
                  return (
                    <InlineGrid key={t.topic} columns={['oneThird', 'twoThirds', 'oneThird']} gap="200" alignItems="center">
                      <Text variant="bodySm" as="span" fontWeight="medium">{t.topic}</Text>
                      <div style={{
                        height: 6, background: 'var(--p-color-bg-surface-secondary)',
                        borderRadius: 3, overflow: 'hidden',
                      }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: tone, borderRadius: 3 }} />
                      </div>
                      <Text variant="bodySm" as="span" alignment="end" fontWeight="semibold">
                        {t.mentioned} / {t.count}
                      </Text>
                    </InlineGrid>
                  );
                })}
              </BlockStack>
            )}
        </BlockStack>
      </Card>
    </BlockStack>
  );
}

// ── KPI block (used in Main Metrics) ─────────────────────────────────────────
function KpiBlock({ label, value, tone }) {
  return (
    <BlockStack gap="100">
      <Text variant="bodySm" as="p" tone="subdued">{label}</Text>
      <Text variant="heading2xl" as="p" fontWeight="bold" tone={tone}>{fmt(value)}</Text>
    </BlockStack>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function AIVisibility() {
  const qc = useQueryClient();
  const [tabIndex, setTabIndex] = useState(0);

  const { data: settings, isLoading: ls } = useQuery('aiv-settings', aiVisibilityApi.settings);
  const { data: latest, isLoading: ll } = useQuery('aiv-latest', aiVisibilityApi.latest, {
    refetchInterval: (data) => (data && ['queued', 'running'].includes(data.status)) ? 4000 : false,
  });
  const { data: results = [] } = useQuery(
    ['aiv-results', latest?.id],
    () => aiVisibilityApi.results(latest.id),
    { enabled: !!latest?.id },
  );
  const { data: history = [] } = useQuery('aiv-history', aiVisibilityApi.history);

  const runMutation = useMutation(aiVisibilityApi.run, {
    onSuccess: () => qc.invalidateQueries('aiv-latest'),
  });

  if (ls || ll) {
    return (
      <Page title="AI Visibility">
        <Box padding="1600"><InlineStack align="center"><Spinner /></InlineStack></Box>
      </Page>
    );
  }

  const allProviders = settings?.providers || [];
  const configuredProviders = allProviders.filter(p => p.available);
  const configuredCount = configuredProviders.length;
  const inFlight = latest && ['queued', 'running'].includes(latest.status);

  const subtitleParts = ['See how AI assistants surface your brand to shoppers'];
  if (configuredCount > 0) {
    subtitleParts.push(`${configuredCount} model${configuredCount === 1 ? '' : 's'} active: ${configuredProviders.map(p => p.name).join(', ')}`);
  }

  const primaryAction = configuredCount > 0
    ? {
        content: inFlight
          ? 'Run in progress…'
          : `Run analysis (${configuredCount} ${configuredCount === 1 ? 'model' : 'models'})`,
        onAction: () => runMutation.mutate({}),
        loading: runMutation.isLoading || inFlight,
        disabled: inFlight,
      }
    : undefined;

  return (
    <Page
      title={`AI Visibility${settings?.brand_name ? ` · ${settings.brand_name}` : ''}`}
      subtitle={subtitleParts.join(' · ')}
      primaryAction={primaryAction}
    >
      <Layout>
        <Layout.Section>
          {runMutation.error && (
            <Box paddingBlockEnd="400">
              <Banner tone="critical">
                <Text as="p">{runMutation.error?.error || 'Failed to start run'}</Text>
              </Banner>
            </Box>
          )}

          <Tabs tabs={TABS} selected={tabIndex} onSelect={setTabIndex}>
            <Box paddingBlockStart="400">
              {TABS[tabIndex].id === 'overview' && (
                <OverviewTab
                  run={latest}
                  results={results}
                  history={history}
                  onRun={() => runMutation.mutate({})}
                  runLoading={runMutation.isLoading}
                  providers={allProviders}
                  configuredCount={configuredCount}
                />
              )}
              {TABS[tabIndex].id === 'prompts'  && <PromptsTab />}
              {TABS[tabIndex].id === 'results'  && <ResultsTab runId={latest?.id} providers={allProviders} />}
            </Box>
          </Tabs>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
