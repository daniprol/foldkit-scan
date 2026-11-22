// An optional chime when something goes wrong, so you can click around your
// app without watching the panel. Off by default.
//
// The tone is made with the Web Audio API, so there is no sound file. The
// AudioContext is created the first time a chime plays, never while sound
// is off. Browsers only let audio start after the user has clicked or typed
// on the page, which is always true by the time the app is slow.

/** Never chime more often than this. */
const MIN_GAP_MS = 1000

/** Two soft notes, the second lower: "something's off", not an alarm. */
const NOTES_HZ: ReadonlyArray<number> = [587.33, 440]
const NOTE_S = 0.12
const GAIN = 0.08

export type Chime = Readonly<{
  /** Plays the chime if sound is on and it has not played in the last
   *  second. Cheap to call on every frame. */
  notify: () => void
  /** Plays it now, whatever the setting. Used when sound is switched on. */
  play: () => void
  dispose: () => void
}>

export const makeChime = (
  isOn: () => boolean,
  now: () => number = () => performance.now(),
): Chime => {
  let context: AudioContext | undefined
  let lastPlayedAt = Number.NEGATIVE_INFINITY

  const play = (): void => {
    lastPlayedAt = now()
    try {
      context ??= new AudioContext()
      if (context.state === 'suspended') void context.resume()
      const start = context.currentTime
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      NOTES_HZ.forEach((hz, index) => {
        oscillator.frequency.setValueAtTime(hz, start + index * NOTE_S)
      })
      const end = start + NOTES_HZ.length * NOTE_S
      gain.gain.setValueAtTime(GAIN, start)
      gain.gain.setTargetAtTime(0, end - NOTE_S / 2, 0.03)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(start)
      oscillator.stop(end + 0.1)
    } catch {
      // No Web Audio here (an old browser or a test runner). Stay quiet.
    }
  }

  return {
    notify: () => {
      if (isOn() && now() - lastPlayedAt >= MIN_GAP_MS) play()
    },
    play,
    dispose: () => {
      void context?.close()
      context = undefined
    },
  }
}

/** A single frame this slow is a visible stutter, worth a chime on its own. */
export const STUTTER_MS = 100
