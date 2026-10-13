/** Resolve this question's images before dispatching it to the model. */
export async function preparePhoneChatImages(opts: {
  captureScreen: boolean;
  attachedPaths: readonly string[];
  capture: () => Promise<string>;
  isCurrent: () => boolean;
}): Promise<string[] | null> {
  if (!opts.isCurrent()) return null;
  // A one-click screen question owns its new capture, rather than reading a
  // renderer-managed tray that can change while the screenshot is in flight.
  const paths = opts.captureScreen ? [await opts.capture()] : [...opts.attachedPaths];
  if (!opts.isCurrent()) return null;
  if (opts.captureScreen && !paths[0]) throw new Error('Screen capture failed');
  return [...new Set(paths)];
}
