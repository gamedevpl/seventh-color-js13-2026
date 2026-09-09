#!/usr/bin/env python3
"""Score for The Seventh Color's trailer.

The reference is the way a fantasy film was scored in 1985, not the way a
trailer is scored now, and the two differ in one thing above all: THIS ONE
SUSTAINS. There are no braams under every section and no drum on every cut.
There is a string bed that changes colour as the story does, a choir over
it, the game's own themes carried on a celesta and then on the whole
orchestra, timpani that roll rather than strike - and exactly one impact in
the film, on the frame the horn breaks. A cut that dissolves needs music
that holds a note through the dissolve; a cut that cuts needs a drum.

Every melodic line is still one of the eight compositions in
native/src/audio.js. `wonder` opens the film as a music box and closes it
on everything at once; `shadow` is the floor under Darkness; `winter`,
`trail`, `marsh`, `castle` and `throne` are the road and the castle. The
pad chords under them are built from those same tracks' own bass notes, so
the harmony is the game's too.

Four voices sit on top (audio/voice-native.mjs) and the bed ducks under
them as one envelope across the whole film.

    python3 tools/trailer/audio/render-native.py

Writes build/trailer-native/audio/seventh.wav.
"""
import json
import os
import wave

import numpy as np

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'build', 'trailer-native', 'audio'))
BEATS_JSON = os.path.normpath(os.path.join(OUT_DIR, '..', 'beats.json'))

with open(BEATS_JSON) as fh:
    B = json.load(fh)
CUTS = B['cuts']
MARK = {m['name']: m['at'] for m in B['marks']}
VO = B.get('vo', [])
VO_DIR = os.path.join(OUT_DIR, 'vo')
BEAT = B['beat']
b_ = lambda n: n * BEAT
END = B['cues']['end']
ENDCARD = 5.6
DUR = END + ENDCARD + 1.0

# --------------------------------------------------------------- the game --
# native/src/audio.js, verbatim. ' ' is a rest; every other character is a
# note, 440 * 2**((code - 78) / 12). Rows are [wave, gain, pattern].
TRACKS = {
    'shadow': (58, [('t', 0.72, '/  /  - /  2 1  '), ('w', 0.16, '; > A > : = @ = '), ('n', 0.08, 'K     H K    H  ')]),
    'wonder': (82, [('s', 0.62, 'S W Z U R U Z W '), ('t', 0.42, ';   8   6   ; 6 '), ('s', 0.20, ' N   P   U   S  ')]),
    'winter': (52, [('s', 0.56, 'U   T   P   Q   '), ('t', 0.48, '1     8 9     8 '), ('n', 0.04, '  H       H     ')]),
    'trail': (74, [('t', 0.52, 'G N I P K N I G '), ('s', 0.48, ' S  U W  Z  W U '), ('t', 0.32, '/   6   8   4 6 ')]),
    'marsh': (66, [('t', 0.62, '/  0 /  + - /   '), ('s', 0.38, ' N Q  O  J M  N '), ('w', 0.12, '; A  <  ; >  :  '), ('n', 0.05, 'K  H    K H   H ')]),
    'castle': (64, [('t', 0.58, '-  ( -  0  / )  '), ('s', 0.28, ' L  Q O  T  S L '), ('n', 0.04, 'K   H   K  H    ')]),
    'throne': (60, [('w', 0.20, '/ / )  -/  0 .  '), ('t', 0.58, ';  > A  : = @ > '), ('s', 0.24, ' N M  J  Q P  M '), ('n', 0.05, 'K  H  K   H K   ')]),
    'pursuit': (104, [('t', 0.62, '/ /*- / /2 1. * '), ('w', 0.16, 'G JN MJ G FIL I '), ('n', 0.07, 'K H KH HK H K HH')]),
}
FREQ = lambda ch: 440.0 * 2.0 ** ((ord(ch) - 78) / 12.0)

N = int(SR * DUR)
dry = np.zeros(N)
wet = np.zeros(N)
RNG = np.random.default_rng(4)


def add(dst, t, mono, gain=1.0):
    i = int(t * SR)
    if i >= len(dst) or i < -len(mono) or gain <= 0:
        return
    if i < 0:
        mono, i = mono[-i:], 0
    n = min(len(mono), len(dst) - i)
    if n > 0:
        dst[i:i + n] += gain * mono[:n]


def put(t, mono, gain=1.0, room=0.0):
    add(dry, t, mono, gain)
    if room:
        add(wet, t, mono, gain * room)


# ---------------------------------------------------------- the trailer kit --
def adsr(n, a, d, s, r):
    a, d, r = max(1, int(a * SR)), max(1, int(d * SR)), max(1, int(r * SR))
    a = min(a, n); d = min(d, max(1, n - a)); r = min(r, max(1, n - a - d))
    hold = max(0, n - a - d - r)
    return np.concatenate([np.linspace(0, 1, a), np.linspace(1, s, d),
                           np.full(hold, s), np.linspace(s, 0, r)])[:n]


def saw(f, n, harmonics=22):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, harmonics + 1):
        if f * k > SR / 2.2:
            break
        out += np.sin(2 * np.pi * f * k * t) / k
    return out * (2 / np.pi)


def lp(x, k):
    """A cheap moving-average lowpass. k is the window in samples."""
    if k < 2:
        return x
    return np.convolve(x, np.ones(k) / k, mode='same')


def filt_saw(f, n, cutoff, res=2.6):
    """A sawtooth as it comes out of a resonant lowpass, built additively:
    harmonic k rolls off as a four-pole filter would and the one nearest the
    cutoff gets a resonance bump. It is not a state-variable filter, but a
    per-sample filter over ninety seconds in numpy is not a thing to write,
    and what a sequencer line needs is the SWEEP - the sound opening up -
    which this gives exactly."""
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, 30):
        fk = f * k
        if fk > SR / 2.2:
            break
        roll = 1.0 / (1.0 + (fk / cutoff) ** 4)
        bump = res / (1.0 + ((fk - cutoff) / (cutoff * 0.18)) ** 2)
        out += np.sin(2 * np.pi * fk * t) * (roll * (1 + bump)) / k
    return out * (2 / np.pi)


def arp(t0, t1, notes, rate, gain, cut0=400, cut1=2600, res=2.6, oct_shift=0, room=0.7):
    """The sequencer. The single most 1985 thing in this score: a short
    cyclic figure at a fixed rate with the filter opening across the
    section. Everything else here is weather; this is the pulse the film
    walks to."""
    step = 1.0 / rate
    i = 0
    t = t0
    span = max(0.001, t1 - t0)
    while t < t1:
        u = (t - t0) / span
        f = notes[i % len(notes)] * (2.0 ** oct_shift)
        cut = cut0 * (cut1 / cut0) ** u
        n = int(step * 1.9 * SR)
        x = filt_saw(f, n, cut, res)
        env = adsr(n, 0.004, step * 0.5, 0.25, step * 1.2)
        put(t, x * env * gain, room=room)
        i += 1
        t += step


def bass(t0, t1, f, rate, gain, room=0.25):
    step = 1.0 / rate
    t = t0
    while t < t1:
        n = int(step * 0.85 * SR)
        tt = np.arange(n) / SR
        x = (np.sin(2 * np.pi * f * tt) + 0.45 * np.sin(2 * np.pi * f * 2 * tt)
             + 0.2 * filt_saw(f, n, 260, 1.4))
        put(t, x * adsr(n, 0.008, 0.10, 0.55, step * 0.5) * gain, room=room)
        t += step


def gated(gain, length=0.30):
    """The gated snare: a noise burst, a short bright room, and the whole
    thing cut off square. Nothing dates a record to 1985 faster."""
    n = int(length * SR)
    x = RNG.standard_normal(n)
    x = x - lp(x, 5)
    body = np.sin(2 * np.pi * 190 * np.arange(n) / SR) * np.exp(-np.arange(n) / (SR * 0.03))
    env = np.exp(-np.arange(n) / (SR * 0.12))
    out = (x * 0.8 + body * 0.5) * env
    out[-int(0.02 * SR):] *= np.linspace(1, 0, int(0.02 * SR))
    return out * gain


def kick(gain):
    n = int(0.34 * SR)
    t = np.arange(n) / SR
    f = 105 * np.exp(-t * 26) + 44
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.13)
            + lp(RNG.standard_normal(n), 30) * np.exp(-t / 0.012) * 0.4) * gain


def pad(t0, t1, roots, gain, bright=0.30, attack=1.4):
    """The string bed. A chord of detuned saws, rolled well off the top, with
    a slow attack and a slower release - the thing that can hold a note
    across a dissolve, which is the whole reason this score is built the way
    it is."""
    n = int((t1 - t0) * SR)
    if n <= 0:
        return
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in roots:
        for det in (-0.004, 0.0, 0.005):
            out += saw(f * (1 + det), n, harmonics=14) / (1 + 0.9 * len(roots))
    out = lp(out, int(6 + (1 - bright) * 40))
    # A slow swell inside the note, so a four-second chord is not four
    # seconds of the same amplitude.
    breathe = 1 + 0.10 * np.sin(2 * np.pi * 0.13 * t + 1.0)
    env = np.minimum(1, np.minimum(t / attack, (t[-1] - t) / max(0.6, attack * 0.8)))
    put(t0, out * env * breathe * gain, room=0.9)


def choir(t0, t1, roots, gain, attack=1.8):
    """Voices: sines with a slow vibrato and a little of the octave above.
    Not a real choir, but at this level under strings it does the job a
    choir does, which is to make a chord sound inhabited."""
    n = int((t1 - t0) * SR)
    if n <= 0:
        return
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in roots:
        vib = 1 + 0.004 * np.sin(2 * np.pi * 4.6 * t + f)
        ph = 2 * np.pi * np.cumsum(f * vib) / SR
        out += (np.sin(ph) + 0.30 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph)) / len(roots)
    env = np.minimum(1, np.minimum(t / attack, (t[-1] - t) / max(0.8, attack)))
    put(t0, out * env * gain, room=1.15)


def roll(t0, length, gain, pitch=58):
    """Timpani, rolled and swelling rather than struck. Thirty-odd soft hits
    a second under a rising envelope."""
    n = int(length * SR)
    out = np.zeros(n + int(0.6 * SR))
    step = int(SR / 17)
    for i in range(0, n, step):
        u = i / max(1, n)
        h = taiko(0.35 + 0.9 * u ** 2, pitch=pitch, length=0.55)
        m = min(len(h), len(out) - i)
        out[i:i + m] += h[:m] * (0.5 + RNG.random() * 0.5)
    put(t0, out * gain, room=0.7)


def shock(t0, gain):
    """The one impact in the film. A struck low note that sags, a noise
    crack, and a high cluster left ringing over the top of it - which is
    what an orchestra does at a moment like this and what a braam is the
    modern shorthand for."""
    n = int(5.0 * SR)
    t = np.arange(n) / SR
    f = 44 * np.exp(-t * 1.1) + 30
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 1.5)
    crack = lp(RNG.standard_normal(n), 4) * np.exp(-t / 0.06) * 0.55
    shimmer = np.zeros(n)
    for k, g in ((1318.5, 0.10), (1567.9, 0.09), (1975.5, 0.075), (2637.0, 0.05)):
        shimmer += np.sin(2 * np.pi * k * t) * np.exp(-t / 1.9) * g
    put(t0, (body * 1.25 + crack + shimmer) * gain, room=1.0)


def braam(length, root, gain, bite=0.5, fall=0.06):
    """The low brass hit. A detuned cluster an octave apart, hard attack,
    long decay, sagging in pitch as it goes - which is what makes it a
    'braam' rather than a chord. Two layers: a filtered body and a thin
    bright one on top so it survives small speakers."""
    n = int(length * SR)
    t = np.arange(n) / SR
    bend = np.exp(-t * 0.9) * fall            # the sag, in semitone-ish units
    body = np.zeros(n)
    for mult, det, g in ((1.0, 0.000, 1.0), (1.0, 0.006, 0.9), (1.0, -0.005, 0.9),
                         (2.0, 0.004, 0.55), (2.0, -0.003, 0.5), (3.0, 0.002, 0.22)):
        f = root * mult * (1 + det)
        ph = 2 * np.pi * np.cumsum(f * (1 - bend)) / SR
        body += g * (2 / np.pi) * sum(np.sin(ph * k) / k for k in range(1, 9))
    body = lp(body, 24)
    bright = lp(saw(root * 4, n, 10), 5) * bite * 0.25
    sub = np.sin(2 * np.pi * np.cumsum(root * 0.5 * (1 - bend)) / SR) * 0.9
    env = adsr(n, 0.035, 0.35, 0.55, length * 0.72)
    # A slow tremolo, the thing that makes a held braam feel alive.
    trem = 1 + 0.14 * np.sin(2 * np.pi * 5.5 * t)
    return (body * 0.5 + bright + sub) * env * trem * gain


def taiko(gain, pitch=64, length=1.1):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = pitch * np.exp(-t * 7) + pitch * 0.55
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.24)
    skin = lp(RNG.standard_normal(n), 26) * np.exp(-t / 0.05) * 0.8
    return (body * 1.15 + skin) * gain


def sub_drop(gain, f0=70, f1=24, length=2.4):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = f0 * (f1 / f0) ** (t / length)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (length * 0.55)) * gain


def riser(length, gain, f0=200, f1=2400):
    """Noise climbing a resonant band plus a rising tone, cut dead at the
    end - the thing that makes the listener expect a hit."""
    n = int(length * SR)
    t = np.arange(n) / SR
    u = t / length
    x = RNG.standard_normal(n)
    # A one-pole bandpass swept by hand, block by block.
    out = np.zeros(n)
    step = 512
    y1 = 0.0
    for i in range(0, n, step):
        blk = x[i:i + step]
        f = f0 * (f1 / f0) ** (i / n)
        k = np.clip(f / (SR / 2), 0.002, 0.9)
        for j, v in enumerate(blk):
            y1 += k * (v - y1)
            out[i + j] = v - y1
    tone = np.sin(2 * np.pi * np.cumsum(f0 * (f1 / f0) ** u * 0.5) / SR) * 0.30
    return (out * 0.5 + tone) * (u ** 2.4) * gain


def whoosh(length, gain):
    n = int(length * SR)
    u = np.arange(n) / n
    x = lp(RNG.standard_normal(n), 9)
    env = np.sin(np.pi * u ** 1.6) ** 2
    return x * env * gain


def tick(gain, high=True):
    n = int(0.16 * SR)
    x = RNG.standard_normal(n)
    if high:
        x = x - lp(x, 6)
        env = np.exp(-np.arange(n) / (SR * 0.018))
    else:
        x = lp(x, 40)
        env = np.exp(-np.arange(n) / (SR * 0.05))
    return x * env * gain


def note(f, dur, kind, gain, a=0.006, d=0.10, s=0.55, oct2=0.0, det=0.0):
    n = max(8, int(dur * SR))
    t = np.arange(n) / SR
    def w(ff):
        if kind == 's':
            return np.sin(2 * np.pi * ff * t)
        if kind == 't':
            o = np.zeros(n)
            for k in range(1, 12, 2):
                if ff * k > SR / 2.2:
                    break
                o += ((-1) ** ((k - 1) // 2)) / (k * k) * np.sin(2 * np.pi * ff * k * t)
            return o * (8 / np.pi ** 2)
        return saw(ff, n)
    x = w(f)
    if det:
        x = 0.62 * x + 0.62 * w(f * (1 + det))
    if oct2:
        x = x + oct2 * w(f * 2)
    return x * adsr(n, a, d, s, dur * 0.55) * gain


def play(track, t0, t1, rows=None, gain=1.0, oct_shift=0, oct2=0.0, det=0.0,
         room=0.5, sustain=1.0, drums=False, every=1):
    """One of the game's tracks across a span. `every` thins it - the setup
    plays one note in two, which is what turns a tracker line into a music
    box."""
    bpm, voices = TRACKS[track]
    spb = 60.0 / bpm / 4.0
    step = 0
    t = t0
    while t < t1:
        for vi, (w, g, pat) in enumerate(voices):
            if rows is not None and vi not in rows:
                continue
            ch = pat[step % len(pat)]
            if ch == ' ' or (every > 1 and (step % every)):
                continue
            if w == 'n':
                if drums:
                    put(t, tick(g * 2.4 * gain, ch == 'H'), room=room * .4)
                continue
            f = FREQ(ch) * (2.0 ** oct_shift)
            low = f < 120
            put(t, note(f, spb * 3.4 * sustain, {'t': 't', 's': 's', 'w': 'w', 'q': 't'}[w],
                        g * gain, a=0.02 if low else 0.008, d=0.18 if low else 0.10,
                        s=0.72 if low else 0.5, oct2=0.0 if low else oct2,
                        det=0.0 if low else det), room=room)
        step += 1
        t += spb


def drone(t0, t1, f, gain, room=0.4):
    n = int((t1 - t0) * SR)
    if n <= 0:
        return
    t = np.arange(n) / SR
    x = (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 2.004 * t)
         + 0.3 * np.sin(2 * np.pi * f * 0.5 * t))
    fade = np.minimum(1, np.minimum(t / 1.5, (t[-1] - t) / 1.5))
    put(t0, x * fade * gain, room=room)


def plate(seconds, bright=0.45):
    n = int(seconds * SR)
    ir = RNG.standard_normal(n) * np.exp(-np.arange(n) / (SR * seconds / 5.0))
    ir = lp(ir, int(2 + (1 - bright) * 26))
    ir[:int(SR * 0.008)] = 0
    return ir / (np.sqrt(np.sum(ir ** 2)) + 1e-9)


# =========================================================================
# The score. Everything is placed off the cut list, because the cut is on
# the same clock the drum is.
# =========================================================================
M = MARK
cut_at = {c['name']: c['at'] for c in CUTS}
cut_times = [c['at'] for c in CUTS]
after = lambda t: [x for x in cut_times if x >= t - 1e-6]
between = lambda a, z: [x for x in cut_times if a - 1e-6 <= x < z - 1e-6]

# The chords, all built from the bass notes of the game's own tracks.
D2, A2, D3, Fs3, A3, D4 = 73.42, 110.0, 146.83, 185.00, 220.0, 293.66
D1, F3, Gs3, C4 = 36.71, 174.61, 207.65, 261.63
E2, B2, E3, G3, B3 = 82.41, 123.47, 164.81, 196.00, 246.94
SEQ = [D3, A2, D3, F3, A3, F3, D3, C4]

# --- I. INVOCATION. Twenty seconds with no pulse in them at all. A pad, a
# music box, and one sentence. The sequencer arriving later is the first
# event in the film, and it can only be an event if nothing precedes it.
pad(0.3, M['voice'] + 1.2, [D2, A2, D3, Fs3], 0.105, bright=0.22, attack=2.0)
choir(2.2, M['voice'] + 0.8, [D4, Fs3 * 2, A3 * 2], 0.036, attack=2.6)
play('wonder', 2.0, M['voice'] - 0.3, rows=[0], gain=0.165, oct_shift=1,
     det=0.004, room=1.45, sustain=3.0, every=2)
roll(M['horn1'] - 1.4, 1.4, 0.09, pitch=48)

# --- II. THE VOICE. He arrives and the sequencer arrives with him: low,
# shut, and three to the second. It does not stop again until the burst.
pad(M['voice'], M['horn'] - 0.1, [D1, D2, F3, Gs3], 0.105, bright=0.17, attack=2.6)
arp(M['voice'] + 0.8, M['creep'], [D3, F3, Gs3, F3, D3, A2], 3.0, 0.090,
    cut0=280, cut1=1100, res=2.3, room=0.85)
bass(M['voice'] + 0.8, M['creep'], D1, 1 / (BEAT * 2), 0.105)
choir(M['winter'], M['offer'], [D3, F3, Gs3], 0.036, attack=2.4)
# One soft timpani where the snow starts and one where he makes the offer.
roll(M['winter'] - 1.2, 1.2, 0.13, pitch=50)
roll(M['offer'] - 1.2, 1.2, 0.15, pitch=46)
play('winter', M['winter'] + 0.6, M['offer'] - 0.4, rows=[0], gain=0.24, det=0.003, room=1.1)

# --- III. THE BURST. The filter opens, the rate doubles, and then the one
# impact in the film - and the only fast percussion, six hits on six
# images, which stops as abruptly as it started.
arp(M['creep'], M['horn'] - 0.05, [D3, F3, Gs3, C4, Gs3, F3], 6.0, 0.115,
    cut0=800, cut1=3600, res=3.0, room=0.55)
pad(M['creep'], M['horn'], [D1 * 2 ** (1 / 12), F3, Gs3, C4], 0.095, bright=0.36, attack=1.4)
put(M['creep'], riser(M['horn'] - M['creep'], 0.24, 200, 3000), room=0.35)

shock(M['horn'], 0.95)
put(M['horn'] + 0.02, whoosh(2.8, 0.20), room=1.2)

t = M['flurry']
while t < M['kneel'] - 0.05:
    put(t, kick(0.50), room=0.16)
    put(t + BEAT * 0.5, gated(0.34), room=0.5)
    t += BEAT
arp(M['flurry'], M['kneel'] - 0.05, SEQ, 12.0, 0.115, cut0=1400, cut1=4000, res=3.4, room=0.4)
bass(M['flurry'], M['kneel'] - 0.05, D2, 2 / BEAT, 0.145)
pad(M['flurry'], M['kneel'] + 0.4, [D1, D2, F3, Gs3, C4], 0.115, bright=0.40, attack=0.5)

# --- IV. HIS LINE, AND THE TWO ANSWERS TO IT. The pulse comes back at
# half the burst's rate and stays there, and the chord warms for the only
# two faces in the film that are not his.
pad(M['kneel'], M['beam'], [D1, D2, F3, Gs3], 0.140, bright=0.26, attack=0.9)
arp(M['kneel'] + 0.4, M['beam'], SEQ, 6.0, 0.105, cut0=700, cut1=2400, res=2.8, room=0.55)
bass(M['kneel'] + 0.4, M['beam'], D2, 1 / BEAT, 0.140)
choir(M['answer'], M['beam'], [D3, Fs3, A3], 0.048, attack=1.8)
t = M['answer']
while t < M['beam'] - 0.1:
    put(t, kick(0.30), room=0.14)
    put(t + BEAT, gated(0.20), room=0.5)
    t += BEAT * 2
play('trail', M['answer'], M['beam'] - 0.2, rows=[0], gain=0.26, oct2=0.14, det=0.005, room=0.6)

# --- V. THE LIGHT, AND HIS LAST WORD. Everything doubles for the four
# beats the light is travelling, drops out over his taunt, and the film
# ends on the warmest chord in it with no pulse under it at all.
pad(M['beam'] - 0.2, M['taunt'] + 0.6, [D1, D2, F3, Gs3, C4], 0.150, bright=0.44, attack=0.7)
arp(M['beam'], M['taunt'], SEQ, 12.0, 0.140, cut0=1800, cut1=4600, res=3.6, room=0.4)
bass(M['beam'], M['taunt'], D2, 2 / BEAT, 0.170)
t = M['beam']
while t < M['taunt'] - 0.05:
    put(t, kick(0.52), room=0.14)
    put(t + BEAT * 0.5, gated(0.40), room=0.55)
    t += BEAT
put(M['beam'] - 1.2, riser(1.2, 0.26, 300, 3200), room=0.3)
# Under the taunt: the pulse thins to a heartbeat and the chord holds.
bass(M['taunt'], M['last'] - 0.2, D1, 1 / (BEAT * 2), 0.085)
pad(M['taunt'], M['last'] + 0.4, [D1, D2, F3, Gs3], 0.105, bright=0.20, attack=1.2)
roll(M['last'] - 1.6, 1.6, 0.17, pitch=44)

pad(M['last'] - 0.2, DUR - 1.6, [D2, A2, D3, Fs3, A3], 0.170, bright=0.30, attack=3.2)
choir(M['last'] + 0.8, DUR - 1.6, [D4, Fs3 * 2, A3 * 2, D3 * 2], 0.058, attack=3.0)
play('wonder', M['last'] + 1.2, DUR - 1.6, rows=[0], gain=0.30, oct_shift=1,
     det=0.004, room=1.35, sustain=2.6, every=2)
play('wonder', END - 1.0, DUR - 1.6, gain=0.44, oct2=0.28, det=0.006, room=0.85)
# The hand-over to the title: one swell, no strike. A film that has held off
# hitting anything since the horn does not start now.
put(END - 0.7, riser(0.7, 0.15, 200, 1400), room=0.6)

# =========================================================================
# The voices, and the hole in the music they speak through.
# =========================================================================
def read_wav(path_):
    with wave.open(path_, 'rb') as fh:
        n = fh.getnframes()
        a = np.frombuffer(fh.readframes(n), dtype='<i2').astype(np.float64) / 32768.0
        if fh.getnchannels() == 2:
            a = a.reshape(-1, 2).mean(axis=1)
    return a


def level(a, target=0.132):
    """Every line to the same presence. loudnorm gets each file close on
    its own terms, but a short line with a pause in it and a long even one
    come out three or four dB apart, and in a mix under percussion that is
    the difference between a line you hear and a line you catch."""
    loud = a[np.abs(a) > 0.02]
    rms = np.sqrt(np.mean(loud ** 2)) if len(loud) > 400 else np.sqrt(np.mean(a ** 2))
    return a * (target / (rms + 1e-9))


voice = np.zeros(N)
vwet = np.zeros(N)
# The duck: the music drops under every line and comes back after it.
# Written as an envelope over the whole film rather than per-cue, because
# two lines close together should not duck twice and let the bed jump up
# for a tenth of a second between them.
duck = np.ones(N)
DUCK = 0.33                              # about -9.6dB under speech
for v in VO:
    a = level(read_wav(os.path.join(VO_DIR, f"{v['id']}.wav")))
    add(voice, v['at'], a, 1.0)
    add(vwet, v['at'], a, 0.16)          # a touch of the same room, no more
    i0 = max(0, int((v['at'] - 0.30) * SR))
    i1 = min(N, int((v['at'] + v['dur'] + 0.45) * SR))
    lead, tailn = int(0.25 * SR), int(0.45 * SR)
    seg = np.full(i1 - i0, DUCK)
    seg[:min(lead, len(seg))] = np.linspace(1, DUCK, min(lead, len(seg)))
    if len(seg) > tailn:
        seg[-tailn:] = np.linspace(DUCK, 1, tailn)
    duck[i0:i1] = np.minimum(duck[i0:i1], seg)
print(f'{len(VO)} lines, {sum(v["dur"] for v in VO):.1f}s of speech, ducking to {20 * np.log10(DUCK):.1f}dB')

print('mixing the plate...')
ir = plate(2.8, bright=0.45)
size = 1
while size < N + len(ir):
    size *= 2
rev = np.fft.irfft(np.fft.rfft(wet, size) * np.fft.rfft(ir, size))[:N]
vrev = np.fft.irfft(np.fft.rfft(vwet, size) * np.fft.rfft(ir, size))[:N]
# The score ducks; the voice does not. Six to eight dB over the ducked bed
# is where a line stops being something you catch and becomes something you
# hear - at two or three it is still competing with a taiko.
mix = (dry + rev * 0.5) * duck + (voice * 1.70 + vrev * 0.5)
mix = lp(mix, 3)

head = int(SR * 0.5)
mix[:head] *= np.linspace(0, 1, head)
tail = int(SR * 1.8)
mix[-tail:] *= np.linspace(1, 0, tail) ** 1.4

# A soft knee on the peaks rather than a hard clip: the braams are meant to
# be the loudest thing in the film and a limiter is what lets them be.
lim = 0.92
mix = np.tanh(mix / lim * 0.92) * lim
mix = mix / (np.max(np.abs(mix)) + 1e-9) * 0.94
stereo = np.stack([mix, mix], axis=1)

os.makedirs(OUT_DIR, exist_ok=True)
out = os.path.join(OUT_DIR, 'seventh.wav')
with wave.open(out, 'wb') as fh:
    fh.setnchannels(2)
    fh.setsampwidth(2)
    fh.setframerate(SR)
    fh.writeframes((np.clip(stereo, -1, 1) * 32767).astype('<i2').tobytes())

print('the arc, in dB over two seconds from each mark:')
for name in ('open', 'horn1', 'voice', 'winter', 'offer', 'creep', 'horn',
             'flurry', 'kneel', 'answer', 'beam', 'taunt', 'last'):
    a = int(M[name] * SR)
    z = min(N, a + int(2.0 * SR))
    r = np.sqrt(np.mean(mix[a:z] ** 2)) if z > a else 0
    print(f'  {name:9s} {M[name]:6.2f}s  {20 * np.log10(r + 1e-9):6.1f}')
print(f'wrote {out}, {DUR:.2f}s, {len(CUTS)} cuts hit')
