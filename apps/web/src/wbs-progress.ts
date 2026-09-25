/** Pick a shade that remains visible over a WBS node's rendered background color. */
export function wbsProgressInk(fill: string): string {
  const channels = fill
    .match(/\d+(?:\.\d+)?/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length < 3) return "#102033";
  const luminance = channels.reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
  return luminance < 128 ? "#ffffff" : "#102033";
}
