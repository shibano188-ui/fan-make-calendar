#!/usr/bin/env ruby
# ストアのスクショを**1枚だけ**差し替える。
#
#   ruby scripts/asc-replace-screenshot.rb 1.2 マイページ.png ~/Desktop/.../マイページ.png
#                                          ^版   ^差し替える対象のファイル名  ^新しい画像
#
# なぜ fastlane を使わないか:
#   Fastfile の screenshots_upload（deliver）は **ロケール単位で全置換**する。
#   1枚だけ替えたいのに全8枚を手元に揃える必要があり、揃え損ねると残りが消える。
#   さらに screenshots_download レーンは中身が deliver（＝アップロード側）なので、
#   空のディレクトリで走らせると取得どころか消しにいく。名前に反するので使わない。
#
# ここでは対象の1枚を消して入れ直すだけなので、他の枚には触れない。
# 入れ直した画像は**必ず末尾に付く**ので、末尾以外を差し替えたときは並び順を直す。
# 並べ替えは appScreenshotSets の relationships に「全部の id を並べた配列」を投げる。

require_relative 'asc_client'

# ファイル名の比較は**必ず正規化してから**行う。
# App Store Connect が返す「カレンダー」は NFD（濁点が別の文字。24バイト）、
# コマンドラインから渡す方は NFC（21バイト）で、そのまま == すると一致しない。
# 実際これで「見つからなかった」と言われた（2026-09-14）。
def same_name?(a, b)
  a.unicode_normalize(:nfc) == b.unicode_normalize(:nfc)
end

version, target_name, new_path = ARGV
unless version && target_name && new_path && File.exist?(new_path)
  abort 'usage: asc-replace-screenshot.rb <version> <差し替える対象のファイル名> <新しい画像>'
end

vers = ASC.req(:get, "apps/#{ASC::APP_ID}/appStoreVersions?limit=10")['data']
v = vers.find { |x| x['attributes']['versionString'] == version }
abort "版 #{version} が無い" unless v
puts "版 #{version}（#{v['attributes']['appStoreState']}）"

locs = ASC.req(:get, "appStoreVersions/#{v['id']}/appStoreVersionLocalizations?limit=50")['data']
ja = locs.find { |l| l['attributes']['locale'] == 'ja' }
abort 'ja のローカライズが無い' unless ja

sets = ASC.req(:get, "appStoreVersionLocalizations/#{ja['id']}/appScreenshotSets?limit=20")['data']
abort 'スクショのセットが無い' if sets.empty?

sets.each do |set|
  shots = ASC.req(:get, "appScreenshotSets/#{set['id']}/appScreenshots?limit=20")['data']
  idx = shots.index { |s| same_name?(s['attributes']['fileName'], target_name) }
  next unless idx

  type = set['attributes']['screenshotDisplayType']
  puts "#{type}: #{shots.size}枚のうち #{idx + 1}枚目「#{target_name}」を差し替える"

  # 差し替える前の並びを、対象だけ nil にして覚えておく（あとで同じ位置に戻す）
  order = shots.map { |x| x['id'] }
  order[idx] = nil

  ASC.req(:delete, "appScreenshots/#{shots[idx]['id']}")
  puts '  古い画像を消した'

  id = ASC.upload_asset(
    'appScreenshot',
    {},
    { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set['id'] } } },
    new_path,
  )
  puts "  新しい画像を入れた（#{id}）"

  # 入れ直した画像は末尾に付くので、元の位置へ戻す。
  # 並べ替えは「セットに属する全部の id を、出したい順に並べた配列」を投げる。
  if idx != order.size - 1
    order[idx] = id
    ASC.req(:patch, "appScreenshotSets/#{set['id']}/relationships/appScreenshots",
            body: { data: order.map { |x| { type: 'appScreenshots', id: x } } })
    puts "  #{idx + 1}枚目へ並べ直した"
  end

  after = ASC.req(:get, "appScreenshotSets/#{set['id']}/appScreenshots?limit=20")['data']
  puts "  結果: #{after.size}枚"
  after.each_with_index { |s, i| puts "    #{i + 1}. #{s['attributes']['fileName']}" }
  abort '並びが元と違う。App Store Connect で確認すること' if after.size != shots.size
  exit 0
end

abort "「#{target_name}」が見つからなかった"
