export type SkillId = 'basic' | 'slam' | 'bash';

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

export function createWarriorSkills(): Record<SkillId, SkillState> {
  return {
    basic: { def: WARRIOR_SKILLS.basic, cooldownRemaining: 0 },
    slam: { def: WARRIOR_SKILLS.slam, cooldownRemaining: 0 },
    bash: { def: WARRIOR_SKILLS.bash, cooldownRemaining: 0 },
  };
}
