//
//  ShareViewController.swift
//
//  Xなどの共有シートから FanHive を選んだときに動く拡張機能。
//  send-intent プラグインの README のコードを、このアプリに要るものだけに絞ってある。
//
//  絞った理由:
//  受け取るのは **テキストとURLだけ**。画像・動画・ファイルの共有は扱わない。
//  ファイルを本体アプリへ渡すには App Group（＋開発者サイトでの登録）が要るが、
//  FanHive のAI入力はXのポストのURLと本文しか使わないので、その依存を丸ごと外せる。
//  受け渡しはURLスキーム(fanhive://)のクエリだけで完結する。
//
//  拡張機能は本体とは別プロセスの小さなプログラムなので、本体へ渡すには openURL しかない。
//

import MobileCoreServices
import Social
import UIKit
import UniformTypeIdentifiers

class ShareItem {
    public var title: String?
    public var type: String?
    public var url: String?
}

class ShareViewController: UIViewController {

    private var shareItems: [ShareItem] = []

    private func sendData() {
        let queryItems = shareItems.map {
            [
                URLQueryItem(name: "title", value: $0.title ?? ""),
                URLQueryItem(name: "description", value: ""),
                URLQueryItem(name: "type", value: $0.type ?? ""),
                URLQueryItem(name: "url", value: $0.url ?? ""),
            ]
        }.flatMap({ $0 })

        // URLComponents が queryItems を適切にエンコードするので、
        // ここで自前に addingPercentEncoding をかけると二重エンコードになる。
        var urlComps = URLComponents(string: "fanhive://")!
        urlComps.queryItems = queryItems
        guard let url = urlComps.url else { return }
        openURL(url)
    }

    fileprivate func handleTypeUrl(_ attachment: NSItemProvider) async throws -> ShareItem {
        let results = try await attachment.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil)
        let shareItem = ShareItem()
        guard let url = results as? URL else { return shareItem }
        // ファイルURLは扱わない（App Groupが要るため）。Web上のURLだけ通す。
        if url.isFileURL { return shareItem }
        shareItem.title = url.absoluteString
        shareItem.url = url.absoluteString
        shareItem.type = "text/plain"
        return shareItem
    }

    fileprivate func handleTypeText(_ attachment: NSItemProvider) async throws -> ShareItem {
        let results = try await attachment.loadItem(forTypeIdentifier: UTType.text.identifier, options: nil)
        let shareItem = ShareItem()
        shareItem.title = results as? String
        shareItem.type = "text/plain"
        return shareItem
    }

    override public func viewDidLoad() {
        super.viewDidLoad()

        shareItems.removeAll()

        guard let extensionItem = extensionContext?.inputItems.first as? NSExtensionItem,
              let attachments = extensionItem.attachments else {
            extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
            return
        }

        Task {
            try? await withThrowingTaskGroup(of: ShareItem.self) { taskGroup in
                for attachment in attachments {
                    if attachment.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                        taskGroup.addTask { try await self.handleTypeUrl(attachment) }
                    } else if attachment.hasItemConformingToTypeIdentifier(UTType.text.identifier) {
                        taskGroup.addTask { try await self.handleTypeText(attachment) }
                    }
                }
                for try await item in taskGroup {
                    // URLもテキストも取れなかったものは捨てる
                    if item.title != nil || item.url != nil {
                        self.shareItems.append(item)
                    }
                }
            }

            self.sendData()
            // README は viewDidAppear で先に completeRequest しているが、それだと
            // openURL より先に拡張機能が閉じられる競合になる。渡し終えてから閉じる。
            self.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        }
    }

    /// 拡張機能からは UIApplication.shared が使えないので、responder chain を辿って本体を開く
    @objc func openURL(_ url: URL) {
        var responder: UIResponder? = self
        while responder != nil {
            if let application = responder as? UIApplication {
                application.open(url, options: [:], completionHandler: nil)
                return
            }
            responder = responder?.next
        }
    }
}
