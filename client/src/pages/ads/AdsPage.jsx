import React, { useState, useMemo } from 'react';
import { useQuery } from 'react-query';
import { Page, Text, Box, Banner, Spinner, Button, Badge } from '@shopify/polaris';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { analyticsApi } from '../../api';
import { useShop } from '../../context/ShopContext';
import { usePlan, downloadCSV } from '../../hooks/usePlan';
import PlanGate from '../../components/PlanGate';
import DateRangeFilter from '../../components/DateRangeFilter';

const fmt     = n => (n||0).toLocaleString();
const fmtPct  = n => `${parseFloat(n||0).toFixed(2)}%`;
const fmtMoney = n => `₹${(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

function KPICard({ label, value, color='#1a1a1a', sub }) {
  return (
    <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e1e3e5', padding:'20px 24px', flex:1, minWidth:140 }}>
      <div style={{ fontSize:11, color:'#6d7175', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:8 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:700, color, marginBottom:sub?4:0 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'#6d7175' }}>{sub}</div>}
    </div>
  );
}

const thS = { padding:'11px 16px', textAlign:'left', color:'#6d7175', fontWeight:600, fontSize:11, borderBottom:'1px solid #e1e3e5', textTransform:'uppercase', letterSpacing:'0.4px', whiteSpace:'nowrap', background:'#fafbfb' };
const tdS = { padding:'11px 16px', borderBottom:'1px solid #f1f2f3', fontSize:13 };
const tdR = { ...tdS, textAlign:'right' };

function DataTable({ columns, rows, emptyText='No data.' }) {
  if (!rows?.length) return <Box padding="800" textAlign="center"><Text tone="subdued">{emptyText}</Text></Box>;
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead><tr>{columns.map(c=><th key={c.key} style={c.right?{...thS,textAlign:'right'}:thS}>{c.label}</th>)}</tr></thead>
        <tbody>{rows.map((row,i)=>(
          <tr key={i} style={{ background:i%2===0?'#fff':'#fafbfb' }}>
            {columns.map(c=><td key={c.key} style={c.right?tdR:tdS}>{c.render?c.render(row[c.key],row):(row[c.key]??'—')}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function Card2({ title, action, children }) {
  return (
    <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e1e3e5', overflow:'hidden', marginBottom:20 }}>
      <div style={{ padding:'14px 20px', borderBottom:'1px solid #e1e3e5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontWeight:600, fontSize:14, color:'#202223' }}>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function PBtn({ label, active, onClick }) {
  return <Button pressed={active} onClick={onClick}>{label}</Button>;
}

function getRange(preset) {
  const end = new Date(), start = new Date();
  start.setDate(start.getDate()-({'7d':7,'30d':30,'90d':90}[preset]||30));
  return { startDate:start.toISOString().slice(0,10), endDate:end.toISOString().slice(0,10) };
}

const CustomTip = ({ active, payload, label }) => {
  if (!active||!payload?.length) return null;
  return (
    <div style={{ background:'#fff', border:'1px solid #e1e3e5', borderRadius:8, padding:'10px 14px', boxShadow:'0 4px 12px rgba(0,0,0,0.1)' }}>
      <div style={{ fontWeight:600, marginBottom:6, fontSize:12, color:'#6d7175' }}>{label}</div>
      {payload.map((p,i)=>(
        <div key={i} style={{ fontSize:13, color:p.color, marginBottom:2 }}>
          <strong>{p.name}:</strong> {typeof p.value==='number'?p.value.toLocaleString():p.value}
        </div>
      ))}
    </div>
  );
};

export default function AdsPage() {
  const { googleStatus } = useShop();
  const { can } = usePlan();
  const [preset, setPreset]       = useState('30d');
  const [customS, setCustomS]     = useState('');
  const [customE, setCustomE]     = useState('');
  const [showCust, setShowCust]   = useState(false);

  const range = useMemo(() => {
    if (showCust && customS && customE) return { startDate:customS, endDate:customE };
    return getRange(preset);
  }, [preset, showCust, customS, customE]);

  const qk = [range.startDate, range.endDate];
  const { data:campaigns=[], isLoading, error } = useQuery(['ads-c',...qk], ()=>analyticsApi.adsCampaigns(range));

  if (!can('googleAds')) {
    return (
      <PlanGate feature="googleAds" required="growth">
        <div style={{ padding:40, minHeight:400 }}>
          <div style={{ fontSize:22, fontWeight:700, color:'#202223', marginBottom:8 }}>Google Ads</div>
          <div style={{ fontSize:13, color:'#6d7175' }}>Campaign performance, spend and conversions</div>
        </div>
      </PlanGate>
    );
  }

  if (!googleStatus?.connected) {
    return (
      <Page title="Google Ads">
        <Banner title="Google not connected" tone="warning" action={{ content:'Connect Google', url:'/connect-google' }}>
          Connect your Google account to view Ads data.
        </Banner>
      </Page>
    );
  }

  const tot = campaigns.reduce((a,c)=>({
    clicks: a.clicks+(c.clicks||0),
    impressions: a.impressions+(c.impressions||0),
    cost: a.cost+(c.cost||0),
    conversions: a.conversions+(c.conversions||0),
    conv_value: a.conv_value+(c.conversion_value||0),
  }),{ clicks:0, impressions:0, cost:0, conversions:0, conv_value:0 });

  const avgCtr  = tot.impressions ? (tot.clicks/tot.impressions)*100 : 0;
  const avgRoas = tot.cost ? (tot.conv_value/tot.cost) : 0;

  const noAdsCustomerId = !error && campaigns.length === 0 && !isLoading;

  return (
    <div style={{ padding:'4px 0 40px' }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:700, color:'#202223', marginBottom:4 }}>Google Ads</div>
        <div style={{ fontSize:13, color:'#6d7175' }}>Campaign performance, spend and conversions</div>
      </div>

      {/* Date range filter — Shopify admin style */}
      <div style={{ marginBottom: 20 }}>
        <DateRangeFilter
          value={{ start: range.startDate, end: range.endDate }}
          onChange={({ presetId, startIso, endIso }) => {
            const map = { last7: '7d', last30: '30d', last90: '90d' };
            if (map[presetId]) {
              setPreset(map[presetId]); setShowCust(false); setCustomS(''); setCustomE('');
            } else {
              setShowCust(true); setCustomS(startIso); setCustomE(endIso);
            }
          }}
          presets={['today','last7','last30','last60','last90','last360']}
        />
      </div>

      {/* Setup required banner */}
      {noAdsCustomerId && (
        <div style={{ marginBottom:20 }}>
          <Banner tone="info" title="Google Ads Customer ID required">
            <Text variant="bodySm">
              To view Google Ads data, go to <strong>Connect Google</strong> → Configure Your Properties → enter your 10-digit Google Ads Customer ID (no dashes).
              <br />Note: Google Ads API requires developer token approval for live data. Campaign data will appear once configured.
            </Text>
          </Banner>
        </div>
      )}

      {error && (
        <div style={{ marginBottom:20 }}>
          <Banner tone="critical" title="Google Ads error">
            <Text variant="bodySm">{error?.error || 'Could not load Google Ads data. Ensure Customer ID is configured.'}</Text>
          </Banner>
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display:'flex', gap:14, marginBottom:20, flexWrap:'wrap' }}>
        <KPICard label="Total Clicks"      value={isLoading?'…':fmt(tot.clicks)}             color="#1a1a1a" />
        <KPICard label="Total Impressions" value={isLoading?'…':fmt(tot.impressions)}         color="#303030" />
        <KPICard label="Avg. CTR"          value={isLoading?'…':fmtPct(avgCtr)}              color="#50b83c" />
        <KPICard label="Total Spend"       value={isLoading?'…':fmtMoney(tot.cost)}           color="#f49342" />
        <KPICard label="Conversions"       value={isLoading?'…':fmt(tot.conversions)}         color="#47c1bf" />
        <KPICard label="ROAS"              value={isLoading?'…':avgRoas?`${avgRoas.toFixed(2)}x`:'—'} color="#1a1a1a" sub="return on ad spend" />
      </div>

      {/* Campaigns table */}
      <Card2 title="Campaign Performance" action={
        campaigns.length > 0 && can('csvExport') && <Button size="slim" onClick={()=>downloadCSV(campaigns,`ads-campaigns-${range.startDate}.csv`)}>Export CSV</Button>
      }>
        {isLoading ? <Box padding="800" textAlign="center"><Spinner /></Box> : (
          <DataTable
            columns={[
              { key:'campaign',         label:'Campaign',    render:v=><strong>{v}</strong> },
              { key:'status',           label:'Status',      render:v=><Badge tone={v==='ENABLED'?'success':'subdued'}>{v||'—'}</Badge> },
              { key:'clicks',           label:'Clicks',      right:true, render:v=><strong>{fmt(v)}</strong> },
              { key:'impressions',      label:'Impressions', right:true, render:v=>fmt(v) },
              { key:'ctr',              label:'CTR',         right:true, render:v=>fmtPct(v) },
              { key:'cost',             label:'Spend',       right:true, render:v=><span style={{color:'#f49342',fontWeight:600}}>{fmtMoney(v)}</span> },
              { key:'conversions',      label:'Conv.',       right:true, render:v=>fmt(v) },
              { key:'conversion_value', label:'Conv. Value', right:true, render:v=>fmtMoney(v) },
              { key:'roas',             label:'ROAS',        right:true, render:v=>v?<strong style={{color:'#50b83c'}}>{parseFloat(v).toFixed(2)}x</strong>:'—' },
            ]}
            rows={campaigns}
            emptyText="No campaign data available. Ensure Google Ads Customer ID is configured and campaigns are running."
          />
        )}
      </Card2>

      {/* Bar chart */}
      {campaigns.length > 0 && (
        <>
          <Card2 title="Spend vs Conversions by Campaign">
            <div style={{ padding:20 }}>
              <div style={{ height:280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={campaigns.slice(0,10)} margin={{ top:4, right:20, left:0, bottom:50 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f2f3" />
                    <XAxis dataKey="campaign" tick={{ fontSize:10, fill:'#6d7175' }} angle={-30} textAnchor="end" interval={0} />
                    <YAxis yAxisId="l" tick={{ fontSize:11 }} width={70} tickFormatter={v=>`₹${(v/1000).toFixed(0)}K`} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fontSize:11 }} width={40} />
                    <Tooltip content={<CustomTip />} />
                    <Legend wrapperStyle={{ paddingTop:20 }} />
                    <Bar yAxisId="l" dataKey="cost"        name="Spend (₹)"  fill="#f49342" radius={[4,4,0,0]} />
                    <Bar yAxisId="r" dataKey="conversions" name="Conversions" fill="#50b83c" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card2>

          <Card2 title="Clicks vs Impressions by Campaign" action={
            can('csvExport') && <Button size="slim" onClick={()=>downloadCSV(campaigns,`ads-clicks-${range.startDate}.csv`)}>Export CSV</Button>
          }>
            <div style={{ padding:20 }}>
              <div style={{ height:280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={campaigns.slice(0,10)} margin={{ top:4, right:20, left:0, bottom:50 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f2f3" />
                    <XAxis dataKey="campaign" tick={{ fontSize:10, fill:'#6d7175' }} angle={-30} textAnchor="end" interval={0} />
                    <YAxis yAxisId="l" tick={{ fontSize:11 }} width={60} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fontSize:11 }} width={70} tickFormatter={v=>`${(v/1000).toFixed(0)}K`} />
                    <Tooltip content={<CustomTip />} />
                    <Legend wrapperStyle={{ paddingTop:20 }} />
                    <Bar yAxisId="l" dataKey="clicks"      name="Clicks"      fill="#1a1a1a" radius={[4,4,0,0]} />
                    <Bar yAxisId="r" dataKey="impressions" name="Impressions"  fill="#303030" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card2>
        </>
      )}

      {/* Info card when no data */}
      {!isLoading && campaigns.length === 0 && (
        <div style={{ background:'#f6f6f7', borderRadius:12, padding:24, textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>📢</div>
          <div style={{ fontSize:15, fontWeight:600, color:'#202223', marginBottom:8 }}>Google Ads data will appear here</div>
          <div style={{ fontSize:13, color:'#6d7175', maxWidth:480, margin:'0 auto', lineHeight:1.6 }}>
            Connect your Google Ads account by entering your Customer ID in the Google Setup page.
            Campaign metrics including clicks, impressions, spend, conversions, and ROAS will display once configured.
          </div>
          <div style={{ marginTop:16 }}>
            <a href="/connect-google" style={{ display:'inline-block', padding:'8px 20px', background:'#1a1a1a', color:'#fff', borderRadius:8, fontSize:13, fontWeight:600, textDecoration:'none' }}>
              Configure Google Setup →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
