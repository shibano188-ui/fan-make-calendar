#!/usr/bin/env ruby
# 提出中の reviewSubmission にサブスクを項目として足す。
#
#   ruby scripts/asc-add-subs.rb <reviewSubmission_id>
#
# ASC API の reviewSubmissionItems がサブスクをどの関係名で受けるか公開情報が曖昧なので、
# 候補を順に試して通ったものを使う。全部だめなら App Store Connect のブラウザから
# 提出し直す（ブラウザは版とサブスクをまとめて1つの提出にしてくれる）。

require_relative 'asc_client'

submission_id = ARGV[0] or abort 'usage: asc-add-subs.rb <reviewSubmission_id>'
candidates = %w[subscription subscriptions inAppPurchaseV2 inAppPurchase]

ASC.subscriptions.each do |sub|
  ok = candidates.find do |rel|
    r = ASC.req(:post, 'reviewSubmissionItems', allow_fail: true, body: {
      data: {
        type: 'reviewSubmissionItems',
        relationships: {
          reviewSubmission: { data: { type: 'reviewSubmissions', id: submission_id } },
          rel => { data: { type: 'subscriptions', id: sub['id'] } },
        },
      },
    })
    puts "  #{rel}: #{r ? '通った' : 'だめ'}"
    r
  end
  puts "#{sub['attributes']['name']}: #{ok ? "追加できた（#{ok}）" : '追加できず'}"
end
