export type SkillId = 'basic' | 'slam';

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
    color: 0x9fd3ff,
  },
  slam: {
    id: 'slam',
    name: 'Quake',
    keyHint: '2',
    cooldown: 3.2,
    damage: 26,
    range: 0.5,
    radius: 3.55,
    color: 0xff6b6b,
  },
};

export function createWarriorSkills(): Record<SkillId, SkillState> {
  return {
    basic: { def: WARRIOR_SKILLS.basic, cooldownRemaining: 0 },
    slam: { def: WARRIOR_SKILLS.slam, cooldownRemaining: 0 },
  };
}
