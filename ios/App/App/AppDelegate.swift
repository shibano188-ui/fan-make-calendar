import UIKit
import Capacitor
import AppTrackingTransparency

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    /// トラッキング許可(ATT)をこの起動で既に要求したか。
    /// applicationDidBecomeActive は復帰のたびに呼ばれるので、二重に出さないための印。
    private var didRequestTracking = false

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
        requestTrackingAuthorizationIfNeeded()
    }

    /// 広告のトラッキング許可(ATT)を要求する。
    ///
    /// **JS側（AdMobプラグイン）から要求してはいけない**。Capacitor はプラグインの呼び出しを
    /// `DispatchQueue(label: "bridge")`＝バックグラウンドスレッドで実行するため、
    /// `ATTrackingManager.requestTrackingAuthorization` がダイアログを出さないまま完了することがある。
    /// iOSはアプリが **active** かつ主スレッドから呼んだときにしかダイアログを出さない。
    /// （2026-08-17 Guideline 2.1「ATTの許可要求が見つからない」で却下された経路がこれ）
    ///
    /// ここで出すと、WebView の読み込みや通知の許可より**先**に出る。
    /// 通知の許可は JS 側が `waitForTrackingDecision()` でこの回答を待ってから聞くので、
    /// 2つのダイアログが重なって片方が消える事故も起きない。
    private func requestTrackingAuthorizationIfNeeded() {
        guard #available(iOS 14, *), !didRequestTracking else { return }
        didRequestTracking = true
        // 起動直後の1フレーム目はまだウインドウが出ておらず、そこに出すと無視されることがある。
        // active になってから少しだけ待って主スレッドで要求する。
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            guard ATTrackingManager.trackingAuthorizationStatus == .notDetermined else { return }
            ATTrackingManager.requestTrackingAuthorization { _ in
                // 結果は見ない。断られてもパーソナライズされないだけで、広告自体は出る。
            }
        }
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
