Twitter/XのポストURLから埋め込み用HTMLを作成してください: $ARGUMENTS

以下の手順で実行してください：

1. Twitter oEmbed API (`https://publish.twitter.com/oembed?url=<URL>`) を使って埋め込みコードを取得
2. `public/ads/jonigata/embeds/` ディレクトリ内の既存の `tweetXXXX.html` ファイルを確認し、次の番号を決定
3. 新しい `tweetXXXX.html` ファイルを作成し、取得した埋め込みコードを保存
4. `public/ads/jonigata/embeds/list.json` の `embeds` 配列に新しいファイル名を追加
5. `public/ads`でコミット（`public/ads`は別のレポジトリです）
6. 作成したファイル名と内容を報告
