// ゲームの DOM（試作 game.html 第7版から）
export const ROOM_MARKUP = `  <div class="dock">
    <button class="bag" id="bag" aria-label="カバンのゲーム機を出す">
      <canvas id="bagBack"></canvas>
      <canvas id="bag3d"></canvas>
      <canvas id="bagFront"></canvas>
    </button>
  </div>
  <div class="stage" id="stage">
    <div class="dim" id="dim"></div>
    <canvas class="sbag" id="sBagBack" style="z-index:2"></canvas>
    <canvas class="sbag" id="sBagItems" style="z-index:2"></canvas>
    <div class="console" id="console">
      <button class="sbtn" id="bL" aria-label="L 左を向く"><canvas width="30" height="10"></canvas></button>
      <button class="sbtn" id="bR" aria-label="R 右を向く"><canvas width="30" height="10"></canvas></button>
      <canvas class="skin" id="skin"></canvas>
      <div class="stks" id="stks"></div>
      <div class="screen" id="screen">
        <div class="tv" id="tv">
          <div class="scan"></div>
          <div class="hud"><canvas id="hud"></canvas></div>
          <div class="tut" id="tut"><div class="tn">大家さん<button id="tutSkip">スキップ</button></div><div class="tl" id="tutL"></div><button class="nx" id="tutNext">次へ ▶</button></div>
          <canvas class="cur" id="cur" width="12" height="17"></canvas>
          <div class="prompt" id="prompt"><i>A</i><span id="promptT"></span></div>
          <div class="card" id="card"><img id="cImg" alt=""><div style="flex:1;min-width:0"><div class="t" id="cT"></div><div class="s" id="cS"></div></div></div>
          <div class="get" id="get"><div class="gx"><div class="gt" id="gT"></div><div class="gs" id="gS"></div></div><div class="gb"><button class="y" id="gShot">撮る</button><button id="gBack">もどす</button></div></div>
          <div class="tray" id="tray"><div class="tt" id="trayT"></div><div class="tl" id="trayL"></div><div class="tb"><button id="trayPut">しまう</button><button class="y" id="trayEnd">おわる</button></div></div>
          <div class="mg" id="mg"><canvas id="mgC" width="192" height="144"></canvas></div>
          <div class="menu" id="menu"><button data-k="shot">スクショを撮る</button><button data-k="move">グッズをかざりかえる</button><button data-k="lib">マイステッカー</button><button data-k="matome">今月のまとめ画像</button><button data-k="close">とじる</button></div>
          <div class="stk" id="stk"><div class="st">ステッカーをつくる</div><canvas id="stkC" width="12" height="12"></canvas><div class="pal" id="pal"></div><div class="row"><button class="y" id="stkOk">本体にはる</button><button id="stkNo">やめる</button></div></div>
          <div class="talk" id="talk"><div class="tn" id="tN"></div><div class="tl" id="tL"></div><div class="tb" id="tB"></div></div>
          <div class="lib" id="lib"><div class="lt">マイステッカー<button class="y" id="libEnd">おわる</button></div><div class="ll" id="libL"></div><div class="lh">本体へドラッグで貼る</div></div>
          <div class="trash" id="trash"><canvas width="14" height="16"></canvas><span>はがす</span></div>
          <div class="toast" id="toast"></div>
          <div class="fade" id="fade"></div>
          <canvas class="boot" id="boot"></canvas>
        </div>
      </div>
      <button class="pbtn" id="bPow" aria-label="電源"><canvas width="32" height="8"></canvas></button>
      <div class="dpad" id="dpad" role="group" aria-label="十字ボタン"><canvas id="dpadC" width="42" height="42"></canvas></div>
      <button class="abtn" id="bA" aria-label="A ボタン"><canvas width="28" height="28"></canvas></button>
      <button class="pbtn" id="bSel" aria-label="SELECT キャラを着がえる"><canvas width="24" height="15"></canvas></button>
      <button class="pbtn" id="bStart" aria-label="START メニュー"><canvas width="24" height="15"></canvas></button>
      <button class="pbtn" id="bShot" aria-label="スクショ"><canvas width="16" height="16"></canvas></button>
      <button class="pbtn" id="bHome" aria-label="自分の部屋へ"><canvas width="16" height="16"></canvas></button>
    </div>
    <canvas class="sbag" id="sBagFront" style="z-index:4"></canvas>
  </div>
  <canvas class="ghost" id="ghost"></canvas>
  <div class="shot" id="shot"><img id="shotImg" alt="スクショ"><div class="row"><button class="a" id="shotShare">X などに共有</button><button class="b" id="shotSave">保存する</button></div><button class="b" id="shotClose" style="flex:none;padding:10px 28px">閉じる</button></div>
`;
