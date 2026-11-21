import { Duration, Effect, Schema } from 'effect'
import { Command, Runtime } from 'foldkit'
import type { Update } from 'foldkit'
import {
  type Document,
  type Html,
  type HtmlBuilder,
  createKeyedLazy,
} from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { afterEach, describe, expect, test, vi } from 'vitest'

import * as Scan from './scan'
import type { FrameRecord } from './types'

// These tests run a real Foldkit app in Chromium, because they depend on
// real MutationObserver timing and real animation frames.

const Model = Schema.Struct({
  rows: Schema.Array(Schema.String),
  selected: Schema.String,
  keyByIndex: Schema.Boolean,
  count: Schema.Finite,
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  ClickedRow: { id: Schema.String },
  ClickedRemoveFirst: {},
  ClickedCopy: {},
  ClickedIncrement: {},
})
type Message = typeof Message.Type

const update = (model: Model, message: Message): { model: Model } =>
  Message.match<{ model: Model }>(message, {
    ClickedRow: ({ id }) => ({ model: { ...model, selected: id } }),
    ClickedRemoveFirst: () => ({
      model: { ...model, rows: model.rows.slice(1) },
    }),
    // A new object with the same value: a wasted render.
    ClickedCopy: () => ({ model: { ...model } }),
    ClickedIncrement: () => ({ model: { ...model, count: model.count + 1 } }),
  })

const scans: Array<Scan.Scan<Model, Message>> = []

afterEach(() => {
  for (const scan of scans.splice(0)) scan.dispose()
  document.body.replaceChildren()
})

const startApp = (initial: Partial<Model> = {}) => {
  const container = document.createElement('div')
  container.id = `app-${scans.length}-${Math.random().toString(36).slice(2)}`
  document.body.append(container)

  const scan = Scan.make<Model, Message>({ container, overlay: false })
  scans.push(scan)

  const rowSlot = createKeyedLazy()
  const lazyRow = scan.keyedLazy('Row', rowSlot)

  const row = (
    id: string,
    state: Readonly<{ isSelected: boolean }>,
    h: HtmlBuilder<Message>,
  ): Html =>
    h.li(
      [
        h.Class(state.isSelected ? 'row selected' : 'row'),
        h.OnClick(Message.ClickedRow({ id })),
      ],
      [id],
    )

  const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
    title: 'test',
    body: h.div(
      [h.Class('root')],
      [
        h.button(
          [h.Class('remove'), h.OnClick(Message.ClickedRemoveFirst())],
          ['remove'],
        ),
        h.button([h.Class('copy'), h.OnClick(Message.ClickedCopy())], ['copy']),
        h.button(
          [h.Class('increment'), h.OnClick(Message.ClickedIncrement())],
          ['+'],
        ),
        h.span([h.Class('count')], [String(model.count)]),
        h.ul(
          [],
          model.rows.map((id, index) => {
            const key = model.keyByIndex ? `${index}:${id}` : id
            // A new object every render: an unstable lazy argument.
            const state = { isSelected: id === model.selected }
            return h.keyed('li')(key, [], [lazyRow(key, row, [id, state, h])])
          }),
        ),
      ],
    ),
  })

  const application = Runtime.makeApplication({
    Model,
    init: () => ({
      model: {
        rows: ['a', 'b', 'c', 'd'],
        selected: '',
        keyByIndex: false,
        count: 0,
        ...initial,
      },
    }),
    update,
    view: scan.view(view),
    slow: scan.slow,
    container,
  })
  Runtime.run(application)
  return scan
}

/** Resolves with the next `count` frames. */
const nextFrames = (
  scan: Scan.Scan<Model, Message>,
  count = 1,
): Promise<ReadonlyArray<FrameRecord>> =>
  new Promise(resolve => {
    const frames: Array<FrameRecord> = []
    const stop = scan.subscribe(frame => {
      frames.push(frame)
      if (frames.length === count) {
        stop()
        resolve(frames)
      }
    })
  })

const click = (selector: string): void => {
  const element = document.querySelector<HTMLElement>(selector)
  if (element === null) throw new Error(`no element for ${selector}`)
  element.click()
}

describe('Scan.make in a real app', () => {
  test('records the first render', async () => {
    const scan = startApp()
    const [frame] = await nextFrames(scan)
    expect(frame?.messages).toEqual([])
    expect(frame?.viewMs).toBeGreaterThanOrEqual(0)
  })

  test('batches Messages from one task into one frame', async () => {
    const scan = startApp()
    await nextFrames(scan)
    const next = nextFrames(scan)
    click('.increment')
    click('.increment')
    click('.increment')
    const [frame] = await next
    expect(frame?.messages.map(m => m.tag)).toEqual([
      'ClickedIncrement',
      'ClickedIncrement',
      'ClickedIncrement',
    ])
    expect(frame?.changes.map(c => c.kind)).toEqual(['Changed'])
    expect(document.querySelector('.count')?.textContent).toBe('3')
  })

  test('flags a Model that is new but equal in value as wasted', async () => {
    const scan = startApp()
    await nextFrames(scan)
    const next = nextFrames(scan)
    click('.copy')
    const [frame] = await next
    expect(frame?.isWasted).toBe(true)
    expect(frame?.changes).toEqual([])
  })

  test('sees a healthy keyed removal as one removed row', async () => {
    const scan = startApp()
    await nextFrames(scan)
    const next = nextFrames(scan)
    click('.remove')
    const [frame] = await next
    expect(frame?.changes.map(c => c.kind)).toEqual(['Removed'])
  })

  test('sees rows keyed by index as churn', async () => {
    const scan = startApp({ keyByIndex: true })
    await nextFrames(scan)
    const next = nextFrames(scan)
    click('.remove')
    const [frame] = await next
    const kinds = frame?.changes.map(c => c.kind) ?? []
    expect(kinds.filter(kind => kind === 'Churn')).toHaveLength(3)
  })

  test('finds the unstable lazy argument', async () => {
    const scan = startApp()
    await nextFrames(scan)
    const next = nextFrames(scan)
    click('.increment')
    await next
    expect(scan.lazyStats()).toEqual([
      {
        name: 'Row',
        hits: 0,
        misses: 8,
        unstableArgs: [1],
        unstableFunction: false,
      },
    ])
  })

  test('produces a report that survives JSON', async () => {
    const scan = startApp()
    await nextFrames(scan)
    const report = JSON.parse(JSON.stringify(scan.report()))
    expect(report.version).toBe(1)
    expect(report.frames).toHaveLength(1)
  })
})

describe('Commands', () => {
  const SaveMessage = defineMessageUnion({
    ClickedSave: {},
    CompletedSave: {},
  })
  type SaveMessage = typeof SaveMessage.Type
  const SaveModel = Schema.Struct({ saves: Schema.Finite })
  type SaveModel = typeof SaveModel.Type

  const Save = Command.define('Save', {
    messages: [SaveMessage.CompletedSave],
    execute: Effect.sleep(Duration.millis(20)).pipe(
      Effect.as(SaveMessage.CompletedSave()),
    ),
  })

  test('records Commands and draws them on the Performance track', async () => {
    const measures: Array<string> = []
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) measures.push(entry.name)
    })
    observer.observe({ type: 'measure' })

    const container = document.createElement('div')
    container.id = 'commands-app'
    document.body.append(container)
    const scan = Scan.make<SaveModel, SaveMessage>({
      container,
      overlay: false,
    })
    const application = Runtime.makeApplication({
      Model: SaveModel,
      init: () => ({ model: { saves: 0 } }),
      update: (model: SaveModel, message: SaveMessage) =>
        SaveMessage.match<Update.Return<SaveModel, SaveMessage>>(message, {
          ClickedSave: () => ({ model, commands: [Save()] }),
          CompletedSave: () => ({ model: { saves: model.saves + 1 } }),
        }),
      view: scan.view(
        (model: SaveModel, h: HtmlBuilder<SaveMessage>): Document => ({
          title: 'save',
          body: h.button(
            [h.Class('save'), h.OnClick(SaveMessage.ClickedSave())],
            [String(model.saves)],
          ),
        }),
      ),
      slow: scan.slow,
      resources: scan.resources,
      container,
    })
    Runtime.run(application)

    await vi.waitFor(() =>
      expect(document.querySelector('.save')).not.toBeNull(),
    )
    click('.save')
    await vi.waitFor(() =>
      expect(scan.commands().at(-1)?.outcome).toBe('Success'),
    )
    const [command] = scan.commands()
    expect(command?.name).toBe('Save')
    expect(command?.resultTag).toBe('CompletedSave')
    expect(command?.durationMs).toBeGreaterThanOrEqual(15)
    expect(scan.report().commands).toHaveLength(1)

    await vi.waitFor(() => expect(measures).toContain('Save'))
    expect(measures).toEqual(
      expect.arrayContaining(['update ClickedSave', 'view', 'patch']),
    )
    observer.disconnect()
    scan.dispose()
  })
})
