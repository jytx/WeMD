/** 确认/取消输入框的按键事件，只取用得到的几项，测试可直接传普通对象。 */
interface ConfirmKeydownEvent {
  key: string;
  nativeEvent: { isComposing?: boolean; keyCode?: number };
}

/**
 * 输入法是否正在组词。
 * Safari 确认上屏的那次回车 isComposing 为 false，但 keyCode 固定为 229，需要一并判断。
 */
export function isComposingKeydown(event: ConfirmKeydownEvent): boolean {
  return (
    Boolean(event.nativeEvent.isComposing) || event.nativeEvent.keyCode === 229
  );
}

/**
 * 确认框/重命名输入框的共用按键处理：Enter 确认，Escape 取消。
 *
 * 输入法组词期间的回车（选词上屏）不触发确认，否则会把未上屏的拼音当成标题提交。
 */
export function handleConfirmKeydown(
  event: ConfirmKeydownEvent,
  onConfirm: () => void,
  onCancel: () => void,
): void {
  if (isComposingKeydown(event)) return;
  if (event.key === "Enter") onConfirm();
  else if (event.key === "Escape") onCancel();
}
