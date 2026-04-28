import React, { useState, useMemo } from 'react';
import { useQuery } from 'react-query';
import { Page, Text, BlockStack, InlineStack, Box, Banner, Spinner, Button, ButtonGroup } from '@shopify/polaris';
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { analyticsApi } from '../../api';
import { useShop } from '../../context/ShopContext';
import { usePlan, downloadCSV } from '../../hooks/usePlan';
import PlanGate from '../../components/PlanGate';
import DateRangeFilter from '../../components/DateRangeFilter';

const fmt    = n => (n||0).toLocaleString();
const fmtPct = n => `${parseFloat(n||0).toFixed(2)}%`;
const fmtSec = n => { const s=Math.round(n||0); return s>=60?`${Math.floor(s/60)}m ${s%60}s`:`${s}s`; };
const fmtDate = d => { if(!d) return ''; if(d.length===8) return `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`; return d; };
const fmtMoney = n => `₹${(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const PIE_COLORS = ['#1a1a1a','#50b83c','#47c1bf','#f49342','#de3618','#303030','#3498db','#1abc9c'];
const DEVICE_COLORS = { mobile:'#1a1a1a', desktop:'#50b83c', tablet:'#f49342' };

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

function DataTable({ columns, rows, emptyText='No data available.' }) {
  if (!rows?.length) return <Box padding="800" textAlign="center"><Text tone="subdued">{emptyText}</Text></Box>;
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
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
    <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e1e3e5', overflow:'hidden' }}>
      <div style={{ padding:'14px 20px', borderBottom:'1px solid #e1e3e5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontWeight:600, fontSize:14, color:'#202223' }}>{title}</span>
        {action}
      </div>
      {children}
    </div>
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

function PBtn({ label, active, onClick }) {
  return <Button pressed={active} onClick={onClick}>{label}</Button>;
}

function getRange(preset) {
  const end = new Date(), start = new Date();
  start.setDate(start.getDate()-({'7d':7,'30d':30,'90d':90}[preset]||30));
  return { startDate:start.toISOString().slice(0,10), endDate:end.toISOString().slice(0,10) };
}

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

function PageLink({ path, baseUrl }) {
  const href = buildPageUrl(path, baseUrl);
  if (!href) return <span style={{ fontSize:11, color:'#6d7175', marginTop:2, display:'block' }}>{path}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{ fontSize:11, color:'#1a73e8', marginTop:2, display:'block', textDecoration:'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:320 }}
      title={href}
      onMouseOver={e=>e.currentTarget.style.textDecoration='underline'}
      onMouseOut={e=>e.currentTarget.style.textDecoration='none'}>
      {path}
    </a>
  );
}

export default function AnalyticsPage() {
  const { googleStatus } = useShop();
  const { can } = usePlan();
  const baseUrl = getBaseUrl(googleStatus?.account?.search_console_property);
  const [preset, setPreset]       = useState('30d');
  const [customS, setCustomS]     = useState('');
  const [customE, setCustomE]     = useState('');
  const [showCust, setShowCust]   = useState(false);
  const [tab, setTab]             = useState(0);

  const range = useMemo(() => {
    if (showCust && customS && customE) return { startDate:customS, endDate:customE };
    return getRange(preset);
  }, [preset, showCust, customS, customE]);

  const qk = [range.startDate, range.endDate];

  const { data:sessions=[], isLoading:lS, error:eS } = useQuery(['ga4s',...qk], ()=>analyticsApi.ga4Sessions(range));
  const { data:sources=[],  isLoading:lSrc }          = useQuery(['ga4src',...qk], ()=>analyticsApi.ga4Sources(range));
  const { data:countries=[], isLoading:lC }            = useQuery(['ga4c',...qk], ()=>analyticsApi.ga4Countries(range));
  const { data:pages=[],    isLoading:lP }             = useQuery(['ga4p',...qk], ()=>analyticsApi.ga4Pages(range));
  const { data:devices=[],  isLoading:lD }             = useQuery(['ga4d',...qk], ()=>analyticsApi.ga4Devices(range));
  const { data:ecomm=[],    isLoading:lE }             = useQuery(['ga4e',...qk], ()=>analyticsApi.ga4Ecommerce(range));

  if (!can('ga4')) {
    return (
      <PlanGate feature="ga4" required="growth">
        <div style={{ padding:40, minHeight:400 }}>
          <div style={{ fontSize:22, fontWeight:700, color:'#202223', marginBottom:8 }}>Analytics – GA4</div>
          <div style={{ fontSize:13, color:'#6d7175' }}>Sessions, users, traffic sources, pages and ecommerce</div>
        </div>
      </PlanGate>
    );
  }

  if (!googleStatus?.connected) {
    return (
      <Page title="Analytics – GA4">
        <Banner title="Google not connected" tone="warning" action={{ content:'Connect Google', url:'/connect-google' }}>
          Connect your Google account to view GA4 analytics data.
        </Banner>
      </Page>
    );
  }

  const tot = sessions.reduce((a,d)=>({ sessions:a.sessions+(d.sessions||0), users:a.users+(d.users||0), new_users:a.new_users+(d.new_users||0) }),{sessions:0,users:0,new_users:0});
  const avgBounce = sessions.length ? sessions.reduce((a,d)=>a+(d.bounce_rate||0),0)/sessions.length : 0;
  const avgDur    = sessions.length ? sessions.reduce((a,d)=>a+(d.avg_session_duration||0),0)/sessions.length : 0;
  const ecommTot  = ecomm.reduce((a,d)=>({ rev:a.rev+(d.revenue||0), tx:a.tx+(d.transactions||0), carts:a.carts+(d.add_to_carts||0) }),{rev:0,tx:0,carts:0});

  const chartD = sessions.map(d=>({ ...d, date:fmtDate(d.date).slice(5) }));
  const ecommD = ecomm.map(d=>({ ...d, date:fmtDate(d.date).slice(5) }));
  const totalSess = tot.sessions||1;
  const totalViews = pages.reduce((a,p)=>a+p.views,0)||1;

  const tabs = [
    { label:'Traffic Sources', count:sources.length },
    { label:'Countries',       count:countries.length },
    { label:'Top Pages',       count:pages.length },
    { label:'Devices',         count:devices.length },
    { label:'Ecommerce',       count:ecomm.length },
  ];

  return (
    <div style={{ padding:'4px 0 40px' }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:22, fontWeight:700, color:'#202223', marginBottom:4 }}>Analytics – GA4</div>
        <div style={{ fontSize:13, color:'#6d7175' }}>Traffic, sessions &amp; audience data</div>
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

      {eS && <div style={{ marginBottom:16 }}><Banner tone="critical" title="GA4 error"><Text variant="bodySm">{eS?.error||'Failed to load GA4 data. Ensure GA4 property is configured.'}</Text></Banner></div>}

      {/* KPI cards */}
      <div style={{ display:'flex', gap:14, marginBottom:20, flexWrap:'wrap' }}>
        <KPICard label="Sessions"              value={lS?'…':fmt(tot.sessions)}    color="#1a1a1a" />
        <KPICard label="Total Users"           value={lS?'…':fmt(tot.users)}       color="#50b83c" />
        <KPICard label="New Users"             value={lS?'…':fmt(tot.new_users)}   color="#47c1bf" />
        <KPICard label="Avg. Bounce Rate"      value={lS?'…':fmtPct(avgBounce)}    color="#f49342" />
        <KPICard label="Avg. Session Duration" value={lS?'…':fmtSec(avgDur)}       color="#1a1a1a" />
      </div>

      {/* Ecommerce KPIs */}
      {!lE && ecommTot.tx > 0 && (
        <div style={{ display:'flex', gap:14, marginBottom:20, flexWrap:'wrap' }}>
          <KPICard label="Revenue"       value={fmtMoney(ecommTot.rev)}  color="#50b83c" sub="GA4 ecommerce tracking" />
          <KPICard label="Transactions"  value={fmt(ecommTot.tx)}        color="#1a1a1a" />
          <KPICard label="Add to Carts"  value={fmt(ecommTot.carts)}     color="#47c1bf" />
        </div>
      )}

      {/* Sessions chart */}
      <Card2 title="Sessions Over Time" action={
        can('csvExport') && <Button size="slim" onClick={()=>downloadCSV(sessions.map(d=>({...d,date:fmtDate(d.date)})),`ga4-sessions-${range.startDate}.csv`)}>Export CSV</Button>
      }>
        <div style={{ padding:'20px' }}>
          {lS ? <Box padding="800" textAlign="center"><Spinner /></Box> : (
            <div style={{ height:300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartD} margin={{ top:8, right:20, left:0, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f2f3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize:11, fill:'#6d7175' }} axisLine={{ stroke:'#e1e3e5' }} tickLine={false} />
                  <YAxis tick={{ fontSize:11, fill:'#6d7175' }} width={50} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTip />} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={8} />
                  <Line type="monotone" dataKey="sessions"  stroke="#1a1a1a" strokeWidth={2} dot={false} name="Sessions" />
                  <Line type="monotone" dataKey="users"     stroke="#50b83c" strokeWidth={2} dot={false} name="Users" />
                  <Line type="monotone" dataKey="new_users" stroke="#47c1bf" strokeWidth={2} dot={false} name="New Users" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </Card2>

      <div style={{ height:20 }} />

      {/* Bounce + Duration */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
        <Card2 title="Bounce Rate Over Time">
          <div style={{ padding:20 }}>
            {lS ? <Box padding="600" textAlign="center"><Spinner /></Box> : (
              <div style={{ height:200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartD}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f2f3" />
                    <XAxis dataKey="date" tick={{ fontSize:10, fill:'#6d7175' }} />
                    <YAxis tick={{ fontSize:10 }} tickFormatter={v=>`${v.toFixed(0)}%`} width={40} />
                    <Tooltip formatter={v=>[`${v.toFixed(2)}%`,'Bounce Rate']} />
                    <Line type="monotone" dataKey="bounce_rate" stroke="#f49342" strokeWidth={2} dot={false} name="Bounce %" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Card2>
        <Card2 title="Avg. Session Duration">
          <div style={{ padding:20 }}>
            {lS ? <Box padding="600" textAlign="center"><Spinner /></Box> : (
              <div style={{ height:200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartD}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f2f3" />
                    <XAxis dataKey="date" tick={{ fontSize:10, fill:'#6d7175' }} />
                    <YAxis tick={{ fontSize:10 }} tickFormatter={v=>fmtSec(v)} width={55} />
                    <Tooltip formatter={v=>[fmtSec(v),'Avg Duration']} />
                    <Line type="monotone" dataKey="avg_session_duration" stroke="#1a1a1a" strokeWidth={2} dot={false} name="Duration" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Card2>
      </div>

      {/* Ecommerce chart */}
      {!lE && ecomm.length > 0 && (
        <>
          <Card2 title="Ecommerce – Revenue &amp; Transactions" action={
            can('csvExport') && <Button size="slim" onClick={()=>downloadCSV(ecomm,`ga4-ecommerce-${range.startDate}.csv`)}>Export CSV</Button>
          }>
            <div style={{ padding:20 }}>
              <div style={{ height:260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={ecommD} margin={{ top:4, right:20, left:0, bottom:0 }}>
                    <defs>
                      <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#50b83c" stopOpacity={0.2}/><stop offset="95%" stopColor="#50b83c" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f2f3" />
                    <XAxis dataKey="date" tick={{ fontSize:11, fill:'#6d7175' }} />
                    <YAxis yAxisId="l" tick={{ fontSize:11 }} width={80} tickFormatter={v=>`₹${(v/1000).toFixed(0)}K`} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fontSize:11 }} width={40} />
                    <Tooltip content={<CustomTip />} />
                    <Legend />
                    <Area yAxisId="l" type="monotone" dataKey="revenue"      stroke="#50b83c" fill="url(#gRev)" strokeWidth={2} dot={false} name="Revenue (₹)" />
                    <Line yAxisId="r" type="monotone" dataKey="transactions" stroke="#1a1a1a" strokeWidth={2} dot={false} name="Transactions" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card2>
          <div style={{ height:20 }} />
        </>
      )}

      {/* Tabbed reports */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #e1e3e5', overflow:'hidden' }}>
        <div style={{ borderBottom:'1px solid #e1e3e5', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0 16px', overflowX:'auto' }}>
          <ButtonGroup variant="segmented">
            {tabs.map((t,i)=>(
              <Button key={i} pressed={tab===i} onClick={()=>setTab(i)}>
                {t.label} ({t.count})
              </Button>
            ))}
          </ButtonGroup>
          <div style={{ display:'flex', gap:8, padding:'8px 0' }}>
            {tab===0 && can('csvExport') && <Button size="slim" onClick={()=>downloadCSV(sources,`ga4-sources-${range.startDate}.csv`)}>Export CSV</Button>}
            {tab===1 && can('csvExport') && <Button size="slim" onClick={()=>downloadCSV(countries,`ga4-countries-${range.startDate}.csv`)}>Export CSV</Button>}
            {tab===2 && can('csvExport') && <Button size="slim" onClick={()=>downloadCSV(pages,`ga4-pages-${range.startDate}.csv`)}>Export CSV</Button>}
            {tab===3 && can('csvExport') && <Button size="slim" onClick={()=>downloadCSV(devices,`ga4-devices-${range.startDate}.csv`)}>Export CSV</Button>}
            {tab===4 && can('csvExport') && <Button size="slim" onClick={()=>downloadCSV(ecomm,`ga4-ecommerce-${range.startDate}.csv`)}>Export CSV</Button>}
          </div>
        </div>

        {/* Traffic Sources */}
        {tab===0 && (lSrc ? <Box padding="800" textAlign="center"><Spinner /></Box> : (
          <div style={{ display:'grid', gridTemplateColumns:'300px 1fr' }}>
            <div style={{ padding:20, borderRight:'1px solid #f1f2f3' }}>
              <div style={{ height:240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sources} dataKey="sessions" nameKey="channel" cx="50%" cy="50%" outerRadius={95} innerRadius={48} paddingAngle={2}>
                      {sources.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                    </Pie>
                    <Tooltip formatter={(v,n)=>[fmt(v),n]}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {sources.map((s,i)=>(
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:PIE_COLORS[i%PIE_COLORS.length], flexShrink:0 }}/>
                  <span style={{ fontSize:12, color:'#202223', flex:1 }}>{s.channel}</span>
                  <span style={{ fontSize:12, fontWeight:600, color:'#6d7175' }}>{((s.sessions/totalSess)*100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
            <DataTable
              columns={[
                { key:'channel',  label:'Channel', render:v=><strong>{v}</strong> },
                { key:'sessions', label:'Sessions', right:true, render:v=><strong>{fmt(v)}</strong> },
                { key:'users',    label:'Users',    right:true, render:v=>fmt(v) },
                { key:'_p',       label:'% Total',  right:true, render:(_,r)=>`${((r.sessions/totalSess)*100).toFixed(1)}%` },
              ]}
              rows={sources}
            />
          </div>
        ))}

        {/* Countries */}
        {tab===1 && (lC ? <Box padding="800" textAlign="center"><Spinner /></Box> : (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr' }}>
            <div style={{ padding:20, borderRight:'1px solid #f1f2f3' }}>
              <div style={{ height:320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={countries.slice(0,10)} layout="vertical" margin={{ left:0, right:20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f2f3" />
                    <XAxis type="number" tick={{ fontSize:11 }}/>
                    <YAxis type="category" dataKey="country" width={110} tick={{ fontSize:11, fill:'#202223' }}/>
                    <Tooltip formatter={v=>[fmt(v),'Sessions']}/>
                    <Bar dataKey="sessions" fill="#1a1a1a" radius={[0,4,4,0]} name="Sessions"/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <DataTable
              columns={[
                { key:'country',  label:'Country', render:v=><strong>{v}</strong> },
                { key:'sessions', label:'Sessions', right:true, render:v=><strong>{fmt(v)}</strong> },
                { key:'users',    label:'Users',    right:true, render:v=>fmt(v) },
                { key:'_p',       label:'% Share',  right:true, render:(_,r)=>`${((r.sessions/totalSess)*100).toFixed(1)}%` },
              ]}
              rows={countries}
            />
          </div>
        ))}

        {/* Pages */}
        {tab===2 && (lP ? <Box padding="800" textAlign="center"><Spinner /></Box> : (
          <DataTable
            columns={[
              { key:'title',    label:'Page', render:(v,r)=>(
                <div>
                  <div style={{ fontWeight:500 }}>{v||'(No title)'}</div>
                  <PageLink path={r.path} baseUrl={baseUrl} />
                </div>
              )},
              { key:'views',    label:'Page Views', right:true, render:v=><strong>{fmt(v)}</strong> },
              { key:'sessions', label:'Sessions',   right:true, render:v=>fmt(v) },
              { key:'_p',       label:'% Views',    right:true, render:(_,r)=>`${((r.views/totalViews)*100).toFixed(1)}%` },
            ]}
            rows={pages}
            emptyText="No page data. Ensure GA4 property is configured."
          />
        ))}

        {/* Devices */}
        {tab===3 && (lD ? <Box padding="800" textAlign="center"><Spinner /></Box> : (
          <div style={{ display:'grid', gridTemplateColumns:'300px 1fr' }}>
            <div style={{ padding:20, borderRight:'1px solid #f1f2f3' }}>
              <div style={{ height:260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={devices} dataKey="sessions" nameKey="device" cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={3}>
                      {devices.map((d,i)=><Cell key={i} fill={DEVICE_COLORS[d.device?.toLowerCase()]||PIE_COLORS[i]}/>)}
                    </Pie>
                    <Tooltip formatter={(v,n)=>[fmt(v),n]}/>
                    <Legend/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <DataTable
              columns={[
                { key:'device',      label:'Device',      render:v=><strong style={{ textTransform:'capitalize' }}>{v}</strong> },
                { key:'sessions',    label:'Sessions',    right:true, render:v=><strong>{fmt(v)}</strong> },
                { key:'users',       label:'Users',       right:true, render:v=>fmt(v) },
                { key:'bounce_rate', label:'Bounce Rate', right:true, render:v=>fmtPct(v) },
                { key:'_p',          label:'% Share',     right:true, render:(_,r)=>`${((r.sessions/totalSess)*100).toFixed(1)}%` },
              ]}
              rows={devices}
            />
          </div>
        ))}

        {/* Ecommerce */}
        {tab===4 && (lE ? <Box padding="800" textAlign="center"><Spinner /></Box> : ecomm.length===0 ? (
          <Box padding="800" textAlign="center"><Text tone="subdued">No ecommerce data. Ensure GA4 ecommerce tracking is set up for your store.</Text></Box>
        ) : (
          <DataTable
            columns={[
              { key:'date',         label:'Date',         render:v=>fmtDate(v) },
              { key:'transactions', label:'Transactions', right:true, render:v=><strong>{fmt(v)}</strong> },
              { key:'revenue',      label:'Revenue',      right:true, render:v=><strong style={{color:'#50b83c'}}>{fmtMoney(v)}</strong> },
              { key:'add_to_carts', label:'Add to Carts', right:true, render:v=>fmt(v) },
              { key:'checkouts',    label:'Checkouts',    right:true, render:v=>fmt(v) },
              { key:'purchases',    label:'Purchases',    right:true, render:v=>fmt(v) },
            ]}
            rows={ecomm}
          />
        ))}
      </div>
    </div>
  );
}
