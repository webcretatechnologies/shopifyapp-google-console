import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { Page, Banner, Spinner, Button, Badge, Text, Box, TextField, Checkbox, InlineStack, BlockStack, Card } from '@shopify/polaris';
import { analyticsApi, settingsApi } from '../api';
import { useShop } from '../context/ShopContext';
import { usePlan } from '../hooks/usePlan';
import PlanGate from '../components/PlanGate';

const fmt = n => (n || 0).toLocaleString();
function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }); }
  catch { return d; }
}

const thS = { padding:'11px 16px', textAlign:'left', color:'#6d7175', fontWeight:600, fontSize:11, borderBottom:'1px solid #e1e3e5', textTransform:'uppercase', letterSpacing:'0.4px', whiteSpace:'nowrap', background:'#fafbfb' };
const tdS = { padding:'11px 16px', borderBottom:'1px solid #f1f2f3', fontSize:13, verticalAlign:'middle' };

function StatusStep({ done, label }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, flex:1 }}>
      <div style={{
        width:36, height:36, borderRadius:'50%',
        background: done ? '#1a73e8' : '#e8eaed',
        display:'flex', alignItems:'center', justifyContent:'center',
        color:'#fff', fontSize:18, fontWeight:700,
      }}>
        {done ? '✓' : '○'}
      </div>
      <div style={{ fontSize:12, color: done ? '#1a73e8' : '#6d7175', fontWeight: done ? 600 : 400, textAlign:'center' }}>{label}</div>
    </div>
  );
}

function StatusCard({ icon, label, value, color }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #e1e3e5', borderRadius:12, padding:'20px 24px', flex:1, minWidth:180 }}>
      <div style={{ display:'flex', alignItems:'center', gap:14 }}>
        <div style={{ width:48, height:48, borderRadius:'50%', background:color+'22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>{icon}</div>
        <div>
          <div style={{ fontSize:12, color:'#6d7175', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:4 }}>{label}</div>
          <div style={{ fontSize:16, fontWeight:700, color }}>{value}</div>
        </div>
      </div>
    </div>
  );
}

function SCard({ title, children, action }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #e1e3e5', borderRadius:12, overflow:'hidden', marginBottom:20 }}>
      <div style={{ padding:'14px 20px', borderBottom:'1px solid #e1e3e5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontWeight:600, fontSize:15, color:'#202223' }}>{title}</span>
        {action}
      </div>
      <div style={{ padding:20 }}>{children}</div>
    </div>
  );
}

export default function SitemapPage() {
  const { googleStatus } = useShop();
  const { can } = usePlan();
  const qc = useQueryClient();
  const [newUrl, setNewUrl]           = useState('');
  const [submitMsg, setSubmitMsg]     = useState(null);
  const [deleteMsg, setDeleteMsg]     = useState(null);
  const [deleting, setDeleting]       = useState(null);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoUrl, setAutoUrl]         = useState('');
  const [autoSaved, setAutoSaved]     = useState(false);

  const { data: shopSettings, isLoading: sLoad } = useQuery('shop-settings', settingsApi.get);
  const autoSaveMutation = useMutation(
    (data) => settingsApi.save(data),
    {
      onSuccess: () => { setAutoSaved(true); setTimeout(() => setAutoSaved(false), 3000); qc.invalidateQueries('shop-settings'); },
    }
  );

  useEffect(() => {
    if (shopSettings) {
      setAutoEnabled(!!shopSettings.auto_sitemap_enabled);
      setAutoUrl(shopSettings.auto_sitemap_url || '');
    }
  }, [shopSettings]);

  const { data: sitemaps = [], isLoading, error, refetch } = useQuery(
    'sitemaps',
    analyticsApi.seoSitemaps,
    { enabled: !!googleStatus?.connected, retry: 1 }
  );

  const submitMutation = useMutation(
    (url) => analyticsApi.submitSitemap(url),
    {
      onSuccess: () => {
        setSubmitMsg({ type: 'success', text: 'Sitemap submitted successfully! It may take a few minutes to appear.' });
        setNewUrl('');
        setTimeout(() => { refetch(); setSubmitMsg(null); }, 3000);
      },
      onError: (err) => {
        setSubmitMsg({ type: 'error', text: err?.error || 'Failed to submit sitemap. Check the URL and try again.' });
      },
    }
  );

  const deleteMutation = useMutation(
    (url) => analyticsApi.deleteSitemap(url),
    {
      onSuccess: () => {
        setDeleteMsg({ type: 'success', text: 'Sitemap removed successfully.' });
        setDeleting(null);
        setTimeout(() => { refetch(); setDeleteMsg(null); }, 3000);
      },
      onError: (err) => {
        setDeleteMsg({ type: 'error', text: err?.error || 'Failed to remove sitemap.' });
        setDeleting(null);
      },
    }
  );

  const scProperty   = googleStatus?.account?.search_console_property || '';
  const isConnected  = !!googleStatus?.connected;
  const hasProperty  = !!scProperty;
  const hasSitemaps  = sitemaps.length > 0;
  const defaultSitemapUrl = hasProperty ? scProperty.replace(/\/$/, '') + '/sitemap.xml' : '';

  if (!can('sitemapManager')) {
    return (
      <PlanGate feature="sitemapManager" required="growth">
        <div style={{ padding:40, minHeight:400 }}>
          <div style={{ fontSize:22, fontWeight:700, color:'#202223', marginBottom:8 }}>Sitemap Manager</div>
          <div style={{ fontSize:13, color:'#6d7175' }}>Manage your Google Search Console sitemaps</div>
        </div>
      </PlanGate>
    );
  }

  if (!isConnected) {
    return (
      <div style={{ padding:'4px 0 40px' }}>
        <div style={{ fontSize:22, fontWeight:700, color:'#202223', marginBottom:16 }}>Sitemap Manager</div>
        <Banner title="Google not connected" tone="warning" action={{ content:'Connect Google', url:'/connect-google' }}>
          Connect your Google account to manage sitemaps.
        </Banner>
      </div>
    );
  }

  // Progress steps
  const step1 = isConnected;
  const step2 = hasProperty;
  const step3 = hasSitemaps;

  return (
    <div style={{ padding:'4px 0 40px' }}>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:22, fontWeight:700, color:'#202223', marginBottom:4 }}>Sitemap Manager</div>
        <div style={{ fontSize:13, color:'#6d7175' }}>Manage your Google Search Console sitemaps and monitor indexing status</div>
      </div>

      {/* Status cards row */}
      <div style={{ display:'flex', gap:16, marginBottom:20, flexWrap:'wrap' }}>
        <StatusCard icon="G" label="Google Account" value={isConnected ? 'Connected' : 'Not Connected'} color={isConnected ? '#1a73e8' : '#de3618'} />
        <StatusCard icon="🌐" label="Domain Verification" value={hasProperty ? 'Verified' : 'Not Set'} color={hasProperty ? '#137333' : '#e37400'} />
        <StatusCard icon="📄" label="Sitemap" value={hasSitemaps ? 'Submitted' : 'Not Submitted'} color={hasSitemaps ? '#137333' : '#6d7175'} />
      </div>

      {/* Progress stepper */}
      <SCard title="Google Search Console Status">
        <div style={{ display:'flex', alignItems:'center', gap:0, padding:'8px 0' }}>
          <StatusStep done={step1} label="Connect Your Domain" />
          <div style={{ flex:0, height:3, width:60, background: step2 ? '#1a73e8' : '#e8eaed', margin:'0 4px', marginBottom:24 }} />
          <StatusStep done={step2} label="Verify Domain or Add New" />
          <div style={{ flex:0, height:3, width:60, background: step3 ? '#1a73e8' : '#e8eaed', margin:'0 4px', marginBottom:24 }} />
          <StatusStep done={step3} label="Submit Sitemap" />
        </div>

        {hasProperty && (
          <div style={{ marginTop:16, display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'#f6f8ff', border:'1px solid #c6d2ff', borderRadius:10, padding:'14px 18px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:'#e8eaf6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🌐</div>
                <div>
                  <div style={{ fontSize:11, color:'#6d7175', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:2 }}>Domain URL</div>
                  <div style={{ fontSize:14, fontWeight:600, color:'#202223' }}>{scProperty}</div>
                </div>
              </div>
              <Badge tone="success">Connected</Badge>
            </div>

            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'#f6fef6', border:'1px solid #b3e6b3', borderRadius:10, padding:'14px 18px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:'#e6f4ea', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>⚡</div>
                <div>
                  <div style={{ fontSize:11, color:'#6d7175', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:2 }}>Data Processing Status</div>
                  <div style={{ fontSize:14, fontWeight:600, color:'#202223' }}>Checked: {fmtDate(new Date().toISOString())}</div>
                </div>
              </div>
              <Badge tone="success">Active</Badge>
            </div>
          </div>
        )}
      </SCard>

      {/* Submit new sitemap */}
      <SCard title="Submit New Sitemap">
        {submitMsg && (
          <div style={{ marginBottom:14 }}>
            <Banner tone={submitMsg.type === 'success' ? 'success' : 'critical'}>{submitMsg.text}</Banner>
          </div>
        )}
        <div style={{ fontSize:13, color:'#6d7175', marginBottom:14 }}>
          Enter your sitemap URL below. For Shopify stores, your sitemap is usually at <code style={{ background:'#f1f2f3', padding:'2px 6px', borderRadius:4 }}>/sitemap.xml</code>
        </div>
        <InlineStack gap="200" blockAlign="end" wrap>
          <Box minWidth="320px">
            <TextField
              label="Sitemap URL"
              labelHidden
              type="url"
              placeholder={defaultSitemapUrl || 'https://yourstore.com/sitemap.xml'}
              value={newUrl}
              onChange={setNewUrl}
              autoComplete="off"
            />
          </Box>
          <Button
            variant="primary"
            onClick={() => { if (newUrl) submitMutation.mutate(newUrl); }}
            loading={submitMutation.isLoading}
            disabled={!newUrl}
          >
            Submit Sitemap
          </Button>
        </InlineStack>
        {hasProperty && (
          <Box paddingBlockStart="200">
            <Button variant="plain" onClick={() => setNewUrl(defaultSitemapUrl)}>
              Use default: {defaultSitemapUrl}
            </Button>
          </Box>
        )}
      </SCard>

      {/* Auto Sitemap Submission */}
      {can('autoSitemap') ? (
        <SCard title="🔄 Automatic Sitemap Submission">
          {autoSaved && <div style={{ marginBottom:12 }}><Banner tone="success">Auto-submit settings saved!</Banner></div>}
          <div style={{ fontSize:13, color:'#6d7175', marginBottom:16 }}>
            When enabled, your sitemap is automatically re-submitted to Google Search Console every day at 2 AM UTC.
            This keeps Google updated whenever your store content changes.
          </div>
          <Box paddingBlockEnd="400">
            <Checkbox
              label={autoEnabled ? 'Auto-Submit Enabled' : 'Auto-Submit Disabled'}
              checked={autoEnabled}
              onChange={setAutoEnabled}
            />
          </Box>
          {autoEnabled && (
            <Box paddingBlockEnd="300">
              <InlineStack gap="200" blockAlign="end" wrap>
                <Box minWidth="320px">
                  <TextField
                    label="Auto-submit URL"
                    labelHidden
                    type="url"
                    placeholder={defaultSitemapUrl || 'https://yourstore.com/sitemap.xml'}
                    value={autoUrl}
                    onChange={setAutoUrl}
                    autoComplete="off"
                  />
                </Box>
                {hasProperty && !autoUrl && (
                  <Button variant="plain" onClick={() => setAutoUrl(defaultSitemapUrl)}>Use default</Button>
                )}
              </InlineStack>
            </Box>
          )}
          <Button
            variant="primary"
            onClick={() => autoSaveMutation.mutate({ auto_sitemap_enabled: autoEnabled, auto_sitemap_url: autoUrl })}
            loading={autoSaveMutation.isLoading}
          >
            Save Auto-Submit Settings
          </Button>
        </SCard>
      ) : (
        <PlanGate feature="autoSitemap" required="growth">
          <div style={{ padding:24 }}>
            <div style={{ fontWeight:600, fontSize:14, marginBottom:4 }}>🔄 Automatic Sitemap Submission</div>
            <div style={{ fontSize:13, color:'#6d7175' }}>Auto-submit your sitemap to Google every day</div>
          </div>
        </PlanGate>
      )}

      {/* Submission History */}
      <div style={{ background:'#fff', border:'1px solid #e1e3e5', borderRadius:12, overflow:'hidden', marginBottom:20 }}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #e1e3e5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <Text variant="headingMd" as="h3" fontWeight="semibold">Submission History</Text>
          <Button variant="plain" onClick={() => refetch()}>↻ Refresh</Button>
        </div>

        {deleteMsg && (
          <div style={{ padding:'12px 20px' }}>
            <Banner tone={deleteMsg.type === 'success' ? 'success' : 'critical'}>{deleteMsg.text}</Banner>
          </div>
        )}

        {isLoading ? (
          <Box padding="800" textAlign="center"><Spinner /></Box>
        ) : error ? (
          <div style={{ padding:24, textAlign:'center', color:'#de3618' }}>
            {error?.error || 'Failed to load sitemaps. Ensure Search Console property is configured.'}
          </div>
        ) : sitemaps.length === 0 ? (
          <div style={{ padding:40, textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:12 }}>📄</div>
            <div style={{ fontSize:15, fontWeight:600, color:'#202223', marginBottom:8 }}>No sitemaps submitted yet</div>
            <div style={{ fontSize:13, color:'#6d7175' }}>Submit your first sitemap above to start tracking indexing status.</div>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  <th style={thS}>Sitemap URL</th>
                  <th style={{ ...thS, textAlign:'center' }}>Status</th>
                  <th style={{ ...thS, textAlign:'right' }}>Submitted URLs</th>
                  <th style={{ ...thS, textAlign:'right' }}>Indexed URLs</th>
                  <th style={{ ...thS, textAlign:'center' }}>Warnings</th>
                  <th style={{ ...thS, textAlign:'center' }}>Errors</th>
                  <th style={thS}>Last Submitted</th>
                  <th style={thS}>Last Downloaded</th>
                  <th style={{ ...thS, textAlign:'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {sitemaps.map((s, i) => {
                  const hasErrors   = s.errors > 0;
                  const hasWarnings = s.warnings > 0;
                  const statusTone  = hasErrors ? 'critical' : hasWarnings ? 'warning' : s.isPending ? 'attention' : 'success';
                  const statusLabel = hasErrors ? 'Error' : hasWarnings ? 'Warning' : s.isPending ? 'Pending' : 'Success';
                  return (
                    <tr key={i} style={{ background: i%2===0?'#fff':'#fafbfb' }}>
                      <td style={tdS}>
                        <a href={s.path} target="_blank" rel="noopener noreferrer"
                          style={{ color:'#1a73e8', fontSize:13, textDecoration:'none', wordBreak:'break-all' }}
                          onMouseOver={e=>e.currentTarget.style.textDecoration='underline'}
                          onMouseOut={e=>e.currentTarget.style.textDecoration='none'}>
                          {s.path}
                        </a>
                      </td>
                      <td style={{ ...tdS, textAlign:'center' }}>
                        <Badge tone={statusTone}>{statusLabel}</Badge>
                      </td>
                      <td style={{ ...tdS, textAlign:'right', fontWeight:600 }}>{fmt(s.submitted)}</td>
                      <td style={{ ...tdS, textAlign:'right' }}>
                        <span style={{ color: s.indexed > 0 ? '#137333' : '#6d7175', fontWeight:600 }}>{fmt(s.indexed)}</span>
                      </td>
                      <td style={{ ...tdS, textAlign:'center' }}>
                        {s.warnings > 0
                          ? <span style={{ color:'#e37400', fontWeight:600 }}>{s.warnings}</span>
                          : <span style={{ color:'#6d7175' }}>0</span>}
                      </td>
                      <td style={{ ...tdS, textAlign:'center' }}>
                        {s.errors > 0
                          ? <span style={{ color:'#de3618', fontWeight:600 }}>{s.errors}</span>
                          : <span style={{ color:'#6d7175' }}>0</span>}
                      </td>
                      <td style={{ ...tdS, fontSize:12, color:'#6d7175' }}>{fmtDate(s.lastSubmitted)}</td>
                      <td style={{ ...tdS, fontSize:12, color:'#6d7175' }}>{fmtDate(s.lastDownloaded)}</td>
                      <td style={{ ...tdS, textAlign:'center' }}>
                        <Button
                          tone="critical"
                          variant="secondary"
                          size="slim"
                          loading={deleting === s.path}
                          onClick={() => { setDeleting(s.path); deleteMutation.mutate(s.path); }}
                        >Remove</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Indexed summary */}
      {sitemaps.length > 0 && (
        <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
          {[
            { label:'Total Sitemaps',    value: sitemaps.length,                                       color:'#1a73e8' },
            { label:'Total URLs Submitted', value: fmt(sitemaps.reduce((a,s)=>a+s.submitted,0)),      color:'#1a1a1a' },
            { label:'Total URLs Indexed',   value: fmt(sitemaps.reduce((a,s)=>a+s.indexed,0)),        color:'#137333' },
            { label:'Sitemaps with Errors', value: sitemaps.filter(s=>s.errors>0).length,             color:'#de3618' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background:'#fff', border:'1px solid #e1e3e5', borderRadius:12, padding:'18px 22px', flex:1, minWidth:160 }}>
              <div style={{ fontSize:11, color:'#6d7175', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:6 }}>{label}</div>
              <div style={{ fontSize:26, fontWeight:700, color }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Info note */}
      <div style={{ marginTop:20, background:'#f6f8ff', border:'1px solid #c6d2ff', borderRadius:10, padding:'14px 18px', fontSize:13, color:'#3c4257' }}>
        <strong>Note:</strong> Google Search Console sitemaps page opens in a new tab for full details.{' '}
        <a href="https://search.google.com/search-console/sitemaps" target="_blank" rel="noopener noreferrer"
          style={{ color:'#1a73e8', fontWeight:600 }}>
          Open Google Search Console →
        </a>
      </div>
    </div>
  );
}
