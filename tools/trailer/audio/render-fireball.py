#!/usr/bin/env python3
"""THE STAMPEDE, arranged for the Unicorn Fireball trailer.

The cut is slapstick with a hero, and the score plays it straight: a dark
room lit by a fight next door; a jaunty little walk that stops dead on a
hit, twice - the second time exactly as the first, because the repeat is
the joke; a heroic get-up; the war swelling in as the camera goes up off
the body; then the game's own groove for the part that explains the game,
a breakdown into the drop, and everything going white.

Like render.py this is a port, not a new composition: BPM, the gallop, the
bassline and the lead are fireball/src/snd.js. What is new is that it is an
ARRANGEMENT rather than a mix: the game scales one groove by herd size, and
a trailer needs movements - an intro that withholds the groove, a build, a
breakdown, a drop, a half-time stretch for the slow motion, a hit, and a
coda that answers the intro. Every one of those starts on a cue the cut
wrote (build/trailer-fireball/beats.json), so the score is arranged to the
picture and never the other way round.

The motif is varied rather than repeated. The intro plays the lead at half
speed two octaves up, as a music box, with an echo; the drop stacks it in
octaves and answers its second bar with a phrase of its own; the coda
brings the music box back over a held chord.

    python3 tools/trailer/audio/render-fireball.py

Writes build/trailer-fireball/audio/stampede.wav.
"""
import json
import os
import subprocess
import wave

import numpy as np

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, '..', '..', '..', 'build', 'trailer-fireball', 'audio')
BEATS_JSON = os.path.normpath(os.path.join(OUT_DIR, '..', 'beats.json'))


# ---------------------------------------------------------------- samples --
def load_mp3(name):
    src = os.path.join(HERE, f'{name}.mp3')
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', src, '-ar', str(SR), '-ac', '1', '-f', 's16le', '-'],
        check=True, stdout=subprocess.PIPE).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768.0


def trim_lead(a, thresh=0.02):
    return a[np.argmax(np.abs(a) > thresh):]


def fade_tail(a, n):
    n = min(n, len(a))
    if n <= 0:
        return a
    a = a.copy()
    a[-n:] *= np.linspace(1, 0, n) ** 1.5
    return a


def detect_pitch(a, fmin=60, fmax=800):
    a = a[: int(SR * 0.5)]
    a = a - a.mean()
    corr = np.correlate(a, a, mode='full')[len(a) - 1:]
    lo, hi = int(SR / fmax), int(SR / fmin)
    return SR / (np.argmax(corr[lo:hi]) + lo)


def resample(a, ratio):
    n_out = max(1, int(len(a) / ratio))
    return np.interp(np.arange(n_out) * ratio, np.arange(len(a)), a, left=0, right=0)


kick_s = fade_tail(trim_lead(load_mp3('kick')), 4000)[: int(SR * 0.30)]
hoof_s = fade_tail(trim_lead(load_mp3('clap')), 2200)[: int(SR * 0.10)]
hat_s = fade_tail(trim_lead(load_mp3('hat')), 800)[: int(SR * 0.07)]
bass_s = trim_lead(load_mp3('bass'))
lead_s = trim_lead(load_mp3('lead'))
bass_f0 = detect_pitch(bass_s, 70, 300)
lead_f0 = detect_pitch(lead_s, 200, 900)

# ------------------------------------------------- the sequencer, ported --
BPM = 132
STEP = 15 / BPM
BAR = STEP * 16
NOTE = lambda s: 110 * 2 ** (s / 12)
R = -99
BASS = [0, R, 0, 0, R, 0, 0, R, 0, 0, R, 0, 7, R, 7, 7]
LEAD = [12, R, 15, R, 19, R, 15, R, 12, R, 10, R, 12, R, R, R,
        17, R, 15, R, 12, R, 15, R, 19, R, 22, R, 19, R, R, R]
GALLOP = [1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0]
# The answer: the same A-minor pentatonic the lead lives in, climbing to
# the octave and falling back, so a four-bar phrase is lead / lead / answer
# / lead instead of the same two bars round and round.
# (kept for the build, which still plays the game's own tune)
ANSWER = [24, R, 22, R, 19, R, 22, R, 24, R, 27, R, 24, R, R, R]

# RIDE OF THE VALKYRIES, on the game's own lead sample. Wagner died in 1883
# and the piece is public domain; what makes it work here is the
# instrument, not the tune - it arrives on the same sampled lead the game
# has been playing all along, over the game's own gallop, which is already
# a rhythm of hooves.
#
# The recognisable gesture is short-short-LONG climbing a minor arpeggio:
# a dotted eighth, a sixteenth, a quarter (3 + 1 + 4 sixteenths = half a
# bar), transposed up the triad each time. Written from A, the trailer's
# tonic, as (step within a 32-step cycle, semitone, length in sixteenths).
VALKYRIES = [
    (0, -5, 3), (3, 0, 1), (4, 3, 4),
    (8, 0, 3), (11, 3, 1), (12, 7, 4),
    (16, 3, 3), (19, 7, 1), (20, 12, 4),
    (24, 7, 3), (27, 12, 1), (28, 15, 4),
]
VALK_AT = {step: (semi, length) for step, semi, length in VALKYRIES}

# ---------------------------------------------------------------- the cut --
with open(BEATS_JSON) as fh:
    cut = json.load(fh)
C = cut['cues']
END = cut['duration']
ENDCARD = 5.0
DUR = END + ENDCARD + 1.0

# Which movement each cue starts. The two hits and the get-up are cues the
# recorder measured off the physics (walk1Hit is the frame the hero left
# the ground), so the walk stops dead on the frame it stops.
MOVEMENT = {
    'face': 'dark',
    'walk1': 'walk', 'walk1Hit': 'silence', 'down1': 'down',
    # It does not set off again - it stands and waits, and the music waits
    # with it: the bassline alone until the rainbow arrives.
    'wait': 'stand', 'waitHit': 'silence',
    'crane': 'war',
    'cardGather': 'gather', 'gatherA': 'gather', 'gatherB': 'gather', 'gatherC': 'gather',
    'cardTrample': 'groove', 'trampleA': 'groove', 'trampleB': 'groove',
    'trampleC': 'groove', 'plough': 'groove',
    # The three gameplay cutaways ride inside the drop - the band is lit
    # through all of them, so the music never leaves it.
    'band1': 'drop', 'band2': 'drop', 'band3': 'drop',
    'cardRainbow': 'break', 'hold': 'break',
    'ignite': 'drop', 'ride': 'drop',
    'approach': 'half', 'slowmo': 'still', 'clash': 'hit',
}
timeline = sorted((t, n) for n, t in C.items() if n in MOVEMENT and isinstance(t, (int, float)))
T_CODA = BAR * (int(C['clash'] / BAR) + 1) if 'clash' in C else None


def movement(t):
    m = 'dark'
    for at, name in timeline:
        if t >= at - 1e-6:
            m = MOVEMENT[name]
    if m == 'hit' and T_CODA is not None and t >= T_CODA:
        return 'coda'
    return m


print('movements:', ' '.join(f'{n}@{t:.2f}' for t, n in timeline), f'end@{END:.2f}')

buf = np.zeros((2, int(SR * DUR)))


def add(t, mono, gain, pan=0.0):
    start = int(t * SR)
    if start >= buf.shape[1] or gain <= 0 or start < 0:
        return
    n = min(len(mono), buf.shape[1] - start)
    buf[0, start:start + n] += gain * (1 - max(0, pan)) * mono[:n]
    buf[1, start:start + n] += gain * (1 + min(0, pan)) * mono[:n]


def env(sample, dur, gain, attack=0.0):
    n = min(int(SR * dur), len(sample))
    t = np.arange(n) / SR
    out = sample[:n] * np.exp(t / dur * np.log(0.001))
    if attack > 0:
        out = out * np.minimum(1.0, t / attack)
    return out * gain


def sine(freq, dur, gain, attack=0.0, f2=None, partial2=0.0):
    n = int(SR * dur)
    t = np.arange(n) / SR
    f = np.linspace(freq, f2, n) if f2 else np.full(n, freq)
    ph = 2 * np.pi * np.cumsum(f) / SR
    tone = (np.sin(ph) + partial2 * np.sin(2 * ph)) * np.exp(t / dur * np.log(0.001))
    if attack > 0:
        tone = tone * np.minimum(1.0, t / attack)
    return tone * gain


def held(freq, dur, gain, attack=0.5, release=0.6, partial2=0.0):
    n = int(SR * dur)
    t = np.arange(n) / SR
    ph = 2 * np.pi * freq * t
    tone = np.sin(ph) + partial2 * np.sin(2 * ph)
    e = np.minimum(1.0, t / attack) * np.minimum(1.0, (dur - t) / release)
    return tone * e * gain


def noise(dur, seed=1):
    rng = np.random.default_rng(seed)
    return rng.uniform(-1, 1, int(SR * dur))


def lowpass(a, k=0.02):
    """One pole, cheap and obviously a filter: 'through a wall'."""
    out = np.empty_like(a)
    y = 0.0
    for i, x in enumerate(a):
        y += k * (x - y)
        out[i] = y
    return out


def far_boom(t, gain):
    """An explosion somewhere else. Distance takes the crack off a blast and
    leaves a roll: no transient at all, a slow swell into a long decay, and
    nothing above a few hundred hertz. The first cut fired a sharp noise
    burst with a hard attack, and four seconds in it read as a firecracker
    going off next to the microphone."""
    d = 2.6
    n = int(SR * d)
    tt = np.arange(n) / SR
    # Swell in over a fifth of a second, then roll away.
    shape = np.minimum(1.0, tt / 0.22) * np.exp(-tt / (d * 0.34))
    rumble = lowpass(noise(d, int(t * 100) % 977), 0.006) * shape * gain * 9.0
    add(t, rumble, 1.0)
    add(t, sine(48, d * 0.8, gain * 0.5, attack=0.18, f2=19), 1.0)


def near_boom(t, gain):
    add(t, sine(90, 1.2, gain, f2=28), 1.0)
    add(t, noise(1.0, int(t * 100) % 991) * np.exp(np.arange(int(SR * 1.0)) / SR / 1.0 * np.log(0.001)) * gain * 0.5, 1.0)
    for i, semi in enumerate([0, 2, 4, 5, 7, 9, 11]):
        add(t + 0.12 + i * 0.06, sine(NOTE(24 + semi), 0.6, 0.16 * gain), 1.0, pan=-0.3 + i * 0.1)


def far_rainbow(t, gain, pan):
    """The seven-note fan the game plays at ignition, from across the plain."""
    for i, semi in enumerate([0, 4, 7, 11, 14, 16, 19]):
        add(t + i * 0.05, sine(NOTE(semi), 0.9, gain, attack=0.01), 1.0, pan=pan)


def rumble_in(t, dur, gain):
    """The herd approaching: a low roar that grows, under everything."""
    n = int(SR * dur)
    tt = np.arange(n) / SR
    k = (tt / dur) ** 2.2
    body = lowpass(noise(dur, int(t * 100) % 811), 0.010) * k * gain * 7.0
    # A tremble on top of it, not quite a rhythm - hooves too many to count.
    body += np.sin(2 * np.pi * 34 * tt) * k * gain * 0.5
    add(t, body, 1.0)


def impact(t, gain):
    """The hit. A kick, a thud, a slap of noise and the floor dropping out."""
    add(t, env(kick_s, 0.3, 1.6 * gain), 1.0)
    add(t, sine(82, 0.6, 1.1 * gain, f2=30), 1.0)
    add(t, noise(0.25, int(t * 100) % 983) * np.exp(np.arange(int(SR * 0.25)) / SR / 0.25 * np.log(0.001)) * 0.55 * gain, 1.0)
    add(t + 0.02, resample(hoof_s, 180 / 400), 0.9 * gain, 1.0)


# ---------------------------------------------------------------- the grid --
t = 0.0
step = 0
while t < END + 0.5:
    s = step % 32
    h = s % 16
    m = movement(t)
    downbeat = h == 0
    dum = h % 4 == 2

    if m == 'dark':
        # The room: a sub that breathes. The fight is one-shots below. Quiet
        # - the walk that follows has to arrive as a lift.
        if downbeat:
            add(t, held(NOTE(-24), BAR * 1.05, 0.16, attack=0.4, release=0.5, partial2=0.1), 1.0)

    elif m == 'walk':
        # THE GAME'S OWN BIT, bare: the gallop on hooves and the bassline,
        # which is what snd.js plays under its own title screen. An earlier
        # cut put a music box here - the lead at half speed, two octaves up
        # - and it pipped over the top of a game that gallops.
        if GALLOP[h]:
            add(t, resample(hoof_s, (180 if dum else 320) / 400), 0.34 * (1.25 if dum else 1.0), pan=-0.1 if h % 2 else 0.1)
        if BASS[h] != R:
            add(t, env(resample(bass_s, NOTE(BASS[h] - 12) / bass_f0), 0.22, 0.7), 1.0)
        if dum:
            add(t, env(kick_s, 0.2, 0.5), 1.0)

    elif m == 'stand':
        # Standing, waiting: the bassline alone, hooves gone. The groove is
        # still running underneath, stripped to its root.
        if BASS[h] != R and h % 2 == 0:
            add(t, env(resample(bass_s, NOTE(BASS[h] - 12) / bass_f0), 0.26, 0.5), 1.0)
        if downbeat:
            add(t, held(NOTE(-24), BAR * 1.05, 0.16, attack=0.35, release=0.5), 1.0)

    elif m in ('silence', 'down'):
        # Nothing. A room tone so it is a held breath and not a dropout.
        if downbeat:
            add(t, held(NOTE(-24), BAR * 1.05, 0.10, attack=0.5, release=0.5), 1.0)

    elif m == 'war':
        # The war comes up with the camera: hooves first, far and soft, then
        # the bass, the kick, and by the top the tune on the lead - the
        # game's own theme, arriving as the plain is revealed.
        k = min(1.0, max(0.0, (t - C['crane']) / (BAR * 3.6)))
        if GALLOP[h] and k > 0.08:
            add(t, resample(hoof_s, (180 if dum else 320) / 400), (0.15 + k * 0.55) * (1.25 if dum else 1.0), pan=-0.1 if h % 2 else 0.1)
        if BASS[h] != R and k > 0.25:
            f = NOTE(BASS[h] - 12)
            add(t, env(resample(bass_s, f / bass_f0), 0.2, 0.4 + k * 0.6), 1.0)
            add(t, sine(f / 2, 0.22, k * 0.8), 1.0)
        if dum and k > 0.45:
            add(t, env(kick_s, 0.22, 0.6 + k * 0.9), 1.0)
        if LEAD[s] != R and k > 0.62:
            f = NOTE(LEAD[s] + 12)
            add(t, env(resample(lead_s, f / lead_f0), 0.26, (k - 0.62) / 0.38 * 0.95), 1.0, pan=0.18)

    elif m == 'gather':
        # The groove, building, the lead arriving in its second half: the
        # herd is growing and the music grows with it. The bells that count
        # it are one-shots below, on the frames units actually joined.
        k = min(1.0, max(0.0, (t - C['cardGather']) / (BAR * 3.0)))
        if GALLOP[h]:
            add(t, resample(hoof_s, (180 if dum else 320) / 400), (0.34 + k * 0.34) * (1.25 if dum else 1.0), pan=-0.1 if h % 2 else 0.1)
        if dum:
            add(t, env(kick_s, 0.22, 0.9 + k * 0.6), 1.0)
        if h % 8 == 6 and k > 0.3:
            add(t, env(hat_s, 0.07, 0.3), 1.0, pan=-0.18)
        if BASS[h] != R:
            f = NOTE(BASS[h] - 12)
            add(t, env(resample(bass_s, f / bass_f0), 0.2, 0.9 + k * 0.4), 1.0)
            add(t, sine(f / 2, 0.22, 0.5 + k * 0.5), 1.0)
        if LEAD[s] != R and k > 0.45:
            f = NOTE(LEAD[s] + 12)
            add(t, env(resample(lead_s, f / lead_f0), 0.26, (k - 0.45) / 0.55 * 0.8), 1.0, pan=0.18)

    elif m == 'groove':
        if GALLOP[h]:
            add(t, resample(hoof_s, (180 if dum else 320) / 400), 0.7 * (1.25 if dum else 1.0), pan=-0.1 if h % 2 else 0.1)
        if dum:
            add(t, env(kick_s, 0.22, 1.5), 1.0)
        if h % 8 == 6:
            add(t, env(hat_s, 0.07, 0.36), 1.0, pan=-0.18)
        if BASS[h] != R:
            f = NOTE(BASS[h] - 12)
            add(t, env(resample(bass_s, f / bass_f0), 0.2, 1.2), 1.0)
            add(t, sine(f / 2, 0.22, 1.0), 1.0)
        if LEAD[s] != R:
            f = NOTE(LEAD[s] + 12)
            add(t, env(resample(lead_s, f / lead_f0), 0.26, 0.95), 1.0, pan=0.18)

    elif m == 'break':
        if downbeat:
            add(t, env(resample(bass_s, NOTE(-12) / bass_f0), BAR * 1.1, 0.28, attack=0.05), 1.0)
            add(t, held(NOTE(-24), BAR * 1.05, 0.22, attack=0.3, release=0.4), 1.0)
        if h in (0, 2, 4):
            add(t, env(resample(lead_s, NOTE(LEAD[h] + 12) / lead_f0), 0.3, 0.34 * (1 - h * 0.12)), 1.0, pan=0.15 - h * 0.1)

    elif m == 'drop':
        if GALLOP[h]:
            add(t, resample(hoof_s, (180 if dum else 320) / 400), 0.85 * (1.25 if dum else 1.0), pan=-0.12 if h % 2 else 0.12)
        if dum or downbeat:
            add(t, env(kick_s, 0.24, 1.7), 1.0)
        if h % 8 == 6:
            add(t, env(hat_s, 0.07, 0.45), 1.0, pan=-0.18)
        if h % 4 == 1:
            add(t, env(hat_s, 0.05, 0.2), 1.0, pan=0.22)
        if BASS[h] != R:
            f = NOTE(BASS[h] - 12)
            add(t, env(resample(bass_s, f / bass_f0), 0.2, 1.4), 1.0)
            add(t, sine(f / 2, 0.24, 1.3), 1.0)
        if LEAD[s] != R:
            f = NOTE(LEAD[s] + 12)
            add(t, env(resample(lead_s, f / lead_f0), 0.26, 1.05), 1.0, pan=0.18)
            add(t, env(resample(lead_s, 2 * f / lead_f0), 0.22, 0.5), 1.0, pan=-0.22)

    elif m == 'half':
        if downbeat:
            add(t, env(kick_s, 0.3, 1.0), 1.0)
            add(t, held(NOTE(-24), BAR * 1.02, 0.5, attack=0.05, release=0.3), 1.0)
        if h == 8:
            add(t, resample(hoof_s, 180 / 400), 0.45, 1.0)
        if step % 2 == 0 and LEAD[(step // 2) % 32] != R:
            add(t, env(resample(lead_s, NOTE(LEAD[(step // 2) % 32] + 12) / lead_f0), 0.45, 0.42), 1.0)

    elif m in ('still', 'hit'):
        if downbeat:
            add(t, held(NOTE(-24), BAR * 1.02, 0.18, attack=0.2, release=0.3, partial2=0.15), 1.0)

    elif m == 'coda':
        if step % 2 == 0 and LEAD[(step // 2) % 32] != R:
            add(t, env(resample(lead_s, NOTE(LEAD[(step // 2) % 32] + 12) / lead_f0), 0.5, 0.5), 1.0,
                pan=0.2 if (step // 2) % 4 < 2 else -0.2)

    t += STEP
    step += 1

# ---------------------------------------------------------- the one-shots --
# The fight next door, on the frames the flashes hit the face. A rainbow
# lighting somewhere is the fan chord, far; an explosion is the sub without
# the crack. Between them, thuds - a herd being a herd out there.
rng = np.random.default_rng(3)
for i, f in enumerate(C.get('faceFlashes', [])):
    if f.get('boom'):
        far_boom(f['at'], 0.38)
    else:
        far_rainbow(f['at'], 0.045, pan=(-0.5 if i % 2 else 0.5))
t0, t1 = C['face'], C['walk1']
for tt in np.arange(t0 + 0.4, t1 - 0.3, 0.55):
    if rng.random() < 0.7:
        add(tt + rng.random() * 0.3, resample(hoof_s, 140 / 400), 0.06 + rng.random() * 0.08, pan=rng.uniform(-0.6, 0.6))

# EVERY JOIN RINGS. The game's own join(n) - a bell climbing a pentatonic,
# one per unicorn taken - on the frames the recorder measured units
# actually joining. It is what makes a gather feel like a gather instead of
# a number moving in a corner.
PENTA = [0, 2, 4, 7, 9]
for n, tt in enumerate(C.get('joins', [])):
    semi = 12 + PENTA[n % 5] + 12 * ((n // 5) & 1)
    add(tt, sine(NOTE(semi), 0.4, 0.22, attack=0.003, partial2=0.3), 1.0, pan=-0.3 + (n % 7) * 0.1)

# The ground under each walk: a roar that grows for the second and a
# quarter before the hit, the audio half of the tremor in the picture.
for key, gain in (('walk1Hit', 0.5), ('waitHit', 0.6)):
    if key in C:
        rumble_in(C[key] - 1.25, 1.25, gain)

# The two hits. The second bigger, and with the rainbow's own chord jammed
# into it, because that one was a rainbow.
for k, key in enumerate(('walk1Hit', 'waitHit')):
    if key in C:
        impact(C[key], 1.0 if k == 0 else 1.35)
        if k == 1:
            far_rainbow(C[key], 0.22, 0.0)
            add(C[key], sine(70, 1.6, 0.8, f2=24), 1.0)

# The get-up, at a third of speed: four notes climbing on the lead, swelled
# in, the last one held. Then the shake: a rattle on the hat.
if 'down1' in C:
    up_at = C['down1'] + BAR * 1.5
    for i, semi in enumerate([12, 15, 19, 24]):
        f = NOTE(semi)
        add(up_at + i * 0.42, env(resample(lead_s, f / lead_f0), 0.55 if i < 3 else 1.6, 0.45 + i * 0.18, attack=0.06), 1.0, pan=-0.2 + i * 0.13)
        add(up_at + i * 0.42, held(f, 0.5 if i < 3 else 1.5, 0.12 + i * 0.05, attack=0.08, release=0.2), 1.0)
    shake_at = up_at + 1.9
    for i in range(7):
        add(shake_at + i * 0.07, env(hat_s, 0.05, 0.28 - i * 0.03), 1.0, pan=(-0.3 if i % 2 else 0.3))

# The war: explosions on the frames the recorder set them off.
for tt in C.get('craneBooms', []):
    near_boom(tt, 0.55)

# Ignition. The drop lands here.
ig = C['ignite']
add(ig, sine(60, 0.9, 1.1, f2=28), 1.0)
add(ig, noise(0.9, 3) * np.exp(np.arange(int(SR * 0.9)) / SR / 0.9 * np.log(0.002)) * 0.55, 1.0)
for i, semi in enumerate([0, 4, 7, 11, 14, 16, 19]):
    add(ig + i * 0.035, sine(NOTE(12 + semi), 0.8, 0.2, attack=0.004), 1.0, pan=-0.3 + i * 0.1)
for semi, g in ((0, 0.4), (7, 0.28), (12, 0.2), (19, 0.14)):
    add(ig, held(NOTE(semi), BAR * 2, g, attack=0.02, release=0.8), 1.0)
# And then it is a MELODY, not a one-shot: the same seven-note fan four more
# times over the ride, transposed up the herd's own pentatonic and back, one
# per half bar, so the sound the rainbow makes is the tune of the sequence.
for k, semi in enumerate([5, 7, 12, 7]):
    at = ig + BAR * (0.5 + k * 0.5)
    for i, n2 in enumerate([0, 4, 7, 11, 14, 16, 19]):
        add(at + i * 0.03, sine(NOTE(12 + semi + n2), 0.55, 0.115, attack=0.004), 1.0,
            pan=-0.3 + i * 0.1)

# The riser under the hold: pitch climbing three octaves, the game's rise(k).
t0, t1 = C['cardRainbow'], ig
n = int(SR * (t1 - t0))
tt = np.arange(n) / SR
k = tt / (t1 - t0)
sweep = 110 * 2 ** (k * 3)
riser = np.sin(2 * np.pi * np.cumsum(sweep) / SR) * (0.06 + k ** 2 * 0.32) * np.minimum(1, tt / 0.5)
riser *= np.minimum(1, (t1 - t0 - tt) / 0.05)
add(t0, riser, 1.0)
sw = noise(2.0, 5) * (np.arange(int(SR * 2.0)) / SR / 2.0) ** 2.5 * 0.5
add(t1 - 2.0, sw, 1.0)

# Into the slow motion. NO riser over the approach - the two bands are
# already running and already lit, and a rising tone under them read as a
# second ignition that never came.
if 'slowmo' in C:
    t0, t1 = C['slowmo'], C['clash']
    d = max(0.3, t1 - t0)
    sw = noise(d, 7) * (np.arange(int(SR * d)) / SR / d) ** 3 * 0.6
    add(t0, sw, 1.0)

# THE CLASH, and the white: the boom, and a chord that holds under the end
# card with the music box coming back over it.
cl = C['clash']
near_boom(cl, 1.6)
# The picture holds the blast for two seconds at an eighth speed now, so the
# sound holds too: a second sub under the first, slower, and the rainbow's
# seven notes again underneath, spread wide.
add(cl + 0.06, sine(52, 3.4, 0.85, attack=0.02, f2=17), 1.0)
add(cl + 0.3, lowpass(noise(3.0, 23), 0.008) * np.exp(-np.arange(int(SR * 3.0)) / SR / 1.1) * 3.2, 1.0)
for i, semi in enumerate([0, 4, 7, 12, 16, 19, 24]):
    add(cl + 0.5 + i * 0.16, sine(NOTE(semi), 1.5, 0.13, attack=0.02), 1.0, pan=-0.35 + i * 0.12)
for semi, g in ((0, 0.26), (7, 0.17), (12, 0.12), (16, 0.07)):
    add(cl + 0.4, held(NOTE(semi - 12), DUR - cl - 0.4, g, attack=1.4, release=1.0), 1.0)
    add(cl + 0.4, held(NOTE(semi), DUR - cl - 0.4, g * 0.5, attack=1.6, release=1.0, partial2=0.2), 1.0)

# --- tail, limiter, out ---------------------------------------------------
end_n = int(DUR * SR)
fade_n = int(SR * 2.6)
buf[:, end_n - fade_n:end_n] *= np.linspace(1, 0, fade_n) ** 1.3
buf = buf[:, :end_n]

peak = np.max(np.abs(buf))
if peak > 0:
    buf = buf / peak * 0.98
buf = np.tanh(buf * 1.2) / np.tanh(1.2)

os.makedirs(OUT_DIR, exist_ok=True)
out_path = os.path.normpath(os.path.join(OUT_DIR, 'stampede.wav'))
w = wave.open(out_path, 'wb')
w.setnchannels(2)
w.setsampwidth(2)
w.setframerate(SR)
w.writeframes((np.clip(buf.T, -1, 1) * 32767).astype(np.int16).tobytes())
w.close()
print(f'wrote {out_path}, {DUR:.2f}s')
