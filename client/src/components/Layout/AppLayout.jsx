import React from 'react';
import { Outlet } from 'react-router-dom';
import { NavMenu } from '@shopify/app-bridge-react';
import { useShop } from '../../context/ShopContext';

export default function AppLayout() {
  const { googleStatus } = useShop();
  const qs = window.location.search;

  return (
    <>
      <NavMenu>
        <a href={`/${qs}`} rel="home">Dashboard</a>
        <a href={`/products${qs}`}>Products</a>
        <a href={`/insights${qs}`}>Insights</a>
        <a href={`/seo${qs}`}>SEO</a>
        <a href={`/site-audit${qs}`}>Site Audit</a>
        <a href={`/ai-visibility${qs}`}>AI Visibility</a>
        <a href={`/sitemap${qs}`}>Sitemap Manager</a>
        <a href={`/analytics${qs}`}>Analytics</a>
        <a href={`/ads${qs}`}>Google Ads</a>
        <a href={`/connect-google${qs}`}>
          {googleStatus?.connected ? 'Connect Google' : 'Connect Google ⚠'}
        </a>
        <a href={`/settings${qs}`}>API Settings</a>
        <a href={`/setup-guide${qs}`}>Google Setup</a>
        <a href={`/billing${qs}`}>Plan &amp; Billing</a>
        <a href={`/help${qs}`}>Help &amp; Guide</a>
      </NavMenu>
      <div style={{ padding: '20px' }}>
        <Outlet />
      </div>
      <div style={{
        position: 'fixed', bottom: 8, right: 8, zIndex: 9999,
        background: '#1a1a1a', color: '#fff', padding: '4px 10px',
        borderRadius: 6, fontSize: 11, fontFamily: 'monospace',
        opacity: 0.85, pointerEvents: 'none',
      }}>
        build v4
      </div>
    </>
  );
}
