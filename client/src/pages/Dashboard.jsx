import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import {
  Page, Card, Text, Banner, Button, ButtonGroup, BlockStack, InlineStack,
  Box, Tabs, Divider, Badge, Link, DataTable, SkeletonBodyText,
  SkeletonDisplayText, EmptyState, InlineGrid,
} from '@shopify/polaris';
import {
  LineChart, BarChart, SimpleBarChart, ComboChart, ChartSkeleton,
} from '@shopify/polaris-viz';
import { analyticsApi, analyticsAiApi } from '../api';
import { useShop } from '../context/ShopContext';
import { usePlan, downloadCSV } from '../hooks/usePlan';
import PlanGate from '../components/PlanGate';
import DateRangeFilter from '../components/DateRangeFilter';

// ── Helpers ───────────────────────────────────────────────────────────────────

const PERIODS = [
  { label: '7 Days',   value: '7d' },
  { label: '28 Days',  value: '28d' },
  { label: '3 Months', value: '90d' },
];

const CHART_HEIGHT = 280;
const MINI_CHART_HEIGHT = 200;

function fmt(n) { return (n || 0).toLocaleString(); }
function fmtPct(n) { return `${parseFloat(n || 0).toFixed(2)}%`; }
function fmtSec(n) {
  const s = Math.round(n || 0);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}
function fmtDate(d) {
  if (!d) return '';
  if (d.length === 8) return `${d.slice(4,6)}/${d.slice(6,8)}`;
  return d.slice(5);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PeriodSelector({ value, onChange }) {
  return (
    <ButtonGroup variant="segmented">
      {PERIODS.map(p => (
        <Button
          key={p.value}
          pressed={value === p.value}
          onClick={() => onChange(p.value)}
        >
          {p.label}
        </Button>
      ))}
    </ButtonGroup>
  );
}

function KPICard({ label, value, sub, loading }) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text variant="bodySm" tone="subdued">{label}</Text>
        {loading ? (
          <SkeletonDisplayText size="medium" />
        ) : (
          <Text variant="headingXl" as="p" fontWeight="bold">{value}</Text>
        )}
        {sub && <Text variant="bodySm" tone="subdued">{sub}</Text>}
      </BlockStack>
    </Card>
  );
}

function SectionHeader({ title, onExport, exportLabel = 'Export CSV' }) {
  return (
    <InlineStack align="space-between" blockAlign="center">
      <Text variant="headingMd" fontWeight="semibold" as="h3">{title}</Text>
      {onExport && (
        <Button size="slim" onClick={onExport}>{exportLabel}</Button>
      )}
    </InlineStack>
  );
}

function PositionBadge({ pos }) {
  const p = parseFloat(pos || 0);
  const tone = p <= 3 ? 'success' : p <= 10 ? 'warning' : undefined;
  return <Badge tone={tone}>{`#${p.toFixed(1)}`}</Badge>;
}

function ChartBlock({ title, loading, hasData = true, emptyText, height = CHART_HEIGHT, children }) {
  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingMd" fontWeight="semibold" as="h3">{title}</Text>
        <Box minHeight={`${height}px`}>
          {loading ? (
            <ChartSkeleton type="Line" />
          ) : !hasData ? (
            <Box paddingBlock="600">
              <Text alignment="center" tone="subdued">{emptyText || 'No data available.'}</Text>
            </Box>
          ) : children}
        </Box>
      </BlockStack>
    </Card>
  );
}

function TableEmpty({ text }) {
  return (
    <Box paddingBlock="600">
      <Text alignment="center" tone="subdued">{text}</Text>
    </Box>
  );
}

// ── Polaris-viz data shapers ──────────────────────────────────────────────────

function toLineSeries(rows, key, name) {
  return {
    name,
    data: rows.map(r => ({ key: fmtDate(r.date), value: Number(r[key] || 0) })),
  };
}

function toBarSeries(rows, key, name, labelKey) {
  return {
    name,
    data: rows.map(r => ({ key: String(r[labelKey] ?? ''), value: Number(r[key] || 0) })),
  };
}

// ── GA4 Tab ───────────────────────────────────────────────────────────────────

function GA4Tab({ period }) {
  const { googleStatus } = useShop();
  const baseUrl = getBaseUrl(googleStatus?.account?.search_console_property);
  const params = { period };
  const { data: sessions = [], isLoading: lS } = useQuery(['ga4-sessions', period], () => analyticsApi.ga4Sessions(params));
  const { data: sources = [],  isLoading: lSrc } = useQuery(['ga4-sources', period],  () => analyticsApi.ga4Sources(params));
  const { data: countries = [], isLoading: lC } = useQuery(['ga4-countries', period], () => analyticsApi.ga4Countries(params));
  const { data: pages = [],    isLoading: lP } = useQuery(['ga4-pages', period],    () => analyticsApi.ga4Pages(params));

  const totals = sessions.reduce((a, d) => ({
    sessions: a.sessions + (d.sessions || 0),
    users:    a.users    + (d.users    || 0),
    new_users:a.new_users+ (d.new_users|| 0),
  }), { sessions: 0, users: 0, new_users: 0 });

  const avgBounce = sessions.length ? (sessions.reduce((a, d) => a + (d.bounce_rate || 0), 0) / sessions.length) : 0;
  const avgDur    = sessions.length ? (sessions.reduce((a, d) => a + (d.avg_session_duration || 0), 0) / sessions.length) : 0;

  const sessionsSeries = [
    toLineSeries(sessions, 'sessions', 'Sessions'),
    toLineSeries(sessions, 'users', 'Users'),
  ];
  const sourcesSeries = [
    toBarSeries(sources.slice(0, 8), 'sessions', 'Sessions', 'channel'),
  ];

  const exportPages = () => downloadCSV(pages, `ga4-pages-${period}.csv`);
  const exportSources = () => downloadCSV(sources, `ga4-sources-${period}.csv`);
  const exportCountries = () => downloadCSV(countries, `ga4-countries-${period}.csv`);

  // Polaris DataTable rows
  const sourceRows = sources.map(r => [r.channel || '—', fmt(r.sessions), fmt(r.users)]);
  const countryRows = countries.map(r => [r.country || '—', fmt(r.sessions), fmt(r.users)]);
  const pageRows = pages.map(r => {
    const href = buildPageUrl(r.path, baseUrl);
    return [
      <BlockStack gap="050" key={r.path}>
        <Text variant="bodyMd" fontWeight="medium">{r.title || '(No title)'}</Text>
        {r.path && (href
          ? <Link url={href} external removeUnderline monochrome={false}>{r.path}</Link>
          : <Text variant="bodySm" tone="subdued">{r.path}</Text>
        )}
      </BlockStack>,
      fmt(r.views),
      fmt(r.sessions),
    ];
  });

  return (
    <BlockStack gap="500">

      {/* KPIs */}
      <InlineGrid columns={{ xs: 2, md: 5 }} gap="400">
        <KPICard label="Total Sessions"       loading={lS} value={fmt(totals.sessions)} />
        <KPICard label="Total Users"          loading={lS} value={fmt(totals.users)} />
        <KPICard label="New Users"            loading={lS} value={fmt(totals.new_users)} />
        <KPICard label="Avg Bounce Rate"      loading={lS} value={fmtPct(avgBounce)} />
        <KPICard label="Avg Session Duration" loading={lS} value={fmtSec(avgDur)} />
      </InlineGrid>

      {/* Sessions + Users chart */}
      <ChartBlock
        title="Sessions & Users Over Time"
        loading={lS}
        hasData={sessions.length > 0}
        emptyText="No session data yet for the selected period."
      >
        <div style={{ height: CHART_HEIGHT }}>
          <LineChart data={sessionsSeries} state="Success" isAnimated />
        </div>
      </ChartBlock>

      {/* Traffic Sources + Countries side by side */}
      <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
        <Card>
          <BlockStack gap="300">
            <SectionHeader title="Traffic Sources" onExport={sources.length ? exportSources : null} />
            {lSrc ? (
              <ChartSkeleton type="Bar" />
            ) : sources.length === 0 ? (
              <TableEmpty text="No traffic source data available." />
            ) : (
              <>
                <div style={{ height: 220 }}>
                  <SimpleBarChart data={sourcesSeries} />
                </div>
                <Divider />
                <DataTable
                  columnContentTypes={['text', 'numeric', 'numeric']}
                  headings={['Channel', 'Sessions', 'Users']}
                  rows={sourceRows}
                />
              </>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <SectionHeader title="Top Countries" onExport={countries.length ? exportCountries : null} />
            {lC ? (
              <SkeletonBodyText lines={6} />
            ) : countries.length === 0 ? (
              <TableEmpty text="No country data available." />
            ) : (
              <DataTable
                columnContentTypes={['text', 'numeric', 'numeric']}
                headings={['Country', 'Sessions', 'Users']}
                rows={countryRows}
              />
            )}
          </BlockStack>
        </Card>
      </InlineGrid>

      {/* Top Pages */}
      <Card padding="0">
        <Box padding="400">
          <SectionHeader title="Top Pages" onExport={pages.length ? exportPages : null} />
        </Box>
        <Divider />
        {lP ? (
          <Box padding="400"><SkeletonBodyText lines={6} /></Box>
        ) : pages.length === 0 ? (
          <TableEmpty text="No page data available. Make sure your GA4 property is configured." />
        ) : (
          <DataTable
            columnContentTypes={['text', 'numeric', 'numeric']}
            headings={['Page', 'Page Views', 'Sessions']}
            rows={pageRows}
          />
        )}
      </Card>

    </BlockStack>
  );
}

// ── Search Console Tab ────────────────────────────────────────────────────────

function SearchConsoleTab({ period }) {
  const [scTab, setScTab] = useState(0);
  const params = { period };

  const { data: overview = [], isLoading: lO } = useQuery(['sc-overview', period], () => analyticsApi.seoOverview(params));
  const { data: queries = [],  isLoading: lQ } = useQuery(['sc-keywords', period], () => analyticsApi.seoKeywords(params));
  const { data: scPages = [],  isLoading: lP } = useQuery(['sc-pages', period],    () => analyticsApi.seoPages(params));

  const totals = overview.reduce((a, d) => ({
    clicks:      a.clicks      + (d.clicks      || 0),
    impressions: a.impressions + (d.impressions || 0),
  }), { clicks: 0, impressions: 0 });
  const avgCtr = overview.length ? (overview.reduce((a, d) => a + (d.ctr || 0), 0) / overview.length) : 0;
  const avgPos = overview.length ? (overview.reduce((a, d) => a + (d.position || 0), 0) / overview.length) : 0;

  const clicksImpressionsCombo = [
    { shape: 'Bar',  series: [toLineSeries(overview, 'impressions', 'Impressions')] },
    { shape: 'Line', series: [toLineSeries(overview, 'clicks',      'Clicks')] },
  ];

  const ctrSeries = [toLineSeries(overview, 'ctr', 'CTR (%)')];
  const positionSeries = [toLineSeries(overview, 'position', 'Avg Position')];

  const exportQueries = () => downloadCSV(queries, `sc-queries-${period}.csv`);
  const exportPages   = () => downloadCSV(scPages,  `sc-pages-${period}.csv`);

  // Polaris DataTable rows
  const queryRows = queries.map(r => [
    <Text variant="bodyMd" fontWeight="medium" key={r.keyword}>{r.keyword}</Text>,
    <strong key="c">{fmt(r.clicks)}</strong>,
    fmt(r.impressions),
    fmtPct(r.ctr),
    <PositionBadge key="p" pos={r.position} />,
  ]);

  const pageRows = scPages.map(r => [
    <Link key={r.page} url={r.page} external monochrome={false}>{r.page}</Link>,
    <strong key="c">{fmt(r.clicks)}</strong>,
    fmt(r.impressions),
    fmtPct(r.ctr),
    <PositionBadge key="p" pos={r.position} />,
  ]);

  return (
    <BlockStack gap="500">

      {/* KPIs */}
      <InlineGrid columns={{ xs: 2, md: 4 }} gap="400">
        <KPICard label="Total Clicks"      loading={lO} value={fmt(totals.clicks)}      sub="organic search" />
        <KPICard label="Total Impressions" loading={lO} value={fmt(totals.impressions)} sub="search results shown" />
        <KPICard label="Avg CTR"           loading={lO} value={fmtPct(avgCtr)}          sub="click-through rate" />
        <KPICard label="Avg Position"      loading={lO} value={`#${avgPos.toFixed(1)}`} sub="search ranking (lower is better)" />
      </InlineGrid>

      {/* Clicks + Impressions combo chart */}
      <ChartBlock
        title="Clicks & Impressions Over Time"
        loading={lO}
        hasData={overview.length > 0}
        emptyText="No Search Console data yet. Make sure your property is configured."
      >
        <div style={{ height: CHART_HEIGHT }}>
          <ComboChart data={clicksImpressionsCombo} state="Success" isAnimated />
        </div>
      </ChartBlock>

      {/* CTR + Position mini charts */}
      <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
        <ChartBlock
          title="CTR Over Time"
          loading={lO}
          hasData={overview.length > 0}
          height={MINI_CHART_HEIGHT}
        >
          <div style={{ height: MINI_CHART_HEIGHT }}>
            <LineChart data={ctrSeries} state="Success" isAnimated />
          </div>
        </ChartBlock>
        <ChartBlock
          title="Avg Position Over Time"
          loading={lO}
          hasData={overview.length > 0}
          height={MINI_CHART_HEIGHT}
        >
          <div style={{ height: MINI_CHART_HEIGHT }}>
            <LineChart data={positionSeries} state="Success" isAnimated />
          </div>
        </ChartBlock>
      </InlineGrid>

      {/* Queries / Pages tabs */}
      <Card padding="0">
        <Tabs
          tabs={[
            { id: 'queries', content: `Queries (${queries.length})` },
            { id: 'pages',   content: `Pages (${scPages.length})` },
          ]}
          selected={scTab}
          onSelect={setScTab}
        >
          <Box padding="400" borderBlockEndWidth="025" borderColor="border">
            <InlineStack align="end">
              <Button onClick={scTab === 0 ? exportQueries : exportPages}>Export CSV</Button>
            </InlineStack>
          </Box>
          {scTab === 0 && (
            lQ ? <Box padding="400"><SkeletonBodyText lines={6} /></Box>
            : queries.length === 0 ? <TableEmpty text="No query data. Configure Search Console property first." />
            : <DataTable
                columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'text']}
                headings={['Query', 'Clicks', 'Impressions', 'CTR', 'Position']}
                rows={queryRows}
              />
          )}
          {scTab === 1 && (
            lP ? <Box padding="400"><SkeletonBodyText lines={6} /></Box>
            : scPages.length === 0 ? <TableEmpty text="No page data available." />
            : <DataTable
                columnContentTypes={['text', 'numeric', 'numeric', 'numeric', 'text']}
                headings={['Page URL', 'Clicks', 'Impressions', 'CTR', 'Position']}
                rows={pageRows}
              />
          )}
        </Tabs>
      </Card>

    </BlockStack>
  );
}

// ── Ads Tab ───────────────────────────────────────────────────────────────────

function AdsTab({ period }) {
  const { data: campaigns = [], isLoading } = useQuery(['ads-campaigns', period], () => analyticsApi.adsCampaigns({ period }));

  const totals = campaigns.reduce((a, c) => ({
    clicks: a.clicks + (c.clicks || 0),
    impressions: a.impressions + (c.impressions || 0),
    cost: a.cost + (c.cost || 0),
    conversions: a.conversions + (c.conversions || 0),
  }), { clicks: 0, impressions: 0, cost: 0, conversions: 0 });

  const exportAds = () => downloadCSV(campaigns, `ads-campaigns-${period}.csv`);

  const campaignRows = campaigns.map(c => [
    <Text variant="bodyMd" fontWeight="medium" key={c.campaign}>{c.campaign}</Text>,
    <Badge key="s" tone={c.status === 'ENABLED' ? 'success' : undefined}>{c.status || '—'}</Badge>,
    fmt(c.clicks),
    fmt(c.impressions),
    fmtPct(c.ctr),
    `₹${parseFloat(c.cost || 0).toFixed(2)}`,
    fmt(c.conversions),
    c.roas ? `${parseFloat(c.roas).toFixed(2)}x` : '—',
  ]);

  const top10 = campaigns.slice(0, 10);
  const spendVsConvCombo = [
    {
      shape: 'Bar',
      series: [{
        name: 'Spend (₹)',
        data: top10.map(c => ({ key: c.campaign, value: Number(c.cost || 0) })),
      }],
    },
    {
      shape: 'Line',
      series: [{
        name: 'Conversions',
        data: top10.map(c => ({ key: c.campaign, value: Number(c.conversions || 0) })),
      }],
    },
  ];

  return (
    <BlockStack gap="500">
      <InlineGrid columns={{ xs: 2, md: 4 }} gap="400">
        <KPICard label="Total Clicks"       loading={isLoading} value={fmt(totals.clicks)} />
        <KPICard label="Total Impressions"  loading={isLoading} value={fmt(totals.impressions)} />
        <KPICard label="Total Spend"        loading={isLoading} value={`₹${(totals.cost || 0).toFixed(2)}`} />
        <KPICard label="Total Conversions"  loading={isLoading} value={fmt(totals.conversions)} />
      </InlineGrid>

      <Card padding="0">
        <Box padding="400" borderBlockEndWidth="025" borderColor="border">
          <SectionHeader title="Campaign Performance" onExport={campaigns.length ? exportAds : null} />
        </Box>
        {isLoading ? (
          <Box padding="400"><SkeletonBodyText lines={6} /></Box>
        ) : campaigns.length === 0 ? (
          <TableEmpty text="No campaign data. Make sure Google Ads Customer ID is configured and ads are running." />
        ) : (
          <DataTable
            columnContentTypes={['text', 'text', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric', 'numeric']}
            headings={['Campaign', 'Status', 'Clicks', 'Impressions', 'CTR', 'Spend', 'Conversions', 'ROAS']}
            rows={campaignRows}
          />
        )}
      </Card>

      {campaigns.length > 0 && (
        <ChartBlock title="Spend vs Conversions by Campaign" loading={isLoading} hasData>
          <div style={{ height: 280 }}>
            <ComboChart data={spendVsConvCombo} state="Success" isAnimated />
          </div>
        </ChartBlock>
      )}
    </BlockStack>
  );
}

// ── Starter overview (basic KPIs only) ────────────────────────────────────────

function StarterOverview() {
  const navigate = useNavigate();
  const { data: overview, isLoading } = useQuery('overview', analyticsApi.overview);
  const totals = overview?.totals || {};
  const keywords = overview?.top_keywords || [];

  return (
    <BlockStack gap="400">
      <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
        <KPICard label="Total Sessions (30d)" loading={isLoading} value={fmt(totals.sessions)} />
        <KPICard label="Total Users (30d)"    loading={isLoading} value={fmt(totals.users)} />
        <KPICard label="Ranked Keywords"      loading={isLoading} value={fmt(keywords.length)} />
      </InlineGrid>

      <Banner
        title="Upgrade for full Analytics & Search Console reports"
        tone="info"
        action={{ content: 'View Plans', onAction: () => navigate('/billing' + window.location.search) }}
      >
        <Text variant="bodySm" as="p">
          Growth plan unlocks: GA4 sessions/users charts, traffic sources, top countries, top pages,
          Search Console performance with clicks/impressions/CTR/position charts, Queries & Pages reports,
          Google Ads campaigns, and CSV exports.
        </Text>
      </Banner>
    </BlockStack>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

const MAIN_TABS = [
  { id: 'ga4', content: 'GA4 Analytics' },
  { id: 'sc',  content: 'Search Console' },
  { id: 'ads', content: 'Google Ads' },
];

function getBaseUrl(scProperty) {
  if (!scProperty) return '';
  if (scProperty.startsWith('sc-domain:')) return `https://${scProperty.replace('sc-domain:', '').replace(/\/$/, '')}`;
  return scProperty.replace(/\/$/, '');
}

function buildPageUrl(path, baseUrl) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  if (!baseUrl) return null;
  return `${baseUrl}${path.startsWith('/') ? path : '/' + path}`;
}

// AI-generated 3-bullet summary of the past week. Tries to load on mount;
// silently hides if there's not enough data yet.
function WeeklyDigestCard() {
  const { can } = usePlan();
  const enabled = can('aiWeeklyDigest');
  const { data, isLoading, error } = useQuery(
    'analytics-weekly-digest',
    analyticsAiApi.weeklyDigest,
    { staleTime: 30 * 60 * 1000, refetchOnWindowFocus: false, retry: false, enabled },
  );
  if (!enabled) return null;
  if (isLoading || error) return null;
  if (!data) return null;
  const bullets = Array.isArray(data.bullets) ? data.bullets : [];
  if (!bullets.length) return null;
  return (
    <Card>
      <BlockStack gap="200">
        <InlineStack gap="200" blockAlign="center">
          <Text variant="bodyLg">✨</Text>
          <Text variant="headingSm" fontWeight="semibold" as="h3">
            {data.headline || 'This week at a glance'}
          </Text>
        </InlineStack>
        <BlockStack gap="100">
          {bullets.map((b, i) => (
            <Text key={i} variant="bodySm" as="p">• {b}</Text>
          ))}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

export default function Dashboard() {
  const { googleStatus } = useShop();
  const { can, planName } = usePlan();
  // Render the Advanced view only when the plan explicitly grants it.
  // Otherwise fall back to the Basic (Starter-style) overview — even on
  // higher tiers, if the admin enabled only Basic Dashboard.
  const showAdvancedDashboard = can('advDashboard');
  const showBasicOnly = !showAdvancedDashboard && can('basicDashboard');
  const [period, setPeriod]     = useState('28d');
  const [mainTab, setMainTab]   = useState(0);

  if (!googleStatus?.connected) {
    return (
      <Page title="Dashboard">
        <Card>
          <EmptyState
            heading="Connect Google to get started"
            action={{ content: 'Connect Google', url: '/connect-google' }}
            image=""
          >
            <p>Connect your Google account to see Analytics, Search Console, and Ads data inside this dashboard.</p>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  return (
    <Page
      title="Analytics Dashboard"
      subtitle={`${planName} plan`}
    >
      <BlockStack gap="500">

        <WeeklyDigestCard />

        {showBasicOnly ? (
          <StarterOverview />
        ) : !showAdvancedDashboard ? (
          <Banner tone="warning" title="Dashboard not enabled on your plan">
            <p>Your plan doesn't include any dashboard tier. Ask the admin to enable Basic or Advanced Dashboard.</p>
          </Banner>
        ) : (
          <>
            {/* Top filter bar — minimal Shopify-admin style: just the date button, no card wrapper */}
            <InlineStack gap="200">
              <DateRangeFilter
                value={(() => {
                  const end = new Date(); end.setHours(0,0,0,0);
                  const start = new Date(end);
                  const days = period === '7d' ? 7 : period === '28d' ? 28 : period === '90d' ? 90 : 28;
                  start.setDate(end.getDate() - days);
                  return { start, end };
                })()}
                onChange={({ presetId }) => {
                  const map = { last7: '7d', last30: '28d', last90: '90d' };
                  setPeriod(map[presetId] || '28d');
                }}
                presets={['today','last7','last30','last60','last90','last360']}
              />
            </InlineStack>

            {/* Main tab navigation */}
            <Tabs tabs={MAIN_TABS} selected={mainTab} onSelect={setMainTab}>
              <Box paddingBlockStart="400">
                {mainTab === 0 && <GA4Tab period={period} />}
                {mainTab === 1 && <SearchConsoleTab period={period} />}
                {mainTab === 2 && (
                  <PlanGate feature="googleAds" required="growth">
                    <AdsTab period={period} />
                  </PlanGate>
                )}
              </Box>
            </Tabs>
          </>
        )}

      </BlockStack>
    </Page>
  );
}
