# Khatabook ("Shiv Shankar Dairy") — Complete Technical & Product Specification

Reverse-engineered from the source code in `C:\Users\HARSH\Downloads\khatabook2\khatabook2\khata-app` (app folder). No code was modified.

Legend:
- Exact names/keys/routes are preserved verbatim.
- `UNVERIFIED FROM SOURCE` = behaviour implied but not provable from static code (server/config side).
- `NOT FOUND / NOT IMPLEMENTED` = feature absent from source.

---

## PART 1 — Product Overview

A single-page-app khatabook (ledger) for **Shiv Shankar Dairy** (a milk/dairy business), allowing the shop owner and optional staff employees to:

- Manage **customers** (parties) with a credit/debit ledger per customer.
- Sell goods producing **"You Gave"** (sold/credit) transactions with **itemized sales** (multi-product, per unit price, customer-specific custom prices), and record **"You Got"** (payment received) entries.
- Manage a **product catalogue** with sale price, purchase price, stock quantity, low-stock alerts, product groups, and **stock in/out** transactions.
- Track **employees** with optional **attendance** and **salary** management (monthly or daily).
- **Import sales from Excel** (Customer × Product matrix sheets) in bulk, and **export** the same matrix from a date range.
- Send **WhatsApp ledger reminders** to customers with a customizable message template.
- View a **public shared ledger** via a shareable link.
- Operate **offline-first**: all data is cached in `localStorage`, mutations are queued, and everything syncs to **Supabase** when back online, with realtime updates.
- View reports: day-wise / customer / bills / GST placeholders plus a real **Customer Transactions Report**, **Profit Report**, and **Inventory Report**.
- Admin manages a route for **collection** (collection_position), and a **distribution matrix** ordering for catalogue previews.

Primary entry: `https://shivshankardairy.vercel.app` (from `.env`), with a manual production-only PWA service worker.

Admin credentials in the database: system super-admin username `admin` / password `admin@2385` (see Part 8/34); a hardcoded fallback migration login `gopal` / `gopalchoudhary@123` exists in `src/pages/Signup.jsx`.

---

## PART 2 — Technology Stack

From `package.json`, `vite.config.js`, `index.html`:

| Layer | Choice |
|---|---|
| Framework | React 19 (ReactDOM client, StrictMode) + React Router DOM (BrowserRouter) |
| Build | Vite (v8 era config) + `@vitejs/plugin-react`, `@tailwindcss/vite` |
| Styling | Tailwind CSS 4 (utility classes; CSS vars `--background`, `--primary`, `--text-secondary`, etc. in `index.css`) |
| Backend/BaaS | Supabase JS v2 (`@supabase/supabase-js`), anon-key client |
| Persistence | localStorage (offline cache/queue/recycle bin/session) — see Part 12 |
| Excel | `xlsx` (dynamically imported inside `parseExcelWorkbook`) |
| Exports (planned) | `html2canvas`, `jspdf` listed as dependencies (used in... see Part 27 — NOT FOUND in current pages) |
| PWA | `vite-plugin-pwa` generates `sw.js`/manifest; manual `navigator.serviceWorker.register('/sw.js')` in production only |
| Tests | Node-based unit tests in `tests/*.test.js` (run via `npm test`) |
| State | Local React state + localStorage; no Redux/Zustand |
| Language | JavaScript (JSX); no TypeScript |

Environment (`src/lib/supabase.js`, `.env`):

- `VITE_SUPABASE_URL=https://nqciyviiizulkaipwwbi.supabase.co` (fallback hardcoded)
- `VITE_SUPABASE_ANON_KEY=sb_publishable_25O7qf9JI7G8g_EfZ0z2Yw_-vgJtF1z` (fallback hardcoded)
- `VITE_APP_URL=https://shivshankardairy.vercel.app` → used for ledger share links (`getAppUrl()`), fallback `window.location.origin`
- `createEphemeralSupabaseClient()` in `src/lib/supabase.js`: a plain client with no session persistence, used for password verification (EmployeeCredentialsEdit).

---

## PART 3 — Project Structure

```
khata-app/
├── index.html                  # #root, loads /src/main.jsx; title "Shiv Shankar Dairy"
├── package.json
├── vite.config.js              # Tailwind + React + VitePWA(precache/runtime caching)
├── .env / .env.example
├── vercel.json
├── public/                     # favicon.svg, icons (icon-192.png, icon-512.png, icon-512-maskable.png)
├── db/                         # 30 SQL files: schema, RPCs, RLS, realtime, seed (see Part 8-11)
├── tests/                      # unit tests (see Part 33)
└── src/
    ├── main.jsx                # initDB(); startAutoSync(); SW register (prod only)
    ├── App.jsx                 # <BrowserRouter><AppShell/> ; routes (Part 5); profile refresh; perf logging
    ├── index.css               # Tailwind + CSS custom props + theme; #khata-toast-container
    ├── components/
    │   ├── Header.jsx / Navbar.jsx / FloatingButton.jsx
    │   ├── CustomerCard.jsx / TransactionCard.jsx / SummaryCard.jsx
    │   ├── FilterModal.jsx / DeleteCustomerModal.jsx
    │   ├── AdminRoute.jsx / EmployeeRoute.jsx / ExcelRoute.jsx
    │   └── ImportStatusBadge.jsx
    ├── hooks/
    │   └── useSwipeNavigation.js
    ├── lib/
    │   ├── supabase.js               # client + createEphemeralSupabaseClient
    │   ├── offline/
    │   │   ├── db.js                 # cache/queue/meta/recycle localStorage layer (850 lines)
    │   │   ├── tableSchemas.js       # TABLE_COLUMNS allowlist + sanitizeTablePayload
    │   │   ├── offlineSupabase.js    # offline-first query client (549 lines)
    │   │   └── sync.js               # queue upload + snapshot refresh (372 lines)
    │   ├── liveSync.js               # realtime + delta catch-up for transactions
    │   ├── transactionService.js     # createGaveTransaction / updateGaveTransaction
    │   ├── transactionOrder.js / customerBalance.js / customerOrderingUtils, utils/customerOrdering.js
    │   ├── customerLedgerNavigation.js / dateKey.js / collectionQueue.js
    │   ├── permissions.js / adminAuth.js / creatorName.js
    │   ├── businessSettings.js / appUrl.js / reminderTemplate.js / reminderSession.js
    │   ├── salary.js / profitReport.js / reportFilters.js
    │   ├── excelImport.js / excelImportValidation.js / excelImportGrouping.js
    │   ├── excelExport.js / importLifecycle.js / importReversal.js
    │   ├── cataloguePreviewMatrix.js
    │   ├── toast.js / perf.js / ErrorBoundary.jsx
    └── pages/                   # 30+ route components (see Part 5)
```

---

## PART 4 — Build, Run, Config, PWA

- Test script: `npm test` runs the `tests/*.test.js` suite.
- `.env`: Supabase URL/anon key + `VITE_APP_URL`.
- `vite.config.js` PWA: `registerType:'autoUpdate'`, `injectRegister:'auto'`, manifest name "Shiv Shankar Dairy", short_name "SSDairy", theme `#5cbdb9`, portrait standalone.
  - Workbox runtime caching: `NetworkFirst` for `\/rest\/v1\/.*$` (api-cache, 200 entries, 7 days); `StaleWhileRevalidate` for assets (`/assets/...` and images/fonts, 300 entries).
- `main.jsx` registers `/sw.js` manually only when not `development` and host isn't `localhost`/`127.0.0.1`, after `window load`.
- `initDB()` (Part 12) and `startAutoSync()` (Part 14) run before React render.
- `index.html` title is "Shiv Shankar Dairy"; favicon `/favicon.svg`.

---

## PART 5 — Routing Map

React Router v7 (BrowserRouter). Guards: `AdminRoute`, `EmployeeRoute`, `ExcelRoute`, and inline `ErrorBoundary`.

| Path | Element | Guard |
|---|---|---|
| `/` | Home (redirect by role, else Login) | — |
| `/home` | Home | — |
| `/admin` | Signup (AdminLogin) | — |
| `/employee/home` | EmployeeHome | EmployeeRoute |
| `/admin/home` | AdminHome | AdminRoute |
| `/admin/employees/setup` | EmployeeSetup | AdminRoute |
| `/admin/employees/:id` | EmployeeDetails | AdminRoute |
| `/admin/employees/:id/edit` | EmployeeEdit | AdminRoute |
| `/admin/employees/:id/credentials` | EmployeeCredentialsEdit | AdminRoute |
| `/admin/employees/:id/payment` | SalaryPayment | AdminRoute |
| `/admin/employees/:id/payment/:paymentId` | PaymentDetail | AdminRoute |
| `/admin/employees/:id/summary` | EmployeeSalarySummary | AdminRoute |
| `/admin/staff` | StaffDashboard | AdminRoute |
| `/admin/staff/new` | CreateEmployee | AdminRoute |
| `/admin/excel` | ExcelImportPage | ExcelRoute |
| `/admin/excel/:importId` | ExcelImportDetail | ExcelRoute |
| `/admin/reminder` | ReminderPage | AdminRoute |
| `/admin/reports/customer-transactions` | CustomerTransactionsReport | — (open) |
| `/admin/reports/customer-transactions/:id` | TransactionDetailPage | — |
| `/admin/reports/profit` | ProfitReport | AdminRoute |
| `/admin/reports/profit/group/:groupId` | ProfitReport | AdminRoute |
| `/customers/add` | CustomerListPage (contact picker) | — |
| `/party/new` | CustomerForm (ErrorBoundary) | — |
| `/customer/:id` | CustomerDetails | — |
| `/customer/:id/profile` | CustomerProfile | — |
| `/customer/:id/transaction` | TransactionEntry | — |
| `/customer/:id/payment` | TransactionEntry (got) | — |
| `/customer/:id/transaction/success` | TransactionSuccess | — |
| `/transaction/:id` | TransactionDetailPage | — |
| `/catalogue/preview` | CataloguePreview | — |
| `/admin/stock-in-excel` | StockInExcelImportPage | AdminRoute |
| `/admin/stock-in-excel/:importId` | StockInExcelImportDetail | AdminRoute |
| `/catalogue/add` | AddProductPage | — |
| `/product/:id` | ProductDetails | — |
| `/product/:id/edit` | EditProductPage | — |
| `/product/:id/stock-in` | StockEntry | — |
| `/product/:id/stock-out` | StockEntry | — |
| `/product/:id/stock-in/:txId/edit` | StockEntry (edit) | — |
| `/product/:id/stock-out/:txId/edit` | StockEntry (edit) | — |
| `/product/:id/stock-success` | StockSuccess | — |
| `/catalogue/reports` | InventoryReport | — |
| `/share/customer/:id` | SharedLedgerView (public) | — |
| `/settings` | SettingsPage | — |
| `/settings/product-groups` | ProductGroupsPage | — |
| `/settings/admins` | AdminProfilesPage | AdminRoute |
| `/settings/recycle-bin` | RecycleBinPage | — |
| `/settings/reminder-message` | ReminderMessageEditor | — |
| `/settings/collection-route` | CollectionRouteEditor | AdminRoute |
| `/settings/downloadexcel` | DownloadExcelPage | — |

`AppShell` extras:
- On navigation from `/admin/reports/customer-transactions` to `/admin/home` (or `/employee/home`), sets `sessionStorage["customer-transactions-reset-on-home-return"]="1"` (consumed by CustomerTransactionsReport to reset).
- On mount, if role=admin and online, refreshes `khata_profile_name` from `admin_profiles` by username.
- `recordRouteChange(pathname)` per navigation (perf).

`Home` behavior: reads `khata_role`; admin→`/admin/home`; employee→`/employee/home`; otherwise renders `Login` (staff login).

---

## PART 6 — Authentication

### Admin (`/admin`, `src/pages/Signup.jsx`)
- Reads `admin_profiles` (all rows: `id, profile_name, username, password_hash, password_salt`).
- Verifies: find matching `username`; `hashPassword(password, salt)` must equal stored `password_hash` (PBKDF2-SHA256, 100,000 iterations, 256-bit → base64; salt = 16 random bytes → base64 — `src/lib/adminAuth.js`).
- On success writes `localStorage`: `khata_role="admin"`, `khata_user=<username>`, `khata_profile_name=<profile_name>`; navigates `/admin/home`.
- **Hardcoded fallback migration** (UNVERIFIED from prod DB): if username `gopal` with password `gopalchoudhary@123`, auto-inserts the account into `admin_profiles` (PBKDF2-hashed) and logs in. Reset if the row already exists.

### Staff/Employee (`src/pages/Login.jsx`, shown at `/`)
- Employee AUTH is real Supabase Auth: `supabase.auth.signInWithPassword({ email: `${username}@example.com`, password })`.
- Fetches `employees.permission_level, permissions_enabled` by username.
- On success writes `khata_role="employee"`, `khata_user=<username>`, `khata_permission_level=<level>`; navigates `/employee/home` with `state: { username }`.

### Credentials management
- `src/pages/CreateEmployee.jsx` / `EmployeeCredentialsEdit.jsx` use `{username}@example.com` as the email.
- `admin_update_employee_auth` RPC (SECURITY DEFINER) writes password/email to `auth.users`/`auth.identities` directly (Part 9); app passes `p_user_id = employee.auth_id`, `p_email = ${username}@example.com`, `p_confirm_email: true`.
- EmployeeCredentialsEdit verifies a password via `createEphemeralSupabaseClient().auth.signInWithPassword(...)` then signs out immediately.

### Session guard (`EmployeeRoute`)
- Verifies `supabase.auth.getSession()` while online; refreshes `permission_level` from DB into `khata_permission_level`.

### Logout (`SettingsPage`)
- Clears `khata_role`, `khata_user`, `khata_profile_name`; calls `supabase.auth.signOut()`.

---

## PART 7 — Roles & Permission Model

`src/lib/permissions.js` — based on `localStorage.khata_role` and `khata_permission_level`.

| Level | Actions granted (ACTIONS_BY_LEVEL) |
|---|---|
| 1 (employee default) | view_customers, view_customer_details, view_transactions, send_reminders, search, filter, view_reports |
| 2 | adds: add_customer, add_transaction, add_product, stock_entry, excel_access |
| 3 | adds: edit_customer, delete_customer, edit_transaction, delete_transaction, edit_product, delete_product |

- `getPermissionLevel()`: `khata_role==="admin"` → 3; employee → `khata_permission_level` (or 1).
- `can(action)` → boolean. `requirePermission(action)` → boolean + toast error `"Permission denied. Contact the administrator."` when denied.
- `requireAdmin()` → boolean; uses `khata_role`.
- Component guards: `AdminRoute` (admin only, redirects employee→`/employee/home`, anonymous→`/`), `EmployeeRoute` (employee only; admin→`/admin/home`), `ExcelRoute` (admin OR employee with `khata_permission_level >= 2`; Excel access = level 2 "excel_access").
- Navbar shows the Excel tab to employees only when their stored `khata_permission_level >= 2`.
- Employee permission labels (multiple screens): L1 "View Entries & Send Reminders", L2 "Add & View Entries/Parties", L3 "Add, View, Edit, Delete: Entries/Parties". Short chips: 1="View", 2="Party", 3="Full".

Password hashing (`src/lib/adminAuth.js`): PBKDF2, 250,000 iterations NOT used → **100,000** iterations, SHA-256, dkLen 32 bytes → base64. `SYSTEM_ADMIN_USERNAME="admin"`, `SYSTEM_ADMIN_PROFILE_NAME="Super Admin"`; system admin filtered from AdminProfilesPage and cannot be edited/deleted.

---

## PART 8 — Database Schema (Supabase `public`)

Source: `db/*.sql`. All tables client-accessed with the **anon key**; for data tables **RLS is disabled** (only `storage.objects` policies exist — Part 10). Column notes: `serial` = auto integer PK; "migration" = added by later `db/#.sql` file.

### `customers`
id serial PK · name text NOT NULL · phone text · type text DEFAULT 'customer' · created_by text · created_at timestamptz DEFAULT now() · updated_at timestamptz DEFAULT now() (trigger `customers_set_updated_at`) · route_position int (migrate_customers_add_route_position) · matrix_position int · collection_position int (migrate_customers_split_positions) · address text · gstin text · photo_url text (migrate_customers_add_profile_fields) · auto_sms_enabled boolean DEFAULT false (migrate_customers_add_auto_sms).
Indexes: `customers_created_at_idx(created_at DESC)`, `idx_customers_route_position`, `idx_customers_matrix_position`, `idx_customers_collection_position`. Realtime: added conditionally (enable_customers_realtime.sql).

### `transactions`
id serial PK · customer_id int NOT NULL FK→customers(id) ON DELETE CASCADE · type text NOT NULL CHECK IN ('gave','got') · amount numeric NOT NULL · description text · payment_mode text DEFAULT 'cash' CHECK IN ('cash','online') · date date DEFAULT now() NOT NULL · created_by text · created_at timestamptz DEFAULT now() · sync_operation_id text UNIQUE (comment-added) · activity_at timestamptz DEFAULT now() (add_transaction_activity_at.sql; backfilled from created_at) · balance_after_transaction numeric (migrate_reports_indexes.sql) · import_history_id uuid FK→import_history(id) ON DELETE RESTRICT (extend_import_history_batch_reversal.sql).
Indexes: customer_id, created_at DESC, type, activity_at DESC, import_history_id.

### `transaction_items`
id serial PK · transaction_id int FK→transactions(id) ON DELETE CASCADE · product_id int FK→products(id) ON DELETE CASCADE · quantity numeric NOT NULL · price numeric NOT NULL (price at time of sale) · created_at timestamptz DEFAULT now() · sync_operation_id text UNIQUE (comment-added).
Indexes: transaction_id, product_id.

### `products`
id serial PK · name text NOT NULL · sale_price numeric DEFAULT 0 · purchase_price numeric DEFAULT 0 · stock_quantity numeric DEFAULT 0 · low_stock_limit numeric DEFAULT 0 · unit text DEFAULT 'PCS' · image_url text · created_by text · created_at timestamptz DEFAULT now() · updated_at timestamptz DEFAULT now() · group_id int FK→product_groups(id) ON DELETE SET NULL (create_product_groups_table.sql).
Indexes: created_at DESC, group_id.

### `product_transactions`
id serial PK · product_id int FK→products(id) ON DELETE CASCADE · type text NOT NULL (comment: 'stock_in','stock_out'; NO CHECK) · quantity numeric NOT NULL · price numeric · notes text · created_by text · created_at timestamptz DEFAULT now() · import_history_id uuid FK→import_history(id) ON DELETE RESTRICT (extend_stock_in_import_reversal.sql).
Indexes: product_id, import_history_id.

### `customer_product_prices`
id SERIAL PK · customer_id int NOT NULL FK→customers(id) CASCADE · product_id int NOT NULL FK→products(id) CASCADE · custom_price NUMERIC NOT NULL CHECK >=0 · created_at/updated_at timestamptz. UNIQUE(customer_id, product_id). Realtime added.

### `product_groups`
id serial PK · name text NOT NULL UNIQUE · created_at/updated_at. Indexes name, products.group_id.

### `employees`
id SERIAL PK · username TEXT NOT NULL UNIQUE · auth_id TEXT · created_by TEXT NOT NULL · created_at timestamptz DEFAULT now() + (migrate_employees_add_permissions_salary.sql) attendance_enabled BOOLEAN DEFAULT false · permissions_enabled BOOLEAN DEFAULT false · salary_type TEXT · salary_amount NUMERIC · salary_start_date DATE · permission_level INTEGER DEFAULT 1. Realtime added.
NOTE (UNVERIFIED FROM SOURCE): attendance/salary FKs declare `employee_id UUID REFERENCES employees(id)` while `employees.id` is SERIAL — a type mismatch unless the live DB altered it.

### `employee_attendance`
id UUID gen_random_uuid() PK · employee_id UUID FK→employees(id) CASCADE (mismatch note) · date DATE NOT NULL · status TEXT NOT NULL CHECK IN ('present','absent','paid_leave','half_day') · created_at. UNIQUE(employee_id, date). Realtime added conditionally.

### `salary_payments`
id UUID gen_random_uuid() PK · employee_id UUID NOT NULL FK→employees(id) CASCADE · amount NUMERIC NOT NULL CHECK >0 · notes TEXT DEFAULT '' · payment_date DATE NOT NULL · created_at DEFAULT now(). Indexes employee_id, payment_date.

### `business_settings`
id INTEGER DEFAULT 1 PK · settings JSONB DEFAULT '{}' NOT NULL · updated_at. CONSTRAINT `single_row`: CHECK (id = 1). Seeded row (1,'{}'). Realtime added.

### `admin_profiles`
id SERIAL PK · profile_name TEXT NOT NULL · username TEXT NOT NULL UNIQUE · password_hash TEXT NOT NULL · password_salt TEXT NOT NULL · created_at/updated_at. Seed: 'Super Admin'/'admin' (`create_super_admin.sql`; password hash for `admin@2385`).

### `import_history`
id uuid gen_random_uuid() PK · filename text NOT NULL · uploaded_at timestamptz DEFAULT now() NOT NULL · uploader text NOT NULL · file_hash text NOT NULL · sheet_name text · parsed_preview jsonb DEFAULT '[]' NOT NULL · import_statistics jsonb DEFAULT '{}' NOT NULL · validation_report jsonb DEFAULT '{}' NOT NULL · status text (post-migration CHECK IN ('processing','imported','deleted','restored','failed')) · is_reimport boolean DEFAULT false · source_import_id uuid FK→import_history(id) ON DELETE SET NULL · deleted_at/deleted_by/restored_at/restored_by (extend_import_history_batch_reversal.sql). Indexes uploaded_at DESC, file_hash.

### `recycle_bin`
id uuid PK · entity_type text NOT NULL · entity_id text · entity_name text · deleted_at timestamptz DEFAULT now() NOT NULL · deleted_by text · original_data jsonb DEFAULT '{}' NOT NULL · restore_deadline timestamptz DEFAULT now()+90 days NOT NULL. Indexes deleted_at DESC, entity_type. GRANT SELECT/INSERT/UPDATE/DELETE to anon, authenticated, service_role. Realtime added (conditional).

### `import_reversal_snapshots`
import_history_id uuid PK FK→import_history CASCADE · transactions jsonb NOT NULL · transaction_items jsonb NOT NULL · captured_at timestamptz DEFAULT now() NOT NULL.

### `import_batch_recycle_bin`
id uuid gen_random_uuid() PK · import_history_id uuid UNIQUE FK→import_history CASCADE · filename text NOT NULL · transaction_count integer DEFAULT 0 NOT NULL · deleted_at DEFAULT now() NOT NULL · deleted_by text NOT NULL · restore_deadline DEFAULT now()+90 days NOT NULL.

### Storage bucket `company-logos`
public bucket, file_size_limit 5,242,880 (5 MB), allowed MIME: image/png, image/jpeg, image/gif, image/webp. Logo object path: `company_logo`.

---

## PART 9 — RPC Functions (Supabase)

All plpgsql. Called with anon key; only `admin_update_employee_auth` has explicit GRANTs (anon, authenticated).

1. **`create_gave_transaction(p_customer_id integer, p_items jsonb, p_amount numeric, p_created_by text, p_created_at timestamptz, p_description text DEFAULT NULL) RETURNS transactions`** (v1, manual path):
   - INSERT transaction (type 'gave', description via `NULLIF(BTRIM(p_description),'')`).
   - Loop `jsonb_to_recordset(COALESCE(p_items,'[]'::jsonb)) AS item(product_id int, quantity numeric, price numeric)`: insert `transaction_items`; `UPDATE products SET stock_quantity = stock_quantity - quantity`; RAISE `'Product % does not exist'` if no product row matched.
   - Returns the created transaction.

2. **`create_gave_transaction(..., p_import_history_id uuid, p_description text DEFAULT NULL)`** (overload, import path — extend_import_history_batch_reversal.sql): same, PLUS guard `'Import history % does not exist'` and writes `import_history_id`.

3. **`link_legacy_import_transactions(p_import_history_id uuid) RETURNS integer`**: for imports created before the import_history_id column, links `type='gave'`, `import_history_id IS NULL`, `created_by = uploader` transactions within `[uploaded_at − 15 min, window_end)` (window_end = `LEAST(uploaded_at + 6h, next upload of same uploader)`), matching a single-line item (product_id, quantity) exactly with no second item; only if candidate count == expected `import_statistics.transactionsCreated` AND no unrelated unlinked txns by that uploader overlap, else raises `'Legacy import linkage is ambiguous...'`. Updates `import_history_id`; returns count.

4. **`delete_import_batch(p_import_history_id uuid, p_actor text) RETURNS integer`** (v2, extend_stock_in_import_reversal.sql): locks import_history; guards: contains "already been deleted.", "Only imported or restored batches can be deleted."
   - Stock-In branch (`sheet_name = 'Stock In'`): snapshot `product_transactions`, error if empty, upsert snapshot (`transaction_items='[]'`), roll back product stock, delete the product_transactions, status→'deleted', upsert recycle-bin row (90-day deadline), return count.
   - Ledger branch: optional legacy linkage; snapshot transactions+items into `import_reversal_snapshots`; restore product stock (`+ SUM(item.quantity)`); DELETE transactions; status→'deleted'; upsert recycle-bin row.

5. **`restore_import_batch(p_import_history_id uuid, p_actor text) RETURNS integer`** (v2): guards "This import is not deleted." / "Import reversal snapshot not found". Stock-In: re-insert product_transactions with original ids, re-add stock. Ledger: re-insert transactions + transaction_items including original `id` (jsonb_populate_recordset), re-deduct stock; status→'restored'; DELETE recycle-bin row; return restored_count.

6. **`permanently_delete_import_batch(p_import_history_id uuid) RETURNS void`**: only when status='deleted'; deletes `import_batch_recycle_bin` + `import_reversal_snapshots` rows.

7. **`admin_update_employee_auth(p_user_id uuid DEFAULT null, p_password text DEFAULT null, p_email text DEFAULT null, p_confirm_email boolean DEFAULT true) RETURNS jsonb`** (SECURITY DEFINER): resolves auth user by lowercase email (auth.users.email OR auth.identities.provider_id where provider='email', earliest created_at wins), falls back to p_user_id; bcrypt (cost 10) into `auth.users.encrypted_password`; updates email + clears `email_change` tokens when changed; updates identity `provider_id` + `identity_data{email,email_verified:true}`; sets `email_confirmed_at` when `p_confirm_email`. Returns `{"ok":bool,"user_id","email"}` or `{"ok":false,"error":"auth user not found"}`.

8. **`set_updated_at()`** trigger function: `NEW.updated_at = now()` (used by `customers_set_updated_at` BEFORE UPDATE trigger on customers).

Also `fix_transaction_amount_rounding.sql` is a one-time data-repair: `amount = SUM(ROUND(quantity*price))` per transaction.

---

## PART 10 — RLS / Security Model

- **Data tables: RLS DISABLED.** `create_recycle_bin_table.sql` states explicitly that the app runs entirely client-side with the anon key and data tables have RLS disabled (consistent across the project); GRANTs on `recycle_bin` to anon/authenticated/service_role are provided.
- **Storage RLS policies (storage.objects)** exist for bucket 'company-logos': `Public Read Access` (SELECT), `Logo Upload Access` (INSERT), `Logo Update Access` (UPDATE), `Logo Delete Access` (DELETE) — each conditioned on `bucket_id = 'company-logos'`.
- **Security-relevant RPCs**: `admin_update_employee_auth` is SECURITY DEFINER (owner privileges; `set search_path = public, extensions`) and revokes PUBLIC then grants execute to anon+authenticated. All import-batch RPCs run as the anon caller.
- Note: because RLS is off and the anon key is embedded in the bundle, any client can read/write all public tables (app maintains authorization through permission checks + its own RBAC stored in admin_profiles/employees). This is by design for this app (UNVERIFIED FROM SOURCE for deployed DB hardening).

---

## PART 11 — Realtime Publications & Triggers

Publication `supabase_realtime` table set (from `db`):
- `customer_product_prices` (unconditional, create_customer_product_prices_table.sql)
- `employees` (unconditional)
- `business_settings` (unconditional)
- `employee_attendance` (conditional DO block)
- `customers` (conditional DO block)
- `recycle_bin` (conditional DO block)
- `transactions` is NOT in the publication list from SQL files, but `liveSync.js` opens a channel `admin-home-transactions-live` on `postgres_changes` for table `transactions` (INSERT/UPDATE/DELETE). NOTE (UNVERIFIED FROM SOURCE): whether the live DB added `transactions` to the publication is not provable from these files; if not added, realtime won't fire and only poll-based catch-up works.

Triggers: only `customers_set_updated_at` BEFORE UPDATE on `customers` → `set_updated_at()`.

---

## PART 12 — Offline Layer (localStorage, `src/lib/offline/db.js`)

### Keys
- `khata_offline_v2:cache` — `{ [table]: rows[] }` (JSON)
- `khata_offline_v2:queue` — array of operations
- `khata_offline_v2:meta` — `{ nextTempId, idMap, syncWatermarks }`
- `khata_offline_v2:recycle_bin:index` — array of local_uuids
- `khata_offline_v2:recycle_bin:item:<uuid>` — one key per recycle-bin entry
- `khata_offline_v2:recycle_bin` — legacy single-array (kept in sync for older readers)
- `khata_offline_v2:legacy_cleaned` — flag; on first `initDB()`, `indexedDB.deleteDatabase("myBusinessOfflineDB")` migrates away from the old IndexedDB store.

### Tables
`OFFLINE_TABLES` (14): customers, product_groups, products, transactions, transaction_items, customer_product_prices, product_transactions, employees, employee_attendance, salary_payments, business_settings, import_history, import_batch_recycle_bin, recycle_bin.
`SERVER_SNAPSHOT_REPLACE_TABLES` (13) = the same minus `business_settings`.

### Row invariants
- Every cached row may carry metadata: `local_uuid` (stable UUID), `synced` (true when confirmed on server), `deleted_locally` (tombstone), `__local_updated_at` (ISO).
- `normalizedRowKey`: `id:<serverId>` when `row.id` resolves (via idMap) or `local:<local_uuid>`; used to dedupe rows (later rows merge over earlier ones).
- `resolveServerId(table, id)` / `rememberServerId(table, localId, serverId)` maintain `meta.idMap["table:localId"]=serverId`.
- `createTempId()` returns negative ints (-1, -2, ...) from `meta.nextTempId`.
- `getAll(table)` returns cached rows with `deleted_locally` filtered out.

### Writes
- `saveFetchedData(rows, {protectUnsynced})`: merge server rows over cache; `protectUnsynced` prevents overwriting rows with `synced===false`; sets `synced:true`, `deleted_locally:false`.
- `replaceFetchedData(rows, {protectUnsynced})`: snapshot replace; preserves unsynced local rows absent from server payload.
- `upsertLocalRows`, `deleteLocalRows` (tombstone, optional `markUnsynced`), `removeLocalRows` (hard delete).
- `enqueueOperation`: writes queue entry `{id: UUID, created_at, updated_at, table, method, payload, options, filters, selectColumns}`; merges an `update`/`upsert` for a temp-id into a pending `insert` of the same row. Writes dispatch `sync-status` (CustomEvent) with `pending`/`synced`.
- `ensureQueueInsertIdempotencyKeys`: adds `sync_operation_id` (UUID) to insert payloads for `transactions`/`transaction_items` missing it.
- `rewriteLocalId`: after a successful server insert, merges local+server row into one real-id row and rewrites dependent rows' FK columns + queue payloads via `rewriteForeignKeys`/`rewriteFilters`.
- `FOREIGN_KEYS = ["customer_id","transaction_id","product_id","employee_id","group_id"]`; `rewriteForeignKeys` maps `customer_id→customers`, `transaction_id→transactions`, `product_id→products`, `employee_id→employees`, `group_id→product_groups`.
- `cancelQueuedDeletes(table, entityId)`: removes queued delete ops whose filters equal `id`.

### Recycle bin (local mirror)
- Per-item storage via `appendRecycleBinItem`/`putRecycleBinItem`/`removeRecycleBinItem`; `readRecycleBinRaw`/`writeRecycleBinRaw`; `reconcileRecycleBinFromServer(rows,{protectUnsynced})` — server rows are authoritative; pending local upserts/deletes preserved when protectUnsynced.
- `moveToRecycleBin(entityType, entityId, entityName, originalData, deletedBy)`: builds `{local_uuid, entity_type, entity_id, entity_name, deleted_at, deleted_by, original_data(JSON string), restore_deadline(+90d)}`, appends locally, and enqueues an `upsert` on `recycle_bin` with `onConflict:'id'` (id = local_uuid).
- `restoreFromRecycleBin(local_uuid, suppliedItem)`: for `transactions` restores `original_data.transaction` + `transaction_items`; for `customers` restores customer + `_transactions[]` (each `{transaction, transaction_items}`); otherwise `upsertLocalRows(entityType,[data])`; removes the item and enqueues a `delete` of the recycle_bin row.
- `permanentlyDeleteFromRecycleBin(local_uuid)`: removes locally + queued delete.
- `cleanupRecycleBin()`: drops expired entries (restore_deadline < now).
- `db` legacy object: Dexie-like API (`table().get/put/delete/bulkDelete/where().equals().first/toArray/delete/below().toArray`) used by RecycleBinPage to read raw items.

### Per-table column allowlists (`tableSchemas.js`)
`sanitizeTablePayload(table, payload)` strips any column not in `TABLE_COLUMNS[table]`; throws for unknown tables. Column lists match the schema in Part 8 (e.g. customers includes matrix_position, collection_position, auto_sms_enabled; transactions includes activity_at, import_history_id, sync_operation_id; products includes group_id; product_transactions includes import_history_id; employees includes the salary/permission columns; import_history includes deleted/restored fields; recycle_bin includes restore_deadline).

---

## PART 13 — Offline-First Client (`offlineSupabase`)

`offlineSupabase.from(table).select/insert/update/delete/upsert(...)` returns a thenable builder supporting: `.select(cols)`, `.single()`, `.maybeSingle()`, filters `.eq/neq/gt/gte/lt/lte/like/ilike/in/is`, `.order(col,{ascending})`, `.limit(n)`, `.range(from,to)`, `.then/.execute`. Also exposes `.auth` (=supabase.auth), `.storage`, `.rpc` (bound supabase.rpc), `.channel(name)` (offline → noop channel that rejects with "CLOSED"), `.removeChannel`. Hook `useOfflineFirst(table)` → `getAll()`/`getById(id)`.

Execution decision (`execute`):
- Non-OFFLINE table → online only (error with `offline:true` when offline).
- `isMutation && payloadHasTemporaryId` while online → still offline path (must queue temp-id writes).
- SELECT online: run offline query; serve from cache if `hasUsableCachedResult(cached)` OR `hasPendingTableOps(table)`; if cache usable AND non-empty, background-refresh cache (`refreshSelectCacheInBackground`); else query server (`executeOnline`) and refresh cache.
- SELECT offline: full in-memory filter/order/limit/range/select emulation.
- Mutations offline: build local rows (temp id, `created_at`, `sync_operation_id` for transactions/transaction_items, `synced:false`), `upsertLocalRows`, `enqueueOperation`, `scheduleSyncIfOnline` (dispatches `khata-sync-request`), dispatch `offline-saved` CustomEvent.
- Duplicate guard on offline insert into `customers`/`products`: name (trimmed, case-insensitive) collides → error `"Customer/Product already exists offline: <name>"`.

Filter semantics offline: `eq/neq/in` are string-compared; `gt/gte/lt/lte` raw; `is` strict equality; `like/ilike` convert `%` wildcards to substring (ilike case-insensitive). Order: undefined/null sort first when ascending etc., string compare with `{numeric:true}`. Relation hydration: `transaction_items` select containing `products(` hydrates `products` from cached products. `pruneStaleCustomerScopeRows` removes customer-scoped transactions that a server refresh says no longer exist (only for synced, non-deleted, matching-customer rows).

---

## PART 14 — Sync Engine (`sync.js`)

### Queue upload — `syncPendingData()`
- Guards: online + `!syncing`.
- Dispatch `sync-status` {pending}; purge ops for unsupported tables (`purgeUnsupportedQueueOps`); `ensureQueueInsertIdempotencyKeys`.
- Loops queue; each op → `executeOperation`:
  - `insert`: preparePayload (rewrite FKs, sanitize, drop temp id); upsert-with-`onConflict:"sync_operation_id"` for transactions/transaction_items when all rows have it, else insert; after success `rewriteLocalId` per row + `saveFetchedData` (server authoritative).
  - `upsert`: `.upsert(payload, options)` (recycle_bin uses onConflict id).
  - `update`: build query with filters; on success saveFetchedData.
  - `delete`: `.delete()` with filters; on success `removeLocalRows` matching filters.
- Success → `removeQueueItem(id)` + `refreshOfflineSnapshot({allowWhileSyncing:true})`.
- Failure → op retained (retried next cycle); log; first error surfaced in `sync-status` detail; loop continues (one failure does NOT block the queue).
- Final: `emitStatus(remaining? "pending" : "synced")`; when queue fully drained and online, `refreshOfflineSnapshot()` (after releasing the `syncing` flag).
- Guards module state: `syncing`, `refreshingSnapshot`.

### Snapshot refresh — `refreshOfflineSnapshot({allowWhileSyncing})`
- `canRefreshSnapshot`: online, not already refreshing, and (allowWhileSyncing || !syncing).
- For each OFFLINE_TABLE except `recycle_bin` (large blobs; synced via queue + read directly by RecycleBinPage): `fetchTableSnapshot`.
- `fetchTableSnapshot`: if table has `SYNC_TIME_COLUMNS` AND a watermark exists → incremental delta: `.select("*").or("col1.gt.<wm>,col2.gt.<wm>,...").limit(INCREMENTAL_CAP+1)`; if rows > INCREMENTAL_CAP → fall back full pull; if 0 rows → skip cache write (already current); else `saveFetchedData(protectUnsynced)` and advance watermark to max timestamp.
- Full pull: pages of 1000 ordered by `id asc`, `.range(from, from+999)`; error codes `42P01` (table missing) or `PGRST205` (range/composite issue) → silently return. `replaceFetchedData` for SERVER_SNAPSHOT_REPLACE_TABLES else `saveFetchedData`.
- Watermark columns (`SYNC_TIME_COLUMNS`):
  customers/products/product_groups: `[created_at, updated_at]`; transactions: `[activity_at]`; transaction_items/product_transactions/salary_payments: `[created_at]`; customer_product_prices: `[created_at, updated_at]`; import_history: `[uploaded_at, deleted_at, restored_at]`; import_batch_recycle_bin: `[deleted_at]`.

### Auto-start — `startAutoSync()`
- Listens `window 'online'` and `'khata-sync-request'` → `syncPendingData()`.
- On cold start while online: `setTimeout(()=>syncPendingData(),0)` (NO independent snapshot refresh at startup — those run only after the queue drains, to avoid clobbering local edits).

`isOnline()` = `navigator.onLine`.

---

## PART 15 — Live Transactions Sync (`liveSync.js`)

Hook `useLiveTransactions()` manages the realtime list of `transactions` for Home pages.

- Channel name: `"admin-home-transactions-live"`, `postgres_changes` INSERT/UPDATE/DELETE on `public.transactions`. Commits merge into cache (protected) + React list. DELETE removes from cache and state.
- In-memory `watermark` (non-persistent): may ONLY advance after a confirmed successful catch-up; realtime never moves it; seeded from cached max on mount.
- `CATCH_UP_MIN_GAP_MS = 15_000` throttling; triggers: online event, visibilitychange→visible, channel SUBSCRIBED.
- Baseline: paginate all transactions (order created_at DESC id DESC, 1000/page) → commit → set watermark.
- Catch-up digest: `fetchServerDigest` (newest `activity_at` + exact count via HEAD); `cacheDigest` (max timestamp + count of real ids).
- Decision: if online && no pending ops for transactions && cache NOT current → `fetchCompleteTransactionsSnapshot()` (≤3 attempts, `snapshotIsComplete` proof) then `reconcileFull` (additive repair via saveFetchedData; subtractive row pruning ONLY when snapshot is proven complete AND online AND row.synced true).
- Otherwise delta: `select(DELTA_COLUMNS).gt("activity_at", wm)` ordered by activity_at/id desc, pages of 1000 up to `MAX_DELTA_PAGES=5`; `hitCap` → full paginate+commit to keep watermark exact; else commit and advance watermark to returned max.
- `DELTA_COLUMNS`: id, customer_id, type, amount, date, payment_mode, description, created_by, created_at, activity_at, import_history_id.
- `mergeRows` protects `synced:false` local rows from server overwrite. Cache mutations serialized through a `cacheLock` promise chain.

---

## PART 16 — Transaction Model & Amount Math

- Types: `gave` (you sold / credit to customer) and `got` (payment received).
- Purchase flow (`transactionService.js`):
  - `createGaveTransaction({customerId, items, amount, createdBy, createdAt, importHistoryId, description})`:
    - Normalizes items to `{product, quantity:Number, price:Number}`.
    - `calculatedAmount = Σ Math.round(quantity × price)`; `transactionAmount = amount ?? calculatedAmount`; `transactionDescription = trimmed || null`; `activityAt = now()`.
    - If online: calls RPC `create_gave_transaction` with `p_customer_id, p_items[{product_id,quantity,price}], p_amount, p_created_by, p_created_at, p_import_history_id?, p_description?`. RPC also decrements stock server-side. On success it decrements the loaded product clones' `stock_quantity` and returns the transaction.
    - Error `PGRST202`/`42883` (function missing) → fall back to legacy offline multi-step write (imports REQUIRE the extended RPC; throws `"Import Batch Reversal is not configured. Run db/extend_import_history_batch_reversal.sql in Supabase first."`).
    - Legacy path: insert transactions (with `activity_at: now()`), insert transaction_items, decrement `products.stock_quantity` per item via offlineSupabase.
  - `updateGaveTransaction({transactionId, items, amount, createdAt, originalItems, description})`: computes stock deltas (+original qty, −new qty), applies per-product updates, deletes old transaction_items by transaction_id, inserts new items, updates `transactions.amount/description/created_at/activity_at`. (UNVERIFIED FROM SOURCE: no server-side RPC equivalent — concurrent stock can drift across devices.)
- Manual free-text entries (no items): amount entered directly (payment_mode default 'cash', option 'online').
- `sync_operation_id` gives idempotency for offline inserts of transactions/transaction_items.
- DB CHECK: transactions.type IN ('gave','got'); payment_mode IN ('cash','online').
- Rounding: amounts are per-line `Math.round(quantity*price)` summed (also enforced by `fix_transaction_amount_rounding.sql`).
- Field semantics (db/db comments + `transactionOrder.js`):
  - `created_at` = business date + original entry time-of-day (preserved across edits) → drives ledger grouping (`groupLedgerByBusinessDate`).
  - `date` = the day the row was actually created; never touched by edits; edit-stable basis for backdated detection.
  - `activity_at` = real last-modified system timestamp; used ONLY for Home/activity ordering so backdated entries sit above older same-day activity.

---

## PART 17 — Ledger Ordering & Balance Math

`src/lib/transactionOrder.js`:
- `businessDateKey(txn)` = `localDateKey(created_at || date)`; `entryDateKey(txn)` = `localDateKey(date || activity_at || created_at)`; `isBackdated(txn)` = entryDateKey > businessDateKey.
- `groupLedgerByBusinessDate(rows)`: groups by business date key, newest date first; entries marked backdated float ABOVE normal same-day entries (so an older correct edit to a previous day stays visible atop that day).
- `addRunningBalanceFromOldestDisplayed(rows)`: sorts oldest→newest, running balance: `type==='got' ? bal −= amount : bal += amount`.
- `splitByTodayActivity(customers, lastActivityMap)`: splits into "today's activity" vs older.
- `compareByCreatedDesc`: newest created_at first (ledger sort).

`src/lib/customerBalance.js`:
- `summarizeTransactions(rows)` → `{got, gave}` sums.
- `balanceFromTransactions(rows)` = `gave − got`.
- `buildBalanceMap(rows)` → `{customer_id: balance}` (got subtracts, everything else adds).
- DEBTOR vs CREDITOR: balance > 0 → the customer owes you ("You will get"/"You Get" — shown red/positive); balance < 0 → you owe the customer ("You will give" — shown green/negative).
- `fetchAllTransactions()` pages transactions 1000 at a time (all types).
- `isDeletedTransaction(row)` true for deleted_locally/deleted_at/is_deleted/deleted_by markers.

Customer sort/ordering (`src/lib/customerOrdering.js` + `src/utils/customerOrdering.js`):
- `sortCustomersByField(customers, field)` falls back to name localeCompare; `moveCustomerToFieldPosition` re-indexes positions 1..N; `persistFieldOrder` batch-updates via offlineSupabase.
- `sortCustomersByMatrix` / `moveCustomerToMatrixPosition` / `persistMatrixOrder` (matrix_position); `sortCustomersByCollection` / `moveCustomerToCollectionPosition` / `persistCollectionOrder` (collection_position). Position fallback default = `Number.MAX_SAFE_INTEGER`.

---

## PART 18 — Customer Workflows

### List & create
- `CustomerListPage` (`/customers/add`): Contact Picker API in DEV via `navigator.contacts.getAll/select`; caches contacts under `localStorage["khata_contact_cache"]`; search by name/phone; select → `/party/new` with `state:{name, phone}`; "Add Manually" → `/party/new`; permission states idle/requesting/granted/denied/unsupported.
- `CustomerForm` (`/party/new`): `requirePermission("add_customer")`; reads `loc.state.name/phone`; loads `products(id,name,sale_price)`; form fields name + phone + expandable Special Pricing (per-product `custom_price` inputs); on save: inserts `customers` (name, phone, created_by, collection_position = next max+1, matrix_position = next max+1), then batch-inserts `customer_product_prices`; navigates `/customer/:newId`.

### Details (`CustomerDetails`, 495 lines)
- Query: `offlineSupabase.from('customers').select('*').eq('id',id).single()`; ledger via `getAll('transactions')` filtered by customer_id (excludes deleted).
- Uses `addRunningBalanceFromOldestDisplayed`, `groupLedgerByBusinessDate`, `localDateKey`, `summarizeTransactions`, `buildBalanceMap`, permission `can()`, `getLedgerLink`, `getCustomerLedgerNavigationState`.
- Renders: customer header, balance summary, DateSeparator groups (en-IN date format), transaction cards, WhatsApp reminder button (fillTemplate), action links to payment/transaction entry/profile; "Edit" uses `can("edit_customer")`; delete via `requirePermission("delete_customer")` → `DeleteCustomerModal` → moves customer + transactions to recycle bin then deletes; supports navigation snapshot (`customerLedger`) so the report/ledger context persists.
- `getHomePath`: admin → `/admin/home`, employee → `/employee/home`.

### Profile (`CustomerProfile`, 429 lines)
- `can/requirePermission` for edit_customer/delete_customer.
- Editable rows: Name, Phone, Address, GSTIN; type toggle Customer/Supplier (`type`); auto SMS toggle (`auto_sms_enabled`); per-product special pricing (add/update/delete customer_product_prices rows keyed by customer_id+product_id).
- Delete flow: fetch `transactions` + `transaction_items`, `moveToRecycleBin('customers', id, name, {customer, _transactions:[{transaction, transaction_items}...]}, khata_user)` then delete customer; post-delete navigation to `/admin/home` or `/employee/home` per role.

### Ordering positions
- `collection_position` (collection route + EmployeeHome queue) and `matrix_position` (Distribution Matrix / Catalogue Preview) managed via Part 17 helpers.

---

## PART 19 — Transaction Entry Workflow

`TransactionEntry` (`/customer/:id/transaction` and `/customer/:id/payment`, 554 lines):
- Type detection: `isGot = pathname endsWith '/payment' || stateData?.type === 'got'`; else `gave`.
- Reads `stateData.editTransactionId` for edit mode; `getLocalDateInputValue` for the date input.
- Editable fields: date (business date), description, payment mode (cash/online), amount (free text) OR itemized products (qty × price, catalogue products with custom customer price fallback to sale_price).
- Save: `createGaveTransaction` (or `updateGaveTransaction` when editing); after a `got`/payment entry calls `moveCustomerToCollectionQueueEnd(customerId)` (Part 28). Permission: `requirePermission("add_transaction")` / for edit `requirePermission("edit_transaction")`.
- Reminder hook: loads saved template + can send prefilled WhatsApp link (`fillTemplate` with business data, `getLedgerLink`).
- Success screen `TransactionSuccess` (`/customer/:id/transaction/success`, 72 lines): shows amount (en-IN), type label ("Received"/"Sold"), buttons: "View Customer" (`navigate(-1)`), "Gave (Out)" and "Got (In)" to new entries preserving type.

Payment entries update the customer's `collection_position` order by moving them to the queue end (see Part 28).

---

## PART 20 — Product, Catalogue & Stock Workflows

### Add product (`AddProductPage`, `/catalogue/add`)
- `requirePermission("add_product")`; validation name + salePrice + purchasePrice required.
- Fields: name, unit, sale_price, purchase_price, stock qty, low_stock_limit, group (from product_groups).
- `created_by = (user id) || khata_user || "admin"`.
- Optional `openingStock > 0` → inserts `product_transactions` (type `stock_in`, price = purchase_price, notes `"Opening Stock"`).

### Product details (`ProductDetails`)
- Loads product, `product_transactions` (created_at desc), group name; realtime on products + product_transactions (per product filter).
- `stockValue = stock_quantity * purchase_price`; buttons: stock in/out, edit (can('edit_product')), stock entry (can('stock_entry')); entry edit links `/product/:id/stock-in|stock-out/:txId/edit`.

### Edit (`EditProductPage`)
- `requirePermission("edit_product")`; validation as add; delete via `requirePermission("delete_product")` and `moveToRecycleBin('products', id, name, product, khata_user)` then delete.

### Stock entry (`StockEntry`)
- Type derived from URL (`stock-in` vs `stock-out`); `requirePermission("stock_entry")` (or edit_product for edit mode).
- New entry price: stock_in uses `purchase_price`, stock_out uses `sale_price`; updates `products.stock_quantity` and inserts `product_transactions`.
- Edit mode recalculates: stock_in → `current − oldQty + newQty`; stock_out → `current + oldQty − newQty`.
- `StockSuccess` success screen with quantity/type, Add More Stock CTA.

### Catalogue preview (`CataloguePreview`)
- Uses `buildDistributionMatrixGrid(data, selectedDate)` (`cataloguePreviewMatrix.js`): filters transactions by `localDateKey(created_at||date) === selectedDate`, builds `grid[customerId][productId] = Σ quantity`, supports both `id` and `local_uuid` keys; customers sorted by `matrix_position`, products by catalogue order.

### Inventory report (`InventoryReport`)
- `products` ordered created_at desc; realtime channel `inventory-report-realtime` on products.
- Metrics: `totalUnits = Σ stock_quantity`, `totalValue = Σ stock_quantity × sale_price`, `lowStockCount` (qty ≤ low_stock_limit); sorts highest-value / lowest-value / highest-qty / lowest-qty / az; search; "Download Report" button → `alert("Download Report - Coming Soon")` (NOT IMPLEMENTED beyond alert).

### Product groups (`ProductGroupsPage`)
- CRUD on product_groups (name unique); delete moves products to group_id null; realtime channel `product-groups-realtime`.

---

## PART 21 — Employees, Attendance & Salary

### Setup (`EmployeeSetup`) & Create (`CreateEmployee`)
- Fields: username, password; toggles: attendance_enabled, permissions_enabled, salary_type ('monthly'|'daily'), salary_amount, salary_start_date, permission_level (1|2|3; full permissions forces 3).
- Create: if online → `auth.signUp({email: username@example.com, password})` → `admin_update_employee_auth(p_user_id, p_email, p_confirm_email:true)`; `created_by = getUser().user.id || "admin"`; insert employees row.

### Employee details (`EmployeeDetails`)
- Month calendar attendance (7-col, days from `getDaysInMonth`, firstDayOfWeek = `new Date(y,m,1).getDay()`).
- Attendance semantics: `present → delete record (default)`, else upsert `{employee_id, date, status}`; a past/today day with no explicit record counts as present when attendance_enabled AND after salary_start_date.
- Status colors: present `#2d6a4f` (green), absent `#e76f51`, paid_leave `#636e72`, half_day `#b45309`.
- Shows cumulative due (from salary_start_date), total payments, adjusted due (negative → "Advance"); realtime channel `employee-details-<id>` on attendance+payments.

### Staff dashboard (`StaffDashboard`)
- Employee cards with Due/Advance, permission chip (View/Party/Full), quick today-attendance `<select>`; totals card; search by username; `useSwipeNavigation` (left→/settings, right→/admin/excel); realtime `staff-dashboard-realtime` on employee_attendance/employees/salary_payments.

### Salary math (`src/lib/salary.js`)
- `getDaysInMonth(y,m)`; `isOnOrBeforeToday(d)`; `getMonthDateRange`; `attendanceFactor`: absent→0, half_day→0.5, else→1.
- `perDayRate`: monthly → `salary_amount / daysInMonth`; daily → `salary_amount`.
- `cumulativeDueSalary(employee, attendanceMap)`: accrued from salary_start_date to today.
- `calculateMonthSalary(...)` → `{totalSalary, payableSalary, present, absent, paidLeave, halfDay, worked}`.
- `monthlyPayments(payments, year, month)` filters by payment_date prefix.

### Payments (`SalaryPayment`, `PaymentDetail`)
- SalaryPayment: cumulativeDue − Σ payments = remainingDue (clamped ≥ 0); insert salary_payments (amount > 0).
- PaymentDetail: edit (amount/notes/payment_date) and delete via `moveToRecycleBin('salary_payments', ...)` + delete; entityName `Salary payment of ₹<amt> for <username> (<date>)`.

---

## PART 22 — Excel Import (Customer × Product Matrix)

### Page (`ExcelImportPage`, `/admin/excel`, 397 lines)
- Upload: drag/select .xlsx; `parseExcelWorkbook(arrayBuffer, catalogueProductNames)`; `catalogueProductNames = fetchAllCatalogueNames` (products page-size 1000).
- First-run guard: if `import_history` table missing, error code `42P01` → shows `"Import History is not configured. Run db/create_import_history_table.sql in Supabase first."`
- Flow: `excludeTotalSummaries` → `parseImportMatrix` → `collectExcelRowItems` → for each row `createGaveTransaction({customerId, items, amount: computed, createdBy, createdAt: now-simulated, importHistoryId, description})`. Result `EMPTY_REPORT = {unknownCustomers, unknownProducts, errors}`.
- Records `import_history` row: filename, file_hash (SHA-256 via `hashFile`), sheet_name, parsed_preview, import_statistics {customersProcessed, productsProcessed, transactionsCreated, rowsSkipped, unknownCustomers, unknownProducts, totalQuantityImported, processingTimeMs}, validation_report, status ('processing'→'imported'), uploader.

### Parser (`src/lib/excelImport.js`)
- `parseImportMatrix(matrix, sheetName, catalogueProductNames)`:
  - `serializableCell`: Date→ISO, numbers/booleans/null kept, else String.
  - Empty/blank matrix → throw `"Header row missing."`
  - When catalogueProductNames provided: scans rows for a cell headed `customer`/`customers` with ≥2 sibling cells matching catalogue product names (via `normalizeProductName`) → picks that as the header row; else throw "Header row missing.".
  - Column header requirements: first column must be "Customer" (else `'First column must contain customer names and be headed "Customer".'`); ≥2 columns (`"At least one product column is required."`); no blank product headers; unique normalized product names.
  - Returns `{sheetName, headers, rows: [{rowNumber, customerName, values[]}], preview}`.
- `parseExcelWorkbook`: dynamic `import("xlsx")`, `XLSX.read(arrayBuffer, {type:'array', cellDates:true})`; first sheet only; `sheet_to_json(header:1, defval:null, raw:true, range to usedRange.e)`; throws `"The selected file is not a readable Excel workbook."` / `"Header row missing."` when unreadable/empty.
- `quantityFromCell(cell)`: `{kind:'empty'}` for blank/0/NaN; `{kind:'quantity', quantity}` numeric (strips commas); `{kind:'invalid', message:'Quantity must be a number.'}`.
- Normalizers: `normalizeImportName` (NFKC, unicode-space collapse, remove zero-width chars, lowercase); `normalizeCustomerImportName` special-cases `shivshankardairy`; `normalizeProductName` converts `⁄`→`/`, `½`→`1/2`, normalizes "1 / 2", spaces.

### Validation & grouping
- `excelImportValidation.js`: `isTotalSummaryLabel` ("total"), `excludeTotalSummaries`, `buildPreviewSections` (splits preview at header boundaries for the detail page).
- `excelImportGrouping.js`: `collectExcelRowItems(inputMatrix, products, priceMap)` → per row builds one multi-item transaction; price = `priceMap.get("customerId:productId") ?? Number(product.sale_price)`; invalid cells counted as skipped with `"Row <n>, <ProductName>: <message>"`.

### Detail (`ExcelImportDetail`) / Stock-In variants
- Detail shows lifecycle badge (`ImportStatusBadge` → `getImportLifecycle`), info grid, stats, unknown customers/products, validation errors, preview tables.
- Statuses: `canDelete = ['imported','restored','completed','completed_with_errors']`; `isDeleted='deleted'`; `isProcessing='processing'`.
- Delete flows (all REQUIRE `navigator.onLine`): "Delete batch" `deleteImportBatch(importId, getImportActor())`; "Delete from list" (deleted entries) `permanentlyDeleteImportBatch`; "Abandoned processing" manual cleanup (delete transaction_items→transactions→import_history).
- `StockInExcelImportPage/Detail`: import_history filtered `sheet_name == 'Stock In'`; stats `productsImported`, `totalStockIn` (suffix " LTR"); same delete machinery via `delete_import_batch`.

---

## PART 23 — Excel Export

`src/lib/excelExport.js`:
- `buildTransactionExportMatrix({customers, products, transactions})` → matrix header `["Customer", ...product names]`; rows per customer with summed quantities from `transaction_items`; **only `transactions.type === 'gave'`** are exported; asserts unique customer/product names.
- `createTransactionWorkbookBytes`/`downloadTransactionWorkbook` generate the workbook with the `xlsx` library.
- `toInclusiveDateRange(startDate, endDate)` → `[startISO, endExclusiveISO)`; `toLocalDateInput`.

`DownloadExcelPage` (`/settings/downloadexcel`, 191 lines):
- Probes earliest transaction for min start date (`transactions.select('created_at').not('created_at','is',null)` oldest, limit 1, maybeSingle).
- Prepares export 200ms debounced with **stale-request guard** (`requestIdRef`).
- Data: customers `(id, name, collection_position, created_at)` ordered collection_position asc nullsFirst false, created_at desc; products (id, name, created_at) created_at desc, id desc; transactions `(id, customer_id, type, created_at, transaction_items(product_id, quantity))` for `type='gave'` within `[start, endExclusive)` ordered asc; paging PAGE_SIZE=1000 via `.range` loops.
- Validation `startDate > endDate` → error; requires ≥1 product (`"There are no catalogue products to export."`).
- **Filename:** `Transactions_<startDate>_to_<endDate>.xlsx`.

---

## PART 24 — Import History & Batch Reversal

- Lifecycle (`importLifecycle.js`): `getImportLifecycle(status)` → `{label, tone}` mapping deleted→deleted, restored→restored, failed→failed, processing→processing, default→imported.
- Client (`importReversal.js`): `getImportActor() = khata_user || "admin"`; calls RPCs `delete_import_batch(p_import_history_id, p_actor)`, `restore_import_batch(p_import_history_id, p_actor)`, `permanently_delete_import_batch(p_import_history_id)`.
- Reversal semantics (DB side, Part 9): reversible deletes snapshot into `import_reversal_snapshots`, restore stock, then move the batch to `import_batch_recycle_bin` (90-day deadline); restore re-inserts original rows with original ids and re-deducts stock.
- Stock-In imports (`sheet_name = 'Stock In'`) get the dedicated branch (product_transactions).
- Product stock transactions also carry `import_history_id` (extend_stock_in_import_reversal.sql) and are reversible.

---

## PART 25 — Recycle Bin (UI + local/global)

`RecycleBinPage` (`/settings/recycle-bin`, 547 lines):
- Loads global `recycle_bin` (`id, entity_type, entity_id, entity_name, deleted_at, deleted_by, restore_deadline` ordered deleted_at desc) + `import_batch_recycle_bin` (via offlineSupabase), and merges with local `getRecycleBin()` entries; dedupe by `local_uuid`; `deleted_at` desc sort.
- On mount runs `cleanupRecycleBin()` (drops expired local entries).
- Realtime channel `recycle-bin-global` on `recycle_bin` + `import_batch_recycle_bin` → reload.
- Server-managed rows flagged `server_managed:true`; excel-import entries surfaced from `import_batch_recycle_bin` as entity_type `"excel_import"` (original_data `{import_id, transaction_count}`), restore/delete REQUIRE online.
- Restore: reads raw `db.table('recycle_bin').get(local_uuid)` → `restoreFromRecycleBin(local_uuid, source)` → for excel_import calls `restoreImportBatch(importId, getImportActor())`; strips `local_uuid/synced/_transactions` before upserting (customer `_transactions` re-upserted too).
- Permanent delete: local `permanentlyDeleteFromRecycleBin` / for excel_import `permanentlyDeleteImportBatch`.
- `isExpired = restore_deadline < now`; displayName strips `"Transaction #<n> - "` prefix; `timeAgo` (mo/d/h/m ago); icons 💳 (transactions) / 👤 (customers) / 📦 (products) / 💸 (salary_payments) / XLS (excel_import); 90-day note.
- 42P01 (recycle_bin table missing) → falls back to local-only list.

---

## PART 26 — Reminders (WhatsApp)

### Template (`reminderTemplate.js`)
- Default: `"Ledger Update - {{customerName}}:\nBalance ₹{{balance}}\n({{balanceType}})\n\nView full ledger:\n{{ledgerLink}}"`
- Persisted in `localStorage["reminder_message_template"]` and `business_settings(1).settings.reminder_message_text`; `loadSavedTemplate` (DB first, localStorage fallback), `saveTemplate` (both), `resetTemplate` (both).
- `fillTemplate(template, vars)` replaces `{{varName}}`.

### Editor (`ReminderMessageEditor`)
- Placeholders supported: `{{customerName}}`, `{{balance}}`, `{{balanceType}}`, `{{ledgerLink}}`, `{{businessName}}`, `{{date}}`; live preview (sample: customerName "Harsh Sharma", balance "710", balanceType "You Will Get", ledgerLink URL, date via toLocaleDateString('en-IN')); Save/Reset buttons.

### Session (`reminderSession.js`)
- `sessionStorage["khata_bulk_reminder_session_v1"]` = `{active, selectedIds[], sessionQueue[], sessionIndex, sessionDone, startedAt}`; `get/save/clearReminderSessionSnapshot`.

### ReminderPage (`/admin/reminder`)
- Loads customers (name asc), all transactions; `balanceMap = buildBalanceMap`; filter pending (`balance > 0`) or all; search name/phone.
- `sendReminder`: strip `[^0-9]` from phone; if length 10 → prefix `91`; `fillTemplate` (balance `Math.round(abs(bal))`, balanceType "You Will Get"/"Settled", `getLedgerLink(id)`); open `https://wa.me/<digits>?text=<encoded>`.
- Sequential session: sticky WhatsApp send button `#25D366`; progress Completed/Remaining; on finish clear snapshot.

### Links (`appUrl.js`)
- `getAppUrl()` = `import.meta.env.VITE_APP_URL || window.location.origin`; `getLedgerLink(id)` = `${getAppUrl()}/share/customer/${id}`.

---

## PART 27 — Reports

- **Reports hub** (`Reports.jsx`): tabs `all / customer / bills / gst / daywise`; only "customer" implemented (Customer Transactions Report card; "Customer List PDF" placeholder card); others "Coming soon".
- **CustomerTransactionsReport** (`/admin/reports/customer-transactions`): filters via `reportFilters.js` defaults `createDefaultCustomerTransactionsFilters()` → `{searchTerm:'', startDate:'', endDate:'', durationFilter:'single_day', singleDay: today ISO, paymentFilter:...}`; persisted via `getSavedReportFilters(key)/saveReportFilters(key)` (per-page localStorage keys); supports single-day, date ranges, payment-mode filter, search; `sessionStorage["customer-transactions-reset-on-home-return"]` triggers reset on return from a detail row; table opens `/admin/reports/customer-transactions/:id` (TransactionDetailPage).
- **ProfitReport** (`/admin/reports/profit`, group variant `:groupId`): rows = transaction_items × product; `calculateProfitMetrics({sellingPrice, purchasePrice, quantity})` → `{revenue = selling × qty, cost = buying × qty, profit = revenue − cost}`; aggregates per product / group; group filter via product_groups.
- **TransactionDetailPage**: share WhatsApp item-total text (`<name> x<qty><unit> — ₹<round(price*qty)>`), balance label "You Will Get"/"You Will Give", running balance recomputed, delete guarded (moves `{transaction, transaction_items}` to recycle bin), navigate to `/customer/:customer_id` after delete.
- **InventoryReport**: functional (Part 20); PDF/print download NOT IMPLEMENTED (`alert`).
- NOT IMPLEMENTED: day-wise report, bills report, GST report, PDF export (html2canvas/jspdf present in dependencies but not referenced by any page — NOT FOUND).

---

## PART 28 — Collection Route & Ordering

- `collectionQueue.js`: `localStorage["khata_collection_queue"]` (string[] of customer ids); `getCollectionQueue()`, `moveCustomerToCollectionQueueEnd(id)`, `resetCollectionQueue()`.
- `applyCollectionQueue(customers)`: sorts by `collection_position ?? 9999` then appends queued (recently-paid) customers at the end — used by EmployeeHome/AdminHome and collection screens.
- **CollectionRouteEditor** (`/settings/collection-route`): loads customers `(id, name, collection_position)` order collection_position asc nullsFirst false; `PositionModal` input 1..N validated; saves via `persistCollectionOrder(offlineSupabase, reordered)` using `moveCustomerToCollectionPosition` (re-indexes 1..N).
- `matrix_position` drives CataloguePreview/distribution ordering (Part 17, 20).

---

## PART 29 — Home Dashboards

`AdminHome` & `EmployeeHome` share the same logic:
- `CUSTOMER_PAGE_SIZE = 1000`; `fetchAllCustomersSnapshot` = `supabaseClient.from('customers').select('*').order('created_at',{ascending:false}).order('id',{ascending:false}).range(...)`.
- Loads all transactions (cached), builds `balanceMap` (`buildBalanceMap`), splits today vs older (`splitByTodayActivity`).
- `useLiveTransactions()` keeps the transaction list live (Part 15).
- Balance headers via `SummaryCard`: "YOU WILL GIVE" (green, balance<0 sum) and "YOU WILL GET" (red, balance>0 sum).
- Filters (FilterModal): filter all/get/give/settled (+ disabled today/upcoming/nodue); sort recent/oldest/highest/lowest/az; reset defaults all+recent.
- Customer ordering applies `applyCollectionQueue` for the collection view. Navigation via `createCustomerLedgerNavigationState` so ledger context survives.
- EmployeeHome restricts actions by permission (Part 7).
- Header shows online/offline/syncing state (`sync-status`, `business-profile-update` events, `navigator.onLine`); Navbar tabs: customers, catalogue (+ excel/employees per role, settings last).

---

## PART 30 — Settings & Business Profile

`SettingsPage` (`/settings`, 411 lines):
- Logo: preview + upload via `uploadLogo(file)` (Part 8 bucket; upserts `company_logo`; marks `settings.logo_uploaded = true`); `getLogoUrl()` for the public URL; updates header through `business-profile-update` event.
- Business name: `business_settings(1).settings.business_name` saved; mirror `localStorage["khata_business_name"]`; default name "Shiv Shankar Dairy" everywhere.
- Account: shows profile name (`khata_profile_name`), logout (clears auth keys + signOut).
- Links: Product Groups, Download Excel, Recycle Bin, Reminder Message, Bulk Reminders, Admin Profiles, Collection Route.
- Swipe navigation (left→/admin/staff or /employee/home, right→/admin/staff for admin).
- `AdminProfilesPage` (`/settings/admins`): list admin_profiles (client-filtered to hide system admin), add/edit (validate unique username, password on create), delete self blocked, must keep ≥1 admin; all ops require online; current admin identity tracked via `khata_user`.

---

## PART 31 — Shared Ledger View & Share Links

`SharedLedgerView` (`/share/customer/:id`, 241 lines, public no-auth):
- Loads customer (single), transactions (created_at asc), transaction_items grouped per transaction with product name/unit.
- Header: business name (`khata_business_name`) + logo (`getLogoUrl()`, fallback heroLogo asset, onError→null).
- Net balance card: `balance = Σ type==='got' ? −amount : +amount`; `balanceLabel = balance >= 0 ? "You Have To Pay" : "You Will Give"`.
- Rows sorted by created_at, running balance attached, grouped by business date (`groupLedgerByBusinessDate`); item lists or "Payment"/"Entry" labels; footer "Generated via Khata App".
- Shared via customers' reminder links `${getAppUrl()}/share/customer/<id>`.

---

## PART 32 — UI Design System & Shared Components

- CSS variables: `--primary` (#18ACF6 header / brand blue), `--background`, `--text-secondary`, etc.; Tailwind classes; system font.
- Toast (`toast.js`): container `#khata-toast-container`; colors `info #5cbdb9`, `success #52b788`, `error #e76f51`, `warning #f4a261`; auto-remove + slide animation.
- Components: `Header` (business logo/name, online/offline/sync dot), `Navbar` (horizontal tabs), `CustomerCard` (avatar initial, name, relative time via `timeAgo`, balance badge: >0 red "You Get", <0 green "You Give", 0 "Settled", en-IN formatting; click → `/customer/:id`), `TransactionCard` (got/gave badge, amount, description, balance), `SummaryCard` (You will give/get split), `FilterModal` (bottom sheet; FILTER_OPTIONS all/get/give/settled/today-disabled/upcoming-disabled/nodue-disabled; SORT_OPTIONS recent/oldest/highest/lowest/az; Escape closes), `DeleteCustomerModal` (list of what's deleted, autofocus cancel), `FloatingButton` (FAB + label), `ImportStatusBadge`.
- `useSwipeNavigation`: `SWIPE_THRESHOLD=80px` horizontal-dominant swipes with 400ms lockout.
- `ErrorBoundary`: "Something went wrong" + Reload.
- Perf (`perf.js`): `khata_perf` localStorage flag; `recordRouteChange`, `recordQueryTiming`; events capped at 500 in `window.__khataPerf.events`.
- Creator names: `creatorName.js` loads admin_profiles (username→profile_name) + employees (username/auth_id), `resolveCreatorName` default "Admin"/"Unknown".

---

## PART 33 — Tests (`tests/*.test.js`)

Unit tests (Node) covering behavioral contracts:
- `transactionOrder`: business date / entry date keying, backdated detection, grouping, running balance from oldest displayed.
- `salary`: days-in-month, attendance factor, per-day rate, cumulative due, monthly salary, monthly payments.
- `reminderSession`: snapshot save/load/clear.
- `recycleGlobal` / `recycleRepro`: local recycle-bin move/restore/permanent + regression cases, deadline logic.
- `offlinePayloads` / `offlineDeleteSync` / `offlineDataLoss`: queue payload shape, delete tombstones survive snapshot replaces, no data loss across sync cycles (protectUnsynced semantics).
- `profitReport`: revenue/cost/profit math.
- `collectionQueue`: get/move-to-end/apply ordering.
- `customerTransactionsReset`: session reset flag behavior.
- `cataloguePreviewMatrix`: distribution grid build for a selected business date, id/local_uuid keying.
- `excelImport` / `excelImportValidation` / `excelImportGrouping`: matrix parsing, header detection/validation, total-summary exclusion, per-row item grouping + price resolution + skipped-row errors.
- `excelExport`: matrix build, date ranges, duplicates assertion.
- `importReversal`: actor logic (UNVERIFIED — covered as logic test).

---

## PART 34 — Constants, Fallbacks & Edge Cases

- Supabase ref `nqciyviiizulkaipwwbi`; anon key embedded; deployment `https://shivshankardairy.vercel.app`.
- Seed admin: username `admin`, password `admin@2385` (in SQL; verify from provider).
- Hardcoded fallback admin: `gopal` / `gopalchoudhary@123` (Signup.jsx migration).
- Default business name constant: "Shiv Shankar Dairy" (also default header prop + `khata_business_name` fallback).
- Employee email convention: `{username}@example.com`.
- Phone normalization for WhatsApp/call: `digits = phone.replace(/[^0-9]/g,'')`; prefix `91` when length 10.
- Pagination constants: `PAGE_SIZE = 1000` (customerBalance, DownloadExcelPage), `CUSTOMER_PAGE_SIZE = 1000`, `CATALOGUE_PAGE_SIZE = 1000`, `INCREMENTAL_CAP = 10000`, snapshot page 1000, `DELTA_PAGE_SIZE = 1000`, `MAX_DELTA_PAGES = 5`, `MAX_FULL_RECONCILE_ATTEMPTS = 3`, `CATCH_UP_MIN_GAP_MS = 15000`, `SWIPE_THRESHOLD = 80`, recycle deadline `90 days`, logo limit `5 MB` (`5242880`), `MAX_EVENTS = 500`.
- Import statuses (post-migration): processing / imported / deleted / restored / failed. Legacy statuses completed/completed_with_errors handled for cleanup.
- Sync error tolerance: `42P01`/`PGRST205` treated as table-missing; `PGRST202`/`42883` treated as missing RPC (legacy path).
- Edge: offline mutations use negative temp ids; `sync_operation_id` for idempotent transaction inserts; `protectUnsynced` on all server→cache merges prevents local-edit clobbering; queued ops block authoritative reconciles until queue drains.
- `isOnline()` relies on `navigator.onLine` (does not test server reachability).

---

## PART 35 — Deployment, Ops & Known Limitations

- Vercel deploy; `vercel.json` present (framework preset); env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL`.
- One-time migrations to run against Supabase SQL editor (order): schema creates (customers → transactions → transaction_items → inventory/products → product_groups → customer_product_prices → employees → attendance → salary → business_settings → admin_profiles → import_history → recycle_bin), then `add_transaction_activity_at`, `migrate_*` position/profile/auto-sms/salary/permission migrations, `create_import_history_table`, `extend_import_history_batch_reversal`, `extend_stock_in_import_reversal`, `fix_transaction_amount_rounding`, `create_logo_storage_bucket`, `create_employee_credentials_rpc`, `enable_customers_realtime`, `create_super_admin`.
- PWA service worker generated at build by vite-plugin-pwa; registered only in production at `/sw.js`; runtime caching: api-cache (NetworkFirst, 7d), asset-cache (StaleWhileRevalidate).
- **Security caveats (documented, by design, UNVERIFIED FROM SOURCE for prod DB):** data tables have RLS disabled and the anon key is public; wipe-prod script `reset_for_production.sql` clears transactional data only. The employee_attendance/salary_payments `employee_id` UUID-vs-SERIAL FK mismatch is a latent DB inconsistency (Part 8).
- **NOT FOUND / NOT IMPLEMENTED:** day-wise, bills, GST reports and "Customer List PDF" (player cards only); inventory report download (alert stub); html2canvas/jspdf not referenced by any page; no backend notification service — WhatsApp reminders open `wa.me` links manually; `transactions` not added to `supabase_realtime` publication by the checked-in SQL (liveSync relies on it — see Part 11); no explicit rate limiting/server-side auth beyond the creditless anon access; service worker offline page caching relies on Workbox precache of built assets.
- UNVERIFIED FROM SOURCE: exact live DB state, migrated data, user accounts in production, and any RLS policies added manually outside `db/`.