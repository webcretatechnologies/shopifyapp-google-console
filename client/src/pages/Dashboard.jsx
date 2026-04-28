import React, { useState } from 'react';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';
import {
  Page, Card, Text, Banner, Button, ButtonGroup, BlockStack, InlineStack,
  Box, Tabs, Spinner, Divider, Badge,
} from '@shopify/polaris';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { analyticsApi } from '../api';
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

function KPICard({ label, value, sub, color = '#202223' }) {
  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="100">
          <Text variant="bodySm" tone="subdued">{label}</Text>
          <Text variant="heading2xl" as="p" fontWeight="bold">
            <span style={{ color }}>{value}</span>
          </Text>
          {sub && <Text variant="bodySm" tone="subdued">{sub}</Text>}
        </BlockStack>
      </Box>
    </Card>
  );
}

function SectionHeader({ title, onExport, exportLabel = 'Export CSV' }) {
  return (
    <InlineStack align="space-between" blockAlign="center">
      <Text variant="headingMd" fontWeight="semibold">{title}</Text>
      {onExport && (
        <Button size="slim" onClick={onExport}>{exportLabel}</Button>
      )}
    </InlineStack>
  );
}

const thS = { padding: '10px 14px', textAlign: 'left', color: '#6d7175', fontWeight: 600, fontSize: 12, borderBottom: '1px solid #e1e3e5', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.4px' };
const tdS = { padding: '10px 14px', borderBottom: '1px solid #f1f2f3', fontSize: 13, color: '#202223' };
const tdR = { ...tdS, textAlign: 'right' };

function DataTable({ columns, rows, emptyText = 'No data available.' }) {
  if (!rows || !rows.length) {
    return <Box padding="600" textAlign="center"><Text tone="subdued">{emptyText}</Text></Box>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#fafbfb' }}>
            {columns.map(c => <th key={c.key} style={c.right ? { ...thS, textAlign: 'right' } : thS}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfb' }}>
              {columns.map(c => (
                <td key={c.key} style={c.right ? tdR : tdS}>
                  {c.render ? c.render(row[c.key], row) : (row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PositionBadge({ pos }) {
  const p = parseFloat(pos || 0);
  const bg = p <= 3 ? '#e3f1df' : p <= 10 ? '#fff5ea' : '#f6f6f7';
  const color = p <= 3 ? '#008060' : p <= 10 ? '#c05717' : '#6d7175';
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, background: bg, color, fontWeight: 700, fontSize: 11 }}>
      #{p.toFixed(1)}
    </span>
  );
}

function LoadingBox() {
  return <Box padding="800" textAlign="center"><Spinner /></Box>;
}

const CHART_COLORS = {
  sessions: '#1a1a1a',
  users: '#50b83c',
  new_users: '#47c1bf',
  clicks: '#1a1a1a',
  impressions: '#303030',
  spend: '#e67e22',
};

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

  const chartData = sessions.map(d => ({ ...d, date: fmtDate(d.date) }));

  const exportPages = () => downloadCSV(pages, `ga4-pages-${period}.csv`);
  const exportSources = () => downloadCSV(sources, `ga4-sources-${period}.csv`);
  const exportCountries = () => downloadCSV(countries, `ga4-countries-${period}.csv`);

  return (
    <BlockStack gap="500">

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
        <KPICard label="Total Sessions"     value={lS ? '—' : fmt(totals.sessions)} color="#1a1a1a" />
        <KPICard label="Total Users"        value={lS ? '—' : fmt(totals.users)}    color="#50b83c" />
        <KPICard label="New Users"          value={lS ? '—' : fmt(totals.new_users)}color="#47c1bf" />
        <KPICard label="Avg Bounce Rate"    value={lS ? '—' : fmtPct(avgBounce)}    color="#e67e22" />
        <KPICard label="Avg Session Duration" value={lS ? '—' : fmtSec(avgDur)}     color="#303030" />
      </div>

      {/* Sessions + Users chart */}
      <Card>
        <Box padding="400">
          <BlockStack gap="300">
            <Text variant="headingMd" fontWeight="semibold">Sessions &amp; Users Over Time</Text>
            {lS ? <LoadingBox /> : (
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gSess" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1a1a1a" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#1a1a1a" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gUsers" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#50b83c" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#50b83c" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f2f3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6d7175' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#6d7175' }} width={45} />
                    <Tooltip formatter={(v, n) => [fmt(v), n]} />
                    <Legend />
                    <Area type="monotone" dataKey="sessions" stroke="#1a1a1a" fill="url(#gSess)" strokeWidth={2} dot={false} name="Sessions" />
                    <Area type="monotone" dataKey="users"    stroke="#50b83c" fill="url(#gUsers)" strokeWidth={2} dot={false} name="Users" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </BlockStack>
        </Box>
      </Card>

      {/* Traffic Sources + Countries side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Traffic Sources */}
        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <SectionHeader title="Traffic Sources" onExport={exportSources} />
              {lSrc ? <LoadingBox /> : (
                <>
                  <div style={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sources.slice(0, 8)} layout="vertical" margin={{ left: 0, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f2f3" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="channel" width={110} tick={{ fontSize: 11, fill: '#202223' }} />
                        <Tooltip formatter={(v) => [fmt(v), 'Sessions']} />
                        <Bar dataKey="sessions" fill="#1a1a1a" radius={[0, 4, 4, 0]} name="Sessions" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <DataTable
                    columns={[
                      { key: 'channel', label: 'Channel' },
                      { key: 'sessions', label: 'Sessions', right: true, render: v => fmt(v) },
                      { key: 'users',    label: 'Users',    right: true, render: v => fmt(v) },
                    ]}
                    rows={sources}
                    emptyText="No traffic source data available."
                  />
                </>
              )}
            </BlockStack>
          </Box>
        </Card>

        {/* Top Countries */}
        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <SectionHeader title="Top Countries" onExport={exportCountries} />
              {lC ? <LoadingBox /> : (
                <DataTable
                  columns={[
                    { key: 'country',  label: 'Country' },
                    { key: 'sessions', label: 'Sessions', right: true, render: v => fmt(v) },
                    { key: 'users',    label: 'Users',    right: true, render: v => fmt(v) },
                  ]}
                  rows={countries}
                  emptyText="No country data available."
                />
              )}
            </BlockStack>
          </Box>
        </Card>
      </div>

      {/* Top Pages */}
      <Card padding="0">
        <Box padding="400">
          <SectionHeader title="Top Pages" onExport={exportPages} />
        </Box>
        <Divider />
        {lP ? <LoadingBox /> : (
          <DataTable
            columns={[
              { key: 'title', label: 'Page Title',  render: (v, row) => {
                const href = buildPageUrl(row.path, baseUrl);
                return (
                  <div>
                    <div style={{ fontWeight: 500 }}>{v || '(No title)'}</div>
                    {row.path && (href
                      ? <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:'#1a73e8', marginTop:2, display:'block', textDecoration:'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:320 }} title={href} onMouseOver={e=>e.currentTarget.style.textDecoration='underline'} onMouseOut={e=>e.currentTarget.style.textDecoration='none'}>{row.path}</a>
                      : <span style={{ fontSize:11, color:'#6d7175', marginTop:2, display:'block' }}>{row.path}</span>
                    )}
                  </div>
                );
              }},
              { key: 'views',    label: 'Page Views', right: true, render: v => fmt(v) },
              { key: 'sessions', label: 'Sessions',   right: true, render: v => fmt(v) },
            ]}
            rows={pages}
            emptyText="No page data available. Make sure GA4 property is configured."
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

  const chartData = overview.map(d => ({ ...d, date: fmtDate(d.date) }));

  const exportQueries = () => downloadCSV(queries, `sc-queries-${period}.csv`);
  const exportPages   = () => downloadCSV(scPages,  `sc-pages-${period}.csv`);

  const scTabs = [
    { id: 'queries', content: 'Queries' },
    { id: 'pages',   content: 'Pages' },
  ];

  const queryCols = [
    { key: 'keyword',     label: 'Query',       render: v => <span style={{ fontWeight: 500 }}>{v}</span> },
    { key: 'clicks',      label: 'Clicks',      right: true, render: v => <strong>{fmt(v)}</strong> },
    { key: 'impressions', label: 'Impressions', right: true, render: v => fmt(v) },
    { key: 'ctr',         label: 'CTR',         right: true, render: v => fmtPct(v) },
    { key: 'position',    label: 'Position',    right: true, render: v => <PositionBadge pos={v} /> },
  ];

  const pageCols = [
    { key: 'page',        label: 'Page URL',    render: v => <a href={v} target="_blank" rel="noopener noreferrer" style={{ fontSize:12, color:'#1a73e8', wordBreak:'break-all', textDecoration:'none' }} title={v} onMouseOver={e=>e.currentTarget.style.textDecoration='underline'} onMouseOut={e=>e.currentTarget.style.textDecoration='none'}>{v}</a> },
    { key: 'clicks',      label: 'Clicks',      right: true, render: v => <strong>{fmt(v)}</strong> },
    { key: 'impressions', label: 'Impressions', right: true, render: v => fmt(v) },
    { key: 'ctr',         label: 'CTR',         right: true, render: v => fmtPct(v) },
    { key: 'position',    label: 'Position',    right: true, render: v => <PositionBadge pos={v} /> },
  ];

  return (
    <BlockStack gap="500">

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <KPICard label="Total Clicks"      value={lO ? '—' : fmt(totals.clicks)}      color="#1a1a1a" sub="organic search" />
        <KPICard label="Total Impressions" value={lO ? '—' : fmt(totals.impressions)} color="#303030" sub="search results shown" />
        <KPICard label="Avg CTR"           value={lO ? '—' : fmtPct(avgCtr)}          color="#50b83c" sub="click-through rate" />
        <KPICard label="Avg Position"      value={lO ? '—' : `#${avgPos.toFixed(1)}`} color="#e67e22" sub="search ranking" />
      </div>

      {/* Performance chart */}
      <Card>
        <Box padding="400">
          <BlockStack gap="300">
            <Text variant="headingMd" fontWeight="semibold">Clicks &amp; Impressions Over Time</Text>
            {lO ? <LoadingBox /> : (
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gClicks" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1a1a1a" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#1a1a1a" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gImpr" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#303030" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#303030" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f2f3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6d7175' }} />
                    <YAxis yAxisId="left"  tick={{ fontSize: 11, fill: '#6d7175' }} width={50} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#6d7175' }} width={65} />
                    <Tooltip formatter={(v, n) => [fmt(v), n]} />
                    <Legend />
                    <Area yAxisId="left"  type="monotone" dataKey="clicks"      stroke="#1a1a1a" fill="url(#gClicks)" strokeWidth={2} dot={false} name="Clicks" />
                    <Area yAxisId="right" type="monotone" dataKey="impressions" stroke="#303030" fill="url(#gImpr)"  strokeWidth={2} dot={false} name="Impressions" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </BlockStack>
        </Box>
      </Card>

      {/* CTR + Position mini chart */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <Box padding="400">
            <BlockStack gap="200">
              <Text variant="headingMd" fontWeight="semibold">CTR Over Time</Text>
              {lO ? <LoadingBox /> : (
                <div style={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f2f3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6d7175' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#6d7175' }} width={40} tickFormatter={v => `${v.toFixed(1)}%`} />
                      <Tooltip formatter={v => [`${v.toFixed(2)}%`, 'CTR']} />
                      <Line type="monotone" dataKey="ctr" stroke="#50b83c" strokeWidth={2} dot={false} name="CTR %" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </BlockStack>
          </Box>
        </Card>
        <Card>
          <Box padding="400">
            <BlockStack gap="200">
              <Text variant="headingMd" fontWeight="semibold">Avg Position Over Time</Text>
              {lO ? <LoadingBox /> : (
                <div style={{ height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f2f3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6d7175' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#6d7175' }} width={40} reversed />
                      <Tooltip formatter={v => [`#${v.toFixed(1)}`, 'Position']} />
                      <Line type="monotone" dataKey="position" stroke="#e67e22" strokeWidth={2} dot={false} name="Position" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </BlockStack>
          </Box>
        </Card>
      </div>

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
          {scTab === 0 && (lQ ? <LoadingBox /> : <DataTable columns={queryCols} rows={queries} emptyText="No query data. Configure Search Console property first." />)}
          {scTab === 1 && (lP ? <LoadingBox /> : <DataTable columns={pageCols}  rows={scPages} emptyText="No page data available." />)}
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

  return (
    <BlockStack gap="500">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <KPICard label="Total Clicks"       value={isLoading ? '—' : fmt(totals.clicks)}                          color="#1a1a1a" />
        <KPICard label="Total Impressions"  value={isLoading ? '—' : fmt(totals.impressions)}                     color="#303030" />
        <KPICard label="Total Spend"        value={isLoading ? '—' : `₹${(totals.cost || 0).toFixed(2)}`}         color="#e67e22" />
        <KPICard label="Total Conversions"  value={isLoading ? '—' : fmt(totals.conversions)}                     color="#50b83c" />
      </div>

      <Card padding="0">
        <Box padding="400" borderBlockEndWidth="025" borderColor="border">
          <SectionHeader title="Campaign Performance" onExport={exportAds} />
        </Box>
        {isLoading ? <LoadingBox /> : (
          <DataTable
            columns={[
              { key: 'campaign',    label: 'Campaign Name', render: v => <span style={{ fontWeight: 500 }}>{v}</span> },
              { key: 'status',      label: 'Status',        render: v => <Badge tone={v === 'ENABLED' ? 'success' : 'subdued'}>{v}</Badge> },
              { key: 'clicks',      label: 'Clicks',        right: true, render: v => fmt(v) },
              { key: 'impressions', label: 'Impressions',   right: true, render: v => fmt(v) },
              { key: 'ctr',         label: 'CTR',           right: true, render: v => fmtPct(v) },
              { key: 'cost',        label: 'Spend',         right: true, render: v => `₹${parseFloat(v || 0).toFixed(2)}` },
              { key: 'conversions', label: 'Conversions',   right: true, render: v => fmt(v) },
              { key: 'roas',        label: 'ROAS',          right: true, render: v => v ? `${parseFloat(v).toFixed(2)}x` : '—' },
            ]}
            rows={campaigns}
            emptyText="No campaign data. Make sure Google Ads Customer ID is configured and ads are running."
          />
        )}
      </Card>

      {campaigns.length > 0 && (
        <Card>
          <Box padding="400">
            <BlockStack gap="300">
              <Text variant="headingMd" fontWeight="semibold">Spend vs Conversions by Campaign</Text>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={campaigns.slice(0, 10)} margin={{ top: 4, right: 20, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f2f3" />
                    <XAxis dataKey="campaign" tick={{ fontSize: 10, fill: '#6d7175' }} angle={-30} textAnchor="end" />
                    <YAxis yAxisId="left"  tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left"  dataKey="cost"        name="Spend (₹)"    fill="#e67e22" radius={[4,4,0,0]} />
                    <Bar yAxisId="right" dataKey="conversions" name="Conversions"   fill="#50b83c" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </BlockStack>
          </Box>
        </Card>
      )}
    </BlockStack>
  );
}

// ── Starter overview (basic KPIs only) ────────────────────────────────────────

function StarterOverview() {
  const navigate = useNavigate();
  const { data: overview } = useQuery('overview', analyticsApi.overview);
  const totals = overview?.totals || {};
  const keywords = overview?.top_keywords || [];

  return (
    <BlockStack gap="400">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <KPICard label="Total Sessions (30d)"   value={fmt(totals.sessions)}  color="#1a1a1a" />
        <KPICard label="Total Users (30d)"      value={fmt(totals.users)}     color="#50b83c" />
        <KPICard label="Ranked Keywords"        value={keywords.length}       color="#303030" />
      </div>

      <Banner
        title="Upgrade for full Analytics & Search Console reports"
        tone="info"
        action={{ content: 'View Plans', onAction: () => navigate('/billing' + window.location.search) }}
      >
        <Text variant="bodySm">
          Growth plan unlocks: GA4 sessions/users charts, traffic sources, top countries, top pages,
          Search Console performance with clicks/impressions/CTR/position charts, Queries &amp; Pages reports,
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

export default function Dashboard() {
  const { googleStatus } = useShop();
  const baseUrl = getBaseUrl(googleStatus?.account?.search_console_property);
  const { can, planName, isStarter } = usePlan();
  const [period, setPeriod]     = useState('28d');
  const [mainTab, setMainTab]   = useState(0);

  if (!googleStatus?.connected) {
    return (
      <Page title="Dashboard">
        <Banner
          title="Connect Google to get started"
          tone="info"
          action={{ content: 'Connect Google', url: '/connect-google' }}
        >
          <p>Connect your Google account to see Analytics, Search Console, and Ads data.</p>
        </Banner>
      </Page>
    );
  }

  return (
    <Page
      title="Analytics Dashboard"
      subtitle={`${planName} plan`}
    >
      <BlockStack gap="500">

        {isStarter ? (
          <StarterOverview />
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
