export type NotificationPopoverLayout = {
  left: number;
  maxHeight: number;
  top: number;
  width: number;
};

type RectLike = Pick<DOMRect, "bottom" | "left" | "right" | "top">;

export function getNotificationPopoverLayout({
  mobile,
  trigger,
  viewportHeight,
  viewportWidth,
}: {
  mobile: boolean;
  trigger: RectLike;
  viewportHeight: number;
  viewportWidth: number;
}): NotificationPopoverLayout {
  const safeMargin = 12;
  const triggerGap = 8;
  const minimumUsefulHeight = 120;
  const width = Math.max(0, Math.min(390, viewportWidth - safeMargin * 2));
  const preferredLeft = mobile
    ? trigger.right - width
    : trigger.right + triggerGap;
  const left = clamp(
    preferredLeft,
    safeMargin,
    Math.max(safeMargin, viewportWidth - width - safeMargin),
  );
  const preferredTop = mobile ? trigger.bottom + triggerGap : trigger.top;
  const top = clamp(
    preferredTop,
    safeMargin,
    Math.max(safeMargin, viewportHeight - safeMargin - minimumUsefulHeight),
  );

  return {
    left,
    maxHeight: Math.max(0, viewportHeight - top - safeMargin),
    top,
    width,
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}
