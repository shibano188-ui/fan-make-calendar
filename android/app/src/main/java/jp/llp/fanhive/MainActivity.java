package jp.llp.fanhive;

import android.content.Intent;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            getBridge().triggerWindowJSEvent("sendIntentReceived");
        }
    }
}
