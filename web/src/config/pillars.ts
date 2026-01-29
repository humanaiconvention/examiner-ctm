export interface Pillar { title: string; description: string }

export const PILLARS: Pillar[] = [
  {
    title: 'Ethical Infrastructure',
    description: 'Scalable and replicable protocols for useful, transparent, accountable AI systems.'
  },
  {
    title: 'Participatory Data',
    description: 'Human-centered data practices rooted in informed, bounded consent and deliberative engagement (inspired by the Danish model) scaled to enable statistically significant, ethically grounded AI systems designed to benefit humanity.'
  },
  {
    title: 'Science- and Culture- informed Research',
    description: 'Responsible data practices and methodologies that maximize engagement for mutual benefit, with long-term individual and collective human safety at the root.'
  }
] as const

export type PillarKey = typeof PILLARS[number]['title']
