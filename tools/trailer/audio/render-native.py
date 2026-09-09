#!/usr/bin/env python3
"""Trailer score for The Seventh Color.

This is trailer music, with the grammar trailer music has: a quiet setup on
a pulse, one enormous low brass hit where the story turns, a percussion bed
that arrives with the montage and doubles in the drop, risers into every
section, and a full stop before the last two cards. What keeps it the
GAME'S trailer rather than a stock cue is that every melodic line in it is
one of the eight compositions in native/src/audio.js - `wonder` in the
setup as a music box, `winter` under the snow, `trail`, `marsh` and
`castle` down the road, `throne` under the drop, and `wonder` again, whole
and loud, over the dawn. The film opens on one voice of it and closes on
six, and everything between is percussion and weather.

The cut is on a grid - 92 to the minute, every shot a whole number of beats
- and build/trailer-native/beats.json lists every cut. So a hit does not
have to be placed by ear against the picture: it is placed ON the picture,
because the picture was cut to the same clock. That is the difference
between a montage with music over it and a trailer.

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

# --- ACT ONE. A drone, a heartbeat, and the game's theme as a music box two
# octaves up, one note in two. The narrator does the rest.
drone(0.0, M['horn'] - 0.1, 55.0, 0.055)
drone(6.0, M['horn'] - 0.1, 82.41, 0.028)
play('wonder', 1.2, M['darkness1'] - 0.1, rows=[0], gain=0.19, oct_shift=1, det=0.004,
     room=1.35, sustain=2.6, every=2)
# His hall gets his own theme under him, low, with no lead - he does not get
# a tune, he gets a floor.
play('shadow', M['darkness1'], M['creep'] - 0.1, rows=[0, 1], gain=0.30, det=0.006, room=0.8)
t = 4.57
while t < M['creep']:
    put(t, taiko(0.11, pitch=52, length=1.6), room=0.5)
    t += BEAT * 2
for c in CUTS:
    if c['kind'] == 'card' and c['at'] < M['creep'] + 1:
        put(c['at'] - 0.55, whoosh(0.75, 0.09), room=0.7)

# --- the tension. Four beats of riser, and everything stops one beat short.
put(M['creep'], riser(M['horn'] - M['creep'], 0.26, 150, 2600), room=0.35)
t = M['creep']
while t < M['horn'] - BEAT:
    put(t, taiko(0.17, pitch=52, length=1.2), room=0.4)
    t += BEAT
drone(M['creep'], M['horn'], 55.0 * 2 ** (1 / 12), 0.06)

# --- THE HORN. The film's first loud thing.
put(M['horn'], braam(4.2, 41.2, 0.95, bite=0.75), room=0.55)
put(M['horn'], sub_drop(0.75), room=0.1)
put(M['horn'], taiko(0.85, pitch=58, length=1.8), room=0.35)
put(M['horn'] + 0.02, whoosh(2.2, 0.22), room=1.1)

# --- the winter. He is talking over it, so it plays under him.
play('winter', M['winter'], M['road'] - 0.15, gain=0.42, det=0.003, room=0.9)
drone(M['winter'], M['road'], 49.0, 0.10)
t = M['winter']
while t < M['road']:
    put(t, taiko(0.28, pitch=48, length=1.5), room=0.45)
    t += BEAT * 2
put(M['gone'], braam(3.0, 36.7, 0.44, bite=0.35), room=0.6)
put(M['gone'], taiko(0.42, pitch=52), room=0.3)
put(M['road'] - 1.4, riser(1.4, 0.24, 200, 2000), room=0.3)

# --- ACT TWO. The percussion bed arrives, and from here every cut gets a hit.
play('trail', M['road'], M['offer'] - 0.1, gain=0.52, oct2=0.16, det=0.005, room=0.45, drums=True)
play('castle', M['offer'], M['drop'] - 0.1, gain=0.50, det=0.005, room=0.6, drums=True)
drone(M['road'], M['drop'], 41.2, 0.10)
t = M['road']
while t < M['drop']:
    put(t, taiko(0.30, pitch=50, length=1.0), room=0.3)
    put(t + BEAT * .5, tick(0.10, True), room=0.25)
    t += BEAT
for x in between(M['road'], M['drop']):
    put(x, taiko(0.46, pitch=54, length=1.2), room=0.35)
put(M['offer'], braam(3.4, 38.9, 0.48, bite=0.5), room=0.5)
put(M['refuse'], braam(2.6, 46.2, 0.46, bite=0.6), room=0.45)
put(M['drop'] - 1.7, riser(1.7, 0.34, 220, 3000), room=0.3)

# --- THE DROP. A hit on every beat and every cut, `throne` under it.
play('throne', M['drop'], M['land'], gain=0.66, det=0.006, room=0.5, drums=True)
drone(M['drop'], M['land'] + 2.0, 36.71, 0.13)
t = M['drop']
while t < M['land']:
    put(t, taiko(0.58, pitch=52, length=0.9), room=0.25)
    put(t + BEAT * .5, taiko(0.28, pitch=64, length=0.5), room=0.2)
    put(t + BEAT * .25, tick(0.09, True), room=0.2)
    put(t + BEAT * .75, tick(0.09, True), room=0.2)
    t += BEAT
for x in between(M['drop'], M['land']):
    put(x, taiko(0.66, pitch=56, length=1.1), room=0.3)
put(M['shaft'] - 0.9, riser(0.9, 0.30, 400, 4000), room=0.25)
put(M['land'] - 1.6, riser(1.6, 0.42, 260, 3800), room=0.3)

# The landing, and then the film stops dead.
put(M['land'], braam(5.0, 32.7, 1.0, bite=0.9), room=0.65)
put(M['land'], sub_drop(0.85, 80, 22, 2.8), room=0.1)
put(M['land'], taiko(0.95, pitch=60, length=2.2), room=0.4)
put(M['land'] + 0.01, whoosh(3.0, 0.26), room=1.2)

# --- the two cards. A sustain, one hit each, and true silence between them,
# because Jack is speaking and he is the only thing that should be.
drone(cut_at['c3'], M['hold'] - 0.35, 32.7, 0.070, room=0.6)
put(cut_at['c3'], taiko(0.30, pitch=46, length=2.0), room=0.5)
drone(cut_at['c4'], M['dawn'], 41.2, 0.10, room=0.6)
put(cut_at['c4'], taiko(0.36, pitch=46, length=2.0), room=0.5)
put(cut_at['c4'], braam(3.6, 41.2, 0.34, bite=0.25), room=0.7)
put(M['dawn'] - 1.2, riser(1.2, 0.26, 200, 1800), room=0.4)

# --- THE DAWN. The theme, whole, in octaves - and it carries the end card,
# which the first pass did not: the picture stopped, the music stopped with
# it, and five seconds of title sat there in a room tone.
D0, D1 = M['dawn'], DUR - 1.4
play('wonder', D0, D1, gain=0.80, oct2=0.34, det=0.006, room=0.65)
play('wonder', D0 + 0.8, D1, rows=[0], gain=0.32, oct_shift=1, det=0.004, room=1.15, sustain=2.0)
play('wonder', M['named'], D1, rows=[1], gain=0.52, oct_shift=-1, room=0.5)
play('wonder', M['named'], D1, rows=[2], gain=0.32, oct_shift=1, det=0.004, room=0.95)
drone(D0, D1, 73.42, 0.18)
# One last swell where the picture hands over to the card.
put(END - 0.9, riser(0.9, 0.20, 200, 1600), room=0.5)
put(END, taiko(0.42, pitch=44, length=2.8), room=0.7)
put(END, braam(4.6, 55.0, 0.34, bite=0.2), room=0.8)
put(D0, taiko(0.44, pitch=44, length=2.6), room=0.6)
put(M['named'], taiko(0.40, pitch=48, length=2.4), room=0.6)
put(M['named'], braam(4.0, 55.0, 0.30, bite=0.2), room=0.7)

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
for name in ('open', 'darkness1', 'creep', 'horn', 'winter', 'gone', 'road',
             'offer', 'refuse', 'drop', 'land', 'hold', 'dawn', 'named'):
    a = int(M[name] * SR)
    z = min(N, a + int(2.0 * SR))
    r = np.sqrt(np.mean(mix[a:z] ** 2)) if z > a else 0
    print(f'  {name:9s} {M[name]:6.2f}s  {20 * np.log10(r + 1e-9):6.1f}')
print(f'wrote {out}, {DUR:.2f}s, {len(CUTS)} cuts hit')
