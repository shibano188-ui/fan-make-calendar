import { useRef } from 'react';
import { setWorkImage, toWorkImage, fileToDataUrl } from '../../lib/workImages';
import { hasNativePhotoPicker, pickPhoto } from '../../lib/pickPhoto';
import { useConfirm } from '../ui/ConfirmDialog';

/** 作品アイコンを選ぶ（ホームの作品カードから）。中身はカスタマイズ画面の選び方と同じ。
 *  アプリは端末の写真選び、Web はファイル選び。選んだ画像はカレンダーの作品の並びにも出る（同じ保存先） */
export function useWorkImagePicker() {
  const confirmDialog = useConfirm();
  const inputRef = useRef<HTMLInputElement>(null);
  const target = useRef<string | null>(null);
  const apply = async (workId: string, dataUrl: string | null) => {
    const img = dataUrl ? await toWorkImage(dataUrl) : null;
    if (dataUrl && !img) return;
    setWorkImage(workId, img);
  };
  const pick = async (workId: string) => {
    if (!hasNativePhotoPicker()) { target.current = workId; inputRef.current?.click(); return; }
    const res = await pickPhoto();
    if (res.status === 'denied') {
      await confirmDialog({
        title: '写真へのアクセスが必要です',
        message: '設定アプリ ＞ FanHive ＞ 写真 で許可すると、作品の画像を選べます。',
        hideCancel: true,
      });
      return;
    }
    if (res.status === 'picked') await apply(workId, res.dataUrl);
  };
  const remove = (workId: string) => { setWorkImage(workId, null); };
  const input = hasNativePhotoPicker() ? null : (
    <input ref={inputRef} type="file" accept="image/*" className="hidden"
      onChange={async (e) => {
        const file = e.target.files?.[0];
        const id = target.current;
        e.target.value = '';
        if (!file || !id) return;
        const url = await fileToDataUrl(file);
        if (url) await apply(id, url);
      }} />
  );
  return { pick, remove, input };
}
