function sendToWindow(target, channel, value) {
  if (!target || target.isDestroyed()) return false;
  const contents = target.webContents;
  if (!contents || contents.isDestroyed()) return false;
  try {
    contents.send(channel, value);
    return true;
  } catch (error) {
    // The native window can outlive its renderer while closing, including between
    // the guards and send(). Dropping a final notification is safe in that case.
    if (
      target.isDestroyed() ||
      contents.isDestroyed() ||
      /(?:destroyed|disposed)/i.test(error.message)
    )
      return false;
    throw error;
  }
}
module.exports = { sendToWindow };
