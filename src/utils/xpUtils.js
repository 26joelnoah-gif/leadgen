// =====================================================
// Ervaringspunten (XP) en levels voor bellers (v26)
//
// De XP zelf wordt in de DATABASE berekend (functies xp_for en
// xp_leaderboard, migration v26) zodat de punten later - bijv. op een
// outbound-marktplaats - verifieerbaar zijn en niet in de client te
// manipuleren. De regels daar:
//   koude lead 1 XP - warme lead (referral/linkedin) 3 XP - beslisser 10 XP
//   resultaatbonus: terugbelafspraak +5, afspraak +15, deal +25
//   geen contact (geen gehoor / voicemail / verkeerd nummer) = 0 XP
//
// Dit bestand bevat alleen de LEVEL-curve en titels voor de weergave.
// =====================================================

// Totale XP die nodig is om level `level` te BEREIKEN.
// Kwadratische curve: L1 = 0, L2 = 50, L3 = 150, L4 = 300, L5 = 500, L10 = 2250...
export function xpNeededForLevel(level) {
  return 25 * level * (level - 1)
}

// Titel per mijlpaal-level; tussenliggende levels houden de laatste titel.
export const LEVEL_TITLES = [
  [1, 'Groentje'],
  [2, 'Starter'],
  [3, 'Beller'],
  [5, 'Doorzetter'],
  [7, 'Gespreksmaker'],
  [10, 'Pro'],
  [13, 'Dealmaker'],
  [16, 'Expert'],
  [20, 'Meester'],
  [25, 'Legende']
]

export function levelTitle(level) {
  let title = LEVEL_TITLES[0][1]
  for (const [minLevel, t] of LEVEL_TITLES) {
    if (level >= minLevel) title = t
  }
  return title
}

// Alles wat de UI nodig heeft om XP + level + voortgang te tonen
export function levelInfo(xp) {
  const total = Math.max(0, Math.floor(xp || 0))
  let level = 1
  while (level < 200 && xpNeededForLevel(level + 1) <= total) level++
  const currentLevelXp = xpNeededForLevel(level)
  const nextLevelXp = xpNeededForLevel(level + 1)
  return {
    xp: total,
    level,
    title: levelTitle(level),
    currentLevelXp,
    nextLevelXp,
    toNext: Math.max(0, nextLevelXp - total),
    progress: nextLevelXp > currentLevelXp
      ? Math.min(1, (total - currentLevelXp) / (nextLevelXp - currentLevelXp))
      : 1
  }
}
