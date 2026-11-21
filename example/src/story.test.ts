import { given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { Message, type Model, init, update } from './main'

const { model: start } = init()
const withoutBugs: Model = { ...start, bugs: [] }

describe('ReceivedPresence', () => {
  test('keeps the same Model when the count did not change', () => {
    story(
      update,
      given(withoutBugs),
      message(Message.ReceivedPresence({ onlineCount: start.onlineCount })),
      model(next => expect(next).toBe(withoutBugs)),
    )
  })

  test('with the planted bug, builds an equal but new Model', () => {
    story(
      update,
      given(start),
      message(Message.ReceivedPresence({ onlineCount: start.onlineCount })),
      model(next => {
        expect(next).not.toBe(start)
        expect(next).toEqual(start)
      }),
    )
  })

  test('stores a new count', () => {
    story(
      update,
      given(withoutBugs),
      message(Message.ReceivedPresence({ onlineCount: 7 })),
      model(next => expect(next.onlineCount).toBe(7)),
    )
  })
})

describe('ToggledBug', () => {
  test('switches a planted bug off and on again', () => {
    story(
      update,
      given(start),
      message(Message.ToggledBug({ bug: 'IndexKeys' })),
      model(next => expect(next.bugs).not.toContain('IndexKeys')),
      message(Message.ToggledBug({ bug: 'IndexKeys' })),
      model(next => expect(next.bugs).toContain('IndexKeys')),
    )
  })
})
