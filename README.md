# Minza Health

**Clinical data and financial infrastructure for African healthcare.**

Live at → [minzahealth.netlify.app](https://minzahealth.netlify.app)

---

## What it is

Minza is an operations platform for health facilities in Africa, starting with East Africa. Every patient record is stored in **FHIR R5 format**, making the data AI-ready, insurance-ready, and interoperable from day one.

The EHR is Minza's entry point and the destination is the infrastructure layer that sits underneath African healthcare payments, insurance claims, drug supplier credit, mobile money processing, and a cross-facility patient record network where a patient's history follows them regardless of which facility they visit.

---

## Status

- **Live product** — deployed and in daily clinical use
- **13 paying facilities** including 8 clinics in Kampala, Uganda
- Built entirely by one person

---

## What facilities get

| Module | Who uses it |
|---|---|
| Patient registration + queue management | Reception |
| Doctor consultations + FHIR R5 records | Doctor / Clinician |
| Lab worklist, results dispatch, walk-in tests | Diagnostic Lab |
| Prescription queue + mobile money POS | Pharmacy |
| Encounter model, bed board, triage (NEWS2), ward round, orders | Hospital |
| Overview dashboard, reports, staff management | Admin |

---

## Technical decisions worth knowing

**Single-file SPA** — the entire product is one HTML file (~9,000 lines). No framework, no build step. This is deliberate. Clinic environments in Uganda have unreliable internet, blocked CDNs, and staff who can't update Node.js. 

**Offline-first** — a custom IndexedDB queue engine writes mutations locally when offline and syncs FIFO when connectivity returns with zero dependencies.

**FHIR R5** — patient records are stored as JSONB with a GIN index therefore every record created today is structured for the interoperability, AI, and insurance integrations that come in later phases.

**Supabase backend** — PostgreSQL with Row Level Security, Edge Functions, Auth. All DB calls via PostgREST.

**MTN MoMo** — integrated at the pharmacy POS and at subscription payment. Supabase Edge Functions handle the server-side MoMo token exchange so credentials never touch the client.

---

## Stack

```
Frontend    Vanilla JS / HTML / CSS — single file, no framework
Backend     Supabase (PostgreSQL, RLS, Edge Functions, Auth)
Offline     Custom IndexedDB sync queue
Data        FHIR R5 (JSONB, GIN index)
Payments    MTN MoMo Collections API
Analytics   PostHog
```

---

## Architecture notes

- `org_id` is the Supabase `auth.uid()` — every table row is scoped to the facility
- Staff accounts use `user_metadata.department` to override the nav view
- New facility accounts store `departments[]` and `monthly_cost` in user metadata, the nav builds dynamically from what was purchased at signup
- Trial enforcement runs client-side on `launchApp()` — expired accounts become read-only until a MoMo subscription payment is confirmed via Edge Function

---

## Roadmap

**Phase 2** — Cross-facility referral data flow where patient records travel between connected Minza facilities as structured FHIR data eliminating phone calls and paper based records.

**Phase 3** — Insurance claims processing made possible by the FHIR-structured data and claims submitted directly to insurers. Mobile money transaction fees are also to be implemented in this phase.

**Phase 4** — Patient identity matching across facilities where the longitudinal records linked by name, phone, and location.

**Phase 5** — Population health analytics such as disease surveillance, drug demand forecasting, AI clinical decision support trained on African patient data.

---

## Why East Africa First

Seeing as I currently live in Uganda, it easier for me to access East Africa than it would be to access other regions.

MTN MoMo and M-Pesa penetration, smartphone usability thresholds, and WHO pressure on governments to digitise all converged in East Africa in the last 2–3 years. The infrastructure to build this exists now in a way it didn't in 2020.

---

## Contact

**Patience Amanya (amanyapatience334@gmail.com)** — Founder  
[minza.health](https://minzahealth.nettlify.app) · Kampala, Uganda
