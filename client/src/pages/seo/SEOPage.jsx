import React, { useState, useMemo } from 'react';
import { useQuery } from 'react-query';
import { Text, Box, Banner, Spinner, Button } from '@shopify/polaris';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { analyticsApi, settingsApi } from '../../api';
import { useShop } from '../../context/ShopContext';
import { usePlan, downloadCSV } from '../../hooks/usePlan';
import PlanGate from '../../components/PlanGate';

// ── utils ─────────────────────────────────────────────────────────────────────
const fmt    = n => (n||0).toLocaleString();
const fmtPct = n => `${parseFloat(n||0).toFixed(2)}%`;
const fmtDate = d => {
  if (!d) return '';
  if (d.length === 8) return `${d.slice(4,6)}/${d.slice(6,8)}`;
  return d.slice(5);
};

function subtractDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0,10);
}

function getRange(preset) {
  const end = new Date(), start = new Date();
  const days = {'7d':7,'28d':28,'90d':90}[preset] || 28;
  start.setDate(start.getDate() - days);
  return { startDate: start.toISOString().slice(0,10), endDate: end.toISOString().slice(0,10), days };
}

// ── styled primitives ─────────────────────────────────────────────────────────
function KPIBlock({ label, value, sub, color, active, onClick }) {
  return (
    <div onClick={onClick} style={{
      flex:1, minWidth:130, padding:'16px 20px', cursor: onClick ? 'pointer' : 'default',
      background: active ? color+'18' : '#fff',
      border: `2px solid ${active ? color : '#e1e3e5'}`,
      borderRadius:10, transition:'all 0.15s',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
        <div style={{ width:10, height:10, borderRadius:'50%', background: active ? color : '#ccc' }}/>
        <span style={{ fontSize:11, fontWeight:600, color:'#6d7175', textTransform:'uppercase', letterSpacing:'0.4px' }}>{label}</span>
      </div>
      <div style={{ fontSize:28, fontWeight:700, color: active ? color : '#202223' }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'#6d7175', marginTop:4 }}>{sub}</div>}
    </div>
  );
}

function TrendPill({ pct }) {
  if (pct === null || pct === undefined) return null;
  const up = pct >= 0;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:3,
      padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:600,
      background: up ? '#e3f1df' : '#ffd7d5',
      color: up ? '#008060' : '#d82c0d',
    }}>
      {up ? '↑' : '↓'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function PosBadge({ pos }) {
  const p = parseFloat(pos||0);
  const [bg,col] = p<=3?['#e3f1df','#008060']:p<=10?['#fff5ea','#c05717']:['#f6f6f7','#6d7175'];
  return <span style={{ display:'inline-block', padding:'2px 9px', borderRadius:12, background:bg, color:col, fontWeight:700, fontSize:11 }}>#{p.toFixed(1)}</span>;
}

const thS = { padding:'11px 16px', textAlign:'left', color:'#6d7175', fontWeight:600, fontSize:11, borderBottom:'1px solid #e1e3e5', textTransform:'uppercase', letterSpacing:'0.4px', whiteSpace:'nowrap', background:'#fafbfb' };
const tdS = { padding:'11px 16px', borderBottom:'1px solid #f1f2f3', fontSize:13 };
const tdR = { ...tdS, textAlign:'right' };

function DataTable({ columns, rows, emptyText='No data available.' }) {
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

function SCard({ title, action, noPad, children }) {
  return (
    <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e1e3e5', overflow:'hidden', marginBottom:20 }}>
      {title && (
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #e1e3e5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontWeight:600, fontSize:14, color:'#202223' }}>{title}</span>
          {action}
        </div>
      )}
      <div style={noPad?{}:{padding:20}}>{children}</div>
    </div>
  );
}

function PBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{ padding:'6px 14px', borderRadius:6, border:'none', cursor:'pointer', fontSize:13, fontWeight:500, background:active?'#5c6ac4':'#f1f2f3', color:active?'#fff':'#202223' }}>{label}</button>
  );
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

const SC_COLORS = { clicks:'#1a73e8', impressions:'#6b2da8', ctr:'#137333', position:'#e37400' };
const PIE_COLORS = ['#5c6ac4','#50b83c','#47c1bf','#f49342','#9b59b6','#3498db'];

// ── Trending computation ───────────────────────────────────────────────────────
function computeTrend(currentRows, prevRows, keyField, valueField) {
  const prevMap = {};
  (prevRows||[]).forEach(r => { prevMap[r[keyField]] = r[valueField]||0; });
  return (currentRows||[]).map(r => {
    const prev = prevMap[r[keyField]] || 0;
    const curr = r[valueField] || 0;
    const pct = prev > 0 ? ((curr - prev) / prev) * 100 : null;
    return { ...r, _prev: prev, _trend: pct };
  }).sort((a,b) => (b[valueField]||0) - (a[valueField]||0));
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function SEOPage() {
  const { googleStatus } = useShop();
  const { can } = usePlan();
  const [preset, setPreset]         = useState('28d');
  const [customS, setCustomS]       = useState('');
  const [customE, setCustomE]       = useState('');
  const [showCust, setShowCust]     = useState(false);
  const [section, setSection]       = useState('performance');
  const [perfTab, setPerfTab]       = useState('queries');
  const [insightTab, setInsightTab] = useState('top');
  const [queryInsTab, setQueryInsTab] = useState('top');
  const [activeKPI, setActiveKPI]   = useState({ clicks:true, impressions:true, ctr:false, position:false });
  const [querySearch, setQuerySearch] = useState('');
  const [pageSearch,  setPageSearch]  = useState('');
  const [brandView, setBrandView]   = useState('all'); // 'all' | 'brand' | 'nonbrand'

  const { data: shopSettings } = useQuery('shop-settings', settingsApi.get, { enabled: can('brandSplit') });

  const range = useMemo(() => {
    if (showCust && customS && customE) {
      const days = Math.ceil((new Date(customE)-new Date(customS))/(1000*60*60*24));
      return { startDate:customS, endDate:customE, days };
    }
    return getRange(preset);
  }, [preset, showCust, customS, customE]);

  const prevRange = useMemo(() => ({
    startDate: subtractDays(range.startDate, range.days),
    endDate:   subtractDays(range.endDate,   range.days),
  }), [range]);

  const qk  = [range.startDate, range.endDate];
  const pqk = [prevRange.startDate, prevRange.endDate];

  // Current period
  const { data:overview=[],  isLoading:lO, error:eO } = useQuery(['sco',...qk],  ()=>analyticsApi.seoOverview(range));
  const { data:queries=[],   isLoading:lQ }            = useQuery(['scq',...qk],  ()=>analyticsApi.seoKeywords(range));
  const { data:pages=[],     isLoading:lP }            = useQuery(['scp',...qk],  ()=>analyticsApi.seoPages(range));
  const { data:countries=[], isLoading:lC }            = useQuery(['scco',...qk], ()=>analyticsApi.seoCountries(range));
  const { data:devices=[],   isLoading:lD }            = useQuery(['scd',...qk],  ()=>analyticsApi.seoDevices(range));

  // Previous period (for trending)
  const { data:prevQueries=[] } = useQuery(['scq',...pqk], ()=>analyticsApi.seoKeywords(prevRange), { enabled: section==='insights' });
  const { data:prevPages=[] }   = useQuery(['scp',...pqk], ()=>analyticsApi.seoPages(prevRange),    { enabled: section==='insights' });

  if (!can('searchConsole')) {
    return (
      <PlanGate feature="searchConsole" required="growth">
        <div style={{ padding:40, minHeight:400 }}>
          <div style={{ fontSize:22, fontWeight:700, color:'#202223', marginBottom:8 }}>Search Console</div>
          <div style={{ fontSize:13, color:'#6d7175' }}>SEO performance, queries, pages, countries &amp; devices</div>
        </div>
      </PlanGate>
    );
  }

  if (!googleStatus?.connected) {
    return (
      <div style={{ padding:40 }}>
        <Banner title="Google not connected" tone="warning" action={{ content:'Connect Google', url:'/connect-google' }}>
          Connect your Google account to view Search Console data.
        </Banner>
      </div>
    );
  }

  // Totals
  const tot = overview.reduce((a,d)=>({ clicks:a.clicks+(d.clicks||0), impressions:a.impressions+(d.impressions||0) }),{clicks:0,impressions:0});
  const avgCtr = overview.length ? overview.reduce((a,d)=>a+(d.ctr||0),0)/overview.length : 0;
  const avgPos = overview.length ? overview.reduce((a,d)=>a+(d.position||0),0)/overview.length : 0;
  const chartD = overview.map(d=>({ ...d, date:fmtDate(d.date) }));

  // Trending
  const trendedQueries = computeTrend(queries, prevQueries, 'keyword', 'clicks');
  const trendedPages   = computeTrend(pages,   prevPages,   'page',    'clicks');
  const trendingUpQ    = [...trendedQueries].filter(q=>q._trend!==null&&q._trend>0).sort((a,b)=>b._trend-a._trend).slice(0,20);
  const trendingDownQ  = [...trendedQueries].filter(q=>q._trend!==null&&q._trend<0).sort((a,b)=>a._trend-b._trend).slice(0,20);
  const trendingUpP    = [...trendedPages].filter(p=>p._trend!==null&&p._trend>0).sort((a,b)=>b._trend-a._trend).slice(0,20);
  const trendingDownP  = [...trendedPages].filter(p=>p._trend!==null&&p._trend<0).sort((a,b)=>a._trend-b._trend).slice(0,20);

  const totalClicks = tot.clicks || 1;

  // Brand vs Non-Brand split
  const brandTerms = can('brandSplit')
    ? (shopSettings?.brand_keywords || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : [];
  const isBranded = (kw) => brandTerms.length > 0 && brandTerms.some(t => (kw||'').toLowerCase().includes(t));
  const brandQueries    = queries.filter(q => isBranded(q.keyword));
  const nonBrandQueries = queries.filter(q => !isBranded(q.keyword));
  const brandClicks     = brandQueries.reduce((a,q) => a+(q.clicks||0), 0);
  const nonBrandClicks  = nonBrandQueries.reduce((a,q) => a+(q.clicks||0), 0);
  const brandImpressions    = brandQueries.reduce((a,q) => a+(q.impressions||0), 0);
  const nonBrandImpressions = nonBrandQueries.reduce((a,q) => a+(q.impressions||0), 0);
  const brandAvgPos    = brandQueries.length ? brandQueries.reduce((a,q)=>a+(q.position||0),0)/brandQueries.length : 0;
  const nonBrandAvgPos = nonBrandQueries.length ? nonBrandQueries.reduce((a,q)=>a+(q.position||0),0)/nonBrandQueries.length : 0;

  // Apply brand filter to queries table
  const brandFilteredQ = brandView==='brand' ? brandQueries : brandView==='nonbrand' ? nonBrandQueries : queries;
  const filteredQ = querySearch ? brandFilteredQ.filter(q=>q.keyword?.toLowerCase().includes(querySearch.toLowerCase())) : brandFilteredQ;
  const filteredP   = pageSearch  ? pages.filter(p=>p.page?.toLowerCase().includes(pageSearch.toLowerCase())) : pages;

  // Nav sections
  const sections = [
    { id:'overview',     label:'Overview' },
    { id:'performance',  label:'Performance' },
    { id:'insights',     label:'Insights' },
    { id:'countries',    label:'Countries' },
    { id:'devices',      label:'Devices' },
  ];

  const perfTabs = [
    { id:'queries',   label:'Queries',  count:queries.length },
    { id:'pages',     label:'Pages',    count:pages.length },
    { id:'countries', label:'Countries',count:countries.length },
    { id:'devices',   label:'Devices',  count:devices.length },
    { id:'days',      label:'Days',     count:overview.length },
  ];

  const commonQueryCols = [
    { key:'keyword',     label:'Query',       render:v=><span style={{fontWeight:500}}>{v}</span> },
    { key:'clicks',      label:'Clicks',      right:true, render:v=><strong>{fmt(v)}</strong> },
    { key:'impressions', label:'Impressions', right:true, render:v=>fmt(v) },
    { key:'ctr',         label:'CTR',         right:true, render:v=>fmtPct(v) },
    { key:'position',    label:'Position',    right:true, render:v=><PosBadge pos={v}/> },
  ];
  const commonPageCols = [
    { key:'page',        label:'Page URL',    render:v=><a href={v} target="_blank" rel="noopener noreferrer" style={{ fontSize:12, color:'#1a73e8', wordBreak:'break-all', textDecoration:'none' }} onMouseOver={e=>e.target.style.textDecoration='underline'} onMouseOut={e=>e.target.style.textDecoration='none'}>{v}</a> },
    { key:'clicks',      label:'Clicks',      right:true, render:v=><strong>{fmt(v)}</strong> },
    { key:'impressions', label:'Impressions', right:true, render:v=>fmt(v) },
    { key:'ctr',         label:'CTR',         right:true, render:v=>fmtPct(v) },
    { key:'position',    label:'Position',    right:true, render:v=><PosBadge pos={v}/> },
  ];

  return (
    <div style={{ padding:'4px 0 40px' }}>
      {/* Header */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:22, fontWeight:700, color:'#202223', marginBottom:4 }}>Search Console</div>
        <div style={{ fontSize:13, color:'#6d7175' }}>SEO performance, queries, pages, countries &amp; devices</div>
      </div>

      {/* Date range bar */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e1e3e5', padding:'12px 20px', marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {[['7d','7 Days'],['28d','28 Days'],['90d','90 Days']].map(([v,l])=>(
              <PBtn key={v} label={l} active={!showCust&&preset===v} onClick={()=>{ setPreset(v); setShowCust(false); }}/>
            ))}
            <PBtn label="Custom Range" active={showCust} onClick={()=>setShowCust(s=>!s)}/>
          </div>
          <span style={{ fontSize:12, color:'#6d7175' }}>{range.startDate} → {range.endDate}</span>
        </div>
        {showCust && (
          <div style={{ marginTop:12, display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
            <input type="date" value={customS} onChange={e=>setCustomS(e.target.value)} style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #c4cdd5', fontSize:13 }}/>
            <span style={{ color:'#6d7175' }}>to</span>
            <input type="date" value={customE} onChange={e=>setCustomE(e.target.value)} style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #c4cdd5', fontSize:13 }}/>
          </div>
        )}
      </div>

      {eO && <div style={{ marginBottom:16 }}><Banner tone="critical" title="Search Console error"><Text variant="bodySm">{eO?.error||'Failed to load. Ensure Search Console property is configured.'}</Text></Banner></div>}

      {/* Section navigation (like GSC sidebar) */}
      <div style={{ display:'flex', gap:0, background:'#fff', borderRadius:12, border:'1px solid #e1e3e5', marginBottom:20, overflow:'hidden' }}>
        {sections.map(s => (
          <button key={s.id} onClick={()=>setSection(s.id)} style={{
            flex:1, padding:'12px 8px', border:'none', cursor:'pointer', fontSize:13,
            fontWeight: section===s.id ? 600 : 400,
            background: section===s.id ? '#5c6ac4' : 'transparent',
            color: section===s.id ? '#fff' : '#6d7175',
            borderRight:'1px solid #e1e3e5', transition:'all 0.15s',
          }}>{s.label}</button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {section==='overview' && (
        <>
          {/* KPI summary */}
          <div style={{ display:'flex', gap:14, marginBottom:20, flexWrap:'wrap' }}>
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e1e3e5', padding:'20px 28px', flex:1 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'#6d7175', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:8 }}>Total Clicks</div>
              <div style={{ fontSize:32, fontWeight:700, color:'#1a73e8' }}>{lO?'…':fmt(tot.clicks)}</div>
              <div style={{ fontSize:12, color:'#6d7175', marginTop:4 }}>organic search</div>
            </div>
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e1e3e5', padding:'20px 28px', flex:1 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'#6d7175', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:8 }}>Total Impressions</div>
              <div style={{ fontSize:32, fontWeight:700, color:'#6b2da8' }}>{lO?'…':fmt(tot.impressions)}</div>
              <div style={{ fontSize:12, color:'#6d7175', marginTop:4 }}>results shown</div>
            </div>
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e1e3e5', padding:'20px 28px', flex:1 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'#6d7175', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:8 }}>Avg. CTR</div>
              <div style={{ fontSize:32, fontWeight:700, color:'#137333' }}>{lO?'…':fmtPct(avgCtr)}</div>
              <div style={{ fontSize:12, color:'#6d7175', marginTop:4 }}>click-through rate</div>
            </div>
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e1e3e5', padding:'20px 28px', flex:1 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'#6d7175', textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:8 }}>Avg. Position</div>
              <div style={{ fontSize:32, fontWeight:700, color:'#e37400' }}>{lO?'…':`#${avgPos.toFixed(1)}`}</div>
              <div style={{ fontSize:12, color:'#6d7175', marginTop:4 }}>search ranking</div>
            </div>
          </div>

          {/* Performance chart */}
          <SCard title={`${fmt(tot.clicks)} total web search clicks`} action={
            can('csvExport') && <Button size="slim" onClick={()=>downloadCSV(overview,`sc-overview-${range.startDate}.csv`)}>Export CSV</Button>
          }>
            {lO ? <Box padding="800" textAlign="center"><Spinner /></Box> : (
              <div style={{ height:280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartD} margin={{ top:4, right:20, left:0, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f2f3" />
                    <XAxis dataKey="date" tick={{ fontSize:11, fill:'#6d7175' }} />
                    <YAxis tick={{ fontSize:11, fill:'#6d7175' }} width={50} />
                    <Tooltip content={<CustomTip />} />
                    <Line type="monotone" dataKey="clicks" stroke="#1a73e8" strokeWidth={2} dot={false} name="Clicks" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </SCard>

          {/* Top content + Top queries side by side */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <SCard title="Top Content by Clicks" action={<Button size="slim" onClick={()=>setSection('insights')}>View insights →</Button>}>
              {lP ? <LoadSpin/> : (
                <div>
                  {pages.slice(0,5).map((p,i)=>(
                    <div key={i} style={{ padding:'10px 0', borderBottom:i<4?'1px solid #f1f2f3':undefined, display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
                      <a href={p.page} target="_blank" rel="noopener noreferrer" style={{ fontSize:12, color:'#1a73e8', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textDecoration:'none' }} title={p.page} onMouseOver={e=>e.currentTarget.style.textDecoration='underline'} onMouseOut={e=>e.currentTarget.style.textDecoration='none'}>{p.page}</a>
                      <strong style={{ fontSize:13, flexShrink:0 }}>{fmt(p.clicks)}</strong>
                    </div>
                  ))}
                  {!lP && pages.length===0 && <Text tone="subdued">No data available.</Text>}
                </div>
              )}
            </SCard>
            <SCard title="Top Queries by Clicks">
              {lQ ? <LoadSpin/> : (
                <div>
                  {queries.slice(0,5).map((q,i)=>(
                    <div key={i} style={{ padding:'10px 0', borderBottom:i<4?'1px solid #f1f2f3':undefined, display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
                      <div style={{ fontSize:13, fontWeight:500, flex:1 }}>{q.keyword}</div>
                      <div style={{ display:'flex', gap:12, flexShrink:0, alignItems:'center' }}>
                        <PosBadge pos={q.position}/>
                        <strong style={{ fontSize:13 }}>{fmt(q.clicks)}</strong>
                      </div>
                    </div>
                  ))}
                  {!lQ && queries.length===0 && <Text tone="subdued">No data available.</Text>}
                </div>
              )}
            </SCard>
          </div>
        </>
      )}

      {/* ── PERFORMANCE ── */}
      {section==='performance' && (
        <>
          {/* Clickable KPI blocks */}
          <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
            <KPIBlock label="Total Clicks"      value={lO?'…':fmt(tot.clicks)}           color={SC_COLORS.clicks}      active={activeKPI.clicks}      onClick={()=>setActiveKPI(k=>({...k,clicks:!k.clicks}))}/>
            <KPIBlock label="Total Impressions" value={lO?'…':fmt(tot.impressions)}       color={SC_COLORS.impressions} active={activeKPI.impressions} onClick={()=>setActiveKPI(k=>({...k,impressions:!k.impressions}))}/>
            <KPIBlock label="Avg. CTR"          value={lO?'…':fmtPct(avgCtr)}            color={SC_COLORS.ctr}         active={activeKPI.ctr}         onClick={()=>setActiveKPI(k=>({...k,ctr:!k.ctr}))} sub="click to toggle"/>
            <KPIBlock label="Avg. Position"     value={lO?'…':`#${avgPos.toFixed(1)}`}   color={SC_COLORS.position}    active={activeKPI.position}    onClick={()=>setActiveKPI(k=>({...k,position:!k.position}))} sub="click to toggle"/>
          </div>

          {/* Multi-line chart */}
          <SCard title="Performance Over Time" action={
            can('csvExport') && <Button size="slim" onClick={()=>downloadCSV(overview,`sc-performance-${range.startDate}.csv`)}>Export CSV</Button>
          }>
            {lO ? <Box padding="800" textAlign="center"><Spinner /></Box> : (
              <div style={{ height:320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartD} margin={{ top:4, right:20, left:0, bottom:0 }}>
                    <defs>
                      {Object.entries(SC_COLORS).map(([k,c])=>(
                        <linearGradient key={k} id={`g${k}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={c} stopOpacity={0.15}/><stop offset="95%" stopColor={c} stopOpacity={0}/>
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f2f3" />
                    <XAxis dataKey="date" tick={{ fontSize:11, fill:'#6d7175' }} />
                    {(activeKPI.clicks||activeKPI.impressions) && <YAxis yAxisId="abs" tick={{ fontSize:11, fill:'#6d7175' }} width={60} />}
                    {(activeKPI.ctr||activeKPI.position) && <YAxis yAxisId="pct" orientation="right" tick={{ fontSize:11, fill:'#6d7175' }} width={50} />}
                    <Tooltip content={<CustomTip />} />
                    <Legend />
                    {activeKPI.clicks      && <Line yAxisId="abs" type="monotone" dataKey="clicks"      stroke={SC_COLORS.clicks}      strokeWidth={2} dot={false} name="Clicks" />}
                    {activeKPI.impressions && <Line yAxisId="abs" type="monotone" dataKey="impressions" stroke={SC_COLORS.impressions} strokeWidth={2} dot={false} name="Impressions" />}
                    {activeKPI.ctr         && <Line yAxisId="pct" type="monotone" dataKey="ctr"         stroke={SC_COLORS.ctr}         strokeWidth={2} dot={false} name="CTR %" />}
                    {activeKPI.position    && <Line yAxisId="pct" type="monotone" dataKey="position"    stroke={SC_COLORS.position}    strokeWidth={2} dot={false} name="Position" />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </SCard>

          {/* Tabbed table */}
          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e1e3e5', overflow:'hidden' }}>
            <div style={{ borderBottom:'1px solid #e1e3e5', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0 16px', overflowX:'auto' }}>
              <div style={{ display:'flex' }}>
                {perfTabs.map(t=>(
                  <button key={t.id} onClick={()=>setPerfTab(t.id)} style={{
                    padding:'12px 18px', border:'none', cursor:'pointer', fontSize:13, whiteSpace:'nowrap',
                    fontWeight:perfTab===t.id?600:400, background:'transparent',
                    color:perfTab===t.id?'#1a73e8':'#6d7175',
                    borderBottom:perfTab===t.id?'2px solid #1a73e8':'2px solid transparent',
                  }}>
                    {t.label} <span style={{ fontSize:11, color:'#9ba3ab' }}>({t.count})</span>
                  </button>
                ))}
              </div>
              <div style={{ display:'flex', gap:8, padding:'8px 0', flexShrink:0 }}>
                {(perfTab==='queries') && <>
                  <input type="text" value={querySearch} onChange={e=>setQuerySearch(e.target.value)} placeholder="Search queries…" style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #c4cdd5', fontSize:12, width:160 }}/>
                  can('csvExport') && <Button size="slim" onClick={()=>downloadCSV(filteredQ,`sc-queries-${range.startDate}.csv`)}>Export CSV</Button>
                </>}
                {(perfTab==='pages') && <>
                  <input type="text" value={pageSearch} onChange={e=>setPageSearch(e.target.value)} placeholder="Search pages…" style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #c4cdd5', fontSize:12, width:160 }}/>
                  can('csvExport') && <Button size="slim" onClick={()=>downloadCSV(filteredP,`sc-pages-${range.startDate}.csv`)}>Export CSV</Button>
                </>}
                {perfTab==='countries' && can('csvExport') && <Button size="slim" onClick={()=>downloadCSV(countries,`sc-countries-${range.startDate}.csv`)}>Export CSV</Button>}
                {perfTab==='devices'   && can('csvExport') && <Button size="slim" onClick={()=>downloadCSV(devices,  `sc-devices-${range.startDate}.csv`)}>Export CSV</Button>}
                {perfTab==='days'      && can('csvExport') && <Button size="slim" onClick={()=>downloadCSV(overview, `sc-days-${range.startDate}.csv`)}>Export CSV</Button>}
              </div>
            </div>

            {perfTab==='queries' && can('brandSplit') && brandTerms.length > 0 && (
              <div style={{ padding:'16px 20px', borderBottom:'1px solid #f1f2f3' }}>
                {/* Brand Split KPI cards */}
                <div style={{ display:'flex', gap:12, marginBottom:14, flexWrap:'wrap' }}>
                  {[
                    { label:'Brand Clicks', value:fmt(brandClicks), color:'#1a73e8', pct: tot.clicks ? ((brandClicks/tot.clicks)*100).toFixed(1) : 0 },
                    { label:'Non-Brand Clicks', value:fmt(nonBrandClicks), color:'#e37400', pct: tot.clicks ? ((nonBrandClicks/tot.clicks)*100).toFixed(1) : 0 },
                    { label:'Brand Impressions', value:fmt(brandImpressions), color:'#6b2da8', pct: null },
                    { label:'Non-Brand Impressions', value:fmt(nonBrandImpressions), color:'#9b59b6', pct: null },
                    { label:'Brand Avg. Position', value:`#${brandAvgPos.toFixed(1)}`, color:'#137333', pct: null },
                    { label:'Non-Brand Avg. Position', value:`#${nonBrandAvgPos.toFixed(1)}`, color:'#c05717', pct: null },
                  ].map(({ label, value, color, pct }) => (
                    <div key={label} style={{ flex:1, minWidth:120, background:'#fff', border:'1px solid #e1e3e5', borderRadius:10, padding:'12px 16px' }}>
                      <div style={{ fontSize:10, color:'#6d7175', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:4 }}>{label}</div>
                      <div style={{ fontSize:20, fontWeight:700, color }}>{value}</div>
                      {pct !== null && <div style={{ fontSize:11, color:'#6d7175', marginTop:2 }}>{pct}% of total</div>}
                    </div>
                  ))}
                </div>
                {/* Pie chart split */}
                <div style={{ display:'flex', gap:20, alignItems:'center', flexWrap:'wrap' }}>
                  <div style={{ display:'flex', gap:8 }}>
                    {[
                      { label:'All Queries', val:'all' },
                      { label:`Brand (${brandQueries.length})`, val:'brand' },
                      { label:`Non-Brand (${nonBrandQueries.length})`, val:'nonbrand' },
                    ].map(({ label, val }) => (
                      <button key={val} onClick={() => setBrandView(val)} style={{
                        padding:'5px 12px', borderRadius:20, border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
                        background: brandView===val ? '#1a73e8' : '#f1f2f3',
                        color: brandView===val ? '#fff' : '#202223',
                      }}>{label}</button>
                    ))}
                  </div>
                  <div style={{ display:'flex', gap:16, alignItems:'center', fontSize:12, color:'#6d7175' }}>
                    {tot.clicks > 0 && <>
                      <span style={{ display:'flex', alignItems:'center', gap:5 }}>
                        <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background:'#1a73e8' }}/>
                        Brand {((brandClicks/tot.clicks)*100).toFixed(1)}%
                      </span>
                      <span style={{ display:'flex', alignItems:'center', gap:5 }}>
                        <span style={{ display:'inline-block', width:10, height:10, borderRadius:'50%', background:'#e37400' }}/>
                        Non-Brand {((nonBrandClicks/tot.clicks)*100).toFixed(1)}%
                      </span>
                    </>}
                  </div>
                </div>
              </div>
            )}

            {perfTab==='queries' && can('brandSplit') && brandTerms.length === 0 && (
              <div style={{ padding:'12px 20px', background:'#fff8ec', borderBottom:'1px solid #f1f2f3', fontSize:12, color:'#c05717', display:'flex', alignItems:'center', gap:8 }}>
                <span>💡</span>
                <span>Set your brand keywords in <a href="/settings" style={{ color:'#1a73e8', fontWeight:600 }}>API Settings</a> to enable Brand vs Non-Brand split.</span>
              </div>
            )}

            {perfTab==='queries'   && (lQ ? <LoadSpin/> : <DataTable columns={commonQueryCols} rows={filteredQ} emptyText="No query data. Configure Search Console property first."/>)}
            {perfTab==='pages'     && (lP ? <LoadSpin/> : <DataTable columns={commonPageCols}  rows={filteredP} emptyText="No page data available."/>)}
            {perfTab==='countries' && (lC ? <LoadSpin/> : <DataTable
              columns={[
                { key:'country',     label:'Country',     render:v=><strong>{v?.toUpperCase()}</strong> },
                { key:'clicks',      label:'Clicks',      right:true, render:v=><strong>{fmt(v)}</strong> },
                { key:'impressions', label:'Impressions', right:true, render:v=>fmt(v) },
                { key:'ctr',         label:'CTR',         right:true, render:v=>fmtPct(v) },
                { key:'position',    label:'Position',    right:true, render:v=><PosBadge pos={v}/> },
                { key:'_bar',        label:'% of Clicks', right:true, render:(_,r)=>(
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ flex:1, height:6, background:'#f1f2f3', borderRadius:3, minWidth:80 }}>
                      <div style={{ width:`${((r.clicks/totalClicks)*100).toFixed(1)}%`, height:'100%', background:'#1a73e8', borderRadius:3 }}/>
                    </div>
                    <span style={{ fontSize:11, color:'#6d7175', minWidth:36 }}>{((r.clicks/totalClicks)*100).toFixed(1)}%</span>
                  </div>
                )},
              ]}
              rows={countries}
            />)}
            {perfTab==='devices' && (lD ? <LoadSpin/> : <DataTable
              columns={[
                { key:'device',      label:'Device',      render:v=><strong style={{textTransform:'capitalize'}}>{v}</strong> },
                { key:'clicks',      label:'Clicks',      right:true, render:v=><strong>{fmt(v)}</strong> },
                { key:'impressions', label:'Impressions', right:true, render:v=>fmt(v) },
                { key:'ctr',         label:'CTR',         right:true, render:v=>fmtPct(v) },
                { key:'position',    label:'Position',    right:true, render:v=><PosBadge pos={v}/> },
                { key:'_bar',        label:'% of Clicks', right:true, render:(_,r)=>(
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ flex:1, height:6, background:'#f1f2f3', borderRadius:3, minWidth:80 }}>
                      <div style={{ width:`${((r.clicks/totalClicks)*100).toFixed(1)}%`, height:'100%', background:'#1a73e8', borderRadius:3 }}/>
                    </div>
                    <span style={{ fontSize:11, color:'#6d7175', minWidth:36 }}>{((r.clicks/totalClicks)*100).toFixed(1)}%</span>
                  </div>
                )},
              ]}
              rows={devices}
            />)}
            {perfTab==='days' && (lO ? <LoadSpin/> : <DataTable
              columns={[
                { key:'date',        label:'Date',        render:v=>v },
                { key:'clicks',      label:'Clicks',      right:true, render:v=><strong>{fmt(v)}</strong> },
                { key:'impressions', label:'Impressions', right:true, render:v=>fmt(v) },
                { key:'ctr',         label:'CTR',         right:true, render:v=>fmtPct(v) },
                { key:'position',    label:'Position',    right:true, render:v=><PosBadge pos={v}/> },
              ]}
              rows={[...overview].reverse()}
            />)}
          </div>
        </>
      )}

      {/* ── INSIGHTS ── */}
      {section==='insights' && (
        <>
          {/* Clicks + Impressions summary with trend */}
          <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e1e3e5', padding:24, marginBottom:20 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:32 }}>
              <div>
                <div style={{ fontSize:12, color:'#6d7175', marginBottom:6 }}>Clicks</div>
                <div style={{ fontSize:36, fontWeight:700, color:'#202223' }}>{lO?'…':fmt(tot.clicks)}</div>
                <div style={{ marginTop:6 }}><TrendPill pct={null}/></div>
              </div>
              <div>
                <div style={{ fontSize:12, color:'#6d7175', marginBottom:6 }}>Impressions</div>
                <div style={{ fontSize:36, fontWeight:700, color:'#202223' }}>{lO?'…':fmt(tot.impressions)}</div>
              </div>
            </div>
          </div>

          {/* Your content (pages) */}
          <SCard title="Your Content" noPad action={
            can('csvExport') && <Button size="slim" onClick={()=>downloadCSV(pages,`sc-content-${range.startDate}.csv`)}>Export CSV</Button>
          }>
            <div style={{ borderBottom:'1px solid #e1e3e5', display:'flex', padding:'0 16px' }}>
              {[['top','Top'],['up','Trending Up'],['down','Trending Down']].map(([v,l])=>(
                <button key={v} onClick={()=>setInsightTab(v)} style={{
                  padding:'10px 16px', border:'none', cursor:'pointer', fontSize:13,
                  fontWeight:insightTab===v?600:400, background:'transparent',
                  color:insightTab===v?'#1a73e8':'#6d7175',
                  borderBottom:insightTab===v?'2px solid #1a73e8':'2px solid transparent',
                }}>{l}</button>
              ))}
            </div>
            {lP ? <LoadSpin/> : (
              <div>
                {(insightTab==='top' ? pages.slice(0,10) : insightTab==='up' ? trendingUpP : trendingDownP).map((p,i,arr)=>(
                  <div key={i} style={{ padding:'12px 20px', borderBottom:i<arr.length-1?'1px solid #f1f2f3':'none', display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
                    <a href={p.page} target="_blank" rel="noopener noreferrer" style={{ fontSize:12, color:'#1a73e8', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textDecoration:'none' }} title={p.page} onMouseOver={e=>e.currentTarget.style.textDecoration='underline'} onMouseOut={e=>e.currentTarget.style.textDecoration='none'}>{p.page}</a>
                    <div style={{ display:'flex', gap:12, alignItems:'center', flexShrink:0 }}>
                      {p._trend!=null && <TrendPill pct={p._trend}/>}
                      <strong style={{ fontSize:13, minWidth:50, textAlign:'right' }}>{fmt(p.clicks)}</strong>
                    </div>
                  </div>
                ))}
                {(insightTab==='up'&&!trendingUpP.length||insightTab==='down'&&!trendingDownP.length) && (
                  <Box padding="600" textAlign="center"><Text tone="subdued">No trend data yet — needs previous period comparison.</Text></Box>
                )}
              </div>
            )}
          </SCard>

          {/* Queries leading to site */}
          <SCard title="Queries Leading to Your Site" noPad action={
            can('csvExport') && <Button size="slim" onClick={()=>downloadCSV(queries,`sc-queries-${range.startDate}.csv`)}>Export CSV</Button>
          }>
            <div style={{ borderBottom:'1px solid #e1e3e5', display:'flex', padding:'0 16px' }}>
              {[['top','Top'],['up','Trending Up'],['down','Trending Down']].map(([v,l])=>(
                <button key={v} onClick={()=>setQueryInsTab(v)} style={{
                  padding:'10px 16px', border:'none', cursor:'pointer', fontSize:13,
                  fontWeight:queryInsTab===v?600:400, background:'transparent',
                  color:queryInsTab===v?'#1a73e8':'#6d7175',
                  borderBottom:queryInsTab===v?'2px solid #1a73e8':'2px solid transparent',
                }}>{l}</button>
              ))}
            </div>
            {lQ ? <LoadSpin/> : (
              <div>
                {(queryInsTab==='top' ? queries.slice(0,10) : queryInsTab==='up' ? trendingUpQ : trendingDownQ).map((q,i,arr)=>(
                  <div key={i} style={{ padding:'12px 20px', borderBottom:i<arr.length-1?'1px solid #f1f2f3':'none', display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
                    <div style={{ fontWeight:500, fontSize:13, flex:1 }}>{q.keyword}</div>
                    <div style={{ display:'flex', gap:12, alignItems:'center', flexShrink:0 }}>
                      <PosBadge pos={q.position}/>
                      {q._trend!=null && <TrendPill pct={q._trend}/>}
                      <strong style={{ fontSize:13, minWidth:50, textAlign:'right' }}>{fmt(q.clicks)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SCard>

          {/* Top Countries */}
          {!lC && countries.length > 0 && (
            <SCard title="Top Countries">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:32 }}>
                <div>
                  {countries.slice(0,8).map((c,i)=>(
                    <div key={i} style={{ marginBottom:12 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                        <span style={{ fontSize:13, fontWeight:500, textTransform:'uppercase' }}>{c.country}</span>
                        <span style={{ fontSize:13, color:'#6d7175' }}>{((c.clicks/totalClicks)*100).toFixed(1)}%</span>
                      </div>
                      <div style={{ height:6, background:'#f1f2f3', borderRadius:3 }}>
                        <div style={{ width:`${((c.clicks/totalClicks)*100).toFixed(1)}%`, height:'100%', background:'#1a73e8', borderRadius:3 }}/>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ height:280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={countries.slice(0,8)} dataKey="clicks" nameKey="country" cx="50%" cy="50%" outerRadius={110} innerRadius={55} paddingAngle={2}>
                        {countries.slice(0,8).map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                      </Pie>
                      <Tooltip formatter={(v,n)=>[fmt(v),n]}/>
                      <Legend/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </SCard>
          )}
        </>
      )}

      {/* ── COUNTRIES ── */}
      {section==='countries' && (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
            <SCard title="Clicks by Country">
              {lC ? <LoadSpin/> : (
                <div style={{ height:320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={countries.slice(0,12)} layout="vertical" margin={{ left:0, right:20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f2f3" />
                      <XAxis type="number" tick={{ fontSize:11 }}/>
                      <YAxis type="category" dataKey="country" width={90} tick={{ fontSize:11, fill:'#202223', textTransform:'uppercase' }}/>
                      <Tooltip formatter={v=>[fmt(v),'Clicks']}/>
                      <Bar dataKey="clicks" fill="#1a73e8" radius={[0,4,4,0]} name="Clicks"/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </SCard>
            <SCard title="Impressions by Country">
              {lC ? <LoadSpin/> : (
                <div style={{ height:320 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={countries.slice(0,12)} layout="vertical" margin={{ left:0, right:20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f2f3" />
                      <XAxis type="number" tick={{ fontSize:11 }}/>
                      <YAxis type="category" dataKey="country" width={90} tick={{ fontSize:11, fill:'#202223', textTransform:'uppercase' }}/>
                      <Tooltip formatter={v=>[fmt(v),'Impressions']}/>
                      <Bar dataKey="impressions" fill="#6b2da8" radius={[0,4,4,0]} name="Impressions"/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </SCard>
          </div>
          <SCard title="All Countries" noPad action={
            can('csvExport') && <Button size="slim" onClick={()=>downloadCSV(countries,`sc-countries-${range.startDate}.csv`)}>Export CSV</Button>
          }>
            {lC ? <LoadSpin/> : (
              <DataTable
                columns={[
                  { key:'country',     label:'Country',     render:v=><strong style={{textTransform:'uppercase'}}>{v}</strong> },
                  { key:'clicks',      label:'Clicks',      right:true, render:v=><strong>{fmt(v)}</strong> },
                  { key:'impressions', label:'Impressions', right:true, render:v=>fmt(v) },
                  { key:'ctr',         label:'CTR',         right:true, render:v=>fmtPct(v) },
                  { key:'position',    label:'Avg Position',right:true, render:v=><PosBadge pos={v}/> },
                  { key:'_bar',        label:'% Share',     right:true, render:(_,r)=>(
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:80, height:6, background:'#f1f2f3', borderRadius:3 }}>
                        <div style={{ width:`${Math.min((r.clicks/totalClicks)*100,100).toFixed(0)}%`, height:'100%', background:'#1a73e8', borderRadius:3 }}/>
                      </div>
                      <span style={{ fontSize:11, color:'#6d7175' }}>{((r.clicks/totalClicks)*100).toFixed(1)}%</span>
                    </div>
                  )},
                ]}
                rows={countries}
              />
            )}
          </SCard>
        </>
      )}

      {/* ── DEVICES ── */}
      {section==='devices' && (
        <>
          <div style={{ display:'grid', gridTemplateColumns:'300px 1fr', gap:16, marginBottom:20 }}>
            <SCard title="Device Split">
              {lD ? <LoadSpin/> : (
                <div style={{ height:280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={devices} dataKey="clicks" nameKey="device" cx="50%" cy="50%" outerRadius={110} innerRadius={55} paddingAngle={3}>
                        {devices.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                      </Pie>
                      <Tooltip formatter={(v,n)=>[fmt(v),n]}/>
                      <Legend/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </SCard>
            <SCard title="Device Performance" noPad action={
              can('csvExport') && <Button size="slim" onClick={()=>downloadCSV(devices,`sc-devices-${range.startDate}.csv`)}>Export CSV</Button>
            }>
              {lD ? <LoadSpin/> : (
                <DataTable
                  columns={[
                    { key:'device',      label:'Device',      render:v=><strong style={{textTransform:'capitalize'}}>{v}</strong> },
                    { key:'clicks',      label:'Clicks',      right:true, render:v=><strong>{fmt(v)}</strong> },
                    { key:'impressions', label:'Impressions', right:true, render:v=>fmt(v) },
                    { key:'ctr',         label:'CTR',         right:true, render:v=>fmtPct(v) },
                    { key:'position',    label:'Avg Position',right:true, render:v=><PosBadge pos={v}/> },
                    { key:'_bar',        label:'% of Clicks', right:true, render:(_,r)=>(
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ width:100, height:8, background:'#f1f2f3', borderRadius:4 }}>
                          <div style={{ width:`${Math.min((r.clicks/totalClicks)*100,100).toFixed(0)}%`, height:'100%', background:'#1a73e8', borderRadius:4 }}/>
                        </div>
                        <span style={{ fontSize:11, color:'#6d7175' }}>{((r.clicks/totalClicks)*100).toFixed(1)}%</span>
                      </div>
                    )},
                  ]}
                  rows={devices}
                />
              )}
            </SCard>
          </div>

          {/* Devices bar chart */}
          <SCard title="Clicks vs Impressions by Device">
            {lD ? <LoadSpin/> : (
              <div style={{ height:240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={devices} margin={{ top:4, right:20, left:0, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f2f3" />
                    <XAxis dataKey="device" tick={{ fontSize:12, fill:'#202223', textTransform:'capitalize' }} />
                    <YAxis yAxisId="l" tick={{ fontSize:11 }} width={60} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fontSize:11 }} width={70} tickFormatter={v=>`${(v/1000).toFixed(0)}K`} />
                    <Tooltip content={<CustomTip />} />
                    <Legend />
                    <Bar yAxisId="l" dataKey="clicks"      fill="#1a73e8" radius={[4,4,0,0]} name="Clicks" />
                    <Bar yAxisId="r" dataKey="impressions" fill="#6b2da8" radius={[4,4,0,0]} name="Impressions" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </SCard>
        </>
      )}
    </div>
  );
}

function LoadSpin() {
  return <Box padding="800" textAlign="center"><Spinner /></Box>;
}
