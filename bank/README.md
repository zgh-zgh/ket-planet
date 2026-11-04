# 考试词库（bank）

本目录是「墨词 Lexi」的考试词库数据层，覆盖中高考与四六级四个学段。

## 一、两个层次

**① 完整库**（字段齐全，供检索、后台、二次加工；主包不加载）

| 文件 | 词数 | 说明 |
|---|---|---|
| `zhongkao.js` | 1,987 | 中考库（初中词表），全局变量 `BANK_ZHONGKAO` |
| `gaokao.js` | 3,908 | 高考库（初中 + 高中累计），全局变量 `BANK_GAOKAO`，每词带 `firstLevel` |
| `overlap.json` | — | 两库关系：共有 1,987，高考独有 1,921 |

**② 精简包**（App 运行时真正加载的，只装学习页和题型会读的字段）

| 文件 | 覆盖 | 体积 | 加载方式 |
|---|---|---|---|
| `pack.js` | 初中 + 高中 3,908 词 | 2.1 MB（gzip 0.68 MB） | `<script>` 随主页面加载 |
| `pack_cet.js` | 四级 1,754 + 六级 1,887 词 | 1.7 MB（gzip 0.57 MB） | **按需加载**：切到四/六级时才拉，中高考用户不付这份流量 |

精简包字段：`w` 单词 · `lv` 学段 · `ph` [英音, 美音] · `phs` 音标来源 · `ex` 真题句 `[英文, 出处, srcType, 中文]` · `dx` 词典句 `[英文, 中文, 词典名]` · `co/ox/fr` 柯林斯星级 / 牛津3000 / 词频。

`report.md` 是校验报告（覆盖率、缺口、来源分布）。


---

## 二、单词语料结构

```js
{
  w: "ability",
  firstLevel: "初中",              // 首次出现学段
  cn: "n. 能力，能耐；才能",
  senses: [{ pos: "n", cn: ["能力","能耐","才能"] }],   // 结构化义项，供题目精简展示

  ph: { uk: "/əˈbɪləti/", ukSrc: "ECDICT",
        us: "/əˈbɪləti/", usSrc: "有道" },
  audio: { url: "https://dict.youdao.com/dictvoice?audio=ability&type=2",
           src: "有道真人发音" },   // 只存地址，不落音频文件

  ex: [                          // 每词最多 4 条：真题优先，再词典、新闻
    { en: "...<B>ability</B>...", cn: "",
      src: "2014·广东·阅读A", srcType: "gaokao",
      srcFull: "2014年高考英语（广东）· 阅读A",
      year: 2014, region: "广东", section: "阅读A" }
  ],

  fam: { root: "", affix: [], derive: [{ w, ph, cn }], syn: [], synGroup },
  tag: ["zk","gk","cet4"],        // 考试标签（ECDICT）
  collins: 4, oxford: 1, frq: 783, // 柯林斯星级 / 牛津3000 / 词频排名
  img: "https://...",              // 有道照片优先，其次 Atlas 插画
  syl: { n: 4, s: 1, l: ["a","bi","li","ty"] },
  flags: []                        // 数据缺口标记
}
```

### `srcType` 取值

| 值 | 含义 | `src` 示例 |
|---|---|---|
| `gaokao` | 高考真题 | `2014·广东·阅读A` |
| `zhongkao` | 中考真题 | `中考真题·阅读理解` |
| `dict` | 词典例句 | `柯林斯` / `牛津` |
| `media` | 影视剧例句 | `家有儿女` |
| `news` | 新闻语料 | `BBC` / `FORBES` |
| `manual` | 人工补充 | `自建` |

### `flags` 取值

`no_exam_ex` 无真题例句 · `few_exam_ex` 真题仅 1 条 · `few_ex` 例句不足 2 条 ·
`no_ph_uk` / `no_ph_us` 缺音标 · `no_syl` 缺音节 · `no_img` 无配图 · `fam_gap` 无相关词

---

## 三、数据来源与许可

| 字段 | 来源 | 许可 / 说明 |
|---|---|---|
| 词表 | KyleBing/english-vocabulary | BSD-3-Clause |
| 释义 `cn` | 同上 | — |
| 音标 `uk` | ECDICT（skywind3000/ECDICT） | MIT |
| 音标 `us` | Wiktionary / 有道 | CC BY-SA 4.0 / 免费接口 |
| 词典例句 | 有道词典 jsonapi（柯林斯、牛津、新英汉） | 免费接口，非开源；已标注具体词典 |
| 新闻例句 | 有道 `auth_sents_part`（BBC/FORBES/CNN 等） | 同上 |
| 高考真题例句 | `ZhangYixuan-in-BUPT/gaokao-english-exam-database` | **仓库无 LICENSE 文件**，README 声明"仅供教学研究使用" |
| 中考真题例句 | `dry-melon/Chinese-middle-school-English-exam-questions` | **CC BY 4.0**（需署名） |
| 四六级真题例句 | `ShepiTT/CET_practice_questions`（仓库内 `cet4_v2.db`） | **Apache-2.0**；仅取仔细阅读 / 长篇阅读原文，选词填空（原文被挖空）整体排除 |
| 词族/派生 | 有道同根词 + WordNet + 人工核订构词 | WordNet License |
| 近义词 | WordNet | WordNet License |
| 配图 | 有道图解 / Word Atlas | 免费接口 / CC BY 4.0 |
| 发音 | 有道 `dictvoice` | 免费接口，仅存地址 |

### 版权说明（重要）

- 原始语料放在 `corpus/`，已被 `.gitignore` 排除，**只保留在本地**，不入库。
- 入库的只是"单句 + 出处"，属于引用；未复制整卷试题。
- 高考真题库没有开源许可，若本项目公开分发，请自行评估风险；收到权利人通知时应能按 `src` 字段批量删除对应例句。
- 中考数据（CC BY 4.0）需在应用内署名，署名位置见 §5。

---

## 四、如何重建

```bash
# 1. 抓例句来源（3908 词，约 40 秒）
node scripts/fetch_sources.js

# 2. 抓音标（同样约 40 秒）
node scripts/fetch_phonetic.js

# 3. 覆盖率探测（需要 corpus/ 已就位）
node scripts/probe_corpus.js

# 4. 提取真题例句
node scripts/build_exam_examples.js

# 5. 组装词库
node scripts/build_bank.js

# 6. 出校验报告
node scripts/build_bank_report.js
```

四六级精简包单独一条链（不依赖中高考的中间产物）：

```bash
# 1. 从 cet4_v2.db 抽真题句 → bank/src/exam_examples_cet.json
node scripts/build_cet_examples.js

# 2. 合成 bank/pack_cet.js（朗读包字段与 pack.js 完全一致）
node scripts/build_cet_pack.js
```

`corpus/` 目录需要自行准备：

```
corpus/gaokao/structured/database.json     高考结构化库
corpus/zhongkao/grade{7,8,9}_*.jsonl       中考数据集
corpus/cet/cet4_v2.db                      四六级真题库（Apache-2.0）
```

---

## 五、人工补录（后台管理页的数据接口）

管理页地址：`http://127.0.0.1:3000/admin.html`（先 `node server.js`）。

> `server.js` 未入库（里面有图片生成的 API key，写在 `.gitignore` 里）。换机器时要把这个文件单独拷过去，否则管理页只能导出、不能保存。

### 补例句 `src/manual_examples.json`

```json
{
  "abandon": [
    { "en": "They had to <B>abandon</B> the plan.", "cn": "他们不得不放弃这个计划。",
      "src": "自建", "srcType": "manual", "addedAt": "2026-11-03" }
  ]
}
```

合并规则：**人工例句永远排在最前**，不受真题优先级影响。

### 补词族 `src/family_supplement.json`

```json
{
  "ability": {
    "root": "able",
    "derive": ["able", "enable", "disable", "capability"],
    "syn": ["capability", "competence"]
  }
}
```

改完重新运行 `node scripts/build_bank.js` 即生效，不需要改代码。

### 校音节 `src/manual_syllables.json`

cmudict 记的是**实际发音**，`chocolate`（词典 choc·o·late，读音 2 个音节）、`vegetable`（词典 veg·e·ta·ble，读音 3 个音节）这类「拼写比发音多一个音节」的词它天生给不出词典写法。这里人工指定，优先级最高：

```json
{
  "chocolate": { "l": ["choc", "o", "late"], "s": 0 },
  "vegetable": { "l": ["veg", "e", "ta", "ble"], "s": 0 }
}
```

- `l` 分段，**拼回去必须等于原词**（脚本会校验，不合格自动跳过并打印警告）
- `s` 主重音下标（0 起；`-1` 表示无重音）
- 人工指定后不再生成朗读切点 `p`，逐段朗读直接用 `l`
- 改完运行 `node scripts/build_syllables.js`（约 1.5 秒）；管理页里点「保存音节」会自动跑这一步

已人工校订 9 词：chocolate、vegetable、diamond、interesting、temperature、privilege、cooperate、desperate、graduate。

---

## 六、已知缺口与后续

1. **相关词覆盖 87.7%**：约 480 词没有任何词族数据（如 `ability`，有道与 WordNet 均无同根词）。可用 `family_supplement.json` 逐个补。
2. **8 个词例句不足 2 条**：`prisoner`、`Mr.`、`adj.`、`behavious`、`communism`、`handtruck`、`Tibet`、`ambassadress`。其中 `adj.` 与 `behavious` 是原词表的脏数据。
3. **中考例句无法标年份**：数据源未提供年份、地区，只能标到题型；如需年份需另抓中考网（图片版 PDF，成本高）。
4. **真题例句无中文译文**：未做机器翻译，`cn` 留空。可在管理页人工补。
5. **音节已改词典式**：`syllables_data.js` 现按韦氏闭音节规则生成（`ge·og·ra·phy`、`his·tor·y`），另存 `p` 字段给逐段朗读用（发音式）。极少数「拼写比发音多一个音节」的词（`chocolate`、`vegetable`）无法由音素推出词典写法，已写进 `src/manual_syllables.json` 人工指定，管理页可继续补。
6. **四六级真题语料偏少**：只有四六级真题 15 套（2019–2025），六级没有独立真题，靠四级题与高考题补；六级真题句覆盖 41%、四级 74%，其余用词典句兜底，不会出现空题干。
7. **315 个六级词、95 个四级词没有词库例句**：学习页会退回 `examples_data.js` 的词典/报刊句（实测每词仍能抽到 3 条），题型不受影响。
8. **原词表自带词性错误**：如 `planetary` 标注为 `n. 行星的`（应为 adj.）。这是 KyleBing 词表的数据，可在管理页人工改释义。

---

## 七、体积

| 文件 | 原始 | gzip |
|---|---|---|
| `zhongkao.js` | 3.5 MB | 0.8 MB |
| `gaokao.js` | 7.1 MB | 1.7 MB |
| `pack.js`（初中+高中精简包） | 2.1 MB | 0.68 MB |
| `pack_cet.js`（四级+六级精简包） | 1.61 MB | 0.54 MB |

App 实际只加载两个精简包：`pack.js` 随页面加载，`pack_cet.js` 在切到四/六级时按需加载。若需进一步瘦身，可把 `ex` 从 4 条降到 3 条、`fam.derive` 从 6 条降到 4 条。
