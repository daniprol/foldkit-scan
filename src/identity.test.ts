import { describe, expect, test } from 'vitest'

import { describeElement, shortLabel } from './identity'

describe('labels', () => {
  test('drops folders from a view identity', () => {
    expect(shortLabel('src/feature/rows.ts#todoRow')).toBe('rows.ts#todoRow')
    expect(shortLabel('div.row')).toBe('div.row')
  })

  test('describes an element without an identity', () => {
    const element = document.createElement('li')
    element.id = 'first'
    element.className = 'row selected'
    expect(describeElement(element)).toBe('li#first.row')
  })
})
