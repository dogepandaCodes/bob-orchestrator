// macOS folder dialog, kept warm (JavaScript for Automation).
//
//   osascript -l JavaScript mcp/folder-dialog.js
//
// A cold `osascript … choose folder` spends seconds becoming a GUI app and
// loading AppKit before the panel appears. This stays running instead, so a
// request only has to open the panel. Protocol, one JSON object per line:
//
//   stdout  ready                                  once, when warm
//   stdin   {"prompt": "...", "start": "/a/dir"}   open the panel
//   stdout  {"path": "/chosen/dir"} | {"path": null}   null = cancelled
//
// It exits when stdin closes, i.e. when the server does.
ObjC.import("AppKit");

const app = $.NSApplication.sharedApplication;
app.setActivationPolicy(1); // NSApplicationActivationPolicyAccessory: no Dock icon
$.NSOpenPanel.openPanel; // load the panel machinery now, not on the first click

const stdin = $.NSFileHandle.fileHandleWithStandardInput;
const stdout = $.NSFileHandle.fileHandleWithStandardOutput;
const write = (text) => stdout.writeData($(text + "\n").dataUsingEncoding($.NSUTF8StringEncoding));

function choose(request) {
  const panel = $.NSOpenPanel.openPanel;
  panel.setCanChooseDirectories(true);
  panel.setCanChooseFiles(false);
  panel.setAllowsMultipleSelection(false);
  panel.setCanCreateDirectories(true);
  panel.setPrompt($("Choose"));
  if (request.prompt) panel.setMessage($(request.prompt));
  if (request.start) panel.setDirectoryURL($.NSURL.fileURLWithPath($(request.start)));
  app.activateIgnoringOtherApps(true);
  const chosen = Number(panel.runModal) === 1 ? panel.URL.path.js : null; // NSModalResponseOK
  app.hide(null); // hand the focus back to the browser
  return chosen;
}

write("ready");
for (;;) {
  const data = stdin.availableData; // blocks until a request, or EOF
  if (Number(data.length) === 0) break; // the bridge reports NSUInteger as a string
  const text = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let path = null;
    try {
      path = choose(JSON.parse(line));
    } catch (e) {
      // A malformed request still gets an answer, so the caller never hangs.
    }
    write(JSON.stringify({ path }));
  }
}
