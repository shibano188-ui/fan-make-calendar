# App Store Connect API の共通部分（JWTを作る・リクエストを投げる）。
# fastlane が包んでいない操作をやるときだけ使う。鍵は fastlane と同じ JSON。

require 'json'
require 'net/http'
require 'uri'
require 'openssl'
require 'base64'
require 'digest'

module ASC
  KEY_JSON = File.expand_path('~/.appstoreconnect/fanhive-asc-key.json')
  APP_ID   = '6801161205'
  HOST     = 'https://api.appstoreconnect.apple.com'

  module_function

  def token
    @token ||= begin
      cfg = JSON.parse(File.read(KEY_JSON))
      b64 = ->(h) { Base64.urlsafe_encode64(JSON.dump(h), padding: false) }
      header  = { alg: 'ES256', kid: cfg.fetch('key_id'), typ: 'JWT' }
      payload = { iss: cfg.fetch('issuer_id'), exp: Time.now.to_i + 20 * 60, aud: 'appstoreconnect-v1' }
      signing_input = "#{b64.call(header)}.#{b64.call(payload)}"
      key = OpenSSL::PKey::EC.new(cfg.fetch('key'))
      der = key.dsa_sign_asn1(OpenSSL::Digest::SHA256.digest(signing_input))
      r, s = OpenSSL::ASN1.decode(der).value.map { |v| v.value.to_s(2).rjust(32, "\x00") }
      "#{signing_input}.#{Base64.urlsafe_encode64(r + s, padding: false)}"
    end
  end

  # raw を渡すとヘッダをそのまま使ってバイト列を送る（アセットのアップロード用）
  def req(method, url, body: nil, raw: nil, allow_fail: false)
    uri = URI(url.start_with?('http') ? url : "#{HOST}/v1/#{url}")
    klass = { get: Net::HTTP::Get, post: Net::HTTP::Post, patch: Net::HTTP::Patch,
              put: Net::HTTP::Put, delete: Net::HTTP::Delete }.fetch(method)
    r = klass.new(uri)
    # アセットのアップロード先(object-storage.apple.com)は署名付きURLなので、
    # Authorization を足すと 400 になる。APIホストのときだけ付ける。
    r['Authorization'] = "Bearer #{token}" if uri.hostname.end_with?('appstoreconnect.apple.com')
    if raw
      raw.each { |k, v| r[k] = v }
      r.body = body
    elsif body
      r['Content-Type'] = 'application/json'
      r.body = JSON.dump(body)
    end
    res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: true) { |h| h.request(r) }
    unless res.code.to_i.between?(200, 299)
      return nil if allow_fail
      abort "#{method.to_s.upcase} #{uri} → #{res.code}\n#{res.body}"
    end
    res.body.to_s.empty? ? {} : JSON.parse(res.body)
  end

  def subscriptions
    req(:get, "apps/#{APP_ID}/subscriptionGroups?limit=50")['data'].flat_map do |g|
      req(:get, "subscriptionGroups/#{g['id']}/subscriptions?limit=50")['data']
    end
  end

  def review_screenshot(sub_id)
    r = req(:get, "subscriptions/#{sub_id}/appStoreReviewScreenshot", allow_fail: true)
    r && r['data']
  end

  # 画像を1枚アップロードする共通処理（予約 → 分割PUT → uploaded:true）
  def upload_asset(type, attributes, relationships, path)
    data = File.binread(path)
    created = req(:post, "#{type}s", body: {
      data: {
        type: "#{type}s",
        attributes: attributes.merge(fileName: File.basename(path), fileSize: data.bytesize),
        relationships: relationships,
      },
    })['data']
    created['attributes']['uploadOperations'].each do |op|
      headers = (op['requestHeaders'] || []).each_with_object({}) { |h, m| m[h['name']] = h['value'] }
      req(op['method'].downcase.to_sym, op['url'], body: data[op['offset'], op['length']], raw: headers)
    end
    req(:patch, "#{type}s/#{created['id']}", body: {
      data: { type: "#{type}s", id: created['id'],
              attributes: { uploaded: true, sourceFileChecksum: Digest::MD5.hexdigest(data) } },
    })
    created['id']
  end
end
