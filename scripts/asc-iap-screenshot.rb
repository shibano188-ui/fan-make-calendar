#!/usr/bin/env ruby
# サブスクの「審査に関する情報 > スクリーンショット」を App Store Connect API で差し替える。
# fastlane(deliver) はこのエンドポイントを包んでいないので、生のAPIを叩く。
#
#   ruby scripts/asc-iap-screenshot.rb list
#   ruby scripts/asc-iap-screenshot.rb replace <画像パス>   # 全サブスクを差し替え
#
# 鍵は ~/.appstoreconnect/fanhive-asc-key.json（fastlane と同じもの）。

require 'json'
require 'net/http'
require 'uri'
require 'openssl'
require 'base64'
require 'digest'

KEY_JSON = File.expand_path('~/.appstoreconnect/fanhive-asc-key.json')
APP_ID   = '6801161205'
HOST     = 'https://api.appstoreconnect.apple.com'

def token
  cfg = JSON.parse(File.read(KEY_JSON))
  header  = { alg: 'ES256', kid: cfg.fetch('key_id'), typ: 'JWT' }
  payload = { iss: cfg.fetch('issuer_id'), exp: Time.now.to_i + 20 * 60, aud: 'appstoreconnect-v1' }
  b64 = ->(h) { Base64.urlsafe_encode64(JSON.dump(h), padding: false) }
  signing_input = "#{b64.call(header)}.#{b64.call(payload)}"
  key = OpenSSL::PKey::EC.new(cfg.fetch('key'))
  der = key.dsa_sign_asn1(OpenSSL::Digest::SHA256.digest(signing_input))
  r, s = OpenSSL::ASN1.decode(der).value.map { |v| v.value.to_s(2).rjust(32, "\x00") }
  "#{signing_input}.#{Base64.urlsafe_encode64(r + s, padding: false)}"
end

$jwt = token

def req(method, url, body: nil, headers: {}, raw: nil)
  uri = URI(url.start_with?('http') ? url : "#{HOST}/v1/#{url}")
  klass = { get: Net::HTTP::Get, post: Net::HTTP::Post, patch: Net::HTTP::Patch, put: Net::HTTP::Put,
            delete: Net::HTTP::Delete }.fetch(method)
  r = klass.new(uri)
  r['Authorization'] = "Bearer #{$jwt}"
  if raw
    raw.each { |k, v| r[k] = v }
    r.body = body
  elsif body
    r['Content-Type'] = 'application/json'
    r.body = JSON.dump(body)
  end
  headers.each { |k, v| r[k] = v }
  res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |h| h.request(r) }
  unless res.code.to_i.between?(200, 299)
    abort "#{method.to_s.upcase} #{uri} → #{res.code}\n#{res.body}"
  end
  res.body.to_s.empty? ? {} : JSON.parse(res.body)
end

def subscriptions
  groups = req(:get, "apps/#{APP_ID}/subscriptionGroups?limit=50")['data']
  groups.flat_map do |g|
    req(:get, "subscriptionGroups/#{g['id']}/subscriptions?limit=50")['data']
  end
end

def shots_of(sub_id)
  req(:get, "subscriptions/#{sub_id}/appStoreReviewScreenshot")['data']
rescue SystemExit
  nil
end

case ARGV[0]
when 'list'
  subscriptions.each do |s|
    shot = shots_of(s['id'])
    a = shot && shot['attributes']
    puts "#{s['attributes']['name']} (#{s['attributes']['productId']}) id=#{s['id']}"
    puts "  screenshot: #{a ? "#{a['fileName']} #{a['assetDeliveryState'] && a['assetDeliveryState']['state']} id=#{shot['id']}" : 'なし'}"
  end
when 'replace'
  path = ARGV[1] or abort 'usage: replace <画像パス>'
  data = File.binread(path)
  subscriptions.each do |s|
    old = shots_of(s['id'])
    req(:delete, "subscriptionAppStoreReviewScreenshots/#{old['id']}") if old
    created = req(:post, 'subscriptionAppStoreReviewScreenshots', body: {
      data: {
        type: 'subscriptionAppStoreReviewScreenshots',
        attributes: { fileName: File.basename(path), fileSize: data.bytesize },
        relationships: { subscription: { data: { type: 'subscriptions', id: s['id'] } } },
      },
    })['data']
    created['attributes']['uploadOperations'].each do |op|
      headers = (op['requestHeaders'] || []).each_with_object({}) { |h, m| m[h['name']] = h['value'] }
      chunk = data[op['offset'], op['length']]
      req(op['method'].downcase.to_sym, op['url'], body: chunk, raw: headers)
    end
    req(:patch, "subscriptionAppStoreReviewScreenshots/#{created['id']}", body: {
      data: {
        type: 'subscriptionAppStoreReviewScreenshots',
        id: created['id'],
        attributes: { uploaded: true, sourceFileChecksum: Digest::MD5.hexdigest(data) },
      },
    })
    puts "差し替えた: #{s['attributes']['name']}"
  end
else
  abort 'usage: asc-iap-screenshot.rb list | replace <画像パス>'
end
