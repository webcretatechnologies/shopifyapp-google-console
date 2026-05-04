import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { NavMenu } from '@shopify/app-bridge-react';
import {
  HomeIcon, CreditCardIcon, QuestionCircleIcon, SettingsIcon,
} from '@shopify/polaris-icons';
import { useShop } from '../../context/ShopContext';
import AiChat from '../AiChat';

// Order by user lifecycle: setup → configure → pay → reference.
const QUICK_LINKS = [
  { path: '/setup-guide', label: 'Google Setup',   icon: HomeIcon },
  { path: '/settings',    label: 'Settings',       icon: SettingsIcon },
  { path: '/billing',     label: 'Plan & Billing', icon: CreditCardIcon },
  { path: '/help',        label: 'Help & Guide',   icon: QuestionCircleIcon },
];

function QuickLinkButton({ to, label, icon: Icon, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
        font: 'inherit', fontSize: 13, fontWeight: 500,
        color: active ? '#fff' : 'var(--p-color-text)',
        background: active ? 'var(--p-color-bg-fill-brand)' : 'var(--p-color-bg-surface)',
        border: '1px solid ' + (active ? 'var(--p-color-bg-fill-brand)' : 'var(--p-color-border)'),
        transition: 'background 120ms, color 120ms, border-color 120ms',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--p-color-bg-surface-hover)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'var(--p-color-bg-surface)'; }}
    >
      <Icon style={{ width: 14, height: 14, fill: 'currentColor' }} />
      {label}
    </button>
  );
}

export default function AppLayout() {
  const { googleStatus } = useShop();
  const navigate = useNavigate();
  const location = useLocation();
  const qs = window.location.search;

  return (
    <>
      {/*
        Order by daily-use priority:
        1. Overview (Dashboard, Insights)
        2. Channel reports (Analytics, SEO, Google Ads)
        3. Findings & actions (AI Visibility, Site Audit)
        4. Project tools (Content, Sitemap)
        5. Catalog (Products)
        6. Setup (Connect Google) — last because it's done once
      */}
      <NavMenu>
        <a href={`/${qs}`} rel="home">Dashboard</a>
        <a href={`/insights${qs}`}>Insights</a>
        <a href={`/analytics${qs}`}>Analytics</a>
        <a href={`/seo${qs}`}>SEO</a>
        <a href={`/ads${qs}`}>Google Ads</a>
        <a href={`/ai-visibility${qs}`}>AI Visibility</a>
        <a href={`/site-audit${qs}`}>Site Audit</a>
        <a href={`/content${qs}`}>Content &amp; Schema</a>
        <a href={`/sitemap${qs}`}>Sitemap Manager</a>
        <a href={`/products${qs}`}>Products</a>
        <a href={`/connect-google${qs}`}>
          {googleStatus?.connected ? 'Connect Google' : 'Connect Google ⚠'}
        </a>
      </NavMenu>

      <div style={{
        display: 'flex', justifyContent: 'flex-end', gap: 8,
        padding: '12px 20px',
        borderBottom: '1px solid var(--p-color-border-secondary)',
        background: 'var(--p-color-bg)',
      }}>
        {QUICK_LINKS.map(link => (
          <QuickLinkButton
            key={link.path}
            label={link.label}
            icon={link.icon}
            active={location.pathname === link.path}
            onClick={() => navigate(`${link.path}${qs}`)}
          />
        ))}
      </div>

      <div style={{ padding: '20px' }}>
        <Outlet />
      </div>

      <AiChat />
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
