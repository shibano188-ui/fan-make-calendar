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
# ここでは対象の1枚を消して同じ位置に入れ直すだけなので、他の枚には触れない。
# 並び順は appScreenshots の配列順で、消した末尾に足せば元の位置に戻る。
# **末尾以外を差し替えるときは、入れ直したあとに並び替えが要る**（このスクリプトは末尾専用）。

require_relative 'asc_client'

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
  idx = shots.index { |s| s['attributes']['fileName'] == target_name }
  next unless idx

  type = set['attributes']['screenshotDisplayType']
  puts "#{type}: #{shots.size}枚のうち #{idx + 1}枚目「#{target_name}」を差し替える"

  if idx != shots.size - 1
    abort "末尾以外なので並び替えが要る（#{idx + 1}/#{shots.size}枚目）。このスクリプトは末尾専用"
  end

  ASC.req(:delete, "appScreenshots/#{shots[idx]['id']}")
  puts '  古い画像を消した'

  id = ASC.upload_asset(
    'appScreenshot',
    {},
    { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set['id'] } } },
    new_path,
  )
  puts "  新しい画像を入れた（#{id}）"

  after = ASC.req(:get, "appScreenshotSets/#{set['id']}/appScreenshots?limit=20")['data']
  puts "  結果: #{after.size}枚"
  after.each_with_index { |s, i| puts "    #{i + 1}. #{s['attributes']['fileName']}" }
  exit 0
end

abort "「#{target_name}」が見つからなかった"
