export type SkillId = 'basic' | 'slam' | 'bash';

export type PlayerClass = 'warrior' | 'mage';

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
    cooldown: 0.4,
    damage: 15,
    range: 2.55,
    radius: 0,
    color: 0xffe08a,
  },
  slam: {
    id: 'slam',
    name: 'Quake',
    keyHint: '2',
    cooldown: 3.2,
    damage: 26,
    range: 0.5,
    radius: 3.55,
    color: 0xff5a5a,
  },
  bash: {
    id: 'bash',
    name: 'Shield Bash',
    keyHint: '3',
    // Mid CD utility — less damage than Slash/Quake; pays for stun + knockback.
    cooldown: 2.0,
    damage: 12,
    range: 2.15,
    radius: 1.35,
    color: 0x7ec8ff,
  },
};

/** Mage kit — ranged bolt, AoE frost nova (slow), personal arcane ward. */
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
};

export const CLASS_LABEL: Record<PlayerClass, string> = {
  warrior: 'Warrior',
  mage: 'Mage',
};

export function createWarriorSkills(): Record<SkillId, SkillState> {
  return {
    basic: { def: WARRIOR_SKILLS.basic, cooldownRemaining: 0 },
    slam: { def: WARRIOR_SKILLS.slam, cooldownRemaining: 0 },
    bash: { def: WARRIOR_SKILLS.bash, cooldownRemaining: 0 },
  };
}

export function createMageSkills(): Record<SkillId, SkillState> {
  return {
    basic: { def: MAGE_SKILLS.basic, cooldownRemaining: 0 },
    slam: { def: MAGE_SKILLS.slam, cooldownRemaining: 0 },
    bash: { def: MAGE_SKILLS.bash, cooldownRemaining: 0 },
  };
}

export function createSkillsForClass(cls: PlayerClass): Record<SkillId, SkillState> {
  return cls === 'mage' ? createMageSkills() : createWarriorSkills();
}
