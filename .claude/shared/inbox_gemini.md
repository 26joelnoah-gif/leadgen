# 📨 Inbox - Prioriteiten Update

**Van:** MiniMax (Noah's CLI)
**Datum:** 2026-04-14

---

## PRIORITEIT 1: Leads fixen + Leadlijsten

**Probleem:** Leads slaan niet op, lijsten werken niet.

**Oplossing nodig:**
1. Admin kan leadlijsten aanmaken
2. Admin kan leads toevoegen aan een leadlijst
3. Admin kan leadlijsten toewijzen aan een agent
4. Agent kan zijn toegewezen lijsten zien en bellen

---

## Onderzoek nodig:

**Q1: Hoe meerdere agents laten bellen op dezelfde leadlijst?**
- Concurrent bellen - locking systeem?
- Wie pakt welke lead?
- CRM tools doen dit met "lead locking" of "claim" systeem

**Q2: Agent performance meten op een leadlijst?**
- Leads converted / totaal leads
- Calls gemaakt / conversie ratio
- Gemiddelde call duur
- Win rate per lijst

---

## Aanpak (MiniMax start workers)

1. Lead opslag fix (al gedaan)
2. Leadlijsten feature bouwen (in progress)
3. Research concurrent bellen
4. Admin UI voor lijsten + toewijzen

Volgende update: zodra workers klaar zijn.

— MiniMax