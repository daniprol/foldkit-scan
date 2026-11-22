import { shortLabel } from '../identity'
import type {
  Corner,
  FlashMode,
  LabelMode,
  PanelTab,
  Settings,
} from '../settings'
import { PHASE_BUDGETS_MS } from '../slow'
import type {
  CommandRecord,
  FrameRecord,
  Hotspot,
  Issue,
  IssueKind,
  LazyStat,
} from '../types'
import { type Child, compact, el, ms } from './el'

// The panel that opens above the pill. Each tab is a small function from
// data to DOM, re-run when the data changes. The same idea as a Foldkit
// view, written by hand so the widget never measures itself.

export type PanelData = Readonly<{
  settings: Settings
  frames: ReadonlyArray<FrameRecord>
  selectedFrameId: number | undefined
  isPaused: boolean
  isInspecting: boolean
  issues: ReadonlyArray<Issue>
  hotspotsByView: ReadonlyArray<Hotspot>
  hotspotsByMessage: ReadonlyArray<Hotspot>
  lazyStats: ReadonlyArray<LazyStat>
  /** Recent Commands, oldest first. */
  commands: ReadonlyArray<CommandRecord>
  commandsByName: ReadonlyArray<Hotspot>
  /** `true` when the experimental DevTools link found the DevTools store. */
  isDevToolsLinked: boolean
  /** Chime on new issues and stutters. */
  isSoundOn: boolean
}>

export type PanelActions = Readonly<{
  selectTab: (tab: PanelTab) => void
  selectFrame: (id: number) => void
  setFlashes: (mode: FlashMode) => void
  setLabels: (mode: LabelMode) => void
  setCorner: (corner: Corner) => void
  setSound: (isOn: boolean) => void
  toggleInspect: () => void
  togglePause: () => void
  close: () => void
  ignoreMessage: (tag: string) => void
  dismissIssue: (id: string) => void
  resetStats: () => void
  openInDevTools: (historyIndex: number) => void
}>

const SVG = 'http://www.w3.org/2000/svg'
const TIMELINE_FRAMES = 90
const FRAME_BUDGET_MS = 1000 / 60

const segmented = <A extends string>(
  key: string,
  options: ReadonlyArray<readonly [A, string]>,
  current: A,
  onSelect: (value: A) => void,
): HTMLElement =>
  el(
    'div',
    { class: 'seg', attrs: { role: 'group' } },
    options.map(([value, label]) =>
      el('button', {
        text: label,
        attrs: {
          'aria-pressed': String(value === current),
          'data-key': `${key}-${value}`,
        },
        on: { click: () => onSelect(value) },
      }),
    ),
  )

// ---- Frames tab ----

/** Commands that started after the previous frame and before this one.
 *  Foldkit starts a Command right after the `update` that returned it, and
 *  renders on the next animation frame, so these came from this frame's
 *  Messages. */
const commandsOf = (
  frames: ReadonlyArray<FrameRecord>,
  frame: FrameRecord,
  commands: ReadonlyArray<CommandRecord>,
): ReadonlyArray<CommandRecord> => {
  const index = frames.indexOf(frame)
  const from = index > 0 ? (frames[index - 1]?.at ?? -Infinity) : -Infinity
  return commands.filter(c => c.startedAt > from && c.startedAt <= frame.at)
}

/** One bar per frame: height is time, colour is the update, view and patch
 *  split. A dashed line marks one 60 fps frame. */
const timeline = (
  frames: ReadonlyArray<FrameRecord>,
  commands: ReadonlyArray<CommandRecord>,
  selectedId: number | undefined,
  onSelect: (id: number) => void,
): SVGSVGElement => {
  const width = 336
  const height = 64
  const recent = frames.slice(-TIMELINE_FRAMES)
  const barWidth = width / TIMELINE_FRAMES
  const maxMs = Math.max(FRAME_BUDGET_MS * 1.5, ...recent.map(f => f.totalMs))
  const y = (value: number): number => (value / maxMs) * (height - 4)

  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('class', 'timeline')
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.setAttribute('preserveAspectRatio', 'none')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', `Timeline of the last ${recent.length} frames`)

  const rect = (attrs: Record<string, string | number>): SVGRectElement => {
    const node = document.createElementNS(SVG, 'rect')
    for (const [name, value] of Object.entries(attrs))
      node.setAttribute(name, String(value))
    return node
  }

  recent.forEach((frame, index) => {
    const x = index * barWidth
    const group = document.createElementNS(SVG, 'g')
    group.addEventListener('click', () => onSelect(frame.id))
    // A transparent full-height target, so thin bars are easy to click.
    group.append(
      rect({ x, y: 0, width: barWidth, height, fill: 'transparent' }),
    )
    if (frame.isReplay) {
      group.append(
        rect({
          x,
          y: height - 6,
          width: barWidth - 1,
          height: 6,
          fill: '#7f849c',
          opacity: 0.55,
        }),
      )
    } else {
      let top = height
      const parts: ReadonlyArray<readonly [number, string]> = [
        [frame.updateMs, '#89b4fa'],
        [frame.viewMs, '#cba6f7'],
        [frame.patchMs, '#f5c26b'],
      ]
      for (const [value, color] of parts) {
        const partHeight = Math.max(value > 0 ? 1 : 0, y(value))
        top -= partHeight
        group.append(
          rect({
            x,
            y: top,
            width: barWidth - 1,
            height: partHeight,
            fill: color,
          }),
        )
      }
      if (frame.isWasted) {
        group.append(
          rect({
            x: x + 0.5,
            y: top - 3,
            width: barWidth - 2,
            height: 3,
            fill: 'none',
            stroke: '#ff9466',
            'stroke-width': 1,
          }),
        )
      }
    }
    // The Command lane: a tick on top of frames whose Messages started
    // Commands. Red when one of them failed.
    const started = commandsOf(frames, frame, commands)
    if (started.length > 0) {
      group.append(
        rect({
          x,
          y: 0,
          width: barWidth - 1,
          height: 3,
          fill: started.some(c => c.outcome === 'Failure')
            ? '#f38ba8'
            : '#94e2d5',
        }),
      )
    }
    if (frame.id === selectedId) {
      group.append(
        rect({
          x: x - 0.5,
          y: 0.5,
          width: barWidth,
          height: height - 1,
          fill: 'none',
          stroke: '#94e2d5',
          'stroke-width': 1,
        }),
      )
    }
    svg.append(group)
  })

  const line = document.createElementNS(SVG, 'line')
  const budgetY = height - y(FRAME_BUDGET_MS)
  line.setAttribute('x1', '0')
  line.setAttribute('x2', String(width))
  line.setAttribute('y1', String(budgetY))
  line.setAttribute('y2', String(budgetY))
  line.setAttribute('stroke', '#9399b2')
  line.setAttribute('stroke-dasharray', '3 3')
  line.setAttribute('opacity', '0.7')
  svg.append(line)
  return svg
}

const phaseRow = (
  name: string,
  value: number,
  budget: number,
  className: string,
): HTMLElement =>
  el('div', { class: 'phase' }, [
    el('span', { text: name }),
    el('i', {}, [
      el('b', {
        class: className,
        style: { width: `${Math.min(100, (value / budget) * 100)}%` },
      }),
    ]),
    el('em', {
      class: value > budget ? 'over' : '',
      text: `${ms(value)} / ${budget}`,
    }),
  ])

const framesTab = (
  data: PanelData,
  actions: PanelActions,
): ReadonlyArray<Child> => {
  const live = data.frames
  if (live.length === 0) {
    return [
      el('p', {
        class: 'empty',
        text: 'No frames yet. Interact with your app.',
      }),
    ]
  }
  const frame = live.find(f => f.id === data.selectedFrameId) ?? live.at(-1)
  if (frame === undefined) return []
  const changedCount = frame.messages.filter(m => m.changedModel).length

  const changesByLabel = new Map<
    string,
    { count: number; kinds: Set<string> }
  >()
  for (const change of frame.changes) {
    const entry = changesByLabel.get(change.label) ?? {
      count: 0,
      kinds: new Set(),
    }
    entry.count += 1
    entry.kinds.add(change.kind)
    changesByLabel.set(change.label, entry)
  }

  const slowestUpdate = Math.max(0, ...frame.messages.map(m => m.updateMs))
  const frameCommands = commandsOf(live, frame, data.commands)

  return [
    timeline(live, data.commands, frame.id, actions.selectFrame),
    el('div', { class: 'axis' }, [
      el('span', {
        text: `last ${Math.min(live.length, TIMELINE_FRAMES)} frames`,
      }),
      el('span', {
        text: data.isPaused ? 'paused (Alt Shift P)' : '- - 16.7 ms',
      }),
    ]),
    el('div', { class: 'fh' }, [
      el('b', {
        text: `Frame ${frame.id}`,
      }),
      frame.messages.length > 0 &&
        el('span', {
          class: 'batch',
          text: `${frame.messages.length} msgs (${changedCount} changed the Model) → 1 render`,
        }),
      frame.isWasted && el('span', { class: 'tag-wasted', text: 'wasted' }),
      frame.isReplay &&
        el('span', { class: 'tag-replay', text: 'DevTools replay' }),
      el('span', { class: 'total', text: ms(frame.totalMs) }),
    ]),
    data.isDevToolsLinked &&
      frame.historyIndex !== undefined &&
      frame.historyIndex >= 0 &&
      el('button', {
        class: 'mini devtools',
        text: 'Show this Message in DevTools',
        title: `DevTools history entry ${frame.historyIndex}`,
        attrs: { 'data-key': 'open-devtools' },
        on: {
          click: () => {
            if (frame.historyIndex !== undefined) {
              actions.openInDevTools(frame.historyIndex)
            }
          },
        },
      }),
    !frame.isReplay &&
      phaseRow('update', slowestUpdate, PHASE_BUDGETS_MS.Update, 'u'),
    !frame.isReplay &&
      phaseRow('view', frame.viewMs, PHASE_BUDGETS_MS.View, 'v'),
    !frame.isReplay &&
      phaseRow('patch', frame.patchMs, PHASE_BUDGETS_MS.Patch, 'p'),
    frame.messages.length > 0 && el('div', { class: 'h', text: 'Messages' }),
    frame.messages.length > 0 &&
      el(
        'ul',
        { class: 'list' },
        frame.messages.slice(-40).map(message =>
          el('li', {}, [
            el('span', { class: 'tag', text: message.tag, title: message.tag }),
            message.changedModel
              ? el('span', {
                  class: message.isEqualInValue ? 'no' : 'yes',
                  text: message.isEqualInValue
                    ? 'new Model, same value'
                    : 'changed the Model',
                })
              : el('span', { class: 'no', text: 'no change' }),
            el('em', { text: ms(message.updateMs) }),
            el('button', {
              class: 'mini',
              text: 'ignore',
              title: `Leave ${message.leafTag} out of frames for this visit`,
              on: { click: () => actions.ignoreMessage(message.leafTag) },
            }),
          ]),
        ),
      ),
    frameCommands.length > 0 && el('div', { class: 'h', text: 'Commands' }),
    frameCommands.length > 0 &&
      el(
        'ul',
        { class: 'list' },
        frameCommands.slice(-20).map(command =>
          el('li', {}, [
            el('span', { class: 'tag', text: command.name }),
            el('span', {
              class: command.outcome === 'Failure' ? 'no failed' : 'yes',
              text: commandResult(command),
            }),
            el('em', {
              text:
                command.durationMs === undefined ? '…' : ms(command.durationMs),
            }),
          ]),
        ),
      ),
    el('div', { class: 'h', text: 'DOM changes' }),
    changesByLabel.size === 0
      ? el('p', { class: 'muted', text: 'Nothing on the page changed.' })
      : el(
          'ul',
          { class: 'list' },
          [...changesByLabel].slice(0, 40).map(([label, entry]) =>
            el('li', {}, [
              el('span', {
                class: 'label',
                text: shortLabel(label),
                title: label,
              }),
              entry.count > 1 &&
                el('span', { class: 'kind', text: `×${entry.count}` }),
              el('em', {
                class: `kind ${[...entry.kinds].join(' ')}`,
                text: [...entry.kinds].join(', ').toLowerCase(),
              }),
            ]),
          ),
        ),
  ]
}

const commandResult = (command: CommandRecord): string => {
  switch (command.outcome) {
    case 'Running':
      return 'running'
    case 'Success':
      return command.resultTag === undefined ? 'done' : `→ ${command.resultTag}`
    case 'Failure':
      return 'failed'
    case 'Interrupted':
      return 'interrupted'
  }
}

// ---- Issues tab ----

const ISSUE_TITLES: Readonly<Record<IssueKind, string>> = {
  UnstableLazyArgument: 'Unstable lazy argument',
  KeyedChurn: 'Keyed churn',
  WastedRender: 'Wasted render',
  SlowPhase: 'Slow phase',
}

const issuesTab = (
  data: PanelData,
  actions: PanelActions,
): ReadonlyArray<Child> => {
  if (data.issues.length === 0) {
    return [
      el('p', {
        class: 'empty',
        text: 'No issues. Problems show up here when they repeat.',
      }),
    ]
  }
  return data.issues.map(issue =>
    el(
      'div',
      {
        class: issue.kind === 'WastedRender' ? 'issue-card note' : 'issue-card',
      },
      [
        el('div', { class: 'title' }, [
          el('b', { text: ISSUE_TITLES[issue.kind] }),
          el('code', { text: issue.subject }),
        ]),
        el('p', { text: issue.explanation }),
        el('p', { class: 'hint', text: issue.hint }),
        el('div', { class: 'actions' }, [
          el('button', {
            class: 'mini',
            text: 'Dismiss',
            attrs: { 'data-key': `dismiss-${issue.id}` },
            on: { click: () => actions.dismissIssue(issue.id) },
          }),
          el('span', { text: `seen ${issue.count}×` }),
        ]),
      ],
    ),
  )
}

// ---- Hotspots tab ----

const ranking = (
  rows: ReadonlyArray<Hotspot>,
  className: string,
  unit: string,
): HTMLElement => {
  const max = Math.max(1, ...rows.map(row => row.count))
  return el(
    'ul',
    { class: `rank ${className}` },
    rows
      .slice(0, 8)
      .map(row =>
        el('li', {}, [
          el('code', { text: shortLabel(row.name), title: row.name }),
          el('i', {}, [
            el('b', { style: { width: `${(row.count / max) * 100}%` } }),
          ]),
          el('em', { text: `${row.count} ${unit}` }),
        ]),
      ),
  )
}

const hotspotsTab = (data: PanelData): ReadonlyArray<Child> => [
  el('div', { class: 'h', text: 'Most patched views, last 5 s' }),
  data.hotspotsByView.length === 0
    ? el('p', { class: 'muted', text: 'Nothing patched recently.' })
    : ranking(data.hotspotsByView, 'views', 'frames'),
  el('div', { class: 'h', text: 'Busiest Messages, last 5 s' }),
  data.hotspotsByMessage.length === 0
    ? el('p', { class: 'muted', text: 'No Messages recently.' })
    : ranking(data.hotspotsByMessage, 'messages', '×'),
  el('div', { class: 'h', text: 'Lazy slots' }),
  data.lazyStats.length === 0
    ? el('p', {
        class: 'muted',
        text: "Wrap a slot with scan.lazy('Name', createLazy()) to see its hit rate.",
      })
    : el(
        'ul',
        { class: 'list' },
        data.lazyStats.map(stat => {
          const total = stat.hits + stat.misses
          const rate = total === 0 ? 0 : Math.round((stat.hits / total) * 100)
          const unstable = [
            ...stat.unstableArgs.map(index => `arg ${index}`),
            ...(stat.unstableFunction ? ['view fn'] : []),
          ]
          return el('li', {}, [
            el('span', { class: 'label', text: stat.name }),
            el('span', {
              class: 'kind',
              text: `hits ${rate}% · misses ${stat.misses}`,
            }),
            unstable.length > 0 &&
              el('em', {
                class: 'kind Churn',
                text: `${unstable.join(', ')} unstable`,
              }),
          ])
        }),
      ),
  el('div', { class: 'h', text: 'Slowest Commands' }),
  data.commandsByName.length === 0
    ? el('p', {
        class: 'muted',
        text: 'Pass resources: scan.resources to Foldkit to see Commands.',
      })
    : el(
        'ul',
        { class: 'list' },
        data.commandsByName
          .slice(0, 8)
          .map(row =>
            el('li', {}, [
              el('span', { class: 'label', text: row.name }),
              el('span', { class: 'kind', text: `${row.count}×` }),
              el('em', { text: `${ms(row.totalMs / row.count)} avg` }),
            ]),
          ),
      ),
]

// ---- Settings tab ----

const settingsTab = (
  data: PanelData,
  actions: PanelActions,
): ReadonlyArray<Child> => [
  el('div', { class: 'settings' }, [
    el('span', { text: 'Corner' }),
    segmented(
      'corner',
      [
        ['TopLeft', '↖'],
        ['TopRight', '↗'],
        ['BottomLeft', '↙'],
        ['BottomRight', '↘'],
      ],
      data.settings.corner,
      actions.setCorner,
    ),
    el('span', { text: 'Flashes' }),
    segmented(
      'flashes',
      [
        ['All', 'All'],
        ['Problems', 'Problems'],
        ['Off', 'Off'],
      ],
      data.settings.flashes,
      actions.setFlashes,
    ),
    el('span', { text: 'Labels' }),
    segmented(
      'labels',
      [
        ['HotOnly', 'Hot only'],
        ['OnHover', 'On hover'],
        ['Always', 'Always'],
      ],
      data.settings.labels,
      actions.setLabels,
    ),
    el('span', { text: 'Sound' }),
    segmented(
      'sound',
      [
        ['On', 'On'],
        ['Off', 'Off'],
      ],
      data.isSoundOn ? 'On' : 'Off',
      choice => actions.setSound(choice === 'On'),
    ),
    el('span'),
    el('span', {
      text: 'A short chime when a new issue appears or a frame takes over 100 ms.',
    }),
    el('span', { text: 'Data' }),
    el('div', {}, [
      el('button', {
        class: 'btn',
        text: 'Reset stats',
        attrs: { 'data-key': 'reset' },
        on: { click: actions.resetStats },
      }),
    ]),
  ]),
  el('div', { class: 'keys' }, [
    el('kbd', { text: 'Alt Shift S' }),
    el('span', { text: 'Open or close this panel' }),
    el('kbd', { text: 'Alt Shift F' }),
    el('span', { text: 'Cycle flashes' }),
    el('kbd', { text: 'Alt Shift C' }),
    el('span', { text: 'Inspect an element (hold for a quick look)' }),
    el('kbd', { text: 'Alt Shift P' }),
    el('span', { text: 'Pause the timeline' }),
    el('kbd', { text: '← →' }),
    el('span', { text: 'Previous or next frame' }),
    el('kbd', { text: 'Esc' }),
    el('span', { text: 'Close or leave inspect' }),
  ]),
]

// ---- the panel ----

const TABS: ReadonlyArray<PanelTab> = [
  'Frames',
  'Issues',
  'Hotspots',
  'Settings',
]

export const renderPanelBody = (
  data: PanelData,
  actions: PanelActions,
): ReadonlyArray<Child> => {
  switch (data.settings.tab) {
    case 'Frames':
      return framesTab(data, actions)
    case 'Issues':
      return issuesTab(data, actions)
    case 'Hotspots':
      return hotspotsTab(data)
    case 'Settings':
      return settingsTab(data, actions)
  }
}

export const renderPanel = (
  data: PanelData,
  actions: PanelActions,
): HTMLElement => {
  const body = el('div', {
    class: 'body',
    attrs: { 'data-key': 'body', tabindex: '-1' },
  })
  body.append(...compact(renderPanelBody(data, actions)))
  return el(
    'div',
    {
      class: `panel corner-${data.settings.corner}`,
      attrs: { role: 'dialog', 'aria-label': 'foldkit-scan' },
    },
    [
      el('div', { class: 'head' }, [
        el('span', { class: 'logo' }, ['foldkit', el('b', { text: '-scan' })]),
        segmented(
          'head-flashes',
          [
            ['All', 'All'],
            ['Problems', 'Issues'],
            ['Off', 'Off'],
          ],
          data.settings.flashes,
          actions.setFlashes,
        ),
        el('button', {
          class: 'icon',
          text: '⌖',
          title: 'Inspect an element (Alt Shift C)',
          attrs: {
            'aria-label': 'Inspect an element',
            'aria-pressed': String(data.isInspecting),
            'data-key': 'inspect',
          },
          on: { click: actions.toggleInspect },
        }),
        el('button', {
          class: 'icon',
          text: '♪',
          title: data.isSoundOn
            ? 'Sound on: chime on new issues and stutters'
            : 'Sound off',
          attrs: {
            'aria-label': 'Sound',
            'aria-pressed': String(data.isSoundOn),
            'data-key': 'sound',
          },
          on: { click: () => actions.setSound(!data.isSoundOn) },
        }),
        el('button', {
          class: 'icon',
          text: data.isPaused ? '▶' : '❚❚',
          title: data.isPaused ? 'Resume (Alt Shift P)' : 'Pause (Alt Shift P)',
          attrs: {
            'aria-label': data.isPaused ? 'Resume' : 'Pause',
            'data-key': 'pause',
          },
          on: { click: actions.togglePause },
        }),
        el('button', {
          class: 'icon',
          text: '✕',
          title: 'Close (Esc)',
          attrs: { 'aria-label': 'Close', 'data-key': 'close' },
          on: { click: actions.close },
        }),
      ]),
      el(
        'div',
        { class: 'tabs', attrs: { role: 'tablist' } },
        TABS.map(tab =>
          el(
            'button',
            {
              attrs: {
                role: 'tab',
                'aria-selected': String(tab === data.settings.tab),
                'data-key': `tab-${tab}`,
              },
              on: { click: () => actions.selectTab(tab) },
            },
            [
              tab,
              tab === 'Issues' &&
                data.issues.length > 0 &&
                el('span', {
                  class: 'badge',
                  text: String(data.issues.length),
                }),
            ],
          ),
        ),
      ),
      body,
    ],
  )
}
