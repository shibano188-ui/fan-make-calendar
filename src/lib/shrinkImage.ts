// 参考画像を送る前に、端末の中で縮める。
//
// なぜ原寸で送らないか:
//   ・見た目（色・雰囲気）を読むのに大きさは要らない。長辺768pxで十分
//   ・**原本をそのまま渡さない**という線引きを守るため（→ 著作物の扱い）
//   ・1枚あたりの費用が画素数にほぼ比例する
//
// 画像はサーバーに保存しない。AIに渡して捨てるだけで、残るのは色コードと選択肢だけ。

export type ShrunkImage = { base64: string; mediaType: 'image/jpeg' };

const MAX_EDGE = 768;

/** data URL を長辺 768px の JPEG に縮めて、base64 の中身だけ返す */
export function shrinkImage(dataUrl: string): Promise<ShrunkImage | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }
      // 透過のある画像を JPEG にすると黒く落ちるので、白を敷いてから描く
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const out = canvas.toDataURL('image/jpeg', 0.8);
      const base64 = out.split(',')[1];
      resolve(base64 ? { base64, mediaType: 'image/jpeg' } : null);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
