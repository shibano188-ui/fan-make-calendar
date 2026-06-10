import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// 触覚フィードバック（ネイティブのみ。Phase F-3）
// 発火は控えめに: いいね・タブ切替・保存成功・リアクション選択のみ

const native = () => Capacitor.isNativePlatform();

export const haptic = {
  /** いいね・リアクション選択・重要マークON */
  light: () => { if (native()) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}); },
  /** タブ切り替え */
  select: () => { if (native()) Haptics.selectionStart().catch(() => {}); },
  /** 保存成功・作品参加 */
  success: () => { if (native()) Haptics.notification({ type: NotificationType.Success }).catch(() => {}); },
};
