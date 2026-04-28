import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Frame, Navigation, TopBar } from '@shopify/polaris';
import {
  HomeIcon, ChartVerticalIcon, SettingsIcon, InfoIcon,
  ConnectIcon, SearchIcon, MegaphoneIcon, EmailIcon,
} from '@shopify/polaris-icons';
import { useAuth } from '../../context/AuthContext';

const navItems = [
  { url: '/admin/dashboard',       label: 'Dashboard',        icon: HomeIcon },
  { url: '/admin/shops',           label: 'Shops / Users',    icon: ConnectIcon },
  { url: '/admin/plans',           label: 'Billing Plans',    icon: ChartVerticalIcon },
  { url: '/admin/subscriptions',   label: 'Subscriptions',    icon: MegaphoneIcon },
  { url: '/admin/admins',          label: 'Admin Users',      icon: SearchIcon },
  { url: '/admin/email-templates', label: 'Email Templates',  icon: EmailIcon },
  { url: '/admin/settings',        label: 'Settings',         icon: SettingsIcon },
];

export default function AdminLayout() {
  const { admin, loadMe, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileNavActive, setMobileNavActive] = useState(false);
  const [userMenuActive, setUserMenuActive] = useState(false);

  useEffect(() => { if (!admin) loadMe(); }, []);

  const handleNavClick = (url) => (e) => {
    e.preventDefault();
    navigate(url);
    setMobileNavActive(false);
  };

  const nav = (
    <Navigation location={location.pathname}>
      <Navigation.Section
        title="Google Console Admin"
        items={navItems.map(item => ({
          ...item,
          onClick: handleNavClick(item.url),
          selected: location.pathname === item.url,
        }))}
      />
    </Navigation>
  );

  const topBar = (
    <TopBar
      showNavigationToggle
      onNavigationToggle={() => setMobileNavActive(v => !v)}
      userMenu={
        <TopBar.UserMenu
          name={admin?.name || 'Admin'}
          detail={admin?.role?.replace('_', ' ') || ''}
          initials={(admin?.name || 'A')[0].toUpperCase()}
          open={userMenuActive}
          onToggle={() => setUserMenuActive(v => !v)}
          actions={[
            { items: [{ content: 'Logout', onAction: logout }] },
          ]}
        />
      }
    />
  );

  return (
    <Frame
      navigation={nav}
      topBar={topBar}
      showMobileNavigation={mobileNavActive}
      onNavigationDismiss={() => setMobileNavActive(false)}
    >
      <Outlet />
    </Frame>
  );
}
