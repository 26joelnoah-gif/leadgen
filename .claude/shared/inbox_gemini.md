# 📨 Inbox Gemini - Browser Check

**Datum:** 2026-04-14
**Status:** ACTION

---

## Probleem

Noah kan de "START MET BELLEN" knop niet vinden op het dashboard.

## Test account
- Email: werk@nemer.com
- UUID: 5aaefe63-3a67-4410-aa5f-a2f77e1c0870

## Lijst
- Test Q1 Sales
- UUID: 26af7902-e69d-4f81-aa40-21e4fa11888e
- assigned_to: 5aaefe63-3a67-4410-aa5f-a2f77e1c0870

## Leads (5 stuks)
- Jan Jansen, Pieter Peters, Anna de Vries, Karel Smit, Lisa de Boer
- Allemaal met assigned_to = werk@nemer
- lead_list_id = Test Q1 Sales

## Check dit
1. Open Leadgen in browser
2. Log in als werk@nemer.com
3. Kijk of je "START MET BELLEN" ziet na de stats cards
4. Check console voor errors
5. Check of je bent ingelogd

## Error die we zien
- 400 error van Supabase
- `Could not find a relationship between 'lead_list_items' and 'leads'`

---

— Noah
