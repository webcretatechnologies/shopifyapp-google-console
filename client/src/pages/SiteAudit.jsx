import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Page, Card, Text, Banner, BlockStack, InlineStack, InlineGrid, Box, Spinner, Badge,
  Button, ButtonGroup, Tabs, Select, EmptyState,
} from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { auditApi } from '../api';
import { COLORS } from '../theme';
import PlanGate from '../components/PlanGate';
import { usePlan, downloadCSV } from '../hooks/usePlan';

const SEVERITY_META = {
  error:   { label: 'Errors',   color: '#d72c0d', bg: '#ffebe9', dot: '#d72c0d' },
  warning: { label: 'Warnings', color: '#b54708', bg: '#fff5ea', dot: '#f49342' },
  notice:  { label: 'Notices',  color: '#374151', bg: '#f1f2f3', dot: '#8a8a8a' },
};

const CATEGORY_LABEL = {
  crawlability:     'Crawlability',
  https:            'HTTPS',
  performance:      'Site Performance',
  internal_linking: 'Internal Linking',
  on_page:          'On-Page SEO',
  structured_data:  'Structured Data',
  content:          'Content',
};

const TABS = [
  { id: 'overview',    label: 'Overview' },
  { id: 'performance', label: 'Performance' },
  { id: 'action-plan', label: '✨ Action Plan' },
  { id: 'issues',      label: 'Issues' },
  { id: 'pages',       label: 'Crawled Pages' },
  { id: 'statistics',  label: 'Statistics' },
  { id: 'progress',    label: 'Progress' },
  { id: 'compare',     label: 'Compare Crawls' },
];

// Google's official Core Web Vitals thresholds.
const CWV_THRESHOLDS = {
  lcp:         { good: 2500,  poor: 4000,  unit: 'ms', label: 'Largest Contentful Paint' },
  inp:         { good: 200,   poor: 500,   unit: 'ms', label: 'Interaction to Next Paint' },
  cls:         { good: 0.1,   poor: 0.25,  unit: '',   label: 'Cumulative Layout Shift' },
  fcp:         { good: 1800,  poor: 3000,  unit: 'ms', label: 'First Contentful Paint' },
  ttfb:        { good: 800,   poor: 1800,  unit: 'ms', label: 'Time to First Byte' },
  speed_index: { good: 3400,  poor: 5800,  unit: 'ms', label: 'Speed Index' },
  tbt:         { good: 200,   poor: 600,   unit: 'ms', label: 'Total Blocking Time' },
};

function gradeCwv(metricKey, value) {
  if (value == null) return 'unknown';
  const t = CWV_THRESHOLDS[metricKey];
  if (!t) return 'unknown';
  if (value <= t.good) return 'good';
  if (value <= t.poor) return 'needs-improvement';
  return 'poor';
}

function formatCwv(metricKey, value) {
  if (value == null) return '—';
  const t = CWV_THRESHOLDS[metricKey];
  if (!t) return String(value);
  if (t.unit === 'ms') return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)} ms`;
  return Number(value).toFixed(3);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function humanize(s) {
  return (s || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function fmt(n) { return (n || 0).toLocaleString(); }
function pct(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0; }

// ─── Reusable bits ───────────────────────────────────────────────────────────
function ScoreGauge({ score = 0, status, size = 140 }) {
  const p = Math.max(0, Math.min(100, score));
  const stroke = p >= 80 ? '#008060' : p >= 60 ? '#b54708' : '#d72c0d';
  const c = 2 * Math.PI * 54;
  const dash = (p / 100) * c;
  const label = p >= 80 ? 'Healthy' : p >= 60 ? 'Needs work' : 'Critical';
  return (
    <BlockStack gap="200" inlineAlign="center">
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="#e1e3e5" strokeWidth="10" />
          <circle cx="60" cy="60" r="54" fill="none"
            stroke={stroke} strokeWidth="10" strokeDasharray={`${dash} ${c}`}
            strokeLinecap="round" transform="rotate(-90 60 60)" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexDirection: 'column' }}>
          <div style={{ fontSize: size * 0.26, fontWeight: 700, color: COLORS.text, lineHeight: 1 }}>
            {status === 'completed' ? p : '—'}
          </div>
          <div style={{ fontSize: 11, color: COLORS.textSubdued, marginTop: 2 }}>/ 100</div>
        </div>
      </div>
      <Text variant="bodySm" tone="subdued">{status === 'completed' ? label : (status || 'pending')}</Text>
    </BlockStack>
  );
}

function SevCard({ severity, count, onClick, active }) {
  const m = SEVERITY_META[severity];
  // Polaris doesn't have a "stat card with click + selected state", so we
  // build it from a Card-styled <button> using Polaris CSS variables.
  return (
    <button onClick={onClick}
      style={{
        padding: '14px 18px', borderRadius: 12,
        background: active ? m.bg : 'var(--p-color-bg-surface)',
        border: `1px solid ${active ? m.color : 'var(--p-color-border)'}`,
        cursor: 'pointer', textAlign: 'left', flex: 1, minWidth: 130,
        font: 'inherit', transition: 'all 120ms ease',
      }}>
      <InlineStack gap="200" blockAlign="center">
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.dot }} />
        <Text variant="bodySm" as="span" tone="subdued" fontWeight="medium">{m.label}</Text>
      </InlineStack>
      <Box paddingBlockStart="200">
        <Text variant="heading2xl" as="p" fontWeight="bold">{count || 0}</Text>
      </Box>
    </button>
  );
}

function RunButton({ onClick, loading, label = 'Rerun audit' }) {
  return (
    <Button variant="primary" onClick={onClick} loading={loading} icon={RefreshIcon}>
      {loading ? 'Running…' : label}
    </Button>
  );
}

// Compact score-over-time chart with AI commentary on the trend.
// Hides itself if fewer than 2 audits have completed.
function ScoreTrendCard() {
  const { can } = usePlan();
  const enabled = can('aiAuditTrend');
  const { data } = useQuery('audit-score-trend', auditApi.scoreTrend, {
    staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false, enabled,
  });
  if (!enabled) return null;
  const points = data?.points || [];
  if (points.length < 2) return null;
  const chartData = points.map(p => ({
    date: new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    score: p.score,
  }));
  return (
    <Card>
      <Box padding="500">
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center">
            <Text variant="headingMd" fontWeight="semibold">Score over time</Text>
            <Text variant="bodySm" tone="subdued">Last {points.length} audits</Text>
          </InlineStack>
          <div style={{ width: '100%', height: 140 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e1e3e5" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6d7175' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#6d7175' }} axisLine={false} tickLine={false} width={30} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#1a1a1a" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {data?.commentary && (
            <div style={{ background: '#f4f5fa', borderLeft: '3px solid #1a1a1a', padding: '10px 14px', borderRadius: 4 }}>
              <Text variant="bodySm">✨ {data.commentary}</Text>
            </div>
          )}
        </BlockStack>
      </Box>
    </Card>
  );
}

// Compact gauge (small variant of ScoreGauge) for PSI mobile/desktop tiles.
function MiniScoreGauge({ score, label, sub }) {
  if (score == null) {
    return (
      <BlockStack gap="100" inlineAlign="center">
        <Text variant="bodySm" tone="subdued" fontWeight="medium">{label}</Text>
        <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--p-color-text-subdued)' }}>—</div>
        {sub && <Text variant="bodySm" tone="subdued">{sub}</Text>}
      </BlockStack>
    );
  }
  const p = Math.max(0, Math.min(100, score));
  const stroke = p >= 90 ? '#008060' : p >= 50 ? '#b54708' : '#d72c0d';
  const c = 2 * Math.PI * 32;
  const dash = (p / 100) * c;
  return (
    <BlockStack gap="100" inlineAlign="center">
      <Text variant="bodySm" tone="subdued" fontWeight="medium">{label}</Text>
      <div style={{ position: 'relative', width: 84, height: 84 }}>
        <svg width="84" height="84" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="32" fill="none" stroke="#e1e3e5" strokeWidth="6" />
          <circle cx="40" cy="40" r="32" fill="none" stroke={stroke} strokeWidth="6"
                  strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
                  transform="rotate(-90 40 40)" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--p-color-text)' }}>{p}</span>
        </div>
      </div>
      {sub && <Text variant="bodySm" tone="subdued">{sub}</Text>}
    </BlockStack>
  );
}

// Pull aggregated mobile/desktop performance scores from psi_data.
// Averages across all tested URLs.
function avgPsiScore(psi_data, strategy, scoreKey = 'performance') {
  if (!psi_data?.results) return null;
  const reports = Object.values(psi_data.results)
    .map(r => r?.[strategy])
    .filter(r => r && !r.error && r.scores);
  if (reports.length === 0) return null;
  const total = reports.reduce((sum, r) => sum + (r.scores[scoreKey] || 0), 0);
  return Math.round(total / reports.length);
}

// ─── Tab: Overview ───────────────────────────────────────────────────────────
function OverviewTab({ audit, summary }) {
  const breakdown = (() => {
    const total = audit.pages_crawled || 0;
    const withIssues = audit.pages_with_issues || 0;
    const broken = summary.filter(s => s.type === 'HTTP_4XX' || s.type === 'HTTP_5XX').reduce((a, c) => a + c.count, 0);
    const healthy = Math.max(0, total - withIssues - broken);
    return { total, healthy, withIssues, broken };
  })();

  // Top issues by count
  const topIssues = [...summary]
    .sort((a, b) => {
      const sevOrder = { error: 0, warning: 1, notice: 2 };
      if (sevOrder[a.severity] !== sevOrder[b.severity]) return sevOrder[a.severity] - sevOrder[b.severity];
      return b.count - a.count;
    })
    .slice(0, 8);

  return (
    <BlockStack gap="500">
      <ScoreTrendCard />

      {/* Top row — Site Health + Crawled Pages breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <Box padding="500">
            <Text variant="headingMd" fontWeight="semibold">Site Health</Text>
            <Box paddingBlockStart="300">
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <ScoreGauge score={audit.score} status={audit.status} size={160} />
              </div>
            </Box>
            <Box paddingBlockStart="300">
              <InlineStack gap="200" align="space-between">
                <Text variant="bodySm" tone="subdued">Your site</Text>
                <Text variant="bodySm" fontWeight="semibold">{audit.score || 0}%</Text>
              </InlineStack>
            </Box>
          </Box>
        </Card>

        <Card>
          <Box padding="500">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingMd" fontWeight="semibold">Crawled Pages</Text>
              <Text variant="headingLg" fontWeight="bold">{breakdown.total}</Text>
            </InlineStack>
            <Box paddingBlockStart="300">
              {/* Stacked bar */}
              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#e1e3e5' }}>
                {breakdown.total > 0 && (
                  <>
                    <div style={{ width: `${pct(breakdown.healthy, breakdown.total)}%`, background: '#008060' }} title={`${breakdown.healthy} healthy`} />
                    <div style={{ width: `${pct(breakdown.broken, breakdown.total)}%`, background: '#d72c0d' }} title={`${breakdown.broken} broken`} />
                    <div style={{ width: `${pct(breakdown.withIssues, breakdown.total)}%`, background: '#f49342' }} title={`${breakdown.withIssues} have issues`} />
                  </>
                )}
              </div>
            </Box>
            <Box paddingBlockStart="400">
              <BlockStack gap="200">
                <BreakdownRow color="#008060" label="Healthy"      count={breakdown.healthy} />
                <BreakdownRow color="#d72c0d" label="Broken"       count={breakdown.broken} />
                <BreakdownRow color="#f49342" label="Have issues"  count={breakdown.withIssues} />
              </BlockStack>
            </Box>
          </Box>
        </Card>
      </div>

      {/* PageSpeed Insights summary — mobile + desktop perf scores, lighthouse SEO/A11y/BP scores */}
      {audit.psi_data?.results && (
        <Card>
          <Box padding="500">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="050">
                <Text variant="headingMd" fontWeight="semibold">PageSpeed Insights</Text>
                <Text variant="bodySm" tone="subdued">
                  Lighthouse scores averaged across {Object.keys(audit.psi_data.results).length} tested URL{Object.keys(audit.psi_data.results).length === 1 ? '' : 's'}
                </Text>
              </BlockStack>
              <Text variant="bodySm" tone="subdued">See <strong>Performance</strong> tab for details</Text>
            </InlineStack>
            <Box paddingBlockStart="400">
              <InlineGrid columns={{ xs: 2, md: 5 }} gap="400">
                <MiniScoreGauge label="Performance · Mobile"  score={avgPsiScore(audit.psi_data, 'mobile',  'performance')}    sub="0–100" />
                <MiniScoreGauge label="Performance · Desktop" score={avgPsiScore(audit.psi_data, 'desktop', 'performance')}    sub="0–100" />
                <MiniScoreGauge label="SEO"                   score={avgPsiScore(audit.psi_data, 'mobile',  'seo')}            sub="Lighthouse" />
                <MiniScoreGauge label="Accessibility"         score={avgPsiScore(audit.psi_data, 'mobile',  'accessibility')}  sub="Lighthouse" />
                <MiniScoreGauge label="Best Practices"        score={avgPsiScore(audit.psi_data, 'mobile',  'best_practices')} sub="Lighthouse" />
              </InlineGrid>
            </Box>
          </Box>
        </Card>
      )}

      {/* Severity counters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <SevCard severity="error"   count={audit.errors_count} />
        <SevCard severity="warning" count={audit.warnings_count} />
        <SevCard severity="notice"  count={audit.notices_count} />
      </div>

      {/* Top issues */}
      <Card>
        <Box padding="0">
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${COLORS.border}` }}>
            <Text variant="headingMd" fontWeight="semibold">Top issues</Text>
          </div>
          {topIssues.length === 0 ? (
            <Box padding="500">
              <Text variant="bodySm" tone="subdued">No issues found 🎉</Text>
            </Box>
          ) : topIssues.map(row => {
            const m = SEVERITY_META[row.severity];
            return (
              <div key={`${row.type}-${row.severity}`} style={{
                padding: '12px 16px', borderBottom: `1px solid ${COLORS.borderMuted}`,
                display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 12,
              }}>
                <InlineStack gap="200" blockAlign="center">
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.dot }} />
                  <Text variant="bodyMd" fontWeight="medium">{humanize(row.type)}</Text>
                  <span style={{ fontSize: 12, color: COLORS.textSubdued }}>{CATEGORY_LABEL[row.category] || row.category}</span>
                </InlineStack>
                <Text variant="bodySm" tone="subdued">{row.count} {row.count === 1 ? 'page' : 'pages'}</Text>
              </div>
            );
          })}
        </Box>
      </Card>
    </BlockStack>
  );
}

function BreakdownRow({ color, label, count }) {
  return (
    <InlineStack align="space-between" blockAlign="center">
      <InlineStack gap="200" blockAlign="center">
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
        <Text variant="bodySm">{label}</Text>
      </InlineStack>
      <Text variant="bodySm" fontWeight="semibold">{count}</Text>
    </InlineStack>
  );
}

// ─── Tab: Performance (PSI) ──────────────────────────────────────────────────

const CWV_GRADE_TONE = {
  good:               { tone: 'success',   label: 'Good' },
  'needs-improvement':{ tone: 'warning',   label: 'Needs improvement' },
  poor:               { tone: 'critical',  label: 'Poor' },
  unknown:            { tone: undefined,   label: 'No data' },
};

function CwvCell({ metricKey, value }) {
  const grade = gradeCwv(metricKey, value);
  const meta = CWV_GRADE_TONE[grade];
  const t = CWV_THRESHOLDS[metricKey];
  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="200">
          <Text variant="bodySm" tone="subdued" fontWeight="medium">{t?.label || metricKey}</Text>
          <Text variant="heading2xl" as="p" fontWeight="bold">{formatCwv(metricKey, value)}</Text>
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </BlockStack>
      </Box>
    </Card>
  );
}

function PerformanceTab({ audit }) {
  const queryClient = useQueryClient();
  const psi = audit.psi_data;
  const allUrls = psi?.urls || (psi?.results ? Object.keys(psi.results) : []);
  const [selectedUrl, setSelectedUrl] = useState(allUrls[0] || '');
  // Default to mobile (Google's primary index). Declared at top so all hooks
  // run on every render, even when we early-return for missing PSI data.
  const [strategy, setStrategy] = useState('mobile');

  // Re-sync if audit reloads with different URLs
  useEffect(() => {
    if (allUrls.length && !allUrls.includes(selectedUrl)) {
      setSelectedUrl(allUrls[0]);
    }
  }, [allUrls.join('|')]);

  // Refresh-only-PSI mutation — re-runs Lighthouse without re-crawling the site.
  const refreshMutation = useMutation(
    () => auditApi.refreshPsi(audit.id),
    {
      onSuccess: () => {
        // Invalidate the audit query so the Performance tab shows the new psi_data.
        queryClient.invalidateQueries('audit-latest');
        queryClient.invalidateQueries(['audit', audit.id]);
      },
    },
  );

  if (!psi?.results || allUrls.length === 0) {
    return (
      <Card>
        <Box padding="500">
          <BlockStack gap="400" inlineAlign="center">
            <Text variant="headingLg" as="h2" alignment="center">PageSpeed Insights data not available</Text>
            <Box maxWidth="500px">
              <Text variant="bodyMd" tone="subdued" alignment="center" as="p">
                This audit was run before PageSpeed Insights was integrated, or the PSI fetch failed.
                You can refresh just the PSI data without re-crawling the site (~60–120 seconds), or run a fresh audit.
              </Text>
            </Box>
            <Button
              variant="primary"
              icon={RefreshIcon}
              onClick={() => refreshMutation.mutate()}
              loading={refreshMutation.isLoading}
            >
              {refreshMutation.isLoading ? 'Running PageSpeed…' : 'Refresh PageSpeed data'}
            </Button>
            {refreshMutation.error && (
              <Banner tone="critical">
                <Text as="p">{refreshMutation.error?.error || refreshMutation.error?.message || 'Refresh failed'}</Text>
              </Banner>
            )}
          </BlockStack>
        </Box>
      </Card>
    );
  }

  const report = psi.results[selectedUrl] || {};
  const mobile = report.mobile && !report.mobile.error ? report.mobile : null;
  const desktop = report.desktop && !report.desktop.error ? report.desktop : null;
  const active = strategy === 'mobile' ? mobile : desktop;
  const fetchedAt = psi.fetched_at ? new Date(psi.fetched_at).toLocaleString() : null;

  return (
    <BlockStack gap="500">
      {/* Header — URL selector + strategy toggle + fetched time */}
      <Card>
        <Box padding="400">
          <InlineStack align="space-between" blockAlign="center" wrap={false} gap="400">
            <BlockStack gap="100">
              <Text variant="headingMd" fontWeight="semibold">PageSpeed Insights · Lighthouse</Text>
              {fetchedAt && <Text variant="bodySm" tone="subdued">Last refreshed {fetchedAt}</Text>}
            </BlockStack>
            <InlineStack gap="200" blockAlign="center">
              {allUrls.length > 1 && (
                <div style={{ minWidth: 280 }}>
                  <Select
                    label="URL"
                    labelHidden
                    options={allUrls.map(u => ({ label: u, value: u }))}
                    value={selectedUrl}
                    onChange={setSelectedUrl}
                  />
                </div>
              )}
              <ButtonGroup variant="segmented">
                <Button pressed={strategy === 'mobile'}  onClick={() => setStrategy('mobile')}>Mobile</Button>
                <Button pressed={strategy === 'desktop'} onClick={() => setStrategy('desktop')}>Desktop</Button>
              </ButtonGroup>
              <Button
                icon={RefreshIcon}
                onClick={() => refreshMutation.mutate()}
                loading={refreshMutation.isLoading}
              >
                {refreshMutation.isLoading ? 'Refreshing…' : 'Refresh PSI'}
              </Button>
            </InlineStack>
          </InlineStack>
          {refreshMutation.error && (
            <Box paddingBlockStart="300">
              <Banner tone="critical" onDismiss={() => refreshMutation.reset()}>
                <Text as="p">{refreshMutation.error?.error || refreshMutation.error?.message || 'PSI refresh failed'}</Text>
              </Banner>
            </Box>
          )}
        </Box>
      </Card>

      {!active ? (
        <Card>
          <EmptyState heading={`No ${strategy} report for this URL`} image="">
            <p>{report[strategy]?.error || 'PSI did not return data for this URL/strategy combination.'}</p>
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* Lighthouse score gauges */}
          <Card>
            <Box padding="500">
              <InlineGrid columns={{ xs: 2, md: 4 }} gap="400">
                <MiniScoreGauge label="Performance"   score={active.scores?.performance}     sub="0–100" />
                <MiniScoreGauge label="Accessibility" score={active.scores?.accessibility}   sub="Lighthouse" />
                <MiniScoreGauge label="Best Practices" score={active.scores?.best_practices} sub="Lighthouse" />
                <MiniScoreGauge label="SEO"           score={active.scores?.seo}             sub="Lighthouse" />
              </InlineGrid>
            </Box>
          </Card>

          {/* Core Web Vitals — primary three */}
          <BlockStack gap="200">
            <Text variant="headingMd" fontWeight="semibold">Core Web Vitals ({strategy})</Text>
            <Text variant="bodySm" tone="subdued">Google's three primary metrics for user experience. Pass thresholds: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1.</Text>
            <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
              <CwvCell metricKey="lcp" value={active.cwv?.lcp?.value} />
              <CwvCell metricKey="inp" value={active.cwv?.inp?.value} />
              <CwvCell metricKey="cls" value={active.cwv?.cls?.value} />
            </InlineGrid>
          </BlockStack>

          {/* Other speed metrics */}
          <BlockStack gap="200">
            <Text variant="headingMd" fontWeight="semibold">Other speed metrics</Text>
            <InlineGrid columns={{ xs: 2, md: 4 }} gap="400">
              <CwvCell metricKey="fcp"         value={active.cwv?.fcp?.value} />
              <CwvCell metricKey="ttfb"        value={active.cwv?.ttfb?.value} />
              <CwvCell metricKey="speed_index" value={active.cwv?.speed_index?.value} />
              <CwvCell metricKey="tbt"         value={active.cwv?.tbt?.value} />
            </InlineGrid>
          </BlockStack>

          {/* Opportunities */}
          {active.opportunities && active.opportunities.length > 0 && (
            <Card>
              <Box padding="0">
                <div style={{ padding: '14px 16px', borderBottom: `1px solid ${COLORS.border}` }}>
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" fontWeight="semibold">Top opportunities</Text>
                    <Text variant="bodySm" tone="subdued">Estimated time you'd save by fixing each</Text>
                  </InlineStack>
                </div>
                {active.opportunities.map(opp => (
                  <div key={opp.id} style={{
                    padding: '14px 16px',
                    borderBottom: `1px solid ${COLORS.borderMuted}`,
                  }}>
                    <InlineStack align="space-between" blockAlign="start" gap="400" wrap={false}>
                      <BlockStack gap="100">
                        <Text variant="bodyMd" fontWeight="medium">{opp.title}</Text>
                        {opp.description && (
                          <Text variant="bodySm" tone="subdued">{opp.description.replace(/\[Learn more.*$/, '').trim()}</Text>
                        )}
                      </BlockStack>
                      <Text variant="bodyMd" fontWeight="semibold">
                        {opp.potential_ms >= 1000 ? `${(opp.potential_ms / 1000).toFixed(2)}s` : `${opp.potential_ms} ms`}
                      </Text>
                    </InlineStack>
                  </div>
                ))}
              </Box>
            </Card>
          )}
        </>
      )}

      {/* Per-URL summary table — only useful when more than one URL was tested */}
      {allUrls.length > 1 && (
        <Card>
          <Box padding="0">
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${COLORS.border}` }}>
              <Text variant="headingMd" fontWeight="semibold">Per-URL summary</Text>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--p-color-bg-surface-secondary)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left',  color: COLORS.textSubdued, fontWeight: 600, fontSize: 12 }}>URL</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', color: COLORS.textSubdued, fontWeight: 600, fontSize: 12 }}>Perf · Mobile</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', color: COLORS.textSubdued, fontWeight: 600, fontSize: 12 }}>Perf · Desktop</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', color: COLORS.textSubdued, fontWeight: 600, fontSize: 12 }}>LCP (mob)</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', color: COLORS.textSubdued, fontWeight: 600, fontSize: 12 }}>CLS (mob)</th>
                  </tr>
                </thead>
                <tbody>
                  {allUrls.map(u => {
                    const r = psi.results[u] || {};
                    const m = r.mobile && !r.mobile.error ? r.mobile : null;
                    const d = r.desktop && !r.desktop.error ? r.desktop : null;
                    return (
                      <tr key={u} style={{ borderTop: `1px solid ${COLORS.borderMuted}`, cursor: 'pointer' }} onClick={() => setSelectedUrl(u)}>
                        <td style={{ padding: '10px 14px', color: u === selectedUrl ? '#1a1a1a' : '#1a73e8', fontWeight: u === selectedUrl ? 600 : 400, wordBreak: 'break-all' }}>{u}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>{m?.scores?.performance ?? '—'}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>{d?.scores?.performance ?? '—'}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>{m?.cwv?.lcp?.value != null ? formatCwv('lcp', m.cwv.lcp.value) : '—'}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>{m?.cwv?.cls?.value != null ? formatCwv('cls', m.cwv.cls.value) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Box>
        </Card>
      )}
    </BlockStack>
  );
}

// ─── Tab: Issues ─────────────────────────────────────────────────────────────
function IssuesTab({ audit, summary }) {
  const [activeSeverity, setActiveSeverity] = useState(null);
  const [activeCategory, setActiveCategory] = useState(null);
  const [expandedType, setExpandedType] = useState(null);
  const [issuesForType, setIssuesForType] = useState({});
  const [aiFixForType, setAiFixForType] = useState({}); // { [type]: { loading, error, data } }

  useEffect(() => {
    if (!expandedType || issuesForType[expandedType]) return;
    auditApi.issues(audit.id, { type: expandedType }).then(data =>
      setIssuesForType(prev => ({ ...prev, [expandedType]: data }))
    );
  }, [expandedType, audit.id]);

  const requestAiFix = async (type) => {
    setAiFixForType(s => ({ ...s, [type]: { loading: true } }));
    try {
      const data = await auditApi.aiFix(audit.id, type);
      setAiFixForType(s => ({ ...s, [type]: { data } }));
    } catch (err) {
      setAiFixForType(s => ({ ...s, [type]: { error: err?.error || err?.message || 'Failed to get AI fix' } }));
    }
  };

  const filtered = summary.filter(s =>
    (!activeSeverity || s.severity === activeSeverity) &&
    (!activeCategory || s.category === activeCategory)
  );
  const sorted = [...filtered].sort((a, b) => {
    const sevOrder = { error: 0, warning: 1, notice: 2 };
    if (sevOrder[a.severity] !== sevOrder[b.severity]) return sevOrder[a.severity] - sevOrder[b.severity];
    return b.count - a.count;
  });
  const allCategories = [...new Set(summary.map(s => s.category))];

  const errorCount   = summary.filter(s => s.severity === 'error').reduce((a, c) => a + c.count, 0);
  const warningCount = summary.filter(s => s.severity === 'warning').reduce((a, c) => a + c.count, 0);
  const noticeCount  = summary.filter(s => s.severity === 'notice').reduce((a, c) => a + c.count, 0);

  return (
    <Card>
      <Box padding="0">
        {/* Filter bar */}
        <div style={{ padding: 12, borderBottom: `1px solid ${COLORS.border}`, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <FilterPill label={`All ${summary.length}`}            active={!activeSeverity}                  onClick={() => setActiveSeverity(null)} />
          <FilterPill label={`Errors ${errorCount}`}             active={activeSeverity === 'error'}      onClick={() => setActiveSeverity('error')} sevColor="#d72c0d" />
          <FilterPill label={`Warnings ${warningCount}`}         active={activeSeverity === 'warning'}    onClick={() => setActiveSeverity('warning')} sevColor="#f49342" />
          <FilterPill label={`Notices ${noticeCount}`}           active={activeSeverity === 'notice'}     onClick={() => setActiveSeverity('notice')} sevColor="#8a8a8a" />
          <span style={{ width: 1, background: COLORS.border, alignSelf: 'stretch', margin: '0 4px' }} />
          <FilterPill label="All categories" active={!activeCategory} onClick={() => setActiveCategory(null)} />
          {allCategories.map(c => (
            <FilterPill key={c} label={CATEGORY_LABEL[c] || c} active={activeCategory === c} onClick={() => setActiveCategory(c)} />
          ))}
          <span style={{ flex: 1 }} />
          <Button size="slim" onClick={() => downloadCSV(
            summary.map(s => ({ severity: s.severity, type: s.type, category: s.category, count: s.count })),
            `site-audit-${audit.id}-issues.csv`,
          )}>Download CSV</Button>
          <Button size="slim" onClick={() => window.open(`/api/print/audit/${audit.id}` + window.location.search, '_blank')}>
            Download Report
          </Button>
        </div>

        {/* Issue rows */}
        {sorted.length === 0 && (
          <Box padding="800"><Text variant="bodySm" tone="subdued" alignment="center">No issues match these filters.</Text></Box>
        )}
        {sorted.map(row => {
          const m = SEVERITY_META[row.severity];
          const expanded = expandedType === row.type;
          const list = issuesForType[row.type];
          return (
            <React.Fragment key={`${row.type}-${row.severity}`}>
              <div onClick={() => setExpandedType(t => t === row.type ? null : row.type)}
                style={{
                  padding: '14px 16px', cursor: 'pointer', background: expanded ? '#fafbfb' : '#fff',
                  borderBottom: `1px solid ${COLORS.borderMuted}`,
                }}>
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: 0.4, background: m.bg, color: m.color,
                    }}>{m.label.replace(/s$/, '')}</span>
                    <Text variant="bodyMd" fontWeight="medium">{humanize(row.type)}</Text>
                    <span style={{ fontSize: 12, color: COLORS.textSubdued }}>{CATEGORY_LABEL[row.category] || row.category}</span>
                  </InlineStack>
                  <InlineStack gap="200" blockAlign="center">
                    <span style={{ fontSize: 13, color: COLORS.textSubdued }}>{row.count} {row.count === 1 ? 'page' : 'pages'}</span>
                    <span style={{ color: COLORS.textSubdued, fontSize: 14 }}>{expanded ? '▾' : '▸'}</span>
                  </InlineStack>
                </InlineStack>
              </div>
              {expanded && (
                <div style={{ background: '#fafbfb', borderBottom: `1px solid ${COLORS.borderMuted}`, padding: '8px 24px 16px' }}>
                  <AiFixPanel
                    state={aiFixForType[row.type]}
                    onRequest={() => requestAiFix(row.type)}
                    auditId={audit.id}
                    issueType={row.type}
                    affectedCount={row.count}
                  />
                  {!list && <Text variant="bodySm" tone="subdued">Loading…</Text>}
                  {list && list.length === 0 && <Text variant="bodySm" tone="subdued">No data</Text>}
                  {list && list.slice(0, 50).map((i, idx) => (
                    <div key={idx} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px dotted #e1e3e5' }}>
                      <a href={i.url} target="_blank" rel="noreferrer" style={{ color: '#0870d9', textDecoration: 'none', wordBreak: 'break-all' }}>{i.url}</a>
                      {i.details && Object.keys(i.details).length > 0 && (
                        <div style={{ fontSize: 11, color: COLORS.textSubdued, marginTop: 2 }}>
                          {Object.entries(i.details).slice(0, 4).map(([k, v]) => `${k}: ${typeof v === 'string' && v.length > 60 ? v.slice(0, 60)+'…' : v}`).join(' · ')}
                        </div>
                      )}
                    </div>
                  ))}
                  {list && list.length > 50 && (
                    <div style={{ fontSize: 12, color: COLORS.textSubdued, marginTop: 6 }}>+ {list.length - 50} more pages</div>
                  )}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </Box>
    </Card>
  );
}

function FilterPill({ label, active, onClick }) {
  return (
    <Button pressed={active} onClick={onClick} size="slim">{label}</Button>
  );
}

// AI-generated, traffic-weighted action plan. Lazily fetched on tab open.
// The same audit produces the same plan deterministically enough that we
// don't bother caching server-side — the LLM call is fast.
function ActionPlanTab({ audit }) {
  const { can } = usePlan();
  const enabled = can('aiAuditPlan');
  const { data, isLoading, error, refetch } = useQuery(
    ['audit-action-plan', audit.id],
    () => auditApi.actionPlan(audit.id),
    { staleTime: 30 * 60 * 1000, refetchOnWindowFocus: false, enabled },
  );

  if (!enabled) {
    return (
      <PlanGate feature="aiAuditPlan" required="growth">
        <Card><Box padding="500"><Text variant="headingMd">✨ Priority action plan</Text></Box></Card>
      </PlanGate>
    );
  }

  const impactColor = (impact) => ({ high: '#d72c0d', medium: '#f49342', low: '#8a8a8a' }[impact] || '#8a8a8a');
  const effortColor = (effort) => ({ quick: '#108043', moderate: '#f49342', significant: '#d72c0d' }[effort] || '#8a8a8a');

  return (
    <Card>
      <Box padding="500">
        <BlockStack gap="400">
          <BlockStack gap="100">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingMd" as="h2">✨ Priority action plan</Text>
              <Button size="slim" onClick={() => refetch()} loading={isLoading}>Regenerate</Button>
            </InlineStack>
            <Text variant="bodySm" tone="subdued">
              Ranked by impact, scope, and Search Console traffic. Fix from top to bottom for the biggest gains.
            </Text>
          </BlockStack>

          {isLoading && <Box padding="800"><InlineStack align="center"><Spinner /></InlineStack></Box>}
          {error && (
            <Banner tone="critical" title="Couldn't generate plan" action={{ content: 'Retry', onAction: () => refetch() }}>
              <p>{error?.error || error?.message || 'Try again in a moment.'}</p>
            </Banner>
          )}
          {data && Array.isArray(data.actions) && data.actions.length === 0 && (
            <Banner tone="success">{data.message || 'No issues to action — your site looks clean.'}</Banner>
          )}
          {data && Array.isArray(data.actions) && data.actions.length > 0 && (
            <BlockStack gap="300">
              {data.actions.map((a) => (
                <div key={a.priority} style={{
                  background: '#fff',
                  border: '1px solid #e1e3e5',
                  borderLeft: `4px solid ${impactColor(a.expected_impact)}`,
                  borderRadius: 8,
                  padding: '14px 16px',
                }}>
                  <BlockStack gap="200">
                    <InlineStack gap="200" blockAlign="center">
                      <span style={{
                        width: 28, height: 28, borderRadius: '50%', background: '#1a1a1a', color: '#fff',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700,
                      }}>{a.priority}</span>
                      <Text variant="bodyMd" fontWeight="semibold">{a.title}</Text>
                    </InlineStack>
                    <Text variant="bodySm" tone="subdued">{a.why}</Text>
                    <InlineStack gap="200">
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#f4f5fa', color: '#202223' }}>
                        Impact: <strong style={{ color: impactColor(a.expected_impact) }}>{a.expected_impact}</strong>
                      </span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#f4f5fa', color: '#202223' }}>
                        Effort: <strong style={{ color: effortColor(a.effort) }}>{a.effort}</strong>
                      </span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#f4f5fa', color: '#202223' }}>
                        {a.affected_count} {a.affected_count === 1 ? 'page' : 'pages'}
                      </span>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#fff', color: '#6d7175', border: '1px solid #e1e3e5' }}>
                        {humanize(a.type)}
                      </span>
                    </InlineStack>
                  </BlockStack>
                </div>
              ))}
            </BlockStack>
          )}
        </BlockStack>
      </Box>
    </Card>
  );
}

const AUTOFIX_TYPES = new Set(['missing_meta_description', 'missing_title_tag', 'missing_alt_text']);

// Inline panel shown above the URL list when an issue type is expanded.
// Lazily fetches an AI explanation + step-by-step fix for the issue type.
function AiFixPanel({ state, onRequest, auditId, issueType, affectedCount }) {
  const { can } = usePlan();
  const canAiFix = can('aiAuditFix');
  const canAutoFix = can('aiAuditAutoFix');
  const supportsAutoFix = AUTOFIX_TYPES.has(issueType) && canAutoFix;
  const [autoFixState, setAutoFixState] = useState(null);

  if (!canAiFix && !state) {
    // Render compact upgrade prompt instead of the "Get AI fix" button.
    return (
      <div style={{ marginBottom: 12 }}>
        <PlanGate feature="aiAuditFix" required="growth" compact>AI fix-it</PlanGate>
      </div>
    );
  }

  const runAutoFix = async (dry_run) => {
    setAutoFixState({ loading: true, dry_run });
    try {
      const result = await auditApi.autoFix(auditId, { issue_type: issueType, dry_run });
      setAutoFixState({ result });
    } catch (err) {
      setAutoFixState({ error: err?.error || err?.message || 'Auto-fix failed' });
    }
  };


  if (!state) {
    return (
      <div style={{ marginBottom: 12, padding: '10px 12px', background: '#fff', border: '1px solid #e1e3e5', borderRadius: 8 }}>
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="bodySm" tone="subdued">Want a clear, step-by-step fix written for you?</Text>
          <Button size="slim" variant="primary" onClick={onRequest}>✨ Get AI fix</Button>
        </InlineStack>
      </div>
    );
  }
  if (state.loading) {
    return (
      <div style={{ marginBottom: 12, padding: 12, background: '#fff', border: '1px solid #e1e3e5', borderRadius: 8 }}>
        <InlineStack gap="200" blockAlign="center">
          <Spinner size="small" />
          <Text variant="bodySm" tone="subdued">Generating fix…</Text>
        </InlineStack>
      </div>
    );
  }
  if (state.error) {
    return (
      <div style={{ marginBottom: 12, padding: 12, background: '#fff5f5', border: '1px solid #f5c2c0', borderRadius: 8 }}>
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="bodySm" tone="critical">{state.error}</Text>
          <Button size="slim" onClick={onRequest}>Retry</Button>
        </InlineStack>
      </div>
    );
  }
  const fix = state.data;
  return (
    <div style={{ marginBottom: 12, padding: 14, background: '#fff', border: '1px solid #1a1a1a', borderRadius: 8 }}>
      <BlockStack gap="200">
        <InlineStack gap="200" blockAlign="center">
          <span style={{ fontSize: 16 }}>✨</span>
          <Text variant="bodyMd" fontWeight="semibold">AI fix-it</Text>
          <span style={{ fontSize: 11, color: COLORS.textSubdued }}>· {fix.affected_count} {fix.affected_count === 1 ? 'page' : 'pages'} affected</span>
        </InlineStack>

        {fix.what && (
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: COLORS.textSubdued }}>What this is</span>
            <div style={{ fontSize: 13, marginTop: 2 }}>{fix.what}</div>
          </div>
        )}

        {fix.why_it_matters && (
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: COLORS.textSubdued }}>Why it matters</span>
            <div style={{ fontSize: 13, marginTop: 2 }}>{fix.why_it_matters}</div>
          </div>
        )}

        {fix.how_to_fix && (
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: COLORS.textSubdued }}>How to fix</span>
            <div style={{ fontSize: 13, marginTop: 2, whiteSpace: 'pre-wrap' }}>{fix.how_to_fix}</div>
          </div>
        )}

        {fix.shopify_path && (
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: COLORS.textSubdued }}>Where in Shopify</span>
            <div style={{ fontSize: 13, marginTop: 2 }}>{fix.shopify_path}</div>
          </div>
        )}

        {fix.code_snippet && (
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: COLORS.textSubdued }}>Copy-paste fix</span>
            <pre style={{
              background: '#1a1a2e', color: '#a8b3cf', padding: '10px 12px',
              borderRadius: 6, fontSize: 12, marginTop: 4, overflowX: 'auto',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{fix.code_snippet}</pre>
          </div>
        )}

        {supportsAutoFix && (
          <div style={{ marginTop: 8, padding: 10, border: '1px dashed #1a1a1a', borderRadius: 6, background: '#fafbfb' }}>
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="bodySm" fontWeight="semibold">⚡ Auto-fix on Shopify</Text>
                <InlineStack gap="100">
                  <Button size="micro" onClick={() => runAutoFix(true)} loading={autoFixState?.loading && autoFixState?.dry_run}>
                    Preview
                  </Button>
                  <Button size="micro" variant="primary" onClick={() => runAutoFix(false)} loading={autoFixState?.loading && !autoFixState?.dry_run}>
                    Apply to all
                  </Button>
                </InlineStack>
              </InlineStack>
              {autoFixState?.error && <Text variant="bodySm" tone="critical">{autoFixState.error}</Text>}
              {autoFixState?.result && (
                <BlockStack gap="100">
                  <Text variant="bodySm" tone={autoFixState.result.failed > 0 ? 'caution' : 'success'}>
                    {autoFixState.result.dry_run ? 'Preview:' : 'Done:'} {autoFixState.result.succeeded}/{autoFixState.result.total} products
                    {autoFixState.result.failed > 0 ? ` · ${autoFixState.result.failed} failed` : ''}
                  </Text>
                  {(autoFixState.result.results || []).slice(0, 5).map((r, i) => (
                    <div key={i} style={{ fontSize: 11, color: r.ok ? '#108043' : '#d72c0d' }}>
                      {r.ok ? '✓' : '✗'} <code>{r.handle}</code>
                      {r.value && <span style={{ color: '#6d7175' }}> — {r.value.slice(0, 60)}{r.value.length > 60 ? '…' : ''}</span>}
                      {r.error && <span> — {r.error}</span>}
                    </div>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </div>
        )}
      </BlockStack>
    </div>
  );
}

// ─── Tab: Crawled Pages ──────────────────────────────────────────────────────
function CrawledPagesTab({ audit }) {
  const [statusFilter, setStatusFilter] = useState(null);
  const { data: pages = [], isLoading } = useQuery(
    ['audit-pages', audit.id, statusFilter],
    () => auditApi.pages(audit.id, statusFilter ? { status_class: statusFilter } : {}),
  );

  return (
    <Card>
      <Box padding="0">
        <div style={{ padding: 12, borderBottom: `1px solid ${COLORS.border}`, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <FilterPill label="All"  active={!statusFilter}             onClick={() => setStatusFilter(null)} />
          <FilterPill label="2xx"  active={statusFilter === '2xx'}    onClick={() => setStatusFilter('2xx')} sevColor="#008060" />
          <FilterPill label="3xx"  active={statusFilter === '3xx'}    onClick={() => setStatusFilter('3xx')} sevColor="#0870d9" />
          <FilterPill label="4xx"  active={statusFilter === '4xx'}    onClick={() => setStatusFilter('4xx')} sevColor="#d72c0d" />
          <FilterPill label="5xx"  active={statusFilter === '5xx'}    onClick={() => setStatusFilter('5xx')} sevColor="#d72c0d" />
          <span style={{ flex: 1 }} />
          <Button size="slim" onClick={() => downloadCSV(
            pages.map(p => ({
              url: p.url, status: p.status_code || '', title: p.title || '',
              meta_description: p.meta_description || '', word_count: p.word_count || 0,
              load_time_ms: p.load_time_ms || 0,
            })),
            `site-audit-${audit.id}-pages.csv`,
          )} disabled={!pages.length}>Download CSV</Button>
        </div>
        {isLoading && <Box padding="800"><InlineStack align="center"><Spinner size="small" /></InlineStack></Box>}
        {!isLoading && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#fafbfb' }}>
                  <th style={th}>URL</th>
                  <th style={th}>Title</th>
                  <th style={{ ...th, textAlign: 'center' }}>Status</th>
                  <th style={{ ...th, textAlign: 'center' }}>Issues</th>
                  <th style={{ ...th, textAlign: 'right' }}>TTFB</th>
                  <th style={{ ...th, textAlign: 'right' }}>Bytes</th>
                </tr>
              </thead>
              <tbody>
                {pages.map(p => (
                  <tr key={p.id} style={{ borderTop: `1px solid ${COLORS.borderMuted}` }}>
                    <td style={td}>
                      <a href={p.url} target="_blank" rel="noreferrer" style={{ color: '#0870d9', textDecoration: 'none', wordBreak: 'break-all' }}>
                        {p.url.length > 80 ? p.url.slice(0, 80) + '…' : p.url}
                      </a>
                    </td>
                    <td style={td}>{p.title || <span style={{ color: COLORS.textSubdued }}>—</span>}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <StatusBadge code={p.status_code} />
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>{p.issues_count || 0}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{p.ttfb_ms ? `${p.ttfb_ms}ms` : '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{p.bytes ? `${(p.bytes/1024).toFixed(1)} KB` : '—'}</td>
                  </tr>
                ))}
                {pages.length === 0 && (
                  <tr><td colSpan="6" style={{ ...td, textAlign: 'center', color: COLORS.textSubdued, padding: 32 }}>No pages match this filter.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Box>
    </Card>
  );
}

function StatusBadge({ code }) {
  if (!code) return <span style={{ color: COLORS.textSubdued }}>—</span>;
  let bg = '#e3f1df', color = '#008060';
  if (code >= 300 && code < 400) { bg = '#e0f0fe'; color = '#0870d9'; }
  else if (code >= 400)          { bg = '#ffebe9'; color = '#d72c0d'; }
  return (
    <span style={{ background: bg, color, padding: '2px 10px', borderRadius: 12, fontWeight: 700, fontSize: 11 }}>{code}</span>
  );
}

const th = { padding: '10px 12px', textAlign: 'left', color: COLORS.textSubdued, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: `1px solid ${COLORS.border}` };
const td = { padding: '10px 12px', verticalAlign: 'top' };

// ─── Tab: Statistics ─────────────────────────────────────────────────────────
function StatisticsTab({ audit }) {
  const { data: stats, isLoading } = useQuery(['audit-stats', audit.id], () => auditApi.stats(audit.id));
  if (isLoading || !stats) return <Box padding="800"><InlineStack align="center"><Spinner /></InlineStack></Box>;

  const tile = (title, children) => (
    <Card>
      <Box padding="500">
        <BlockStack gap="200">
          <Text variant="headingMd" fontWeight="semibold">{title}</Text>
          <div style={{ marginTop: 4 }}>{children}</div>
        </BlockStack>
      </Box>
    </Card>
  );

  const statusEntries = Object.entries(stats.status_codes).filter(([_, v]) => v > 0);
  const total = stats.pages || 1;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
      {tile('HTTP Status Codes', (
        <BlockStack gap="150">
          {statusEntries.map(([k, v]) => (
            <InlineStack key={k} align="space-between">
              <Text variant="bodySm">{k}</Text>
              <Text variant="bodySm" fontWeight="semibold">{v} ({pct(v, total)}%)</Text>
            </InlineStack>
          ))}
        </BlockStack>
      ))}

      {tile('Canonicalization', (
        <BlockStack gap="150">
          <InlineStack align="space-between"><Text variant="bodySm">With canonical</Text>    <Text variant="bodySm" fontWeight="semibold">{stats.canonicalization.with} ({pct(stats.canonicalization.with, total)}%)</Text></InlineStack>
          <InlineStack align="space-between"><Text variant="bodySm">Without canonical</Text> <Text variant="bodySm" fontWeight="semibold">{stats.canonicalization.without} ({pct(stats.canonicalization.without, total)}%)</Text></InlineStack>
        </BlockStack>
      ))}

      {tile('Structured Data (JSON-LD)', (
        <BlockStack gap="150">
          <InlineStack align="space-between"><Text variant="bodySm">With JSON-LD</Text>    <Text variant="bodySm" fontWeight="semibold">{stats.structured_data.with} ({pct(stats.structured_data.with, total)}%)</Text></InlineStack>
          <InlineStack align="space-between"><Text variant="bodySm">Without JSON-LD</Text> <Text variant="bodySm" fontWeight="semibold">{stats.structured_data.without} ({pct(stats.structured_data.without, total)}%)</Text></InlineStack>
          {Object.entries(stats.structured_data.types || {}).slice(0, 5).map(([t, c]) => (
            <InlineStack key={t} align="space-between"><Text variant="bodySm" tone="subdued">  {t}</Text><Text variant="bodySm" tone="subdued">{c}</Text></InlineStack>
          ))}
        </BlockStack>
      ))}

      {tile('Mobile / Viewport', (
        <BlockStack gap="150">
          <InlineStack align="space-between"><Text variant="bodySm">With viewport meta</Text>    <Text variant="bodySm" fontWeight="semibold">{stats.viewport.with} ({pct(stats.viewport.with, total)}%)</Text></InlineStack>
          <InlineStack align="space-between"><Text variant="bodySm">Missing viewport</Text>      <Text variant="bodySm" fontWeight="semibold">{stats.viewport.without} ({pct(stats.viewport.without, total)}%)</Text></InlineStack>
        </BlockStack>
      ))}

      {tile('Images', (
        <BlockStack gap="150">
          <InlineStack align="space-between"><Text variant="bodySm">Total images</Text>     <Text variant="bodySm" fontWeight="semibold">{fmt(stats.images.total)}</Text></InlineStack>
          <InlineStack align="space-between"><Text variant="bodySm">Missing alt text</Text> <Text variant="bodySm" fontWeight="semibold">{fmt(stats.images.missing_alt)} ({pct(stats.images.missing_alt, stats.images.total || 1)}%)</Text></InlineStack>
        </BlockStack>
      ))}

      {tile('Internal Linking', (
        <BlockStack gap="150">
          <InlineStack align="space-between"><Text variant="bodySm">Internal links</Text>  <Text variant="bodySm" fontWeight="semibold">{fmt(stats.links.internal)}</Text></InlineStack>
          <InlineStack align="space-between"><Text variant="bodySm">External links</Text>  <Text variant="bodySm" fontWeight="semibold">{fmt(stats.links.external)}</Text></InlineStack>
          <InlineStack align="space-between"><Text variant="bodySm">Pages with multiple H1s</Text> <Text variant="bodySm" fontWeight="semibold">{stats.headings.pages_multiple_h1}</Text></InlineStack>
        </BlockStack>
      ))}
    </div>
  );
}

// ─── Tab: Progress ───────────────────────────────────────────────────────────
function ProgressTab() {
  const { data: history = [], isLoading } = useQuery('audit-history', auditApi.history);
  if (isLoading) return <Box padding="800"><InlineStack align="center"><Spinner /></InlineStack></Box>;
  const completed = history.filter(h => h.status === 'completed');

  if (!completed.length) {
    return <Card><Box padding="800"><Text variant="bodySm" tone="subdued" alignment="center">No completed audits yet.</Text></Box></Card>;
  }

  // Simple inline SVG line chart of total issues over time
  const sorted = [...completed].reverse(); // oldest first
  const issues = sorted.map(a => (a.errors_count || 0) + (a.warnings_count || 0) + (a.notices_count || 0));
  const max = Math.max(...issues, 1);
  const w = 800, h = 220, pad = 40;
  const stepX = sorted.length > 1 ? (w - pad * 2) / (sorted.length - 1) : 0;
  const yFor = v => h - pad - (v / max) * (h - pad * 2);
  const points = sorted.map((a, i) => `${pad + i * stepX},${yFor(issues[i])}`).join(' ');

  return (
    <BlockStack gap="500">
      <Card>
        <Box padding="500">
          <Text variant="headingMd" fontWeight="semibold">Total issues over time</Text>
          <div style={{ marginTop: 16, overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ minWidth: 600, maxHeight: 240 }}>
              <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#e1e3e5" />
              <line x1={pad} y1={pad}     x2={pad}     y2={h - pad} stroke="#e1e3e5" />
              <polyline points={points} fill="none" stroke={COLORS.accent} strokeWidth="2" />
              {sorted.map((a, i) => (
                <circle key={a.id} cx={pad + i * stepX} cy={yFor(issues[i])} r="3" fill={COLORS.accent} />
              ))}
              <text x={pad - 6} y={pad + 4} textAnchor="end" fontSize="10" fill="#6d7175">{max}</text>
              <text x={pad - 6} y={h - pad + 4} textAnchor="end" fontSize="10" fill="#6d7175">0</text>
            </svg>
          </div>
        </Box>
      </Card>

      <Card>
        <Box padding="0">
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${COLORS.border}` }}>
            <Text variant="headingMd" fontWeight="semibold">Audit history</Text>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ background: '#fafbfb' }}>
                <th style={th}>Date</th>
                <th style={th}>URL</th>
                <th style={{ ...th, textAlign: 'center' }}>Score</th>
                <th style={{ ...th, textAlign: 'center' }}>Pages</th>
                <th style={{ ...th, textAlign: 'center' }}>Errors</th>
                <th style={{ ...th, textAlign: 'center' }}>Warnings</th>
                <th style={{ ...th, textAlign: 'center' }}>Notices</th>
                <th style={{ ...th, textAlign: 'center' }}>Status</th>
              </tr></thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id} style={{ borderTop: `1px solid ${COLORS.borderMuted}` }}>
                    <td style={td}>{h.completed_at ? new Date(h.completed_at).toLocaleString() : (h.started_at ? new Date(h.started_at).toLocaleString() : '—')}</td>
                    <td style={td}><span style={{ color: '#0870d9', fontSize: 12 }}>{h.audit_url}</span></td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{h.score ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{h.pages_crawled}</td>
                    <td style={{ ...td, textAlign: 'center', color: '#d72c0d' }}>{h.errors_count}</td>
                    <td style={{ ...td, textAlign: 'center', color: '#b54708' }}>{h.warnings_count}</td>
                    <td style={{ ...td, textAlign: 'center', color: '#374151' }}>{h.notices_count}</td>
                    <td style={{ ...td, textAlign: 'center' }}><Badge>{h.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>
      </Card>
    </BlockStack>
  );
}

// ─── Tab: Compare Crawls ─────────────────────────────────────────────────────
function CompareTab() {
  const { data: history = [] } = useQuery('audit-history', auditApi.history);
  const completed = history.filter(h => h.status === 'completed');
  const [aId, setAId] = useState(null);
  const [bId, setBId] = useState(null);

  useEffect(() => {
    if (completed.length >= 2 && (!aId || !bId)) {
      setAId(completed[0].id);
      setBId(completed[1].id);
    }
  }, [completed.length]);

  if (completed.length < 2) {
    return <Card><Box padding="800"><Text variant="bodySm" tone="subdued" alignment="center">Need at least 2 completed audits to compare. Run the audit again to add another.</Text></Box></Card>;
  }

  const a = completed.find(h => h.id === aId);
  const b = completed.find(h => h.id === bId);
  if (!a || !b) return null;

  const diff = (k) => {
    const av = a[k] || 0, bv = b[k] || 0, d = av - bv;
    const arrow = d > 0 ? '▲' : d < 0 ? '▼' : '—';
    const color = (k === 'score') ? (d > 0 ? '#008060' : d < 0 ? '#d72c0d' : '#6d7175') : (d > 0 ? '#d72c0d' : d < 0 ? '#008060' : '#6d7175');
    return { av, bv, d, arrow, color };
  };

  const Row = ({ label, k }) => {
    const { av, bv, d, arrow, color } = diff(k);
    return (
      <tr style={{ borderTop: `1px solid ${COLORS.borderMuted}` }}>
        <td style={td}>{label}</td>
        <td style={{ ...td, textAlign: 'center', fontWeight: 600 }}>{av}</td>
        <td style={{ ...td, textAlign: 'center', fontWeight: 600 }}>{bv}</td>
        <td style={{ ...td, textAlign: 'center', color, fontWeight: 600 }}>{arrow} {Math.abs(d) || ''}</td>
      </tr>
    );
  };

  return (
    <Card>
      <Box padding="0">
        <Box padding="400" borderBlockEndWidth="025" borderColor="border">
          <InlineStack gap="300" blockAlign="center" wrap>
            <Text variant="bodyMd" as="span" fontWeight="semibold">Compare:</Text>
            <Box minWidth="240px">
              <Select
                label="Audit A"
                labelHidden
                value={String(aId || '')}
                onChange={(v) => setAId(parseInt(v))}
                options={completed.map(h => ({
                  label: `${new Date(h.completed_at).toLocaleString()} (#${h.id})`,
                  value: String(h.id),
                }))}
              />
            </Box>
            <Text variant="bodySm" as="span" tone="subdued">vs</Text>
            <Box minWidth="240px">
              <Select
                label="Audit B"
                labelHidden
                value={String(bId || '')}
                onChange={(v) => setBId(parseInt(v))}
                options={completed.map(h => ({
                  label: `${new Date(h.completed_at).toLocaleString()} (#${h.id})`,
                  value: String(h.id),
                }))}
              />
            </Box>
          </InlineStack>
        </Box>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#fafbfb' }}>
            <th style={th}>Metric</th>
            <th style={{ ...th, textAlign: 'center' }}>A (#{a.id})</th>
            <th style={{ ...th, textAlign: 'center' }}>B (#{b.id})</th>
            <th style={{ ...th, textAlign: 'center' }}>Change</th>
          </tr></thead>
          <tbody>
            <Row label="Score"            k="score" />
            <Row label="Pages crawled"    k="pages_crawled" />
            <Row label="Errors"           k="errors_count" />
            <Row label="Warnings"         k="warnings_count" />
            <Row label="Notices"          k="notices_count" />
          </tbody>
        </table>
      </Box>
    </Card>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function SiteAudit() {
  return (
    <PlanGate feature="siteAudit" required="growth">
      <SiteAuditInner />
    </PlanGate>
  );
}

function SiteAuditInner() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('overview');

  const { data: latest, isLoading: ll } = useQuery('audit-latest', auditApi.latest, {
    refetchInterval: (data) => (data && ['queued', 'crawling', 'analyzing'].includes(data.status)) ? 3000 : false,
  });
  const { data: storefront } = useQuery('audit-storefront', auditApi.storefront);
  const auditId = latest?.id;
  const auditDone = latest?.status === 'completed';

  const { data: summary = [] } = useQuery(
    ['audit-summary', auditId],
    () => auditApi.summary(auditId),
    { enabled: !!auditId && auditDone }
  );

  const runMutation = useMutation(auditApi.run, {
    onSuccess: () => qc.invalidateQueries('audit-latest'),
  });

  if (ll) return <Page title="Site Audit"><Box padding="1600"><InlineStack align="center"><Spinner /></InlineStack></Box></Page>;

  // No audits yet
  if (!latest) {
    return (
      <Page title="Site Audit" subtitle={storefront?.url ? `Will audit: ${storefront.url}` : 'Crawl your storefront to find SEO issues'}>
        <Card>
          <Box padding="800">
            <BlockStack gap="400" inlineAlign="center">
              <Text variant="headingMd">No audits yet</Text>
              <Text variant="bodySm" tone="subdued" alignment="center">
                Crawl your storefront to find SEO issues — missing titles, broken links, duplicate content, missing alt text, structured data gaps, and more.
              </Text>
              <RunButton onClick={() => runMutation.mutate({})} loading={runMutation.isLoading} label="Run first audit" />
            </BlockStack>
          </Box>
        </Card>
      </Page>
    );
  }

  const inProgress = ['queued', 'crawling', 'analyzing'].includes(latest.status);

  return (
    <Page>
      {/* Header bar */}
      <Card>
        <Box padding="400">
          <InlineStack align="space-between" blockAlign="center" wrap={false}>
            <BlockStack gap="100">
              <InlineStack gap="200" blockAlign="center">
                <Text variant="headingLg" fontWeight="bold">Site Audit:</Text>
                <a href={latest.audit_url} target="_blank" rel="noreferrer" style={{ color: '#0870d9', fontSize: 18, fontWeight: 600, textDecoration: 'none' }}>
                  {(() => { try { return new URL(latest.audit_url).host; } catch { return latest.audit_url; } })()}
                </a>
              </InlineStack>
              <InlineStack gap="400" blockAlign="center">
                {latest.completed_at && (
                  <Text variant="bodySm" tone="subdued">Updated: {new Date(latest.completed_at).toLocaleString()}</Text>
                )}
                <Text variant="bodySm" tone="subdued">Pages crawled: <strong>{latest.pages_crawled}</strong></Text>
                {latest.duration_ms && <Text variant="bodySm" tone="subdued">{Math.round(latest.duration_ms / 1000)}s</Text>}
              </InlineStack>
            </BlockStack>
            <RunButton onClick={() => runMutation.mutate({})} loading={inProgress || runMutation.isLoading} label={inProgress ? 'Audit running…' : 'Rerun audit'} />
          </InlineStack>
        </Box>
      </Card>

      {/* Tab strip */}
      <Box paddingBlockStart="400">
        <Tabs
          tabs={TABS.map(t => ({ id: t.id, content: t.label, accessibilityLabel: t.label, panelID: `${t.id}-panel` }))}
          selected={TABS.findIndex(t => t.id === tab)}
          onSelect={(i) => setTab(TABS[i].id)}
        >
          <Box paddingBlockStart="400">
            {latest.status === 'failed' && (
              <Box paddingBlockEnd="400">
                <Banner tone="critical" title="Audit failed">
                  <Text as="p">{latest.error_message || 'Unknown error'}</Text>
                </Banner>
              </Box>
            )}
            {inProgress && (
              <Box paddingBlockEnd="400">
                <Banner tone="info" title={`Audit in progress: ${latest.status}`}>
                  <Text as="p">Crawled {latest.pages_crawled} pages so far. This page auto-refreshes.</Text>
                </Banner>
              </Box>
            )}

            {tab === 'overview'    && auditDone && <OverviewTab     audit={latest} summary={summary} />}
            {tab === 'performance' && auditDone && <PerformanceTab  audit={latest} />}
            {tab === 'action-plan' && auditDone && <ActionPlanTab   audit={latest} />}
            {tab === 'issues'      && auditDone && <IssuesTab       audit={latest} summary={summary} />}
            {tab === 'pages'      && auditDone && <CrawledPagesTab audit={latest} />}
            {tab === 'statistics' && auditDone && <StatisticsTab   audit={latest} />}
            {tab === 'progress'                  && <ProgressTab />}
            {tab === 'compare'                   && <CompareTab />}

            {!auditDone && tab !== 'progress' && tab !== 'compare' && (
              <Card>
                <EmptyState heading="Waiting for audit to complete…" image="">
                  <p>The crawler is still processing pages. Check back in a moment.</p>
                </EmptyState>
              </Card>
            )}
          </Box>
        </Tabs>
      </Box>
    </Page>
  );
}
