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

func stderr(_ message: String) {
    if let data = "\(message)\n".data(using: .utf8) {
        FileHandle.standardError.write(data)
    }
}

func maskCode(_ code: String) -> String {
    if code.count <= 2 {
        return String(repeating: "*", count: code.count)
    }
    return String(repeating: "*", count: max(0, code.count - 2)) + code.suffix(2)
}

func maskCodesInText(_ text: String) -> String {
    let pattern = #"[0-9]{4,12}"#
    guard let regex = try? NSRegularExpression(pattern: pattern) else { return text }
    let nsText = text as NSString
    var result = text
    for match in regex.matches(in: text, options: [], range: NSRange(location: 0, length: nsText.length)).reversed() {
        let code = nsText.substring(with: match.range)
        if let range = Range(match.range, in: result) {
            result.replaceSubrange(range, with: maskCode(code))
        }
    }
    return result
}

func normalizeCode(_ value: Substring) -> String {
    return value.filter { $0.isNumber }
}

struct Candidate {
    let code: String
    let textIndex: Int
    let patternIndex: Int
    let snippet: String
}

let bundleIds = [
    "com.apple.MobileSMS",
    "com.apple.notificationcenterui",
    "com.apple.UserNotificationCenter",
]

var texts: [String] = []
for bundleId in bundleIds {
    for app in NSRunningApplication.runningApplications(withBundleIdentifier: bundleId) {
        let appElement = AXUIElementCreateApplication(app.processIdentifier)
        collectText(appElement, output: &texts)
    }
}

if texts.isEmpty {
    stderr("NO_MESSAGES_ACCESSIBILITY_TEXT")
    exit(0)
}

let patterns = [
    #"Ihr\s+TF\s+Bank\s+Bestätigungscode\s+ist\s+([0-9]{4,12})"#,
    #"Ihr\s+TF\s+Bank\s+Bestaetigungscode\s+ist\s+([0-9]{4,12})"#,
    #"TF\s*Bank[\s\S]{0,80}Bestätigungscode[\s\S]{0,30}([0-9]{4,12})"#,
]

var candidates: [Candidate] = []
for (patternIndex, pattern) in patterns.enumerated() {
    let regex = try NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
    for (textIndex, rawText) in texts.enumerated() {
        let text = rawText.replacingOccurrences(of: "\u{00a0}", with: " ")
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        for match in regex.matches(in: text, options: [], range: range) {
            guard match.numberOfRanges > 1,
                  let codeRange = Range(match.range(at: 1), in: text)
            else {
                continue
            }
            let code = normalizeCode(text[codeRange])
            if code.count >= 4 && code.count <= 12 {
                let snippetStart = max(0, match.range.location - 40)
                let snippetLength = min((text as NSString).length - snippetStart, match.range.length + 80)
                let snippet = (text as NSString).substring(with: NSRange(location: snippetStart, length: snippetLength))
                candidates.append(Candidate(code: code, textIndex: textIndex, patternIndex: patternIndex, snippet: snippet))
            }
        }
    }
}

let debugEnabled = ProcessInfo.processInfo.environment["TFBANK_MESSAGES_TAN_DEBUG"] != "0"
if debugEnabled {
    let maskedCandidates = candidates.suffix(12).map { candidate in
        "idx=\(candidate.textIndex),pattern=\(candidate.patternIndex),code=\(maskCode(candidate.code)),snippet=\(maskCodesInText(candidate.snippet.prefix(140).description))"
    }.joined(separator: " | ")
    stderr("TFBANK_MESSAGES_DEBUG text_count=\(texts.count) candidate_count=\(candidates.count) candidates_tail=\(maskedCandidates)")
}

let pickMode = ProcessInfo.processInfo.environment["TFBANK_MESSAGES_TAN_PICK"]?.lowercased() ?? "last"
let selected: Candidate?
if pickMode == "first" {
    selected = candidates.first
} else {
    selected = candidates.last
}

if let selected {
    if debugEnabled {
        stderr("TFBANK_MESSAGES_SELECTED pick=\(pickMode) index=\(selected.textIndex) pattern=\(selected.patternIndex) code=\(maskCode(selected.code))")
    }
    print(selected.code)
} else {
    if debugEnabled {
        let matchingTexts = texts
            .enumerated()
            .filter { $0.element.localizedCaseInsensitiveContains("TF Bank") || $0.element.localizedCaseInsensitiveContains("Bestätigungscode") }
            .suffix(8)
            .map { "idx=\($0.offset),text=\(maskCodesInText($0.element.prefix(180).description))" }
            .joined(separator: " | ")
        if !matchingTexts.isEmpty {
            stderr("TFBANK_MESSAGES_TEXTS_WITH_HINT \(matchingTexts)")
        }
    }
    stderr("NO_TFBANK_TAN_CODE_MATCH")
}
