#!/usr/bin/env python3
"""THE SEVENTH COLOUR, arranged for The Seventh Color trailer.

Not one note of this is new. The game carries eight compositions in
native/src/audio.js - sixteen-step patterns, one character per step, packed
so a context-mixing compressor can eat them - and they are already the
right eight: a theme for the forest, one for Darkness, one for the winter,
one for the road, the marsh, the castle, the throne, and one at a hundred
and four for the floor giving way. A trailer that wrote its own music for
this game would be throwing away the only score it needed.

What is new is the arrangement and the playing. The game has one square
oscillator per voice and no room; this has:

  - a real envelope per part, so a bass note holds and a lead plucks;
  - octave doubling and a detuned pair on the leads, which is the whole
    difference between a tracker and an instrument;
  - a sub under the low rows through the castle, so the throne has a floor;
  - one plate reverb, convolved, sized per movement - close in the glade,
    enormous in the hall, gone entirely at the moment the horn breaks.

And it is a SCORE rather than a loop: every movement starts on a cue the
cut wrote (build/trailer-native/beats.json), so the music is arranged to
the picture and never the other way round. The shape it plays:

  the prologue    wonder, two octaves up, one note at a time, all room
  the council     shadow, low and slow, no lead at all
  the glade       wonder, warm and whole - the only place the film is happy
  the creep       wonder with the tune taken out; just the pulse
  THE HORN        everything stops. one impact, and a tail that is the
                  first thirty seconds played backwards under it
  the winter      winter, and it does not leave for a minute
  the road        trail, then marsh: the first movement with a pulse
  the castle      castle into throne, the sub arriving under it
  the beam        throne, held, and a strike where the light lands
  the fall        pursuit, at a hundred and four - the only fast bar
  the dawn        wonder again, everything at once, in octaves

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
C = B['cues']
MARK = {m['name']: m['at'] for m in B['marks']}
END = C['end']
# The end card crossfades in over the last of the picture, so the score has
# to keep playing past the last frame of game.
ENDCARD = 5.6
DUR = END + ENDCARD + 1.0

# --------------------------------------------------------------- the game --
# native/src/audio.js, verbatim. ' ' is a rest; every other character is a
# note, 440 * 2**((code - 78) / 12). The row is [wave, gain, pattern] and
# 'n' is the noise channel - 'H' is the high hit, anything else the low one.
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

buf = np.zeros(int(SR * DUR))
wet = np.zeros(int(SR * DUR))       # everything that goes to the plate


def add(dst, t, mono, gain):
    start = int(t * SR)
    if start >= len(dst) or gain <= 0 or start < 0:
        return
    n = min(len(mono), len(dst) - start)
    if n > 0:
        dst[start:start + n] += gain * mono[:n]


# ------------------------------------------------------------ instruments --
def adsr(n, a, d, s, r):
    """Sample-count ADSR. Everything here is a note of known length, so the
    release is inside the note rather than after it."""
    a, d, r = max(1, int(a * SR)), max(1, int(d * SR)), max(1, int(r * SR))
    a = min(a, n)
    d = min(d, max(1, n - a))
    r = min(r, max(1, n - a - d))
    hold = max(0, n - a - d - r)
    return np.concatenate([
        np.linspace(0, 1, a),
        np.linspace(1, s, d),
        np.full(hold, s),
        np.linspace(s, 0, r),
    ])[:n]


def osc(freq, n, kind, detune=0.0):
    """Bandlimited enough for the job: a saw and a square built from a fixed
    stack of harmonics rather than a hard edge, which is what stops the low
    rows of `shadow` and `throne` from fizzing at this sample rate."""
    t = np.arange(n) / SR
    f = freq * (1.0 + detune)
    if kind == 's':
        return np.sin(2 * np.pi * f * t)
    if kind == 't':
        # A triangle is odd harmonics falling as 1/k^2, alternating sign.
        out = np.zeros(n)
        for k in range(1, 12, 2):
            if f * k > SR / 2.2:
                break
            out += ((-1) ** ((k - 1) // 2)) / (k * k) * np.sin(2 * np.pi * f * k * t)
        return out * (8 / np.pi ** 2)
    if kind == 'q':
        out = np.zeros(n)
        for k in range(1, 16, 2):
            if f * k > SR / 2.2:
                break
            out += np.sin(2 * np.pi * f * k * t) / k
        return out * (4 / np.pi)
    # 'w' - sawtooth
    out = np.zeros(n)
    for k in range(1, 20):
        if f * k > SR / 2.2:
            break
        out += np.sin(2 * np.pi * f * k * t) / k
    return out * (2 / np.pi)


def note(freq, dur, kind, gain, a=0.006, d=0.10, s=0.55, r=None, oct2=0.0, det=0.0):
    """One note. `oct2` mixes in the octave above and `det` a second copy a
    few cents off - between them that is most of the distance from a
    tracker channel to something that sounds played."""
    n = max(8, int(dur * SR))
    if r is None:
        r = dur * 0.55
    e = adsr(n, a, d, s, r)
    w = osc(freq, n, kind)
    if det:
        w = 0.6 * w + 0.6 * osc(freq, n, kind, det)
    if oct2:
        w = w + oct2 * osc(freq * 2, n, kind)
    return w * e * gain


def hit(dur, high, gain):
    """The noise channel. The game filters white noise one way for a hat and
    the other for a kick; this gives the kick a pitched body as well, since
    a lowpassed noise burst on its own is a rustle, not a drum."""
    n = int(dur * SR)
    rng = np.random.default_rng(7 if high else 3)
    x = rng.standard_normal(n)
    if high:
        # A one-pole highpass, then a fast decay.
        y = np.zeros(n)
        prev = 0.0
        for i in range(0, n, 1024):
            blk = x[i:i + 1024]
            y[i:i + 1024] = blk - np.concatenate([[prev], blk[:-1]]) * 0.92
            prev = blk[-1] if len(blk) else prev
        env = np.exp(-np.arange(n) / (SR * 0.03))
        return y * env * gain
    y = np.convolve(x, np.ones(48) / 48, mode='same')
    env = np.exp(-np.arange(n) / (SR * 0.10))
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * 52 * t) * np.exp(-t / 0.12)
    return (y * 0.6 + body * 1.1) * env * gain


def sub(freq, dur, gain):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * freq * t) * adsr(n, 0.02, 0.1, 0.8, dur * 0.4) * gain


def impact(gain, length=3.2):
    """The horn. A body that falls a fifth as it decays, a noise crack on
    the front, and nothing else in the mix for two seconds afterwards."""
    n = int(length * SR)
    t = np.arange(n) / SR
    f = 78 * np.exp(-t * 1.5) + 34
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.9)
    rng = np.random.default_rng(11)
    crack = rng.standard_normal(n) * np.exp(-t / 0.05) * 0.5
    ring = np.sin(2 * np.pi * 1870 * t) * np.exp(-t / 0.35) * 0.10
    return (body * 1.2 + crack + ring) * gain


def plate(seconds, bright=0.5):
    """A decaying noise impulse response. Cheap, and after an FFT convolution
    it is the difference between eight square waves and a room."""
    n = int(seconds * SR)
    rng = np.random.default_rng(23)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / (SR * seconds / 5.0))
    # Roll the top off so the tail is a room and not a hiss.
    k = int(2 + (1 - bright) * 26)
    ir = np.convolve(ir, np.ones(k) / k, mode='same')
    ir[:int(SR * 0.008)] = 0
    return ir / (np.sqrt(np.sum(ir ** 2)) + 1e-9)


# ------------------------------------------------------------- the arranger --
def play(track, t0, t1, rows=None, gain=1.0, oct_shift=0, lead_oct2=0.0,
         det=0.0, wet_gain=0.5, sub_row=None, sustain=1.0, drums=True):
    """Lay one of the game's tracks across a span of the film.

    `rows` selects which of its voices play - taking the tune out of
    `wonder` is what the creep is - and everything else is how it is
    played rather than what is played."""
    bpm, voices = TRACKS[track]
    spb = 60.0 / bpm / 4.0
    step = 0
    t = t0
    while t < t1:
        for vi, (w, g, pat) in enumerate(voices):
            if rows is not None and vi not in rows:
                continue
            ch = pat[step % len(pat)]
            if ch == ' ':
                continue
            if w == 'n':
                if not drums:
                    continue
                s = hit(0.22, ch == 'H', g * 3.2 * gain)
                add(buf, t, s, 1.0)
                add(wet, t, s, wet_gain * 0.5)
                continue
            f = FREQ(ch) * (2.0 ** oct_shift)
            dur = spb * 3.4 * sustain
            kind = {'t': 't', 's': 's', 'w': 'w', 'q': 'q'}[w]
            # The lowest row of a track is its bass: long, held, no octave.
            low = f < 120
            s = note(f, dur, kind, g * gain,
                     a=0.02 if low else 0.008,
                     d=0.18 if low else 0.10,
                     s=0.72 if low else 0.5,
                     oct2=0.0 if low else lead_oct2,
                     det=0.0 if low else det)
            add(buf, t, s, 1.0)
            add(wet, t, s, wet_gain)
            if sub_row is not None and vi == sub_row:
                add(buf, t, sub(f / 2, dur * 0.9, g * gain * 0.55), 1.0)
        step += 1
        t += spb


def drone(t0, t1, freq, gain):
    n = int((t1 - t0) * SR)
    t = np.arange(n) / SR
    x = (np.sin(2 * np.pi * freq * t) + 0.5 * np.sin(2 * np.pi * freq * 2.003 * t)
         + 0.25 * np.sin(2 * np.pi * freq * 0.5 * t))
    fade = np.minimum(1, np.minimum(t / 1.2, (t[-1] - t) / 1.2)) if n else x
    add(buf, t0, x * fade * gain, 1.0)
    add(wet, t0, x * fade * gain, 0.35)


# =========================================================================
# The score, movement by movement, on the cut's own clock.
# =========================================================================
K = lambda name: C[name] if name in C else MARK[name]

# --- the prologue. One note at a time, two octaves up, and all room. The
# tune is `wonder` - so the last movement of the film is answering the
# first, which is the whole story in one gesture.
play('wonder', K('open'), K('council') - 0.15, rows=[0], gain=0.30,
     oct_shift=1, det=0.004, wet_gain=1.25, sustain=2.4)
drone(K('open'), K('council') - 0.15, 73.42, 0.16)

# --- the council. No lead: he does not get a tune.
play('shadow', K('council'), K('glade') - 0.2, rows=[0, 1], gain=0.42,
     det=0.006, wet_gain=0.75, sub_row=0)

# --- the glade. The only warm place in the film, and the only movement
# that gets all three voices of `wonder` at once.
play('wonder', K('glade'), K('still') - 0.1, gain=0.60,
     lead_oct2=0.22, det=0.005, wet_gain=0.55)

# --- the creep. Same track, tune removed: the pad and the counter-line
# only, so the picture is doing the talking and the music is only breathing.
play('wonder', K('still'), K('break') - 0.35, rows=[1, 2], gain=0.50,
     det=0.004, wet_gain=0.7, sustain=1.6)

# --- THE HORN. Everything stops. Three seconds of nothing but a sub
# climbing under the shards, then the impact on the frame the line says it,
# and after that only the plate emptying out. The silence before is doing
# as much work as the hit.
_sw = int(3.0 * SR)
_t = np.arange(_sw) / SR
_ph = 2 * np.pi * np.cumsum(28 + 16 * (_t / 3.0) ** 2) / SR
add(buf, K('break'), np.sin(_ph) * (_t / 3.0) ** 2.2 * 0.34, 1.0)
add(buf, K('horn') - 0.06, impact(0.85, 4.0), 1.0)
add(wet, K('horn') - 0.06, impact(0.5, 4.0), 1.4)

# --- the winter, which does not leave for a minute.
play('winter', K('snow'), K('chain') - 0.2, gain=0.58,
     det=0.003, wet_gain=0.85, sub_row=1)
# A cold sheet under the whole of it.
drone(K('snow'), K('chain') - 0.2, 55.0, 0.10)

# --- the road. `trail` walks; `marsh` is the first movement with a pulse
# in it, and it arrives exactly where the film starts cutting fast.
play('trail', K('chain'), K('lights') - 0.15, gain=0.60, lead_oct2=0.18, det=0.005, wet_gain=0.5)
play('marsh', K('lights'), K('gown') - 0.15, gain=0.62, lead_oct2=0.16, det=0.005, wet_gain=0.5, sub_row=0)

# --- the castle, and then the throne with a floor under it.
play('castle', K('gown'), K('offer') - 0.15, gain=0.60, det=0.005, wet_gain=0.9, sub_row=0)
play('throne', K('offer'), K('fall') - 0.25, gain=0.66, det=0.006, wet_gain=1.0, sub_row=0)
drone(K('offer'), K('fall') - 0.25, 36.71, 0.13)

# The light landing on him: one bright strike, up where nothing else is.
for k, g in ((0, 0.30), (0.09, 0.19), (0.20, 0.11)):
    s = note(FREQ('Z') * 2, 1.9, 's', g, a=0.002, d=0.5, s=0.25, r=1.2)
    add(buf, K('land') + k, s, 1.0)
    add(wet, K('land') + k, s, 1.3)

# --- the fall. The only fast bar in the film, and the game wrote it.
play('pursuit', K('fall'), K('dawn') - 0.3, gain=0.66, lead_oct2=0.2, det=0.006, wet_gain=0.45, sub_row=0)

# --- the dawn. `wonder` again and all of it: the tune where it was written,
# an octave above it, the counter-line, the bass, and the prologue's high
# music-box copy still up there on top. The film opened on one voice of
# this and closes on six.
D0, D1 = K('dawn'), END + 0.9
play('wonder', D0, D1, gain=0.76, lead_oct2=0.34, det=0.006, wet_gain=0.65, sub_row=1)
play('wonder', D0 + 0.9, D1, rows=[0], gain=0.34, oct_shift=1, det=0.004, wet_gain=1.1, sustain=2.0)
# From "they named it the seventh colour" the bass doubles down an octave -
# the only place in the film with real weight under the theme, and the
# loudest thing in it. The council was louder than the dawn on the first
# pass, which is a score that does not know which way the story goes.
play('wonder', K('named'), D1, rows=[1], gain=0.48, oct_shift=-1, wet_gain=0.5)
play('wonder', K('named'), D1, rows=[2], gain=0.34, oct_shift=1, det=0.004, wet_gain=0.9)
drone(D0, D1, 73.42, 0.18)

# =========================================================================
# The room, and the master.
# =========================================================================
print('mixing the plate...')
ir = plate(2.6, bright=0.45)
n = len(buf)
size = 1
while size < n + len(ir):
    size *= 2
rev = np.fft.irfft(np.fft.rfft(wet, size) * np.fft.rfft(ir, size))[:n]
mix = buf + rev * 0.55

# A gentle high shelf off the top - the whole thing is oscillators and the
# plate is noise, and both live in the same 6kHz that makes a mix tiring.
mix = np.convolve(mix, np.array([0.25, 0.5, 0.25]), mode='same')

# Fade the head and the tail, and leave the last second under the end card.
head = int(SR * 0.8)
mix[:head] *= np.linspace(0, 1, head)
tail = int(SR * 1.6)
mix[-tail:] *= np.linspace(1, 0, tail) ** 1.4

peak = np.max(np.abs(mix))
mix = mix / peak * 0.90
stereo = np.stack([mix, mix], axis=1)

os.makedirs(OUT_DIR, exist_ok=True)
out = os.path.join(OUT_DIR, 'seventh.wav')
with wave.open(out, 'wb') as fh:
    fh.setnchannels(2)
    fh.setsampwidth(2)
    fh.setframerate(SR)
    fh.writeframes((np.clip(stereo, -1, 1) * 32767).astype('<i2').tobytes())

# The level arc, printed, because "does the drop drop" is a question with a
# number for an answer.
print('movements:', ' '.join(f'{k}@{v:.2f}' for k, v in sorted(C.items(), key=lambda kv: kv[1]) if isinstance(v, (int, float))))
for name in ('open', 'council', 'glade', 'still', 'snow', 'chain', 'lights', 'gown', 'offer', 'beam', 'fall', 'dawn'):
    a = int(K(name) * SR)
    b = min(len(mix), a + int(2.0 * SR))
    rms = np.sqrt(np.mean(mix[a:b] ** 2)) if b > a else 0
    print(f'  {name:9s} {20 * np.log10(rms + 1e-9):6.1f} dB')
print(f'wrote {out}, {DUR:.2f}s')
