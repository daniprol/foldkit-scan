import { Option } from 'effect'
import { given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { Message, type Model, init, update } from './main'

const { model: start } = init()
const withNoopBug: Model = { ...start, bugs: ['NoopUpdate'] }
const firstId = start.tasks[0]?.id ?? ''
const secondId = start.tasks[1]?.id ?? ''

describe('init', () => {
  test('starts with every planted bug off', () => {
    expect(start.bugs).toEqual([])
  })
})

describe('ReceivedPresence', () => {
  test('keeps the same Model when the count did not change', () => {
    story(
      update,
      given(start),
      message(Message.ReceivedPresence({ onlineCount: start.onlineCount })),
      model(next => expect(next).toBe(start)),
    )
  })

  test('with the planted bug, builds an equal but new Model', () => {
    story(
      update,
      given(withNoopBug),
      message(Message.ReceivedPresence({ onlineCount: start.onlineCount })),
      model(next => {
        expect(next).not.toBe(withNoopBug)
        expect(next).toEqual(withNoopBug)
      }),
    )
  })

  test('stores a new count', () => {
    story(
      update,
      given(start),
      message(Message.ReceivedPresence({ onlineCount: 7 })),
      model(next => expect(next.onlineCount).toBe(7)),
    )
  })
})

describe('hover', () => {
  test('remembers the hovered row and forgets it on leave', () => {
    story(
      update,
      given(start),
      message(Message.HoveredTask({ id: firstId })),
      model(next => expect(next.maybeHoveredId).toEqual(Option.some(firstId))),
      message(Message.UnhoveredTask({ id: firstId })),
      model(next => expect(next.maybeHoveredId).toEqual(Option.none())),
    )
  })

  test('a late leave from the previous row keeps the new hover', () => {
    story(
      update,
      given(start),
      message(Message.HoveredTask({ id: secondId })),
      message(Message.UnhoveredTask({ id: firstId })),
      model(next => expect(next.maybeHoveredId).toEqual(Option.some(secondId))),
    )
  })
})

describe('ClickedStatus', () => {
  test('changes only that task', () => {
    story(
      update,
      given(start),
      message(Message.ClickedStatus({ id: firstId, status: 'Done' })),
      model(next => {
        expect(next.tasks[0]?.status).toBe('Done')
        expect(next.tasks.slice(1)).toEqual(start.tasks.slice(1))
        expect(next.tasks[1]).toBe(start.tasks[1])
      }),
    )
  })
})

describe('ClickedStatus on the current status', () => {
  test('keeps the same Model', () => {
    const status = start.tasks[0]?.status ?? 'Todo'
    story(
      update,
      given(start),
      message(Message.ClickedStatus({ id: firstId, status })),
      model(next => expect(next).toBe(start)),
    )
  })
})

describe('ToggledBug', () => {
  test('switches a planted bug on and off again', () => {
    story(
      update,
      given(start),
      message(Message.ToggledBug({ bug: 'SlowView' })),
      model(next => expect(next.bugs).toContain('SlowView')),
      message(Message.ToggledBug({ bug: 'SlowView' })),
      model(next => expect(next.bugs).not.toContain('SlowView')),
    )
  })
})
