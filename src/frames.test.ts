import { describe, expect, test } from 'vitest'

import { makeFrameBuilder } from './frames'
import type { DomChange, FrameRecord, MessageRecord } from './types'

const message = (
  tag: string,
  overrides: Partial<MessageRecord> = {},
): MessageRecord => ({
  tag,
  leafTag: tag,
  updateMs: 1,
  changedModel: true,
  isEqualInValue: false,
  ...overrides,
})

const change = {
  kind: 'Changed',
  label: 'a.ts#row',
  element: {},
} as unknown as DomChange

const setup = (changes: ReadonlyArray<DomChange> = [change]) => {
  let time = 0
  const builder = makeFrameBuilder({
    maxFrames: 3,
    takeDomChanges: () => changes,
    now: () => time,
  })
  const frames: Array<FrameRecord> = []
  builder.subscribe(frame => frames.push(frame))
  return {
    builder,
    frames,
    tick: (ms: number) => {
      time += ms
    },
  }
}

// Frames finish in a microtask, after the browser has reported DOM changes.
const flush = () => Promise.resolve()

describe('frame builder', () => {
  test('batches every Message before a render into one frame', async () => {
    const { builder, frames } = setup()
    builder.addMessage(message('ClickedRow'))
    builder.addMessage(message('Ticked', { changedModel: false }))
    builder.setViewMs(3)
    builder.closeFrame(2)
    expect(builder.isClosing()).toBe(true)
    await flush()

    expect(frames).toHaveLength(1)
    expect(frames[0]?.messages.map(m => m.tag)).toEqual([
      'ClickedRow',
      'Ticked',
    ])
    expect(frames[0]?.totalMs).toBe(2 + 3 + 2)
    expect(frames[0]?.changes).toEqual([change])
    expect(builder.isClosing()).toBe(false)
  })

  test('drops Messages that did not change the Model and never rendered', async () => {
    const { builder, frames, tick } = setup()
    builder.addMessage(message('Ticked', { changedModel: false }))
    tick(1000)
    builder.addMessage(message('ClickedRow'))
    builder.closeFrame(1)
    await flush()

    expect(frames[0]?.messages.map(m => m.tag)).toEqual(['ClickedRow'])
  })

  test('marks a frame wasted when the page did not change', async () => {
    const { builder, frames } = setup([])
    builder.addMessage(message('GotPresence'))
    builder.closeFrame(1)
    await flush()

    expect(frames[0]?.isWasted).toBe(true)
  })

  test('marks a frame wasted when the new Model is equal in value', async () => {
    const { builder, frames } = setup()
    builder.addMessage(message('GotPresence', { isEqualInValue: true }))
    builder.closeFrame(1)
    await flush()

    expect(frames[0]?.isWasted).toBe(true)
  })

  test('records DOM changes without a render as a replay', () => {
    const { builder, frames } = setup()
    builder.addReplay([change])

    expect(frames[0]?.isReplay).toBe(true)
    expect(frames[0]?.messages).toEqual([])
  })

  test('keeps only the most recent frames', async () => {
    const { builder } = setup()
    for (let i = 0; i < 5; i++) {
      builder.addMessage(message(`M${i}`))
      builder.closeFrame(1)
      await flush()
    }
    expect(builder.recentFrames().map(f => f.id)).toEqual([2, 3, 4])
  })
})
