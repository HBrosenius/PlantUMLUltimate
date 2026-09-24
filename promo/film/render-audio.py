"""Create the film's 48 kHz audio mix from the natural-speed voice and JS score."""

import array
import math
import random
import sys
import wave

RATE = 48_000
DURATION = 59.35
BPM = 112


def add_tone(mix, frequency, at, length, gain, kind="sine"):
    start = round(at * RATE)
    count = min(round(length * RATE), len(mix) - start)
    if count <= 0:
        return
    for i in range(count):
        time = i / RATE
        attack = min(1.0, time / 0.02)
        decay = math.exp(-math.log(1000) * time / length)
        phase = (time * frequency) % 1.0
        wave_value = math.sin(2 * math.pi * phase) if kind == "sine" else 4 * abs(phase - 0.5) - 1
        mix[start + i] += wave_value * gain * attack * decay


def pluck(mix, frequency, at, gain=0.055):
    add_tone(mix, frequency, at, 0.65, gain, "triangle")
    add_tone(mix, frequency * 2, at, 0.23, gain * 0.19)


def add_shaker(mix, at, length, gain, seed):
    rng = random.Random(seed)
    start = round(at * RATE)
    count = min(round(length * RATE), len(mix) - start)
    if count <= 0:
        return
    previous = 0.0
    for i in range(count):
        value = rng.uniform(-1, 1)
        high = value - previous * 0.88
        previous = value
        decay = math.exp(-math.log(1000) * i / max(1, count))
        mix[start + i] += high * gain * decay


def main(voice_path, output_path):
    with wave.open(voice_path, "rb") as source:
        assert source.getnchannels() == 1 and source.getsampwidth() == 2
        input_rate = source.getframerate()
        voice = array.array("h", source.readframes(source.getnframes()))

    length = round(DURATION * RATE)
    mix = array.array("f", [0.0]) * length
    notes = [261.63, 329.63, 392, 523.25, 587.33, 659.25, 783.99]
    score = [0, 2, 4, 3, 1, 2, 5, 4, 0, 3, 5, 4, 2, 1, 4, 3]
    beat = 60 / BPM
    for i in range(math.ceil(DURATION / beat)):
        at = i * beat
        if i % 2 == 0:
            pluck(mix, notes[score[(i // 2) % len(score)]], at, 0.045)
        if i % 8 == 0:
            add_tone(mix, 130.81, at, 2.1, 0.024)
        if i % 4 == 2:
            add_tone(mix, 196, at, 0.35, 0.017, "triangle")
        add_shaker(mix, at, 0.07, 0.004 if i % 2 else 0.008, i)
    for at in [7.5, 19, 31, 39, 47, 54]:
        add_shaker(mix, at, 0.22, 0.019, round(at * 100))
        pluck(mix, 783.99, at + 0.11, 0.048)
        pluck(mix, 1046.5, at + 0.24, 0.028)

    # Linear interpolation changes sample rate, not playback speed or pitch.
    for i in range(min(length, round(len(voice) * RATE / input_rate))):
        pos = i * input_rate / RATE
        left = int(pos)
        fraction = pos - left
        sample = voice[left] * (1 - fraction) + voice[min(left + 1, len(voice) - 1)] * fraction
        mix[i] += sample / 32768 * 1.05

    peak = max(abs(value) for value in mix)
    scale = min(0.88, 0.95 / peak)
    output = array.array("h")
    for i, value in enumerate(mix):
        fade = min(1.0, (length - i) / RATE)
        output.append(round(max(-1, min(1, value * scale * fade)) * 32767))
    with wave.open(output_path, "wb") as destination:
        destination.setnchannels(1)
        destination.setsampwidth(2)
        destination.setframerate(RATE)
        destination.writeframes(output.tobytes())
    print(f"Mix: {DURATION:.2f}s; natural-speed voice: {len(voice)/input_rate:.2f}s; peak before limiting: {peak:.3f}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
