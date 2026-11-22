import {
  Array,
  Clock,
  Duration,
  Effect,
  Option,
  Schema,
  Stream,
  String,
} from 'effect'
import { Command, Runtime, Subscription, type Update } from 'foldkit'
import {
  type Document,
  type Html,
  type HtmlBuilder,
  createKeyedLazy,
  createLazy,
} from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

import { rowKeyWithBug } from './bugs/indexKeys'
import { setOnlineCountWithBug } from './bugs/noopUpdate'
import { doHeavyWorkWithBug } from './bugs/slowView'
import { type RowState, rowStateWithBug } from './bugs/unstableArgument'
import { scan } from './scan'

// A small sprint board with four performance bugs you can switch on and
// off. Run `pnpm dev`, hover and type to see healthy updates stay small,
// then flip a bug and watch foldkit-scan find it.

// MODEL

const Status = Schema.Literals(['Todo', 'Doing', 'Done'])
type Status = typeof Status.Type

const Task = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  owner: Schema.String,
  status: Status,
  due: Schema.String,
})
type Task = typeof Task.Type

const Bug = Schema.Literals([
  'UnstableArgument',
  'IndexKeys',
  'NoopUpdate',
  'SlowView',
])
type Bug = typeof Bug.Type

export const Model = Schema.Struct({
  tasks: Schema.Array(Task),
  search: Schema.String,
  maybeSelectedId: Schema.Option(Schema.String),
  maybeHoveredId: Schema.Option(Schema.String),
  nextId: Schema.Finite,
  now: Schema.Finite,
  onlineCount: Schema.Finite,
  isSaving: Schema.Boolean,
  maybeSavedAt: Schema.Option(Schema.Finite),
  bugs: Schema.Array(Bug),
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  UpdatedSearch: { text: Schema.String },
  HoveredTask: { id: Schema.String },
  UnhoveredTask: { id: Schema.String },
  ClickedTask: { id: Schema.String },
  ClickedStatus: { id: Schema.String, status: Status },
  ClickedNewTask: {},
  ClickedAddManyTasks: {},
  ClickedSave: {},
  CompletedSaveTasks: { savedAt: Schema.Finite },
  ToggledBug: { bug: Bug },
  Ticked: { now: Schema.Finite },
  ReceivedPresence: { onlineCount: Schema.Finite },
})
export type Message = typeof Message.Type

// INIT

const TITLES = [
  'Write release notes',
  'Fix flaky login test',
  'Review the caching PR',
  'Update the onboarding guide',
  'Plan the sprint demo',
  'Profile the search page',
  'Triage new bug reports',
  'Rotate the API keys',
  'Draft the Q3 roadmap',
  'Clean up feature flags',
]
const OWNERS = ['AL', 'BK', 'CM', 'DP']
const STATUSES: ReadonlyArray<Status> = ['Todo', 'Doing', 'Done']

const makeTask = (index: number): Task => ({
  id: `t-${100 + index}`,
  title: TITLES[index % TITLES.length] ?? 'Task',
  owner: OWNERS[index % OWNERS.length] ?? '?',
  status: STATUSES[index % STATUSES.length] ?? 'Todo',
  due: `Dec ${String.padStart(2, '0')(`${(index % 27) + 1}`)}`,
})

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: {
    tasks: Array.makeBy(TITLES.length, makeTask),
    search: '',
    maybeSelectedId: Option.none(),
    maybeHoveredId: Option.none(),
    nextId: TITLES.length,
    now: 0,
    onlineCount: 3,
    isSaving: false,
    maybeSavedAt: Option.none(),
    bugs: [],
  },
})

// COMMAND

/** How many tasks "Add 1,000" adds, to try foldkit-scan on a big page. */
const MANY_TASKS = 1000

// A pretend save to a server. foldkit-scan shows it in the Command lane.
const SaveTasks = Command.define('SaveTasks', {
  messages: [Message.CompletedSaveTasks],
  execute: Effect.sleep(Duration.millis(400)).pipe(
    Effect.andThen(Clock.currentTimeMillis),
    Effect.map(savedAt => Message.CompletedSaveTasks({ savedAt })),
  ),
})

// UPDATE

const hasBug = (model: Model, bug: Bug): boolean => model.bugs.includes(bug)

type UpdateReturn = Update.Return<Model, Message>

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    UpdatedSearch: ({ text }) => ({
      model: modifyFields(model, { search: () => text }),
    }),

    HoveredTask: ({ id }) => ({
      model: modifyFields(model, { maybeHoveredId: () => Option.some(id) }),
    }),

    // The pointer may already be on the next row, so only clear our own id.
    UnhoveredTask: ({ id }) =>
      Option.contains(model.maybeHoveredId, id)
        ? {
            model: modifyFields(model, { maybeHoveredId: () => Option.none() }),
          }
        : { model },

    ClickedTask: ({ id }) => ({
      model: modifyFields(model, { maybeSelectedId: () => Option.some(id) }),
    }),

    ClickedStatus: ({ id, status }) => {
      const isUnchanged = model.tasks.some(
        task => task.id === id && task.status === status,
      )
      return isUnchanged
        ? { model }
        : {
            model: modifyFields(model, {
              tasks: Array.map(task =>
                task.id === id
                  ? modifyFields(task, { status: () => status })
                  : task,
              ),
            }),
          }
    },

    ClickedNewTask: () => ({
      model: modifyFields(model, {
        tasks: tasks => [makeTask(model.nextId), ...tasks],
        nextId: nextId => nextId + 1,
      }),
    }),

    ClickedAddManyTasks: () => ({
      model: modifyFields(model, {
        tasks: tasks => [
          ...tasks,
          ...Array.makeBy(MANY_TASKS, index => makeTask(model.nextId + index)),
        ],
        nextId: nextId => nextId + MANY_TASKS,
      }),
    }),

    ClickedSave: () => ({
      model: modifyFields(model, { isSaving: () => true }),
      commands: [SaveTasks()],
    }),

    CompletedSaveTasks: ({ savedAt }) => ({
      model: modifyFields(model, {
        isSaving: () => false,
        maybeSavedAt: () => Option.some(savedAt),
      }),
    }),

    ToggledBug: ({ bug }) => ({
      model: modifyFields(model, {
        bugs: bugs =>
          bugs.includes(bug) ? bugs.filter(b => b !== bug) : [...bugs, bug],
      }),
    }),

    Ticked: ({ now }) => ({
      model: modifyFields(model, { now: () => now }),
    }),

    ReceivedPresence: ({ onlineCount }) => {
      if (hasBug(model, 'NoopUpdate')) {
        return { model: setOnlineCountWithBug(model, onlineCount) }
      }
      // The fix: when nothing changed, return the very same Model.
      return onlineCount === model.onlineCount
        ? { model }
        : { model: modifyFields(model, { onlineCount: () => onlineCount }) }
    },
  })

// SUBSCRIPTION

// The clock in the header. scan.ts lists `Ticked` in `ignoreMessages`, so
// the clock still flashes but stays out of the Frames tab and the stats.
const everySecond = Stream.tick(Duration.seconds(1)).pipe(
  Stream.mapEffect(() => Clock.currentTimeMillis),
  Stream.map(now => Message.Ticked({ now })),
)

// A pretend "who is online" ping. The count never changes. It runs off the
// clock's beat, so its frames rarely share one with a tick.
const presence = Stream.tick(Duration.millis(2300)).pipe(
  Stream.map(() => Message.ReceivedPresence({ onlineCount: 3 })),
)

export const subscriptions = Subscription.make<Model, Message>()(() => ({
  clock: Subscription.persistentEntry(everySecond),
  presence: Subscription.persistentEntry(presence),
}))

// VIEW

// Four constant objects, made once. Passing these keeps the lazy slot's
// arguments stable between renders.
const IDLE: RowState = { isSelected: false, isHovered: false }
const HOVERED: RowState = { isSelected: false, isHovered: true }
const SELECTED: RowState = { isSelected: true, isHovered: false }
const SELECTED_HOVERED: RowState = { isSelected: true, isHovered: true }

const stableRowState = (isSelected: boolean, isHovered: boolean): RowState =>
  isSelected
    ? isHovered
      ? SELECTED_HOVERED
      : SELECTED
    : isHovered
      ? HOVERED
      : IDLE

// One memo slot per row, and one for the workload card. The second line of
// each wraps the slot so foldkit-scan can count its hits and misses; it is
// called exactly like the original.
const taskRowSlot = createKeyedLazy()
const lazyTaskRow = scan.keyedLazy('TaskRow', taskRowSlot)
const workloadSlot = createLazy()
const lazyWorkload = scan.lazy('Workload', workloadSlot)

const statusClass = (status: Status): string =>
  `status status-${status.toLowerCase()}`

const taskRow = (
  task: Task,
  key: string,
  state: RowState,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('div')(
    key,
    [
      h.Class(
        [
          'row',
          state.isSelected ? 'selected' : '',
          state.isHovered ? 'hovered' : '',
        ].join(' '),
      ),
      h.Role('option'),
      h.AriaLabel(task.title),
      h.AriaSelected(state.isSelected),
      h.OnClick(Message.ClickedTask({ id: task.id })),
      h.OnMouseEnter(Message.HoveredTask({ id: task.id })),
      h.OnMouseLeave(Message.UnhoveredTask({ id: task.id })),
    ],
    [
      h.span([h.Class('task-title')], [task.title]),
      h.span([h.Class('avatar')], [task.owner]),
      h.span([h.Class(statusClass(task.status))], [task.status]),
      h.span([h.Class('due')], [task.due]),
    ],
  )

const tableView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const query = model.search.trim().toLowerCase()
  const visible = model.tasks.filter(task =>
    task.title.toLowerCase().includes(query),
  )
  const rows = visible.map((task, index) => {
    const isSelected = Option.contains(model.maybeSelectedId, task.id)
    const isHovered = Option.contains(model.maybeHoveredId, task.id)
    const key = hasBug(model, 'IndexKeys')
      ? rowKeyWithBug(task.id, index)
      : task.id
    const state = hasBug(model, 'UnstableArgument')
      ? rowStateWithBug(isSelected, isHovered)
      : stableRowState(isSelected, isHovered)
    return lazyTaskRow(key, taskRow, [task, key, state, h])
  })
  return h.div(
    [h.Class('table'), h.Role('listbox'), h.AriaLabel('Tasks')],
    [
      h.div(
        [h.Class('row th'), h.AriaHidden(true)],
        [
          h.span([], ['Task']),
          h.span([], ['Owner']),
          h.span([], ['Status']),
          h.span([], ['Due']),
        ],
      ),
      ...(Array.isArrayEmpty(rows)
        ? [h.div([h.Class('empty')], ['No tasks match.'])]
        : rows),
    ],
  )
}

const statusButton = (
  task: Task,
  status: Status,
  h: HtmlBuilder<Message>,
): Html =>
  h.button(
    [
      h.Class(status === task.status ? 'seg on' : 'seg'),
      h.AriaPressed(`${status === task.status}`),
      h.OnClick(Message.ClickedStatus({ id: task.id, status })),
    ],
    [status],
  )

const selectedTaskView = (task: Task, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      h.div([h.Class('detail-title')], [task.title]),
      h.div(
        [h.Class('muted')],
        [`${task.id} · ${task.owner} · due ${task.due}`],
      ),
      h.div(
        [h.Class('segmented'), h.AriaLabel('Status')],
        STATUSES.map(status => statusButton(task, status, h)),
      ),
    ],
  )

const noSelectionView = (h: HtmlBuilder<Message>): Html =>
  h.p([h.Class('muted')], ['Click a row to see it here.'])

const detailView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.Class('card detail'), h.AriaLabel('Selected task')],
    [
      h.h2([h.Class('card-title')], ['Selected task']),
      Option.match(
        Option.flatMap(model.maybeSelectedId, id =>
          Array.findFirst(model.tasks, task => task.id === id),
        ),
        {
          onNone: () => noSelectionView(h),
          onSome: task => selectedTaskView(task, h),
        },
      ),
    ],
  )

const countBy = (
  tasks: ReadonlyArray<Task>,
  isCounted: (task: Task) => boolean,
): number =>
  Array.reduce(tasks, 0, (sum, task) => sum + (isCounted(task) ? 1 : 0))

const statusBar = (
  tasks: ReadonlyArray<Task>,
  status: Status,
  h: HtmlBuilder<Message>,
): Html => {
  const count = countBy(tasks, task => task.status === status)
  const percent = Array.isReadonlyArrayEmpty(tasks)
    ? 0
    : Math.round((count / tasks.length) * 100)
  return h.div(
    [h.Class('bar-row')],
    [
      h.span([h.Class('bar-label')], [status]),
      h.span(
        [h.Class('bar')],
        [
          h.span([
            h.Class(`bar-fill bar-${status.toLowerCase()}`),
            h.Style({ width: `${percent}%` }),
          ]),
        ],
      ),
      h.span([h.Class('bar-count')], [`${count}`]),
    ],
  )
}

const workloadView = (
  tasks: ReadonlyArray<Task>,
  h: HtmlBuilder<Message>,
): Html =>
  h.section(
    [h.Class('card'), h.AriaLabel('Workload')],
    [
      h.h2([h.Class('card-title')], ['Workload']),
      ...STATUSES.map(status => statusBar(tasks, status, h)),
    ],
  )

const workloadOrBugView = (model: Model, h: HtmlBuilder<Message>): Html => {
  if (hasBug(model, 'SlowView')) {
    doHeavyWorkWithBug()
    return workloadView(model.tasks, h)
  }
  // The fix: memoize the card on the tasks, so hovers, keystrokes and clock
  // ticks skip it.
  return lazyWorkload(workloadView, [model.tasks, h])
}

const BUGS: ReadonlyArray<readonly [Bug, string, string]> = [
  [
    'UnstableArgument',
    'Unstable lazy argument',
    'Every row view runs on each hover. See Hotspots.',
  ],
  [
    'IndexKeys',
    'Row keys include the index',
    'Search or add a task: rows rebuild in orange.',
  ],
  [
    'NoopUpdate',
    'Update that always copies the Model',
    'A wasted render every couple of seconds.',
  ],
  [
    'SlowView',
    'Heavy view on every render',
    'Frames over 100 ms. Hover feels sticky.',
  ],
]

const bugToggle = (
  isOn: boolean,
  bug: Bug,
  label: string,
  effect: string,
  h: HtmlBuilder<Message>,
): Html =>
  h.label(
    [h.Class(isOn ? 'bug on' : 'bug')],
    [
      h.input([
        h.Type('checkbox'),
        h.AriaLabel(label),
        h.Checked(isOn),
        h.OnChange(() => Message.ToggledBug({ bug })),
      ]),
      h.span(
        [],
        [
          h.span([h.Class('bug-label')], [label]),
          h.span([h.Class('bug-effect')], [effect]),
        ],
      ),
    ],
  )

const bugsView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.section(
    [h.Class('bugs'), h.AriaLabel('Planted bugs')],
    [
      h.div(
        [h.Class('bugs-head')],
        [
          h.b([], ['Planted bugs']),
          h.span([h.Class('muted')], ['wrong on purpose, in src/bugs/']),
        ],
      ),
      h.div(
        [h.Class('bug-list')],
        BUGS.map(([bug, label, effect]) =>
          bugToggle(hasBug(model, bug), bug, label, effect, h),
        ),
      ),
    ],
  )

const hintView = (h: HtmlBuilder<Message>): Html =>
  h.p(
    [h.Class('hint')],
    [
      h.b([], ['Try it: ']),
      'hover a row, click one, change its status. Only what changed flashes. ',
      'Then flip a bug and do it again, or search: while you type, only ',
      'problems flash. ',
      h.kbd([], ['Alt']),
      '+',
      h.kbd([], ['Shift']),
      '+',
      h.kbd([], ['S']),
      ' opens the panel.',
    ],
  )

const clockText = (now: number): string =>
  now === 0 ? '--:--:--' : new Date(now).toLocaleTimeString()

const headerView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.header(
    [h.Class('head')],
    [
      h.div(
        [],
        [
          h.h1([h.Class('title')], ['Sprint board']),
          h.div(
            [h.Class('sub')],
            [
              `Sprint 14 · ${model.onlineCount} online · `,
              h.span([h.Class('clock')], [clockText(model.now)]),
            ],
          ),
        ],
      ),
      h.div(
        [h.Class('actions')],
        [
          h.input([
            h.Class('search'),
            h.Type('search'),
            h.Placeholder('Search tasks'),
            h.AriaLabel('Search tasks'),
            h.Value(model.search),
            h.OnInput(text => Message.UpdatedSearch({ text })),
          ]),
          h.button(
            [h.Class('button'), h.OnClick(Message.ClickedNewTask())],
            ['New task'],
          ),
          h.button(
            [
              h.Class('button secondary'),
              h.OnClick(Message.ClickedAddManyTasks()),
            ],
            ['Add 1,000'],
          ),
          h.button(
            [
              h.Class('button secondary'),
              h.Disabled(model.isSaving),
              h.OnClick(Message.ClickedSave()),
            ],
            [model.isSaving ? 'Saving…' : 'Save'],
          ),
        ],
      ),
    ],
  )

const footerView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.footer(
    [h.Class('foot')],
    [
      h.span(
        [],
        [
          `${model.tasks.length} tasks`,
          Option.match(model.maybeSavedAt, {
            onNone: () => '',
            onSome: savedAt =>
              ` · saved ${new Date(savedAt).toLocaleTimeString()}`,
          }),
        ],
      ),
      h.a([h.Href('?scan=off')], ['Compare with foldkit-scan off']),
    ],
  )

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Sprint board',
  body: h.div(
    [h.Class('app')],
    [
      headerView(model, h),
      hintView(h),
      bugsView(model, h),
      h.div(
        [h.Class('layout')],
        [
          tableView(model, h),
          h.aside(
            [h.Class('side')],
            [detailView(model, h), workloadOrBugView(model, h)],
          ),
        ],
      ),
      footerView(model, h),
    ],
  ),
})
