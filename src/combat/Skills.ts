export type SkillId = 'basic' | 'slam' | 'bash' | 'burst';

export type PlayerClass = 'warrior' | 'mage' | 'rogue';

/** Cycle order for C / Tab — Warrior → Mage → Rogue → Warrior… */
export const CLASS_CYCLE: readonly PlayerClass[] = ['warrior', 'mage', 'rogue'];

/** Slot-4 skills unlock at this session level (existing XP curve). */
export const SKILL4_UNLOCK_LEVEL = 3;

export type SkillDef = {
  id: SkillId;
  name: string;
  keyHint: string;
  cooldown: number;
  damage: number;
  range: number;
  radius: number; // 0 for single-target style cone/ray
  color: number;
};

export type SkillState = {
  def: SkillDef;
  cooldownRemaining: number;
};

export const WARRIOR_SKILLS: Record<SkillId, SkillDef> = {
  basic: {
    id: 'basic',
    name: 'Slash',
    keyHint: 'LMB / 1',
    // Hardest basic hit of the three kits — the melee bruiser out-swings the
    // mage's ranged bolt and the rogue's poke, and every swing staggers.
    cooldown: 0.4,
    damage: 18,
    range: 2.55,
    radius: 0,
    color: 0xffe08a,
  },
  slam: {
    id: 'slam',
    name: 'Quake',
    keyHint: '2',
    cooldown: 3.2,
    damage: 30,
    range: 0.5,
    radius: 3.7,
    color: 0xff5a5a,
  },
  bash: {
    id: 'bash',
    name: 'Shield Bash',
    keyHint: '3',
    // Mid CD utility — lighter than Slash/Quake; pays for stun + knockback.
    cooldown: 2.0,
    damage: 16,
    range: 2.15,
    radius: 1.35,
    color: 0x7ec8ff,
  },
  burst: {
    id: 'burst',
    name: 'Leap Strike',
    keyHint: '4',
    // Gap-closer — longer CD than Quake; smaller landing AoE; mobility + a
    // hammer-like landing (launches survivors) is the payoff.
    cooldown: 5.6,
    damage: 28,
    range: 5.2,
    radius: 2.35,
    color: 0xffb040,
  },
};

/** Mage kit — ranged bolt, AoE frost nova (slow), personal arcane ward, delayed meteor. */
export const MAGE_SKILLS: Record<SkillId, SkillDef> = {
  basic: {
    id: 'basic',
    name: 'Arcane Bolt',
    keyHint: 'LMB / 1',
    cooldown: 0.48,
    damage: 16,
    range: 7.2,
    radius: 0,
    color: 0xc48bff,
  },
  slam: {
    id: 'slam',
    name: 'Frost Nova',
    keyHint: '2',
    cooldown: 3.6,
    damage: 20,
    range: 0.5,
    radius: 3.9,
    color: 0x6ad8ff,
  },
  bash: {
    id: 'bash',
    name: 'Arcane Ward',
    keyHint: '3',
    // Defensive bubble — no damage; short i-frames + small heal.
    cooldown: 4.2,
    damage: 0,
    range: 0,
    radius: 1.6,
    color: 0xa78bff,
  },
  burst: {
    id: 'burst',
    name: 'Meteor',
    keyHint: '4',
    // Delayed sky drop — longer CD than Nova; punchier hit, tighter radius, needs aim.
    cooldown: 6.2,
    damage: 30,
    range: 4.6,
    radius: 2.7,
    color: 0xff6a3d,
  },
};

/** Rogue kit — stab, fan of knives AoE, smoke dodge i-frames, shadow leap gap-closer. */
export const ROGUE_SKILLS: Record<SkillId, SkillDef> = {
  basic: {
    id: 'basic',
    name: 'Stab',
    keyHint: 'LMB / 1',
    // Slightly snappier than Slash; a touch less punch so Fan/Leap carry the kit.
    cooldown: 0.36,
    damage: 14,
    range: 2.35,
    radius: 0,
    color: 0x9dffc8,
  },
  slam: {
    id: 'slam',
    name: 'Fan of Knives',
    keyHint: '2',
    cooldown: 3.4,
    damage: 18,
    range: 0.5,
    radius: 3.7,
    color: 0x5ad4a8,
  },
  bash: {
    id: 'bash',
    name: 'Smoke Bomb',
    keyHint: '3',
    // Escape tool — no damage; brief i-frames (dodge window).
    cooldown: 3.8,
    damage: 0,
    range: 0,
    radius: 1.8,
    color: 0x6a7a88,
  },
  burst: {
    id: 'burst',
    name: 'Shadow Leap',
    keyHint: '4',
    // Rogue gap-closer — similar travel to Leap Strike; teal landing bloom.
    cooldown: 5.4,
    damage: 24,
    range: 5.4,
    radius: 2.2,
    color: 0x3ecf9a,
  },
};

export const CLASS_LABEL: Record<PlayerClass, string> = {
  warrior: 'Warrior',
  mage: 'Mage',
  rogue: 'Rogue',
};

export function createWarriorSkills(): Record<SkillId, SkillState> {
  return {
    basic: { def: WARRIOR_SKILLS.basic, cooldownRemaining: 0 },
    slam: { def: WARRIOR_SKILLS.slam, cooldownRemaining: 0 },
    bash: { def: WARRIOR_SKILLS.bash, cooldownRemaining: 0 },
    burst: { def: WARRIOR_SKILLS.burst, cooldownRemaining: 0 },
  };
}

export function createMageSkills(): Record<SkillId, SkillState> {
  return {
    basic: { def: MAGE_SKILLS.basic, cooldownRemaining: 0 },
    slam: { def: MAGE_SKILLS.slam, cooldownRemaining: 0 },
    bash: { def: MAGE_SKILLS.bash, cooldownRemaining: 0 },
    burst: { def: MAGE_SKILLS.burst, cooldownRemaining: 0 },
  };
}

export function createRogueSkills(): Record<SkillId, SkillState> {
  return {
    basic: { def: ROGUE_SKILLS.basic, cooldownRemaining: 0 },
    slam: { def: ROGUE_SKILLS.slam, cooldownRemaining: 0 },
    bash: { def: ROGUE_SKILLS.bash, cooldownRemaining: 0 },
    burst: { def: ROGUE_SKILLS.burst, cooldownRemaining: 0 },
  };
}

export function createSkillsForClass(cls: PlayerClass): Record<SkillId, SkillState> {
  if (cls === 'mage') return createMageSkills();
  if (cls === 'rogue') return createRogueSkills();
  return createWarriorSkills();
}

export function nextClassInCycle(current: PlayerClass): PlayerClass {
  const idx = CLASS_CYCLE.indexOf(current);
  const from = idx >= 0 ? idx : 0;
  return CLASS_CYCLE[(from + 1) % CLASS_CYCLE.length]!;
}

export function isSkillUnlocked(id: SkillId, level: number): boolean {
  if (id === 'burst') return level >= SKILL4_UNLOCK_LEVEL;
  return true;
}
