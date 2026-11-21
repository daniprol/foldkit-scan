import { Option } from 'effect'
import type { Runtime } from 'foldkit'
import { describe, expect, test } from 'vitest'

import { describeMessage, makeSlowConfig } from './slow'
import type { MessageRecord } from './types'

type Model = Readonly<{ count: number }>
type Message = Readonly<{ _tag: string }>

const setup = (ignoreMessages: ReadonlyArray<string> = []) => {
  const messages: Array<MessageRecord> = []
  const phases: Array<string> = []
  const config = makeSlowConfig<Model, Message>({
    ignoreMessages,
    forwardSlowWarnings: false,
    handlers: {
      onMessage: record => messages.push(record),
      onView: ms => phases.push(`view ${ms}`),
      onPatch: ms => phases.push(`patch ${ms}`),
    },
  })
  if (config === false || config.onSlow === undefined) {
    throw new Error('expected a slow config with onSlow')
  }
  return { config, onSlow: config.onSlow, messages, phases }
}

const updateContext = (
  previousModel: Model,
  nextModel: Model,
  tag = 'Clicked',
): Runtime.SlowContext<Model, Message> => ({
  _tag: 'Update',
  previousModel,
  nextModel,
  message: { _tag: tag },
  durationMs: 0.5,
  thresholdMs: -1,
})

describe('slow config', () => {
  test('lowers every budget so Foldkit reports every phase', () => {
    const { config } = setup()
    expect(config).toMatchObject({
      show: 'Always',
      thresholdOverrides: { Update: -1, View: -1, Patch: -1 },
    })
  })

  test('records whether the Model changed, and whether it changed in value', () => {
    const { onSlow, messages } = setup()
    const model = { count: 1 }
    onSlow(updateContext(model, model))
    onSlow(updateContext(model, { count: 1 }))
    onSlow(updateContext(model, { count: 2 }))

    expect(messages.map(m => [m.changedModel, m.isEqualInValue])).toEqual([
      [false, false],
      [true, true],
      [true, false],
    ])
  })

  test('skips ignored Messages', () => {
    const { onSlow, messages } = setup(['Ticked'])
    onSlow(updateContext({ count: 1 }, { count: 2 }, 'Ticked'))
    expect(messages).toEqual([])
  })

  test('passes view and patch times on', () => {
    const { onSlow, phases } = setup()
    const model = { count: 1 }
    onSlow({
      _tag: 'View',
      model,
      message: Option.none(),
      durationMs: 3,
      thresholdMs: -1,
    })
    onSlow({
      _tag: 'Patch',
      model,
      message: Option.none(),
      durationMs: 2,
      thresholdMs: -1,
    })
    expect(phases).toEqual(['view 3', 'patch 2'])
  })
})

describe('describeMessage', () => {
  test('uses the tag of a plain Message', () => {
    expect(describeMessage({ _tag: 'ClickedRow' })).toEqual({
      tag: 'ClickedRow',
      leafTag: 'ClickedRow',
    })
  })

  test('shows the path of a Submodel Message', () => {
    const message = {
      _tag: 'GotTableMessage',
      message: { _tag: 'ClickedRow' },
    }
    expect(describeMessage(message)).toEqual({
      tag: 'GotTableMessage › ClickedRow',
      leafTag: 'ClickedRow',
    })
  })
})
