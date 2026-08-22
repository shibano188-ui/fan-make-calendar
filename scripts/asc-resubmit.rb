#!/usr/bin/env ruby
# 却下されたあとの出し直しを一気にやる。
#
#   ruby scripts/asc-resubmit.rb <サブスク審査用の画像>
#
# なぜ要るか（2026-08-21）:
#   却下されても審査提出（reviewSubmission）は UNRESOLVED_ISSUES のまま**開いたまま**残る。
#   これがあると (1) サブスクの審査用スクショが差し替えられない
#   （MEDIA_ASSET_DELETE_NOT_ALLOWED）(2) 新しい提出も作れない
#   （A review submission is already in progress）。
#   なので「古い提出を取り消す → スクショ差し替え → 版とサブスクを入れた提出を作る → 出す」を順にやる。
#
# バイナリの紐付け（fastlane submit / deliver の build 選択）は先に済ませておくこと。

require_relative 'asc_client'

shot = ARGV[0]
abort 'usage: asc-resubmit.rb <サブスク審査用の画像>' unless shot && File.exist?(shot)

# ── 1. 開いたままの提出を取り消す ───────────────────────────────
open_states = %w[READY_FOR_REVIEW WAITING_FOR_REVIEW IN_REVIEW UNRESOLVED_ISSUES]
subs = ASC.req(:get, "apps/#{ASC::APP_ID}/reviewSubmissions?limit=10")['data']
open = subs.select { |s| open_states.include?(s['attributes']['state']) }
open.each do |s|
  puts "提出を取り消す: #{s['id']} (#{s['attributes']['state']})"
  ASC.req(:patch, "reviewSubmissions/#{s['id']}",
          body: { data: { type: 'reviewSubmissions', id: s['id'], attributes: { canceled: true } } })
end
sleep 5 unless open.empty?

# ── 2. サブスクの審査用スクショを差し替える ──────────────────────
subscriptions = ASC.subscriptions
subscriptions.each do |sub|
  old = ASC.review_screenshot(sub['id'])
  ASC.req(:delete, "subscriptionAppStoreReviewScreenshots/#{old['id']}") if old
  ASC.upload_asset('subscriptionAppStoreReviewScreenshot', {},
                   { subscription: { data: { type: 'subscriptions', id: sub['id'] } } }, shot)
  puts "スクショ差し替え: #{sub['attributes']['name']}"
end

# ── 3. 版とサブスクを入れた提出を作って出す ──────────────────────
version = ASC.req(:get, "apps/#{ASC::APP_ID}/appStoreVersions?limit=5")['data']
           .find { |v| v['attributes']['appVersionState'] != 'READY_FOR_DISTRIBUTION' }
abort '提出できるバージョンが見つからない' unless version
puts "バージョン #{version['attributes']['versionString']} (#{version['attributes']['appVersionState']})"

submission = ASC.req(:post, 'reviewSubmissions', body: {
  data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' },
          relationships: { app: { data: { type: 'apps', id: ASC::APP_ID } } } },
})['data']

add = lambda do |type, id|
  ASC.req(:post, 'reviewSubmissionItems', body: {
    data: { type: 'reviewSubmissionItems',
            relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: submission['id'] } },
                             type => { data: { type: "#{type}s", id: id } } } },
  })
end

add.call('appStoreVersion', version['id'])
puts 'バージョンを追加'
subscriptions.each do |sub|
  # 審査済みのサブスクは追加できない（400が返る）ので、そのときは黙って飛ばす
  r = ASC.req(:post, 'reviewSubmissionItems', allow_fail: true, body: {
    data: { type: 'reviewSubmissionItems',
            relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: submission['id'] } },
                             subscription: { data: { type: 'subscriptions', id: sub['id'] } } } },
  })
  puts(r ? "サブスクを追加: #{sub['attributes']['name']}" : "サブスクは追加不要: #{sub['attributes']['name']}")
end

ASC.req(:patch, "reviewSubmissions/#{submission['id']}",
        body: { data: { type: 'reviewSubmissions', id: submission['id'], attributes: { submitted: true } } })
puts "提出した: #{submission['id']}"
