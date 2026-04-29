# Google Console Analytics — Shopify App
## Project Timeline (AI-Assisted Development)

This document lists every feature delivered, in plain English, with hours estimated for a **single full-stack developer paired with an AI coding assistant**. AI dramatically speeds up boilerplate, scaffolding, repetitive UI work, and cross-file edits. It helps less with platform-specific debugging (Shopify iframe quirks, OAuth, billing flows), where most of the time is still trial and error. All hours assume focused work — no meetings, no context switching.

---

## Phase 1 — Setup & Foundation

| # | Task | Description | Hours |
|---|---|---|---|
| 1 | Permanent Public URL | Configured a fixed secure URL that always points to the app, so merchants get a stable experience instead of a temporary preview link that changes. | 1h |
| 2 | Branding & Look-and-Feel | Made the app look and feel like a native Shopify app — same fonts, colors, spacing — so merchants don't feel like they've left Shopify. | 2h |
| 3 | Database Foundation | Designed the data structures that store shops, subscriptions, plans, audit data, AI runs, products, orders, settings, and email templates. | 3h |
| | **Subtotal** | | **6h** |

---

## Phase 2 — Core Analytics Pages

| # | Task | Description | Hours |
|---|---|---|---|
| 4 | Dashboard Page | Landing screen with at-a-glance numbers from Google Analytics, Search Console, and Google Ads. Switches between Basic and Advanced based on plan. | 4h |
| 5 | SEO / Search Console Page | Detailed view of how the store performs in Google search — clicks, impressions, queries, top pages, countries, devices, brand vs non-brand split. | 5h |
| 6 | Analytics Page (GA4) | Detailed Google Analytics view — sessions, users, pages, traffic sources, devices, e-commerce numbers, charted over time. | 5h |
| 7 | Google Ads Page | Campaign performance, cost, conversions, and revenue tracked from Google Ads inside the Shopify admin. | 3h |
| 8 | Sitemap Manager | Lets merchants submit and remove sitemaps to Google Search Console without leaving Shopify. | 2h |
| | **Subtotal** | | **19h** |

---

## Phase 3 — AI Visibility Feature

| # | Task | Description | Hours |
|---|---|---|---|
| 9 | AI Visibility Engine | Asks ChatGPT, Gemini, and other AI assistants questions about the merchant's store and tracks how often the store gets mentioned. Built with three free AI providers, automatically falls back if one fails. | 6h |
| 10 | AI Visibility Dashboard | Visual report showing the AI Visibility score, mentions count, citations, cited pages, and which AI providers picked the store up. | 4h |
| 11 | Prompts & History | Lets merchants edit which questions are asked of the AI, see results per question per provider, and review history of past runs. | 2h |
| | **Subtotal** | | **12h** |

---

## Phase 4 — Site Audit Feature

| # | Task | Description | Hours |
|---|---|---|---|
| 12 | Site Audit Crawler | Crawls the merchant's storefront and analyzes pages for SEO problems — broken links, missing tags, slow pages, duplicates. | 6h |
| 13 | Site Audit Report Page | Visual report with overall score, issues split by severity (critical / high / medium / low), pages crawled, and a table of every issue found. | 4h |
| 14 | Password-Protected Store Support | Lets merchants enter their storefront password securely so the audit can run on stores that aren't public yet. | 1h |
| | **Subtotal** | | **11h** |

---

## Phase 5 — Content & Schema Tools

| # | Task | Description | Hours |
|---|---|---|---|
| 15 | AI Product Description Generator | Picks any product, generates fresh description / title / meta tags with AI, edits, then publishes back to Shopify. | 5h |
| 16 | Product FAQs Generator | Generates frequently-asked-questions per product using AI; merchants can edit, reorder, and publish them. | 3h |
| 17 | Structured Markup (Schema) | Adds Google-readable JSON-LD code so products show up better in search results. Supports Product, FAQ, Breadcrumb, Organization. Paste-or-auto-inject. | 5h |
| 18 | Searchable Product Picker | A reusable search-as-you-type product picker with thumbnails, used by all three Content & Schema tools. | 1.5h |
| | **Subtotal** | | **14.5h** |

---

## Phase 6 — Insights & Reporting

| # | Task | Description | Hours |
|---|---|---|---|
| 19 | Insights Page | Operational insights — alerts (out-of-stock products with traffic), per-product SEO status, automated SEO suggestions, Ads-to-orders attribution. | 5h |
| 20 | Products Page | Shopify-admin-style product list synced from the store, with search, status filter, pagination, and inventory details. | 3h |
| 21 | Connect Google Page | Walks merchants through linking their Google account, choosing Search Console / GA4 properties, plus optional Google Ads ID. | 3h |
| | **Subtotal** | | **11h** |

---

## Phase 7 — Email System

| # | Task | Description | Hours |
|---|---|---|---|
| 22 | Transactional Email Foundation | Sends emails on key events — welcome, Google connected, subscription started, audit complete, AI complete, stock alerts, weekly reports. Includes professional HTML layout. | 4h |
| 23 | Per-Shop Email Preferences | Lets each merchant pick which non-critical emails they want, and which day to receive the weekly report. | 1.5h |
| 24 | Plan Reminder Email | Auto-sends a reminder 24 hours after install if the merchant hasn't picked a plan yet, listing what they get with a paid plan. | 1h |
| 25 | Admin Email Templates Editor | Super admin can rewrite the header, body, and footer of every email type, with click-to-insert variables and live preview. | 3.5h |
| | **Subtotal** | | **10h** |

---

## Phase 8 — Plan & Billing System

| # | Task | Description | Hours |
|---|---|---|---|
| 26 | Billing Plans Setup | Three plans (Starter / Growth / Pro) with price, trial days, features, and limits — all editable from the admin panel. | 2h |
| 27 | Billing Page (Merchant View) | Plan picker with cards side-by-side, current plan highlighted with a bold border, trial info in the footer, plus upgrade/downgrade buttons. | 3h |
| 28 | Subscribe / Activate Flow | Free plans activate instantly. Paid plans hand off to Shopify's payment screen, then return the merchant to the dashboard automatically. | 2.5h |
| 29 | Plan-Limit Enforcement | When a plan has a limit (e.g. 100 products, 500 keywords), the app shows only that many in lists and counts, with an upgrade banner. | 2h |
| 30 | Feature Locks (Plan Gates) | Premium features show a blurred preview with an "Upgrade Required" card when not included in the merchant's plan. | 2h |
| 31 | Per-Shop Extra Features (Add-ons) | Super admin can grant any feature to any shop manually, with the amount paid recorded. The merchant gets the feature unlocked instantly. | 2h |
| | **Subtotal** | | **13.5h** |

---

## Phase 9 — Super Admin Panel

| # | Task | Description | Hours |
|---|---|---|---|
| 32 | Admin Login & Sessions | Secure login for the super admin, with sessions that last 7 days and verify properly so the panel never opens on a stale session. | 2h |
| 33 | Admin Dashboard | Top-level numbers — total shops, active subscriptions, recent installs. | 1.5h |
| 34 | Shops / Users Management | Searchable, filterable table of every store using the app, with deactivate and feature-grant actions. | 2h |
| 35 | Billing Plans Management | Create, edit, activate, deactivate plans. Tick which features each plan includes. Set price, trial days, and product/order/keyword limits. | 3h |
| 36 | Subscriptions Management | View every active and past subscription, with status, plan, and trial info. | 1.5h |
| 37 | Admin Users Management | Add/remove other super admins, set roles, deactivate accounts. | 1.5h |
| 38 | Runtime Settings | Edit SMTP settings, AI API keys, Shopify keys, and other configuration from the admin panel without touching server files. | 2h |
| | **Subtotal** | | **13.5h** |

---

## Phase 10 — Embedded App Polish

| # | Task | Description | Hours |
|---|---|---|---|
| 39 | Top Quick-Access Bar | Sticky top bar with one-click access to Google Setup, Plan & Billing, Help, and Settings — visible on every page. | 0.5h |
| 40 | Setup Guide Page | Step-by-step onboarding checklist for new merchants. | 1.5h |
| 41 | Help & Guide Page | Self-serve help content explaining how each feature works. | 1h |
| 42 | Shop Settings Page | Merchant-facing settings — Google credentials, brand keywords, email preferences, default date range, structured markup config. | 3h |
| | **Subtotal** | | **6h** |

---

## Phase 11 — Stability & Bug Fixes

| # | Task | Description | Hours |
|---|---|---|---|
| 43 | Multi-LLM Failover | When one AI provider fails, the system automatically tries the next one so the merchant always gets a result. | 1h |
| 44 | Database Schema Stability | Fixed a problem where database indexes were piling up on every restart and would eventually break the app. | 1h |
| 45 | Embedded App Iframe Fixes | Solved Shopify iframe quirks that were causing the app to occasionally show blank or refresh in a loop. | 2h |
| 46 | Admin Session Stability | Fixed intermittent admin panel failures where the panel would sometimes load blank or kick the admin out unexpectedly. | 1.5h |
| 47 | UI Polish & Layout Fixes | Product table column alignment, chart colors, button states, loading spinners, dashboard tier exclusivity (only one of Basic/Advanced per plan). | 3h |
| | **Subtotal** | | **8.5h** |

---

## Phase 12 — Deployment

| # | Task | Description | Hours |
|---|---|---|---|
| 48 | Source Control & PRs | Set up the project on GitHub with feature branches and pull requests so changes are reviewable. | 0.5h |
| 49 | Local Development Environment | Containerized local setup so the project runs identically on any machine. | 1h |
| | **Subtotal** | | **1.5h** |

---

## Grand Total

| Phase | Hours |
|---|---|
| 1. Setup & Foundation | 6h |
| 2. Core Analytics | 19h |
| 3. AI Visibility | 12h |
| 4. Site Audit | 11h |
| 5. Content & Schema | 14.5h |
| 6. Insights & Reporting | 11h |
| 7. Email System | 10h |
| 8. Plan & Billing | 13.5h |
| 9. Super Admin Panel | 13.5h |
| 10. Embedded App Polish | 6h |
| 11. Stability & Bug Fixes | 8.5h |
| 12. Deployment | 1.5h |
| **Total** | **≈ 126 hours** |

---

## Calendar Estimate

Assuming 6–8 hours of focused work per day:

- **Working Days:** 16 – 21 days
- **Calendar Weeks (5-day weeks):** 3 – 4 weeks

---

## Notes

- All times are **net development hours** — they exclude project management, stakeholder meetings, design reviews, QA cycles, and Shopify App Store submission.
- AI-assisted hours assume the developer **reviews and tests every change**. AI produces code quickly, but verification, integration, and platform-specific debugging time remain.
- Some Shopify-specific debugging (iframe behavior, OAuth, Protected Customer Data approval) takes the same time with or without AI — there is no shortcut around platform quirks.
- Compared to a typical (non-AI) developer timeline of ~360 hours, AI assistance reduces development effort by roughly **65%** on this kind of project (heavy on standard CRUD pages, dashboards, lists, and admin tools — exactly the pattern AI handles best).
