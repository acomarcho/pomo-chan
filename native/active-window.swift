import AppKit
import CoreGraphics

struct WindowInfo: Encodable {
    let title: String
    let owner: OwnerInfo
}

struct OwnerInfo: Encodable {
    let name: String
    let bundleId: String
    let processId: pid_t
    let path: String
}

func getActiveWindow() -> WindowInfo? {
    guard let frontApp = NSWorkspace.shared.frontmostApplication else {
        return nil
    }

    let pid = frontApp.processIdentifier
    let name = frontApp.localizedName ?? ""
    let bundleId = frontApp.bundleIdentifier ?? ""
    let path = frontApp.bundleURL?.path ?? ""

    var title = ""
    if let windowList = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] {
        for window in windowList {
            guard let windowPID = window[kCGWindowOwnerPID as String] as? pid_t,
                  windowPID == pid else {
                continue
            }
            if let windowTitle = window[kCGWindowName as String] as? String, !windowTitle.isEmpty {
                title = windowTitle
                break
            }
        }
    }

    return WindowInfo(
        title: title,
        owner: OwnerInfo(name: name, bundleId: bundleId, processId: pid, path: path)
    )
}

let encoder = JSONEncoder()

// Read stdin on a background thread so the main run loop stays alive
// for NSWorkspace to track app switches.
DispatchQueue.global().async {
    while let _ = readLine() {
        let result: String
        if let info = getActiveWindow(),
           let data = try? encoder.encode(info),
           let json = String(data: data, encoding: .utf8) {
            result = json
        } else {
            result = "null"
        }
        DispatchQueue.main.sync {
            print(result)
            fflush(stdout)
        }
    }
    exit(0)
}

RunLoop.main.run()
