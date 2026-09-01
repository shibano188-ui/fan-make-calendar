#!/usr/bin/env ruby
# 新しいバージョンを作って「新機能」を入れる。
#
#   ruby scripts/asc-new-version.rb 1.2 "$(cat fastlane/metadata/ja/release_notes.txt)"
#
# なぜ要るか:
#   配信中の版しか無いと **編集できる版が無い**ので、fastlane の
#   screenshots_download / screenshots_upload が「Could not find a version to edit」で落ちる。
#   スクショを差し替えるにも審査に出すにも、先にこれで版を作る。
#
#   版を作ると、説明文・スクショ・キーワードは**前の版から引き継がれる**。
#   引き継がれないのは「新機能（whatsNew）」だけで、これは版ごとに必須なので
#   ここで一緒に入れてしまう。
#
# 冪等。既に版があれば作らず、新機能の書き換えだけする。

require_relative 'asc_client'

version   = ARGV[0]
whats_new = ARGV[1]
unless version && whats_new && !whats_new.strip.empty?
  abort 'usage: asc-new-version.rb <version> <新機能のテキスト>'
end

vers = ASC.req(:get, "apps/#{ASC::APP_ID}/appStoreVersions?limit=20")['data']
v = vers.find { |x| x['attributes']['versionString'] == version }

if v
  puts "既にある版を使う: #{version}（#{v['attributes']['appStoreState']}）"
else
  v = ASC.req(:post, 'appStoreVersions', body: {
    data: {
      type: 'appStoreVersions',
      attributes: { platform: 'IOS', versionString: version },
      relationships: { app: { data: { type: 'apps', id: ASC::APP_ID } } },
    },
  })['data']
  puts "版を作った: #{version}"
end

locs = ASC.req(:get, "appStoreVersions/#{v['id']}/appStoreVersionLocalizations?limit=50")['data']
ja = locs.find { |l| l['attributes']['locale'] == 'ja' }
unless ja
  abort "ja のローカライズが無い（あるのは: #{locs.map { |l| l['attributes']['locale'] }.join(', ')}）"
end

ASC.req(:patch, "appStoreVersionLocalizations/#{ja['id']}", body: {
  data: {
    type: 'appStoreVersionLocalizations',
    id: ja['id'],
    attributes: { whatsNew: whats_new },
  },
})

puts '新機能を入れた（ja）:'
puts whats_new.lines.map { |l| "  #{l}" }.join
puts
puts '次: fastlane screenshots_download → 差し替え → fastlane screenshots_upload → fastlane submit build:12'
