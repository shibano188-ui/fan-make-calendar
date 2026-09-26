// 新しい版への切り替え（Android アプリ・ブラウザ）。
// 画面は Service Worker が端末に持っていて、新しい版は裏で取ってくるが、開いている画面は
// 読み込み直すまで古いまま。アプリは裏に回しても終わらないので、閉じて開き直さない人は
// 何日も前の版を使い続ける（2026-09-26: 直した投稿画面が、直す前の動きのまま使われていた）。
// そこで、アプリに戻ってきたときに新しい版を確かめ、切り替わったらその場で読み込み直す。
// 戻ってきた直後（数秒以内）だけにするのは、入力の途中で急に画面が作り直されないようにするため。
// 投稿画面の入力は sessionStorage の下書きに残るので、読み込み直しても消えない。

const RESUME_WINDOW_MS = 8000;

export function installAppUpdate(): void {
  if (!('serviceWorker' in navigator)) return;
  let resumedAt = 0;
  let pending = false; // 切り替わったが、読み込み直す機会を待っている

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (Date.now() - resumedAt < RESUME_WINDOW_MS) window.location.reload();
    else pending = true;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (pending) { window.location.reload(); return; }
    resumedAt = Date.now();
    navigator.serviceWorker.getRegistration()
      .then((reg) => reg?.update())
      .catch(() => { /* オフラインなど。次に戻ってきたときにまた確かめる */ });
  });
}
