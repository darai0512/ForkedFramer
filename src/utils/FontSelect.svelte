<script lang="ts">
  export let value: string;

  const LOCAL_FONTS = [
    "源暎アンチック",
    "源暎エムゴ",
    "源暎ぽっぷる",
    "源暎ラテゴ",
    "源暎ラテミン",
    "源暎きわみゴ",
    "ふい字",
    "まきばフォント",
  ];

  const GOOGLE_FONTS = [
    "BIZ UDGothic",
    "BIZ UDMincho",
    "BIZ UDPGothic",
    "BIZ UDPMincho",
    "Dela Gothic One",
    "DotGothic16",
    "Hachi Maru Pop",
    "Hina Mincho",
    "IBM Plex Sans JP",
    "Kaisei Decol",
    "Kaisei HarunoUmi",
    "Kaisei Opti",
    "Kaisei Tokumin",
    "Kiwi Maru",
    "Klee One",
    "Kosugi",
    "Kosugi Maru",
    "M PLUS 1",
    "M PLUS 1 Code",
    "M PLUS 1p",
    "M PLUS 2",
    "M PLUS Rounded 1c",
    "Mochiy Pop One",
    "Mochiy Pop P One",
    "New Tegomin",
    "Noto Sans JP",
    "Noto Serif JP",
    "Potta One",
    "Rampart One",
    "Reggae One",
    "RocknRoll One",
    "Sawarabi Gothic",
    "Shippori Antique",
    "Shippori Antique B1",
    "Shippori Mincho",
    "Shippori Mincho B1",
    "Stick",
    "Yomogi",
    "Yuji Boku",
    "Yuji Mai",
    "Yuji Syuku",
    "Yusei Magic",
    "Zen Antique",
    "Zen Antique Soft",
    "Zen Kaku Gothic Antique",
    "Zen Kaku Gothic New",
    "Zen Kurenaido",
    "Zen Maru Gothic",
    "Zen Old Mincho",
    "Shizuru",
    "Cherry Bomb One",
    "Slackside One",
    "Darumadrop One",
  ];
</script>

<select class="select text-sm py-1 px-2" style="width: auto;" bind:value>
  <optgroup label="ローカル">
    {#each LOCAL_FONTS as f}
      <option value={f}>{f}</option>
    {/each}
  </optgroup>
  <optgroup label="Google Fonts">
    {#each GOOGLE_FONTS as f}
      <option value={f}>{f}</option>
    {/each}
  </optgroup>
</select>
