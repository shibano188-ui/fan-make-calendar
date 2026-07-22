package jp.llp.fanhive;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.webkit.WebView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // 直近に実測したステータスバー(＋カットアウト)高さ(CSS px)。
    private float latestTopCss = 0f;
    private WebView webView;
    private final Handler handler = new Handler();

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // ステータスバーの実測高さを CSS 変数 --sat として WebView に注入する。
        // CSS env(safe-area-inset-top) は一部のAndroid端末(例: Nothing OS / Android 15 の
        // WebView)で 0 を返し、全ページの上部バーがステータスバーに被る。WindowInsets は端末を
        // 問わず正しい値を返すので、それを唯一の真実として各ページ(var(--sat))に配る。
        webView = getBridge().getWebView();

        // 回転・インセット変更のたびに最新値へ更新。
        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, insets) -> {
            int topPx = insets.getInsets(WindowInsetsCompat.Type.systemBars()).top;
            latestTopCss = topPx / getResources().getDisplayMetrics().density;
            injectSat();
            return insets;
        });
        ViewCompat.requestApplyInsets(webView);

        // リモートURLは非同期ロードのため、初回のインセット発火時点ではまだ document が
        // 無いことがある。DOM生成後に確実に載るよう、起動直後は数回リトライする。
        for (int delay : new int[] { 300, 800, 1500, 2500, 4000 }) {
            handler.postDelayed(this::injectSat, delay);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // アプリ復帰時やSW更新後の再読込に備えて再注入。
        injectSat();
        handler.postDelayed(this::injectSat, 400);
    }

    /** documentElement の --sat を最新の実測値へ更新（値未取得なら何もしない）。 */
    private void injectSat() {
        if (webView == null || latestTopCss <= 0f) return;
        webView.evaluateJavascript(
            "document.documentElement.style.setProperty('--sat','" + latestTopCss + "px')",
            null
        );
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            getBridge().triggerWindowJSEvent("sendIntentReceived");
        }
    }
}
