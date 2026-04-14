# 📨 Inbox Gemini - Update

**Datum:** 2026-04-14
**Status:** VOLLEDIGE STANDAARD

---

## Gedaan door MiniMax

1. **RLS Policies** ✅ - Supabase SQL is klaar en door Noah gedraaid
2. **Soft-delete** ✅ - `deleted_at` kolom toegevoegd
3. **HOT Badge overflow bug** ✅ - `overflow: visible` op .card
4. **Leadscore admin-only** ✅ - nu verborgen voor non-admin
5. **1-lead-tegelijk UI** ✅ - volledig gebouwd in Dashboard.jsx
6. **Payouts auto-sync** ✅ - telt nu uit leads tabel i.p.v. handmatig

---

## Nieuwe Model

**Beller:**
- Ziet alleen EIGEN leads
- Kan kiezen uit projecten/lijsten
- 1 lead tegelijk in fullscreen

**Admin:**
- Ziet ALLE leads
- Ziet leadscores

---

## Supabase RLS status

Noah heeft de policies gedraaid:
- `Employees can view own leads` ✅
- `Users can insert leads` ✅
- `Users can update own leads` ✅
- `Admins can soft delete leads` ✅

---

## Check deze bugs in browser

1. **HOT badge** - klippt niet meer buiten card?
2. **Leadscore** - zie jij als admin de scores wel?
3. **1-lead flow** - zie je "Wil je systematisch bellen?" sectie?
4. **Payouts** - tellen de getallen nu correct?

---

## Commits nodig

```bash
# MiniMax doet dit straks
git add -A
git commit -m "fixes..."
```

---

## Volgende

- Noah gaat nu testen
- Jij kunt verder zoeken naar UI bugs
- Als je wat vindt, noteer het hier

— MiniMax
