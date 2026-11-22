import { afterEach, describe, expect, test, vi } from 'vitest'

import { makeChime } from './sound'

// A stand-in for Web Audio that counts the chimes started.
const fakeAudio = () => {
  const counts = { contexts: 0, chimes: 0 }
  const param = { setValueAtTime: () => {}, setTargetAtTime: () => {} }
  class FakeAudioContext {
    state = 'running'
    currentTime = 0
    destination = {}
    constructor() {
      counts.contexts += 1
    }
    createOscillator() {
      return {
        type: 'sine',
        frequency: param,
        connect: (node: unknown) => node,
        start: () => {
          counts.chimes += 1
        },
        stop: () => {},
      }
    }
    createGain() {
      return { gain: param, connect: (node: unknown) => node }
    }
    resume() {
      return Promise.resolve()
    }
    close() {
      return Promise.resolve()
    }
  }
  vi.stubGlobal('AudioContext', FakeAudioContext)
  return counts
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('chime', () => {
  test('stays silent and makes no AudioContext while sound is off', () => {
    const counts = fakeAudio()
    const chime = makeChime(() => false)
    chime.notify()
    chime.notify()
    expect(counts).toEqual({ contexts: 0, chimes: 0 })
  })

  test('plays at most once a second while sound is on', () => {
    const counts = fakeAudio()
    let time = 0
    const chime = makeChime(
      () => true,
      () => time,
    )
    chime.notify()
    time = 500
    chime.notify()
    expect(counts.chimes).toBe(1)
    time = 1000
    chime.notify()
    expect(counts.chimes).toBe(2)
    // One AudioContext is reused for every chime.
    expect(counts.contexts).toBe(1)
  })

  test('does not throw without Web Audio', () => {
    vi.stubGlobal('AudioContext', undefined)
    const chime = makeChime(() => true)
    expect(() => chime.play()).not.toThrow()
  })
})
