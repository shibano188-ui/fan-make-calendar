package jp.llp.fanhive;

import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import com.android.installreferrer.api.ReferrerDetails;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Google Play の Install Referrer を JS に渡す（src/lib/deepLink.ts）。
 * 共有ページのストアのリンクに付けた referrer（utm_source=share&utm_content=<予定の id>）を、
 * 入れたあとに初めて開いたときに読み、その予定を開くのに使う。
 */
@CapacitorPlugin(name = "InstallReferrer")
public class InstallReferrerPlugin extends Plugin {

    @PluginMethod
    public void get(PluginCall call) {
        InstallReferrerClient client = InstallReferrerClient.newBuilder(getContext()).build();
        client.startConnection(new InstallReferrerStateListener() {
            @Override
            public void onInstallReferrerSetupFinished(int code) {
                try {
                    if (code != InstallReferrerClient.InstallReferrerResponse.OK) {
                        call.reject("unavailable: " + code);
                        return;
                    }
                    ReferrerDetails details = client.getInstallReferrer();
                    JSObject ret = new JSObject();
                    ret.put("referrer", details.getInstallReferrer());
                    call.resolve(ret);
                } catch (Exception e) {
                    call.reject(e.getMessage());
                } finally {
                    client.endConnection();
                }
            }

            @Override
            public void onInstallReferrerServiceDisconnected() { }
        });
    }
}
