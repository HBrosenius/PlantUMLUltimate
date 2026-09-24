"""Shorten quiet gaps in the supplied narration without changing speech speed."""

import array
import math
import sys
import wave


def main(source: str, destination: str) -> None:
    with wave.open(source, "rb") as stream:
        rate = stream.getframerate()
        assert stream.getnchannels() == 1 and stream.getsampwidth() == 2
        samples = array.array("h", stream.readframes(stream.getnframes()))

    window = round(rate * 0.02)
    quiet = []
    for start in range(0, len(samples), window):
        block = samples[start : start + window]
        rms = math.sqrt(sum(value * value for value in block) / len(block)) / 32768
        quiet.append(rms < 0.004)

    runs = []
    start = None
    for index, is_quiet in enumerate(quiet + [False]):
        if is_quiet and start is None:
            start = index
        elif not is_quiet and start is not None:
            if index - start >= 15:
                runs.append((start * window, min(index * window, len(samples))))
            start = None

    keep = round(rate * 0.10)  # 100 ms on each side of a spoken phrase
    crossfade = round(rate * 0.008)
    output = array.array("h")
    cursor = 0
    for start, end in runs:
        cut_start, cut_end = start + keep, end - keep
        if cut_end - cut_start <= crossfade or cut_start < cursor:
            continue
        output.extend(samples[cursor:cut_start])
        # The edit sits inside a low-level gap; a short crossfade removes clicks.
        for i in range(crossfade):
            blend = (i + 1) / (crossfade + 1)
            left = output[-crossfade + i]
            right = samples[cut_end + i]
            output[-crossfade + i] = round(left * (1 - blend) + right * blend)
        cursor = cut_end + crossfade
    output.extend(samples[cursor:])

    with wave.open(destination, "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(rate)
        stream.writeframes(output.tobytes())

    print(f"Source: {len(samples) / rate:.2f}s; edited: {len(output) / rate:.2f}s; pauses shortened: {len(runs)}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
