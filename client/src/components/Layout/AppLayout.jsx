import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Frame, Navigation } from '@shopify/polaris';
import {
  HomeIcon, ChartVerticalIcon, SearchIcon, MegaphoneIcon, ConnectIcon,
  SettingsIcon, InfoIcon, ProductIcon, AlertCircleIcon, QuestionCircleIcon,
  GlobeAsiaIcon,
} from '@shopify/polaris-icons';
import { useShop } from '../../context/ShopContext';

const globalStyle = `
  /* Make app nav sidebar same background as content — avoids conflict with Shopify's own sidebar */
  .Polaris-Frame__Navigation,
  .Polaris-Navigation {
    background-color: #f6f6f7 !important;
    border-right: 1px solid #e1e3e5 !important;
  }
  .Polaris-Navigation__Item:hover {
    background-color: #edeeef !important;
  }
  .Polaris-Frame {
    background-color: #f6f6f7 !important;
  }
`;

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { googleStatus } = useShop();

  // Preserve ?shop=&host= query string on all navigation so App Bridge stays initialized
  const qs = window.location.search;
  const navItem = (url, label, icon, extra = {}) => ({
    label,
    icon,
    selected: location.pathname === url,
    onClick: () => navigate(url + qs),
    ...extra,
  });

  const nav = (
    <Navigation location={location.pathname}>
      <Navigation.Section items={[
        navItem('/', 'Dashboard', HomeIcon),
        navItem('/products', 'Products', ProductIcon),
        navItem('/insights', 'Insights', AlertCircleIcon),
        navItem('/seo', 'SEO', SearchIcon),
        navItem('/sitemap', 'Sitemap Manager', GlobeAsiaIcon),
        navItem('/analytics', 'Analytics', ChartVerticalIcon),
        navItem('/ads', 'Google Ads', MegaphoneIcon),
        navItem('/connect-google', 'Connect Google', ConnectIcon,
          { badge: !googleStatus?.connected ? '!' : undefined }),
      ]} />
      <Navigation.Section
        title="Setup & Help"
        items={[
          navItem('/settings',    'API Settings',  SettingsIcon),
          navItem('/setup-guide', 'Google Setup',  InfoIcon),
          navItem('/help',        'Help & Guide',  QuestionCircleIcon),
        ]}
      />
    </Navigation>
  );

  return (
    <>
      <style>{globalStyle}</style>
      <Frame navigation={nav}>
        <div style={{ padding: '20px' }}>
          <Outlet />
        </div>
      </Frame>
    </>
  );
}
