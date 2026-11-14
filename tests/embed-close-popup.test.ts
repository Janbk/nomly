import { describe, expect, it, vi } from "vitest";

import { CLOSE_POPUP_MESSAGE_TYPE, requestPopupClose } from "@/lib/embed/close-popup";

function framedWindow() {
  const parent = { postMessage: vi.fn() };
  const win = { parent, postMessage: vi.fn() } as unknown as Window;
  return { win, parent };
}

describe("requestPopupClose", () => {
  it("posts the close message to the parent frame", () => {
    const { win, parent } = framedWindow();
    expect(requestPopupClose("stock-check", win)).toBe(true);
    expect(parent.postMessage).toHaveBeenCalledWith(
      { type: CLOSE_POPUP_MESSAGE_TYPE, source: "stock-check" },
      "*",
    );
    expect(CLOSE_POPUP_MESSAGE_TYPE).toBe("nomly:close-popup");
  });

  it("does nothing when the page isn't framed", () => {
    const win = { postMessage: vi.fn() } as unknown as Window & { parent: Window };
    (win as { parent: Window }).parent = win;
    expect(requestPopupClose("stock-check", win)).toBe(false);
    expect(win.postMessage).not.toHaveBeenCalled();
  });

  it("swallows a throwing postMessage", () => {
    const { win, parent } = framedWindow();
    parent.postMessage.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(requestPopupClose("stock-check", win)).toBe(false);
  });
});
