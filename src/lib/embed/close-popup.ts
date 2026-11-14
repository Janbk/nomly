/**
 * Message an embed page posts to its parent frame when it is "done", so the
 * host (the Home Assistant dashboard) can close the popup around the iframe —
 * the iframe can't do that itself, the dialog belongs to the cross-origin
 * parent. See docs/home-assistant.md (`/embed/lager`).
 */
export const CLOSE_POPUP_MESSAGE_TYPE = "nomly:close-popup";

export type ClosePopupMessage = {
  type: typeof CLOSE_POPUP_MESSAGE_TYPE;
  source: string;
};

type FrameWindow = Pick<Window, "parent" | "postMessage">;

/**
 * Asks the parent frame to close the popup. Returns whether a message was
 * sent (false when the page isn't framed, e.g. opened directly).
 *
 * targetOrigin is "*": the message carries no data, the CSP
 * `frame-ancestors` (EMBED_FRAME_ANCESTORS) already decides who may frame the
 * page at all, and the listener checks `event.origin` on its side. Pinning
 * the origin client-side would need the server-only env var shipped to the
 * page and would break for entries postMessage can't target ('self',
 * wildcard hosts).
 */
export function requestPopupClose(source: string, win: FrameWindow = window): boolean {
  const parent = win.parent;
  if (!parent || parent === win) return false;
  const message: ClosePopupMessage = { type: CLOSE_POPUP_MESSAGE_TYPE, source };
  try {
    parent.postMessage(message, "*");
    return true;
  } catch {
    return false;
  }
}
