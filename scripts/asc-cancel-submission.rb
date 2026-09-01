#!/usr/bin/env ruby
# 開いたままの審査提出を取り消す。
#
#   ruby scripts/asc-cancel-submission.rb
#
# いつ要るか:
#   - 出したあとでスクショや説明文を直したくなったとき
#     （審査中は差し替えられない。消そうとすると MEDIA_ASSET_DELETE_NOT_ALLOWED）
#   - 却下されたあと。**却下されても提出は UNRESOLVED_ISSUES のまま開いたまま残る**ので、
#     これを消さないと新しい提出が作れない（A review submission is already in progress）
#
# 取り消すと版は編集できる状態に戻る。**審査の待ち行列は先頭から並び直しになる**ので、
# 直すものが無いなら取り消さないこと。
#
# 出し直しは `cd ios/App && fastlane submit build:<番号>`。
# 却下後にサブスクの審査用スクショごと出し直すなら scripts/asc-resubmit.rb のほう。

require_relative 'asc_client'

OPEN_STATES = %w[READY_FOR_REVIEW WAITING_FOR_REVIEW IN_REVIEW UNRESOLVED_ISSUES].freeze

subs = ASC.req(:get, "apps/#{ASC::APP_ID}/reviewSubmissions?limit=10")['data']
open = subs.select { |s| OPEN_STATES.include?(s['attributes']['state']) }

if open.empty?
  puts '開いたままの提出は無い（取り消すものなし）'
  exit 0
end

open.each do |s|
  a = s['attributes']
  puts "取り消す: #{s['id']}（#{a['state']} / 提出 #{a['submittedDate']}）"
  ASC.req(:patch, "reviewSubmissions/#{s['id']}",
          body: { data: { type: 'reviewSubmissions', id: s['id'], attributes: { canceled: true } } })
end

sleep 5

vers = ASC.req(:get, "apps/#{ASC::APP_ID}/appStoreVersions?limit=5")['data']
vers.first(3).each do |v|
  puts "  版 #{v['attributes']['versionString']}: #{v['attributes']['appStoreState']}"
end
puts
puts '版が編集できる状態（PREPARE_FOR_SUBMISSION など）に戻っていれば、スクショを差し替えられる。'
puts '出し直しは: cd ios/App && fastlane submit build:12'
