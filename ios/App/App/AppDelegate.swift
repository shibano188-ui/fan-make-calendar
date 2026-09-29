import UIKit
import Capacitor
import AppTrackingTransparency

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

/// Capacitor の画面。アプリ内だけのプラグイン（TrackingPlugin）をここで登録する。
/// Main.storyboard の customClass がこれを指している。
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(TrackingPlugin())
    }
}

/// 広告のトラッキング許可(ATT)を、JS から決めたタイミングで要求する口。
///
/// 前は AppDelegate が起動直後に出していたが、それだとオンボーディングの途中に割り込む。
/// 今は JS（src/lib/att.ts）が「オンボーディングを終えたあと」に呼ぶ（2026-09-29 柴野）。
///
/// **AdMob プラグインの requestTrackingAuthorization は使わない**。Capacitor はプラグインの呼び出しを
/// `DispatchQueue(label: "bridge")`＝バックグラウンドスレッドで実行するため、ダイアログが出ないまま
/// 完了することがある（2026-08-17 Guideline 2.1「ATTの許可要求が見つからない」で却下された経路）。
/// iOSはアプリが **active** かつ主スレッドから呼んだときにしかダイアログを出さないので、ここで主スレッドに移す。
@objc(TrackingPlugin)
public class TrackingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TrackingPlugin"
    public let jsName = "Tracking"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise)
    ]

    /// 回答が出るまで待って、状態（authorized / denied / restricted / notDetermined）を返す。
    /// 既に答えてある人には何も出さずに今の状態を返す。
    @objc func request(_ call: CAPPluginCall) {
        guard #available(iOS 14, *) else { call.resolve(["status": "authorized"]); return }
        DispatchQueue.main.async {
            guard ATTrackingManager.trackingAuthorizationStatus == .notDetermined,
                  UIApplication.shared.applicationState == .active else {
                call.resolve(["status": Self.name(ATTrackingManager.trackingAuthorizationStatus)])
                return
            }
            ATTrackingManager.requestTrackingAuthorization { status in
                call.resolve(["status": Self.name(status)])
            }
        }
    }

    @available(iOS 14, *)
    private static func name(_ s: ATTrackingManager.AuthorizationStatus) -> String {
        switch s {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        default: return "notDetermined"
        }
    }
}
