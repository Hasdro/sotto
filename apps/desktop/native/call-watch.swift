// Sotto call watcher (owner, 21 Oct 2026): prints, as one JSON line, the bundle IDs of the apps
// that are using a microphone right now, whenever that set changes. The desktop app maps them to
// call apps (Zoom, Teams, Meet in a browser, 3CX, Yeastar) to start and stop listening by itself.
// macOS 14.2+: Core Audio process objects. Reads only who uses input; never any audio.
import CoreAudio
import Foundation

func address(_ selector: AudioObjectPropertySelector) -> AudioObjectPropertyAddress {
  AudioObjectPropertyAddress(
    mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal,
    mElement: kAudioObjectPropertyElementMain)
}

func processes() -> [AudioObjectID] {
  var addr = address(kAudioHardwarePropertyProcessObjectList)
  var size: UInt32 = 0
  guard
    AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size)
      == noErr, size > 0
  else { return [] }
  var ids = [AudioObjectID](repeating: 0, count: Int(size) / MemoryLayout<AudioObjectID>.size)
  guard
    AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &ids)
      == noErr
  else { return [] }
  return ids
}

func usesInput(_ id: AudioObjectID) -> Bool {
  var addr = address(kAudioProcessPropertyIsRunningInput)
  var value: UInt32 = 0
  var size = UInt32(MemoryLayout<UInt32>.size)
  return AudioObjectGetPropertyData(id, &addr, 0, nil, &size, &value) == noErr && value != 0
}

func bundleID(_ id: AudioObjectID) -> String? {
  var addr = address(kAudioProcessPropertyBundleID)
  var value: Unmanaged<CFString>?
  var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
  guard AudioObjectGetPropertyData(id, &addr, 0, nil, &size, &value) == noErr, let v = value
  else { return nil }
  let s = v.takeRetainedValue() as String
  return s.isEmpty ? nil : s
}

setvbuf(stdout, nil, _IOLBF, 0)
var last: [String]? = nil
while true {
  let now = Array(Set(processes().filter(usesInput).compactMap(bundleID))).sorted()
  if now != last {
    last = now
    if let data = try? JSONSerialization.data(withJSONObject: ["inputs": now]),
      let line = String(data: data, encoding: .utf8)
    {
      print(line)
    }
  }
  Thread.sleep(forTimeInterval: 1.0)
}
