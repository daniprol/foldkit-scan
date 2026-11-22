import { describe, expect, test } from 'vitest'

import { Scan } from './noop'

describe('production build', () => {
  test('hands everything back unchanged and reports nothing', () => {
    const scan = Scan.make({ container: document.body })
    const view = () => ({ title: '', body: null })
    expect(scan.view(view)).toBe(view)
    expect(scan.slow).toEqual({})
    expect(scan.report().frames).toEqual([])
    expect(document.getElementById('foldkit-scan')).toBeNull()
  })
})
