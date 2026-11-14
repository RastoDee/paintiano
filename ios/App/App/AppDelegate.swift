import UIKit
import Capacitor
import StoreKit

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

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

// The app's own view controller: the stock Capacitor one plus our small local plugin.
class PfBridgeViewController: CAPBridgeViewController {
    private var pfObservers: [NSObjectProtocol] = []

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PfRefundPlugin())
        // The moment the app stops being the active one (the swipe home, the app switcher, the lock button) the page hears
        // "pfresign" and hushes its sound at once, instead of waiting for the later "hidden" while the last notes ring on;
        // active again ("pfactive"), it gives the sound back if it never left (see 05-main.jsx).
        let nc = NotificationCenter.default
        pfObservers.append(nc.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.bridge?.triggerWindowJSEvent(eventName: "pfresign")
        })
        pfObservers.append(nc.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.bridge?.triggerWindowJSEvent(eventName: "pfactive")
        })
    }

    deinit {
        pfObservers.forEach { NotificationCenter.default.removeObserver($0) }
    }
}

// PfRefund.request({ transactionId }) opens Apple's refund request sheet for one purchase.
// Resolves { status: "requested" | "cancelled" | "unknown" }. Apple decides; the server hears of a refund from Apple.
@objc(PfRefundPlugin)
public class PfRefundPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PfRefundPlugin"
    public let jsName = "PfRefund"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise)
    ]

    @objc func request(_ call: CAPPluginCall) {
        let idText = call.getString("transactionId") ?? ""
        let productId = call.getString("productId") ?? ""
        Task { @MainActor in
            let active = UIApplication.shared.connectedScenes.first { $0.activationState == .foregroundActive } as? UIWindowScene
            guard let scene = self.bridge?.viewController?.view.window?.windowScene ?? active else {
                call.reject("no_scene")
                return
            }
            // The purchase itself, looked up among what this Apple ID holds (by id, else by product).
            var found: Transaction?
            for await result in Transaction.currentEntitlements {
                guard case .verified(let t) = result else { continue }
                if String(t.id) == idText { found = t; break }
                if !productId.isEmpty && t.productID == productId && found == nil { found = t }
            }
            do {
                let status: Transaction.RefundRequestStatus
                if let t = found {
                    status = try await t.beginRefundRequest(in: scene)
                } else if let id = UInt64(idText) {
                    status = try await Transaction.beginRefundRequest(for: id, in: scene)
                } else {
                    call.reject("no_transaction")
                    return
                }
                switch status {
                case .success: call.resolve(["status": "requested"])
                case .userCancelled: call.resolve(["status": "cancelled"])
                @unknown default: call.resolve(["status": "unknown"])
                }
            } catch {
                call.reject("refund: " + String(describing: error))
            }
        }
    }
}
