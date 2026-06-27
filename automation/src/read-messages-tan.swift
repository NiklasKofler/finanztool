import AppKit
import ApplicationServices
import Foundation

func attrString(_ element: AXUIElement, _ attribute: String) -> String? {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
    guard result == .success, let value else { return nil }
    if let text = value as? String {
        return text
    }
    return String(describing: value)
}

func children(_ element: AXUIElement) -> [AXUIElement] {
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &value)
    guard result == .success, let children = value as? [AXUIElement] else { return [] }
    return children
}

func collectText(_ element: AXUIElement, depth: Int = 0, output: inout [String]) {
    if depth > 14 || output.count > 500 {
        return
    }

    let parts = [
        attrString(element, kAXDescriptionAttribute),
        attrString(element, kAXTitleAttribute),
        attrString(element, kAXValueAttribute),
        attrString(element, kAXHelpAttribute),
        attrString(element, kAXIdentifierAttribute),
    ].compactMap { $0 }.filter { !$0.isEmpty }

    if !parts.isEmpty {
        output.append(parts.joined(separator: " "))
    }

    for child in children(element) {
        collectText(child, depth: depth + 1, output: &output)
    }
}

let app = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.MobileSMS").first
guard let app else {
    exit(0)
}

let appElement = AXUIElementCreateApplication(app.processIdentifier)
var texts: [String] = []
collectText(appElement, output: &texts)

let pattern = #"TF Bank.*Bestätigungscode ist\s+([0-9]{4,12})"#
let regex = try NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
var codes: [String] = []

for text in texts {
    let range = NSRange(text.startIndex..<text.endIndex, in: text)
    for match in regex.matches(in: text, options: [], range: range) {
        guard match.numberOfRanges > 1,
              let codeRange = Range(match.range(at: 1), in: text)
        else {
            continue
        }
        codes.append(String(text[codeRange]))
    }
}

if let latestCode = codes.last {
    print(latestCode)
}
