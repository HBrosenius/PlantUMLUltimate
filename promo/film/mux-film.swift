import AVFoundation
import Foundation

let videoURL = URL(fileURLWithPath: CommandLine.arguments[1])
let audioURL = URL(fileURLWithPath: CommandLine.arguments[2])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[3])
let videoAsset = AVURLAsset(url: videoURL)
let audioAsset = AVURLAsset(url: audioURL)
guard let videoTrack = videoAsset.tracks(withMediaType: .video).first,
      let audioTrack = audioAsset.tracks(withMediaType: .audio).first else {
    fatalError("Missing video or audio track")
}

let composition = AVMutableComposition()
let resultVideo = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
try resultVideo.insertTimeRange(
    CMTimeRange(start: .zero, duration: videoAsset.duration),
    of: videoTrack,
    at: .zero
)
resultVideo.preferredTransform = videoTrack.preferredTransform

let resultAudio = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
try resultAudio.insertTimeRange(
    CMTimeRange(start: .zero, duration: min(audioAsset.duration, videoAsset.duration)),
    of: audioTrack,
    at: .zero
)

try? FileManager.default.removeItem(at: outputURL)
guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
    fatalError("Could not create film exporter")
}
exporter.outputURL = outputURL
exporter.outputFileType = .mp4
let semaphore = DispatchSemaphore(value: 0)
exporter.exportAsynchronously { semaphore.signal() }
semaphore.wait()
guard exporter.status == .completed else {
    fatalError("Export failed: \(exporter.error?.localizedDescription ?? "unknown error")")
}
print("Exported \(outputURL.path)")
