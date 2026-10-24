#!/usr/bin/env ruby
# 編集中の版のアプリ名・サブタイトル・キーワードを書き換える（日本語）。
#
#   ruby scripts/asc-store-text.rb 1.15
#
# アプリ名・サブタイトルは appInfo（配信中ではない方）に、キーワードは版ごとに入る。
# 先に asc-new-version.rb で版を作っておく。

require_relative 'asc_client'

# 2026-10-24 柴野: 名前に「予定管理」を入れ、予約・締切と「購入までを1つに」はサブタイトルへ（どちらも30文字まで）
NAME = '推し活カレンダー FanHive - グッズの予定管理・通知'
SUB  = '推しグッズの予約・締切の管理から購入まで、これ1つで！'
# 2026-10-24 柴野: ファンハイブ・推し活・カレンダー・予定管理で引っかかるように。
# 推し活・カレンダーはアプリ名にもあるが、日本語は名前の中で語が分かれて扱われるか分からないので、念のため単独でも入れる。
# 100文字に収めるため、ポップアップ・通販・漫画・声優・アイドルを外した
KW   = 'ファンハイブ,推し活,カレンダー,予定管理,スケジュール,アニメ,オタ活,オタク,一番くじ,コラボ,イベント,受注,アクスタ,缶バッジ,ぬいぐるみ,フィギュア,再販,再入荷,値下げ,キャラ,限定,抽選'

version = ARGV[0] or abort 'usage: asc-store-text.rb <version>'

info = ASC.req(:get, "apps/#{ASC::APP_ID}/appInfos")['data']
  .find { |i| (i['attributes']['appStoreState'] || i['attributes']['state']) != 'READY_FOR_SALE' }
abort '編集できる appInfo が無い（先に版を作る）' unless info
loc = ASC.req(:get, "appInfos/#{info['id']}/appInfoLocalizations")['data'].find { |l| l['attributes']['locale'] == 'ja' }
ASC.req(:patch, "appInfoLocalizations/#{loc['id']}",
        body: { data: { type: 'appInfoLocalizations', id: loc['id'], attributes: { name: NAME, subtitle: SUB } } })

v = ASC.req(:get, "apps/#{ASC::APP_ID}/appStoreVersions?limit=5")['data'].find { |x| x['attributes']['versionString'] == version }
abort "版 #{version} が無い" unless v
vl = ASC.req(:get, "appStoreVersions/#{v['id']}/appStoreVersionLocalizations")['data'].find { |l| l['attributes']['locale'] == 'ja' }
ASC.req(:patch, "appStoreVersionLocalizations/#{vl['id']}",
        body: { data: { type: 'appStoreVersionLocalizations', id: vl['id'], attributes: { keywords: KW } } })

a = ASC.req(:get, "appInfoLocalizations/#{loc['id']}")['data']['attributes']
b = ASC.req(:get, "appStoreVersionLocalizations/#{vl['id']}")['data']['attributes']
puts "アプリ名:     #{a['name']}", "サブタイトル: #{a['subtitle']}", "キーワード:   #{b['keywords']}", "新機能:       #{b['whatsNew']}"
