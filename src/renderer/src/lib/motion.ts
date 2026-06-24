import type { SpringOptions, Transition } from 'motion/react'

export const METER_SPRING:  SpringOptions = { stiffness: 180, damping: 22 }
export const BAR_SPRING:    SpringOptions = { stiffness: 180, damping: 26 }
export const LIST_SPRING:   SpringOptions & { type: 'spring' } = { type: 'spring', stiffness: 340, damping: 26 }
export const CARD_SPRING:   SpringOptions & { type: 'spring' } = { type: 'spring', stiffness: 320, damping: 24 }
export const NAV_SPRING:    SpringOptions & { type: 'spring' } = { type: 'spring', stiffness: 320, damping: 28 }
export const PANEL_SPRING:  SpringOptions & { type: 'spring' } = { type: 'spring', stiffness: 260, damping: 30 }
export const BTN_SPRING:    SpringOptions & { type: 'spring' } = { type: 'spring', stiffness: 380, damping: 22 }

export const EXIT_EASE: Transition = { duration: 0.18, ease: [0.4, 0, 1, 1] as const }
