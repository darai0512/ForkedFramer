<script lang="ts">
  import { type ModalSettings, modalStore } from '@skeletonlabs/skeleton';
  import aiPictorsIcon from '../assets/aipictors_logo_0.webp';

  function showComic() {
    const d: ModalSettings = {
      type: 'component',
      component: 'comic',
    };
    modalStore.trigger(d);    
  }
</script>

<div>
  <h2>チートシート</h2>
  <h3>画面全体</h3>
  <p>Space+ドラッグ: スクロール（手のひらツール）</p>
  <p>右ドラッグ: スクロール（手のひらツール）</p>
  <p>Wheel: ズーム</p>
  <p>Undo/Redo: Ctrl+Z/Shift+Ctrl+Z</p>

  <h3>コマ ※文字キー＋クリックはインスペクタを非表示にしてから</h3>
  <p>Q+Click: 削除</p>
  <p>W+Click: 左右に分割</p> 
  <p>S+Click: 上下に分割</p> 
  <p>D+Click: 画像削除</p>
  <p>T+Click: 画像左右反転</p>
  <p>Y+Click: 画像上下反転</p>
  <p>E+Click: 画像フィット</p>
  <p>B+ドラッグ: パディング変更</p>
  <p>ドラッグ: 画像移動(+Shiftでフィットしながら)</p>
  <p>Ctrl+ドラッグ: 画像スケール(+Shiftでフィットしながら)</p>
  <p>Alt+ドラッグ: 画像回転</p>

  <h3>枠線</h3>
  <p>Ctrl+ドラッグ: 太さ</p>
  <p>Shift+ドラッグ: 傾き(Altを押していると15度単位)</p>
  <p>T+クリック: 分割縦横のフリップ</p>

  <h3>フキダシ</h3>
  <p>Alt+ドラッグ: 移動</p>
  <p>F+ドラッグ: 作成</p>
  <p>G+ドラッグ: 透明画像つきで作成</p>
  <p>なにもないところでダブルクリック: 作成</p>
  <p>フキダシをダブルクリック: 適当な大きさ</p>
  <p>Q+クリック: 削除</p>
  <p>S+ドラッグ(対象にドロップ): スタイルのコピー</p>
  <p>フキダシに画像をドロップ: 画像フキダシ化</p>
  <p>テキストをペースト: 作成</p>
  <p>空行区切りテキストをペースト: 一気に作成</p>
  <p>インスペクタのテキスト上でShift+Enter: そこで分割</p>

  <h3>画像フキダシ</h3>
  <p>ドラッグ: 移動</p>
  <p>Ctrl+ドラッグ: スケール</p>
  <p>画像ファイルを左上のフキダシアイコンにドロップ: 作成</p>
  <p>画像をペースト: 作成</p>

  <h3>紹介・入門記事</h3>
  <p>
    <a href="https://www.youtube.com/channel/UC3kZKl2Q5IvlFKnJ8RHKBGw">Youtube ムービーマニュアル</a>
  </p>
  <p>
    <a href="https://note.com/super_lilac52/n/n63eee9724a03" target="_blank" rel="noopener noreferrer">「FramePlanner」とは？誰でも簡単にAIマンガが作れる神ツールを解説！</a>
  </p>
  <p>
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-static-element-interactions -->
    <span class="comic-link" on:click={showComic}>はじめてのFramePlanner（まんが入門！）</span>(<a href="https://twitter.com/aiai61555228" target="_blank" rel="noopener noreferer">@aiai61555228</a>)
  </p>

  <h3>ギャラリー</h3>
  <p class="inline-elements">
    <a href="https://www.aipictors.com/tags/frameplanner?orderBy=LIKES_COUNT&sort=DESC&page=0&prompt=0
    https://www.aipictors.com/search/?tag=frameplanner" target="_blank" rel="noopener noreferrer">
      <img width=110 src={aiPictorsIcon} alt="aipictors"/>
    </a>
    <a href="https://www.chichi-pui.com/posts/tags/FramePlanner/" target="_blank" rel="noopener noreferrer">ちちぷい</a>
    <a href="https://twitter.com/hashtag/frameplanner?src=hashtag_click&f=live" target="_blank" rel="noopener noreferrer">#frameplanner(Twitter)</a>
  </p>

  <h3>資料</h3>
  <p>
    <a href="https://github.com/jonigata/FramePlanner2" target="_blank" rel="noopener noreferrer">github</a>
    <a href="https://twitter.com/jonigata_ai" target="_blank" rel="noopener noreferrer">twitter</a>
    <a href="https://t.co/UC3jJOJJtS" target="_blank" rel="noopener noreferrer">anonymous request</a>
  </p>

  <h2>Q&A</h2>
  <dl>
    <dt>Q.「クリップボードを使う」をブロックしてしまったが、使いたい</dt>
    <dd>A.ブラウザの設定のサイトごとのセキュリティで「許可」してください。ブラウザのURL欄の鍵アイコンでできるみたいです。</dd>
    <dt>Q.フキダシの透明度を変えたい</dt>
    <dd>A.フキダシインスペクタの下の方に色設定があるので、そこをクリックしてカラーピッカーを開いたら右端の透明度スライダーを操作してください</dd>
    <dt>Q.ダウンロードしたパッケージを読み込むには？</dt>
    <dd>A.ファイルマネージャにドロップしてください</dd>
  </dl>
</div>

<style>
  h2 {
    font-family: '源暎エムゴ';
    font-size: 24px;
    margin-top: 16px;
  }
  h3 { 
    font-family: '源暎エムゴ';
    font-size: 18px;
    margin-top: 8px;
  }
  p {
    font-family: '源暎アンチック';
    margin-left: 32px;
  }
  dt {
    font-weight: 700;
    margin-top: 8px;
    margin-left: 16px;
  }
  dd {
    margin-left: 32px;
  }
  ul {
    margin-left: 32px;
  }
  ol {
    margin-left: 32px;
  }
  ol li {
    list-style-type: none;
    counter-increment: cnt;
  }
  ol li::before {
    content: counter(cnt)". ";
  }
  .comic-link {
    cursor: pointer;
    text-decoration: underline;
    color: #0000ff;
  }
  .inline-elements * {
    display: inline-block;
    vertical-align: middle;
  }
</style>