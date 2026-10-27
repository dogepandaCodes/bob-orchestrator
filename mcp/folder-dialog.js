// macOS folder dialog, started ahead of the click (JavaScript for Automation).
//
//   osascript -l JavaScript mcp/folder-dialog.js
//
// A cold `osascript … choose folder` spends seconds becoming a GUI app and
// loading AppKit before the panel appears; this does that work in advance.
// It is single-use: it shows one panel, answers, and exits. A window cannot
// outlive its process — a helper that stayed running after the panel closed
// left it frozen on screen, because nothing was left to process its removal.
//
//   stdout  ready                                  once warm
//   stdin   {"prompt": "...", "start": "/a/dir"}   one request
//   stdout  {"path": "/chosen/dir"} | {"path": null}   null = cancelled, then exit
ObjC.import("AppKit");
ObjC.import("stdlib");

const app = $.NSApplication.sharedApplication;
app.setActivationPolicy(1); // NSApplicationActivationPolicyAccessory: no Dock icon
$.NSOpenPanel.openPanel; // load the panel machinery now, not on the click

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
  // The bridge hands integers back as strings, so compare as numbers.
  return Number(panel.runModal) === 1 ? panel.URL.path.js : null; // NSModalResponseOK
}

write("ready");

// The one request, read up to its newline. EOF means the server went away.
let text = "";
while (!text.includes("\n")) {
  const data = stdin.availableData;
  if (Number(data.length) === 0) $.exit(0);
  text += $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js;
}

let path = null;
try {
  path = choose(JSON.parse(text.split("\n")[0]));
} catch (e) {
  // A malformed request still gets an answer, so the caller never waits.
}
write(JSON.stringify({ path }));
$.exit(0); // and the panel goes with the process
