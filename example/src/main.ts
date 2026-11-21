import { Array, Clock, Duration, Option, Schema, Stream, String } from 'effect'
import { Runtime, Subscription, type Update } from 'foldkit'
import {
  type Document,
  type Html,
  type HtmlBuilder,
  createKeyedLazy,
} from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

import { rowKeyWithBug } from './bugs/indexKeys'
import { setOnlineCountWithBug } from './bugs/noopUpdate'
import { type RowState, rowStateWithBug } from './bugs/unstableArgument'
import { scan } from './scan'

// A small task list with three performance bugs you can switch on and off.
// Run `pnpm dev`, then watch foldkit-scan find each one.

// MODEL

const Task = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  owner: Schema.String,
  status: Schema.Literals(['Todo', 'Doing', 'Done']),
  due: Schema.String,
})
type Task = typeof Task.Type

const Bug = Schema.Literals(['UnstableArgument', 'IndexKeys', 'NoopUpdate'])
type Bug = typeof Bug.Type

export const Model = Schema.Struct({
  tasks: Schema.Array(Task),
  filter: Schema.String,
  selectedId: Schema.Option(Schema.String),
  nextId: Schema.Finite,
  now: Schema.Finite,
  onlineCount: Schema.Finite,
  bugs: Schema.Array(Bug),
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  UpdatedFilter: { text: Schema.String },
  ClickedTask: { id: Schema.String },
  ClickedNewTask: {},
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
]
const OWNERS = ['AL', 'BK', 'CM', 'DP']
const STATUSES = ['Todo', 'Doing', 'Done'] as const

const makeTask = (index: number): Task => ({
  id: `t-${100 + index}`,
  title: TITLES[index % TITLES.length] ?? 'Task',
  owner: OWNERS[index % OWNERS.length] ?? '?',
  status: STATUSES[index % STATUSES.length] ?? 'Todo',
  due: `Dec ${String.padStart(2, '0')(`${(index % 27) + 1}`)}`,
})

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: {
    tasks: Array.makeBy(8, makeTask),
    filter: '',
    selectedId: Option.none(),
    nextId: 8,
    now: 0,
    onlineCount: 3,
    bugs: ['UnstableArgument', 'IndexKeys', 'NoopUpdate'],
  },
})

// UPDATE

const hasBug = (model: Model, bug: Bug): boolean => model.bugs.includes(bug)

type UpdateReturn = Update.Return<Model, Message>

export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    UpdatedFilter: ({ text }) => ({
      model: modifyFields(model, { filter: () => text }),
    }),

    ClickedTask: ({ id }) => ({
      model: modifyFields(model, { selectedId: () => Option.some(id) }),
    }),

    ClickedNewTask: () => ({
      model: modifyFields(model, {
        tasks: tasks => [makeTask(model.nextId), ...tasks],
        nextId: nextId => nextId + 1,
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

const everySecond = Stream.tick(Duration.seconds(1)).pipe(
  Stream.mapEffect(() => Clock.currentTimeMillis),
  Stream.map(now => Message.Ticked({ now })),
)

// A pretend "who is online" ping. The count never changes.
const presence = Stream.tick(Duration.seconds(2)).pipe(
  Stream.map(() => Message.ReceivedPresence({ onlineCount: 3 })),
)

export const subscriptions = Subscription.make<Model, Message>()(() => ({
  clock: Subscription.persistentEntry(everySecond),
  presence: Subscription.persistentEntry(presence),
}))

// VIEW

// Two constant objects, made once. Passing these keeps the lazy slot's
// arguments stable between renders.
const SELECTED: RowState = { isSelected: true }
const NOT_SELECTED: RowState = { isSelected: false }

// One memo slot per row. The second line wraps it so foldkit-scan can count
// its hits and misses; it is called exactly like the original.
const taskRowSlot = createKeyedLazy()
const lazyTaskRow = scan.keyedLazy('TaskRow', taskRowSlot)

const taskRow = (
  task: Task,
  key: string,
  state: RowState,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('div')(
    key,
    [
      h.Class(state.isSelected ? 'row selected' : 'row'),
      h.OnClick(Message.ClickedTask({ id: task.id })),
    ],
    [
      h.span([], [task.title]),
      h.span([h.Class('avatar')], [task.owner]),
      h.span([h.Class('status')], [task.status]),
      h.span([h.Class('due')], [task.due]),
    ],
  )

const tableView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const query = model.filter.trim().toLowerCase()
  const visible = model.tasks.filter(task =>
    task.title.toLowerCase().includes(query),
  )
  const rows = visible.map((task, index) => {
    const isSelected = Option.contains(model.selectedId, task.id)
    const key = hasBug(model, 'IndexKeys')
      ? rowKeyWithBug(task.id, index)
      : task.id
    const state = hasBug(model, 'UnstableArgument')
      ? rowStateWithBug(isSelected)
      : isSelected
        ? SELECTED
        : NOT_SELECTED
    return lazyTaskRow(key, taskRow, [task, key, state, h])
  })
  return h.div(
    [h.Class('table')],
    [
      h.div(
        [h.Class('row th')],
        [
          h.span([], ['Task']),
          h.span([], ['Owner']),
          h.span([], ['Status']),
          h.span([], ['Due']),
        ],
      ),
      ...(rows.length === 0
        ? [h.div([h.Class('empty')], ['No tasks match.'])]
        : rows),
    ],
  )
}

const BUG_LABELS: ReadonlyArray<readonly [Bug, string]> = [
  ['UnstableArgument', 'Unstable lazy argument'],
  ['IndexKeys', 'Row keys include the index'],
  ['NoopUpdate', 'Update that always copies the Model'],
]

const bugsView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('bugs')],
    [
      h.b([], ['Planted bugs:']),
      ...BUG_LABELS.map(([bug, label]) =>
        h.label(
          [],
          [
            h.input([
              h.Type('checkbox'),
              h.Checked(hasBug(model, bug)),
              h.OnChange(() => Message.ToggledBug({ bug })),
            ]),
            label,
          ],
        ),
      ),
    ],
  )

const headerView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('head')],
    [
      h.div(
        [],
        [
          h.h1([h.Class('title')], ['Tasks']),
          h.div([h.Class('sub')], [`Sprint 14 · ${model.onlineCount} online`]),
        ],
      ),
      h.div(
        [h.Class('actions')],
        [
          h.input([
            h.Class('filter'),
            h.Placeholder('Filter tasks'),
            h.AriaLabel('Filter tasks'),
            h.Value(model.filter),
            h.OnInput(text => Message.UpdatedFilter({ text })),
          ]),
          h.button(
            [h.Class('button'), h.OnClick(Message.ClickedNewTask())],
            ['New task'],
          ),
        ],
      ),
    ],
  )

const footerView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Class('foot')],
    [
      h.span([], [`${model.tasks.length} tasks`]),
      h.span(
        [],
        [
          model.now === 0
            ? 'Starting…'
            : `Updated ${new Date(model.now).toLocaleTimeString()}`,
        ],
      ),
    ],
  )

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Tasks',
  body: h.div(
    [h.Class('app')],
    [
      headerView(model, h),
      bugsView(model, h),
      tableView(model, h),
      footerView(model, h),
    ],
  ),
})
