# 使い方（プロジェクト直下から）:
#   GEM_HOME=/opt/homebrew/Cellar/cocoapods/<version>/libexec ruby scripts/add-share-extension.rb
#   ※ xcodeproj gem は CocoaPods に同梱されている（brew install cocoapods）
#
# Share Extension のターゲットを App.xcodeproj に追加する。
# Xcode の GUI でやる「File > New > Target > Share Extension」と同じことを、
# 再現可能な形で残すためにスクリプトにしてある。冪等（既にあれば何もしない）。
require 'xcodeproj'

PROJ = 'ios/App/App.xcodeproj'
EXT_NAME = 'ShareExtension'
EXT_DIR  = 'ShareExtension'

project = Xcodeproj::Project.open(PROJ)
app = project.targets.find { |t| t.name == 'App' }
abort('App ターゲットが見つからない') unless app

if project.targets.any? { |t| t.name == EXT_NAME }
  puts "既に #{EXT_NAME} がある。何もしない"
  exit 0
end

# App の設定を土台にして食い違いを防ぐ（deployment target / version 番号など）
app_release = app.build_configuration_list.build_settings('Release')
deployment  = app_release['IPHONEOS_DEPLOYMENT_TARGET'] || '15.0'

ext = project.new_target(:app_extension, EXT_NAME, :ios, deployment)

# ソースをグループに登録
group = project.main_group.find_subpath(EXT_DIR, true)
group.set_source_tree('SOURCE_ROOT')
group.set_path(EXT_DIR)
swift_ref = group.new_reference('ShareViewController.swift')
group.new_reference('Info.plist')
ext.add_file_references([swift_ref])

ext.build_configurations.each do |config|
  s = config.build_settings
  s['INFOPLIST_FILE'] = "#{EXT_DIR}/Info.plist"
  s['PRODUCT_BUNDLE_IDENTIFIER'] = 'jp.llp.fanhive.ShareExtension'
  s['PRODUCT_NAME'] = '$(TARGET_NAME)'
  s['SWIFT_VERSION'] = app_release['SWIFT_VERSION'] || '5.0'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = deployment
  s['TARGETED_DEVICE_FAMILY'] = '1,2'
  s['MARKETING_VERSION'] = app_release['MARKETING_VERSION'] || '1.0'
  s['CURRENT_PROJECT_VERSION'] = app_release['CURRENT_PROJECT_VERSION'] || '1'
  s['CODE_SIGN_STYLE'] = 'Automatic'
  # Info.plist は自前で置くので Xcode に生成させない
  s['GENERATE_INFOPLIST_FILE'] = 'NO'
  s['SKIP_INSTALL'] = 'YES'
end

# 本体に埋め込む（PlugIns/ に入らないと共有シートに出ない）
app.add_dependency(ext)
embed = app.build_phases.find do |ph|
  ph.is_a?(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase) &&
    ph.symbol_dst_subfolder_spec == :plug_ins
end
if embed.nil?
  embed = app.new_copy_files_build_phase('Embed Foundation Extensions')
  embed.symbol_dst_subfolder_spec = :plug_ins
  embed.dst_path = ''
end
build_file = embed.add_file_reference(ext.product_reference)
build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

project.save
puts "#{EXT_NAME} を追加した"
