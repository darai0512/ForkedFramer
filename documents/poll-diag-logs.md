# ポーリング診断ログ (`[DIAG ...]`)

コンソールで `[DIAG` でフィルタしてください。

## ログ一覧

### pollMedia（pollMediaStatus内）

| ログ | 意味 |
|------|------|
| `[DIAG pollMedia] poll実行 HH:MM:SS` | 実際にAPIを叩いたタイミング |
| `[DIAG pollMedia] extraWait(Xms) 開始` | 10回以降の追加バックオフ待機開始 |
| `[DIAG pollMedia] extraWait → タイマー満了` | 追加待機が通常満了 |
| `[DIAG pollMedia] extraWait → タブ復帰で即resolve` | 追加待機中にタブ復帰→スキップ |
| `[DIAG pollMedia] extraWait → wasHiddenスキップ` | API呼出中にタブ復帰していた→追加待機スキップ |
| `[DIAG pollMedia] extraWait → タブ非表示でタイマー停止` | タブ離脱で追加待機タイマー一時停止 |

### resilientTask（runResilientTask内）

| ログ | 意味 |
|------|------|
| `[DIAG resilientTask] wait(Xms) 開始` | 基本インターバル待機開始 |
| `[DIAG resilientTask] wait → タイマー満了` | 通常のタイマー満了で次のpollへ |
| `[DIAG resilientTask] wait → タブ復帰で即resolve` | 待機中にタブ復帰→スキップ |
| `[DIAG resilientTask] wait → wasHiddenスキップ` | API呼出中にタブ復帰していた→スキップ |
| `[DIAG resilientTask] wait → タブ非表示でタイマー停止` | タブ離脱でタイマー一時停止 |

## 確認ポイント

タブを切り替えて戻ったとき:

- 「タブ復帰で即resolve」または「wasHiddenスキップ」が出ていれば正常（即座に再poll）
- これらが出ずに「タイマー満了」が出ている場合、別の原因で遅延が発生している

## ポーリングの流れ

```
[resilientTaskのwait] → poll実行 → [extraWait(10回以降)] → yield → [resilientTaskのwait] → ...
```

- `resilientTask wait`: 基本インターバル（画像1s / GPT 5s / 動画10s）
- `pollMedia extraWait`: 11回目以降に追加される漸増バックオフ
