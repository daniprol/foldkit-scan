import {
  all,
  change,
  click,
  expect,
  expectAll,
  given,
  hover,
  role,
  scene,
  type,
} from 'foldkit/scene'
import { describe, test } from 'vitest'

import { init, update, view } from './main'

const { model: start } = init()
const app = { update, view }

describe('sprint board', () => {
  test('hovering a row highlights only that row', () => {
    scene(
      app,
      given(start),
      hover(role('option', { name: 'Fix flaky login test' })),
      expect(role('option', { name: 'Fix flaky login test' })).toHaveClass(
        'hovered',
      ),
      expect(role('option', { name: 'Write release notes' })).not.toHaveClass(
        'hovered',
      ),
    )
  })

  test('search filters the rows as you type', () => {
    scene(
      app,
      given(start),
      type(role('searchbox', { name: 'Search tasks' }), 'review'),
      expectAll(all.role('option')).toHaveCount(1),
      expect(role('option', { name: 'Review the caching PR' })).toExist(),
    )
  })

  test('selecting a row lets you change its status', () => {
    scene(
      app,
      given(start),
      click(role('option', { name: 'Write release notes' })),
      expect(role('option', { name: 'Write release notes' })).toHaveAttr(
        'aria-selected',
        'true',
      ),
      click(role('button', { name: 'Done' })),
      expect(role('button', { name: 'Done' })).toHaveAttr(
        'aria-pressed',
        'true',
      ),
    )
  })

  test('flipping a bug ticks its box', () => {
    scene(
      app,
      given(start),
      change(role('checkbox', { name: 'Row keys include the index' }), 'on'),
      expect(
        role('checkbox', { name: 'Row keys include the index' }),
      ).toBeChecked(),
    )
  })
})
