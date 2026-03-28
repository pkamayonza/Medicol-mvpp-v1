# Minza Health — Frontend v2

Modular, offline-first clinical frontend for the Minza Health platform.

---

## Stack

- **Frontend**: Pure HTML + CSS + Vanilla JS (ES Modules, no build step)
- **Backend**: Supabase (PostgreSQL + PostgREST + Auth)
- **Offline**: IndexedDB mutation queue with auto-drain on reconnect
- **Hosting**: Netlify (static)

---

## Project Structure

```
frontend/
├── pages/
│   ├── login.html           Auth screen
│   ├── dashboard.html       Clinic home: today's queue + stats
│   ├── patients.html        Patient list, search, register
│   ├── patient-profile.html Patient record + visit history
│   ├── visit.html           Consultation → Prescription → Billing
│   ├── pharmacy.html        Pharmacy order queue (clinic & pharmacy)
│   └── payments.html        Payment history + date filter
│
├── styles/
│   └── main.css             Single stylesheet (all pages) 
│
└── js/
    ├── services/
    │   └── api.js           ALL HTTP calls. One file. Nothing else touches fetch().
    │
    ├── modules/
    │   ├── auth.js          Login, logout, session restore, route protection
    │   ├── patients.js      Fetch, create, search, render patients
    │   ├── visits.js        Create visit, update status, render queue
    │   ├── consultations.js Create consultation, bind form, render card
    │   ├── prescriptions.js Item store, create prescription, render builder
    │   ├── pharmacy.js      Orders, send to pharmacy, accept/reject/dispense
    │   ├── payments.js      Bills, record payment, render summary
    │   └── dashboard.js     Fetch stats, render stat cards
    │
    └── utils/
        ├── format.js        Date, currency, age, HTML escaping — pure functions
        └── ui.js            Toast, modal, conn pill, form helpers
```

---

## Run Locally

No build step needed. Serve the `frontend/` folder with any static server.

**VS Code Live Server:**
Right-click `pages/login.html` → Open with Live Server.

> Must be served over HTTP/HTTPS because ES Modules do not work from `file://`.

---

## Architecture Rules (non-negotiable)

| Rule | Why |
|------|-----|
| All `fetch()` calls go through `js/services/api.js` | Single place to change base URL, headers, error handling |
| Each module has ONE responsibility | `patients.js` only touches patients. `visits.js` only touches visits. |
| No business logic in HTML files | HTML files only import modules and wire up events |
| Offline mutations queue to IndexedDB | Drain runs on reconnect — no data is lost |
| `protectRoute()` called at top of every protected page | Restores session silently, redirects to login if expired |

---

## Manual Test Flows

### Test 1 — Full Clinic Workflow

**Prerequisites:** Create a test account via Supabase auth or the old index.html signup.

1. Open `pages/login.html`
2. Sign in with clinic credentials
3. Verify redirect to `dashboard.html`
4. Verify today's date shows in header
5. Click **+ New Patient**
6. Fill in: Name = "Grace Nakato", Phone = "0701234567", Gender = Female
7. Click **Register Patient**
8. Verify patient appears in list
9. Click **Visit** button on Grace's row
10. Click **Start Visit** in modal
11. Verify redirect to `visit.html` with patient banner showing
12. Fill Symptoms: "Fever for 3 days, headache"
13. Fill Diagnosis: "Malaria — confirmed by RDT"
14. Fill Notes: "Patient treated empirically. Coartem prescribed."
15. Click **Save Consultation**
16. Verify consultation renders in read-only view
17. In Prescription builder: Drug = "Coartem 20/120mg", Dosage = "4 tabs BD x 3 days", Qty = 1, Price = 15000
18. Click **+ Add Drug**
19. Verify drug appears in list with correct total (UGX 15,000)
20. Select pharmacy from dropdown (should show "Internal Pharmacy")
21. Click **Save & Send Prescription →**
22. Verify prescription renders in read-only view
23. Verify billing section appears with total UGX 15,000
24. Select Method = Cash, Amount = 15000
25. Click **Record Payment**
26. Verify bill shows as "paid"
27. Go back to Dashboard — verify visit shows as "Completed"

**Expected result:** Full flow from patient registration to payment completed.

---

### Test 2 — Pharmacy Workflow

1. Log in as pharmacy account (or ensure clinic has pharmacy access)
2. Navigate to `pharmacy.html`
3. Verify incoming orders show (from Test 1)
4. Click **View** on the order from Grace Nakato
5. Click **Accept Order**
6. Verify order status changes to "Accepted"
7. Click **View** again
8. Click **Mark Dispensed**
9. Verify order status changes to "Dispensed"
10. Verify prescription status in `visit.html` also updates

**Expected result:** Order flows from Sent → Accepted → Dispensed.

---

### Test 3 — Patient Profile & History

1. Go to `patients.html`
2. Click **Profile** on Grace Nakato's row
3. Verify redirect to `patient-profile.html`
4. Verify demographics show correctly
5. Verify visit history shows the visit from Test 1 with diagnosis
6. Click the visit row — verify redirect to `visit.html` with correct visit loaded
7. Go back to profile
8. Click **Edit**
9. Change phone number → Save
10. Verify demographics update immediately

**Expected result:** Profile shows full history, editing works.

---

### Test 4 — Payment History

1. Navigate to `payments.html`
2. Verify stats show UGX 15,000 collected (from Test 1)
3. Verify the cash payment row appears
4. Click **View** on the payment
5. Verify bill detail modal shows correct amounts
6. Click **Open Visit →** — verify redirect to correct visit
7. Change date range to previous month → Apply
8. Verify table clears (no payments in previous month)
9. Reset to current month → Apply
10. Verify payment reappears

**Expected result:** Payments visible, filterable, drillable.

---

### Test 5 — Offline Mode

1. Open `visit.html` for any active visit
2. Open DevTools → Network tab → Set to Offline
3. Verify connectivity pill changes to **Offline**
4. Try to record a payment
5. Verify toast shows "Saved offline — will sync when back online"
6. Set Network back to Online
7. Verify connectivity pill changes to **Syncing…** then **Online**
8. Verify the payment appears in Supabase (open dashboard or check payments page)

**Expected result:** Mutations queue when offline, drain and sync on reconnect.

---

### Test 6 — Search

1. Go to `patients.html`
2. Type "Grace" in search box
3. Verify only matching patients show (debounced — 350ms delay)
4. Clear search — verify all patients return
5. Search by phone number — verify correct patient found

**Expected result:** Search works by name and phone without page reload.

---

## Environment

The Supabase credentials are hardcoded in `js/services/api.js`. To change them:

```js
// js/services/api.js
const API_BASE  = 'https://YOUR_PROJECT.supabase.co/rest/v1';
const AUTH_BASE = 'https://YOUR_PROJECT.supabase.co/auth/v1';
const ANON_KEY  = 'YOUR_ANON_KEY';
```

Do not put credentials in multiple files. They live in one place only.

---

## Deployment (Netlify)

1. Push `frontend/` to a GitHub repo
2. Connect repo to Netlify
3. Build command: *(none — static)*
4. Publish directory: `frontend`
5. Done

For custom domain: add `minza.health` in Netlify → Domain settings.

---

## Database Schema (reference)

The frontend communicates with these PostgREST endpoints:

| Table | Used by |
|-------|---------|
| `patients` | patients.js |
| `visits` | visits.js |
| `consultations` | consultations.js |
| `prescriptions` | prescriptions.js |
| `prescription_items` | prescriptions.js |
| `pharmacy_orders` | pharmacy.js |
| `clinic_pharmacies` | pharmacy.js |
| `bills` | payments.js |
| `payments` | payments.js |

All tables have RLS enabled. The JWT from Supabase Auth controls which rows each user can access.