import type { DomChange, FrameRecord, MessageRecord } from './types'

// The frame builder turns Foldkit's timing callbacks into FrameRecords.
//
// Foldkit runs `update` once per Message, right away. When the Model
// changed, it waits for the next animation frame and then runs `view` and
// `patch` once, no matter how many Messages arrived. So one frame is:
//
//   update × N  →  view  →  patch  →  (a microtask later) DOM changes
//
// This file is plain TypeScript on purpose. It runs on every Message, so it
// should stay cheap and easy to follow.

/** Messages that did not change the Model and were not followed by a render
 *  this soon are dropped. They never caused a frame. */
const IDLE_MESSAGE_TIMEOUT_MS = 100

/** Keep at most this many Messages in one frame, so a runaway loop
 *  cannot grow memory without bound. */
const MAX_MESSAGES_PER_FRAME = 200

export type FrameListener = (frame: FrameRecord) => void

export type FrameBuilder = Readonly<{
  /** Called for every Message `update` handled. */
  addMessage: (message: MessageRecord) => void
  /** Called after `view` ran. */
  setViewMs: (durationMs: number) => void
  /** Called after `patch` ran. Finishes the frame a microtask later, once
   *  the browser has reported the DOM changes. */
  closeFrame: (patchMs: number) => void
  /** `true` between `closeFrame` and the moment the frame is finished. */
  isClosing: () => boolean
  /** Records DOM changes that no live frame caused: a DevTools replay. */
  addReplay: (changes: ReadonlyArray<DomChange>) => void
  subscribe: (listener: FrameListener) => () => void
  /** The most recent frames, oldest first. */
  recentFrames: () => ReadonlyArray<FrameRecord>
  clear: () => void
}>

export type FrameBuilderOptions = Readonly<{
  /** How many finished frames to keep. */
  maxFrames: number
  /** Returns every DOM change seen since the last call. */
  takeDomChanges: () => ReadonlyArray<DomChange>
  /** The DevTools history index to stamp on each live frame. Only set by
   *  the experimental DevTools link. */
  historyIndex?: () => number | undefined
  /** Defaults to `performance.now`. Tests pass a fake clock. */
  now?: () => number
}>

export const makeFrameBuilder = (
  options: FrameBuilderOptions,
): FrameBuilder => {
  const now = options.now ?? (() => performance.now())
  const listeners = new Set<FrameListener>()
  let frames: Array<FrameRecord> = []
  let nextId = 0

  // The frame being collected right now.
  let openMessages: Array<MessageRecord> = []
  let lastMessageAt = 0
  let viewMs = 0

  // A frame that has patched but is waiting for its DOM changes.
  let closingFrame: Omit<FrameRecord, 'changes' | 'isWasted'> | undefined

  const emit = (frame: FrameRecord): void => {
    frames.push(frame)
    if (frames.length > options.maxFrames) {
      frames = frames.slice(-options.maxFrames)
    }
    for (const listener of listeners) {
      listener(frame)
    }
  }

  const addMessage = (message: MessageRecord): void => {
    const at = now()
    const isFrameDirty = openMessages.some(m => m.changedModel)
    if (!isFrameDirty && at - lastMessageAt > IDLE_MESSAGE_TIMEOUT_MS) {
      openMessages = []
    }
    lastMessageAt = at
    openMessages.push(message)
    if (openMessages.length > MAX_MESSAGES_PER_FRAME) {
      openMessages.shift()
    }
  }

  const setViewMs = (durationMs: number): void => {
    viewMs = durationMs
  }

  const finishFrame = (): void => {
    if (closingFrame === undefined) {
      return
    }
    const frame = closingFrame
    closingFrame = undefined

    const changes = options.takeDomChanges()
    const changedMessages = frame.messages.filter(m => m.changedModel)
    const isWasted =
      changedMessages.length > 0 &&
      (changes.length === 0 || changedMessages.every(m => m.isEqualInValue))

    emit({ ...frame, changes, isWasted })
  }

  const closeFrame = (patchMs: number): void => {
    // A previous frame that never got its microtask (rare, but possible
    // when frames run back to back inside one task) is finished first.
    finishFrame()

    const messages = openMessages
    const updateMs = messages.reduce((sum, m) => sum + m.updateMs, 0)
    closingFrame = {
      id: nextId++,
      at: now(),
      messages,
      updateMs,
      viewMs,
      patchMs,
      totalMs: updateMs + viewMs + patchMs,
      isReplay: false,
      historyIndex: options.historyIndex?.(),
    }
    openMessages = []
    viewMs = 0

    // MutationObserver delivers its records in a microtask. Ours is queued
    // after the browser's, so by the time it runs, the changes are in.
    queueMicrotask(finishFrame)
  }

  const addReplay = (changes: ReadonlyArray<DomChange>): void => {
    if (changes.length === 0) {
      return
    }
    emit({
      id: nextId++,
      at: now(),
      messages: [],
      updateMs: 0,
      viewMs: 0,
      patchMs: 0,
      totalMs: 0,
      changes,
      isWasted: false,
      isReplay: true,
      historyIndex: undefined,
    })
  }

  const subscribe = (listener: FrameListener): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  return {
    addMessage,
    setViewMs,
    closeFrame,
    isClosing: () => closingFrame !== undefined,
    addReplay,
    subscribe,
    recentFrames: () => frames,
    clear: () => {
      frames = []
    },
  }
}
