// Stereo Test: a native macOS window around experiment.html, which is bundled in Resources/web together
// with rds.js and index.html. Responses stay in the app's own WebKit storage; settings (the page's URL
// fragment) are kept in UserDefaults so they survive a relaunch.
// Run with `--selftest <folder>` to load the page, drive a few trials, download the CSV into that folder,
// write selftest.json there and quit.
import AppKit
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate, WKDownloadDelegate {
  private var window: NSWindow!
  private var webView: WKWebView!
  private var extraWindows: [NSWindow] = []
  private var urlObservation: NSKeyValueObservation?
  private let webRoot = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true).absoluteURL
  private let selfTestFolder: URL? = {
    let args = CommandLine.arguments
    guard let i = args.firstIndex(of: "--selftest"), i + 1 < args.count else { return nil }
    return URL(fileURLWithPath: args[i + 1], isDirectory: true)
  }()
  private var selfTestLog: [String] = []
  private var selfTestStarted = false
  private var selfTestDownloaded: (() -> Void)?

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.mainMenu = makeMenu()
    webView = makeWebView()
    window = makeWindow(title: "Stereo Test", size: NSSize(width: 1280, height: 860), content: webView)
    if !window.setFrameUsingName("StereoTestMain") { window.center() }
    window.setFrameAutosaveName("StereoTestMain")
    window.collectionBehavior.insert(.fullScreenPrimary)
    // Closing the test window quits, so Dot studio windows can't be left behind without a way back.
    NotificationCenter.default.addObserver(forName: NSWindow.willCloseNotification, object: window, queue: .main) { _ in NSApp.terminate(nil) }
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    urlObservation = webView.observe(\.url, options: [.new]) { [weak self] view, _ in
      guard self?.selfTestFolder == nil, let url = view.url, url.lastPathComponent == "experiment.html",
            let fragment = URLComponents(url: url, resolvingAgainstBaseURL: true)?.percentEncodedFragment else { return }
      UserDefaults.standard.set(fragment, forKey: "settings")
    }
    note("launched")
    loadExperiment()
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

  @objc private func loadExperiment() {
    let page = webRoot.appendingPathComponent("experiment.html")
    var url = page
    if selfTestFolder == nil, let saved = UserDefaults.standard.string(forKey: "settings") {
      if URLComponents(string: "#" + saved) != nil, let restored = URL(string: page.absoluteString + "#" + saved) { url = restored }
      else { UserDefaults.standard.removeObject(forKey: "settings") }
    }
    webView.loadFileURL(url, allowingReadAccessTo: webRoot)
  }

  @objc private func reloadPage() { webView.reload() }

  private func makeWebView() -> WKWebView {
    let configuration = WKWebViewConfiguration()
    configuration.preferences.isElementFullscreenEnabled = true
    let view = WKWebView(frame: .zero, configuration: configuration)
    view.uiDelegate = self
    view.navigationDelegate = self
    view.allowsMagnification = false
    return view
  }

  private func makeWindow(title: String, size: NSSize, content: NSView) -> NSWindow {
    let window = NSWindow(contentRect: NSRect(origin: .zero, size: size), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
    window.title = title
    window.contentView = content
    window.isReleasedWhenClosed = false
    window.minSize = NSSize(width: 700, height: 500)
    return window
  }

  // Dot studio and other bundled pages open in their own window, so the test page never navigates away.
  private func openWindow(for url: URL) {
    let view = makeWebView()
    let window = makeWindow(title: "Dot studio", size: NSSize(width: 1200, height: 820), content: view)
    window.center()
    window.makeKeyAndOrderFront(nil)
    extraWindows.append(window)
    NotificationCenter.default.addObserver(forName: NSWindow.willCloseNotification, object: window, queue: .main) { [weak self] note in
      self?.extraWindows.removeAll { $0 === note.object as? NSWindow }
    }
    view.loadFileURL(url, allowingReadAccessTo: webRoot)
  }

  private func makeMenu() -> NSMenu {
    let main = NSMenu()
    func item(_ title: String, _ action: Selector?, _ key: String, _ modifiers: NSEvent.ModifierFlags = .command, target: AnyObject? = nil) -> NSMenuItem {
      let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
      item.keyEquivalentModifierMask = modifiers
      item.target = target
      return item
    }
    func add(_ title: String, _ items: [NSMenuItem]) {
      let menu = NSMenu(title: title)
      items.forEach(menu.addItem)
      let holder = NSMenuItem()
      holder.submenu = menu
      main.addItem(holder)
    }
    add("Stereo Test", [
      item("About Stereo Test", #selector(NSApplication.orderFrontStandardAboutPanel(_:)), ""), .separator(),
      item("Hide Stereo Test", #selector(NSApplication.hide(_:)), "h"),
      item("Quit Stereo Test", #selector(NSApplication.terminate(_:)), "q"),
    ])
    add("Edit", [
      item("Undo", Selector(("undo:")), "z"), item("Redo", Selector(("redo:")), "z", [.command, .shift]), .separator(),
      item("Cut", #selector(NSText.cut(_:)), "x"), item("Copy", #selector(NSText.copy(_:)), "c"),
      item("Paste", #selector(NSText.paste(_:)), "v"), item("Select All", #selector(NSText.selectAll(_:)), "a"),
    ])
    add("View", [
      item("Reload", #selector(reloadPage), "r", target: self), .separator(),
      item("Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control]),
    ])
    add("Window", [
      item("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"),
      item("Close", #selector(NSWindow.performClose(_:)), "w"),
    ])
    return main
  }

  // MARK: alert() and confirm()

  func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
    if selfTestFolder != nil { selfTestLog.append("alert: \(message)"); completionHandler(); return }
    let alert = NSAlert()
    alert.messageText = message
    alert.runModal()
    completionHandler()
  }

  func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
    if selfTestFolder != nil { selfTestLog.append("confirm: \(message)"); completionHandler(true); return }
    let alert = NSAlert()
    alert.messageText = message
    alert.addButton(withTitle: "OK")
    alert.addButton(withTitle: "Cancel")
    completionHandler(alert.runModal() == .alertFirstButtonReturn)
  }

  // target="_blank" links and window.open
  func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
    if let url = navigationAction.request.url {
      if url.isFileURL { openWindow(for: url) } else { NSWorkspace.shared.open(url) }
    }
    return nil
  }

  // MARK: navigation and downloads

  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    if navigationAction.shouldPerformDownload { decisionHandler(.download); return }
    guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
    if !url.isFileURL && !["blob", "about", "data"].contains(url.scheme ?? "") {
      NSWorkspace.shared.open(url)
      decisionHandler(.cancel)
    } else if webView === self.webView && (navigationAction.targetFrame?.isMainFrame ?? true) && url.standardizedFileURL.path != webRoot.appendingPathComponent("experiment.html").standardizedFileURL.path {
      // The test window only ever shows the test: bundled pages open in their own window, anything
      // else (a file dropped on the window, say) is refused.
      if url.standardizedFileURL.path.hasPrefix(webRoot.standardizedFileURL.path) { openWindow(for: url) }
      decisionHandler(.cancel)
    } else {
      decisionHandler(.allow)
    }
  }

  func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
    decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
  }

  func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
  func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

  func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
    if let folder = selfTestFolder {
      let destination = folder.appendingPathComponent(suggestedFilename)
      try? FileManager.default.removeItem(at: destination)
      completionHandler(destination)
      return
    }
    let panel = NSSavePanel()
    panel.nameFieldStringValue = suggestedFilename
    panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
    panel.beginSheetModal(for: download.webView?.window ?? window) { result in
      guard result == .OK, let url = panel.url else { completionHandler(nil); return }
      try? FileManager.default.removeItem(at: url) // the panel has already asked before replacing
      completionHandler(url)
    }
  }

  func downloadDidFinish(_ download: WKDownload) { selfTestDownloaded?() }

  func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
    if selfTestFolder != nil { selfTestLog.append("download failed: \(error.localizedDescription)"); selfTestDownloaded?(); return }
    NSAlert(error: error).runModal()
  }

  // MARK: self-test

  private func note(_ message: String) {
    guard selfTestFolder != nil else { return }
    selfTestLog.append(message)
    FileHandle.standardError.write(Data("selftest: \(message)\n".utf8))
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { note("load failed: \(error)") }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { note("navigation failed: \(error)") }
  // Reload after a WebKit content-process crash; responses are safe in localStorage. Two crashes within
  // 10 s ask first, so a page that keeps crashing can't loop.
  private var lastCrashReload = Date.distantPast
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    note("web content process ended")
    if Date().timeIntervalSince(lastCrashReload) < 10 && selfTestFolder == nil {
      let alert = NSAlert()
      alert.messageText = "The page stopped working again."
      alert.informativeText = "Saved responses are kept. Reload the page?"
      alert.addButton(withTitle: "Reload")
      alert.addButton(withTitle: "Quit")
      if alert.runModal() != .alertFirstButtonReturn { NSApp.terminate(nil); return }
    }
    lastCrashReload = Date()
    if webView === self.webView { loadExperiment() } else { webView.reload() }
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    note("loaded \(webView.url?.lastPathComponent ?? "?")")
    guard let folder = selfTestFolder, webView === self.webView, !selfTestStarted else { return }
    selfTestStarted = true
    let script = """
      const out = {colorSpace: COLOR_SPACE, dpr: devicePixelRatio, screen: [screen.width, screen.height], fullscreenEnabled: document.fullscreenEnabled};
      out.previousLaunches = Number(localStorage.getItem('selftest-launches') || 0);
      localStorage.setItem('selftest-launches', String(out.previousLaunches + 1));
      const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', {bubbles: true})); };
      const key = k => document.dispatchEvent(new KeyboardEvent('keydown', {key: k, bubbles: true, cancelable: true}));
      set('participant', 'SELFTEST'); set('seed', 'selftest');
      out.savedBefore = results.glasses.length;
      document.getElementById('runGlasses').click();
      out.started = !!run;
      for (let i = 0; i < 3 && run; i++) { key(' '); key('1'); }
      const stimulus = document.getElementById('stimulus');
      out.stimulus = {width: stimulus.width, height: stimulus.height, cssWidth: stimulus.style.width, left: stimulus.style.left, top: stimulus.style.top};
      const data = document.getElementById('viewAnaglyph').getContext('2d', {colorSpace: COLOR_SPACE}).getImageData(0, 0, 400, 1, {colorSpace: 'display-p3'}).data;
      const values = new Set(); for (let i = 0; i < data.length; i += 4) values.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      out.pixels = [...values];
      key('q'); key('q');
      out.savedAfter = results.glasses.length;
      out.storedKeys = Object.keys(localStorage);
      downloadCsv();
      return out;
      """
    note("running page script")
    webView.callAsyncJavaScript(script, arguments: [:], in: nil, in: .page) { [weak self] result in
      guard let self else { return }
      self.note("page script returned")
      var report: [String: Any] = ["log": self.selfTestLog]
      switch result {
      case .success(let value): report["page"] = value
      case .failure(let error): report["error"] = String(describing: error)
      }
      let finish = {
        self.selfTestDownloaded = nil
        report["log"] = self.selfTestLog
        report["files"] = (try? FileManager.default.contentsOfDirectory(atPath: folder.path)) ?? []
        // Leave the persistence counter, remove the test responses.
        self.webView.evaluateJavaScript("localStorage.removeItem('rds-experiment:selftest:SELFTEST')") { _, _ in
          let json = (try? JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])) ?? Data()
          try? json.write(to: folder.appendingPathComponent("selftest.json"))
          NSApp.terminate(nil)
        }
      }
      self.selfTestDownloaded = finish
      DispatchQueue.main.asyncAfter(deadline: .now() + 15) { if self.selfTestDownloaded != nil { self.selfTestLog.append("timed out waiting for the CSV download"); finish() } }
    }
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
