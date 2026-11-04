# 中/高考词库校验报告

生成时间：2026-11-03 12:36:33

## 一、总览

| 指标 | 中考库（初中 1987 词） | 高考库（初中+高中累计） |
|---|---|---|
| 词数 | 1987 | 3908 |
| 英式音标 | 1986 (99.9%) | 3899 (99.8%) |
| 美式音标 | 1986 (99.9%) | 3901 (99.8%) |
| 例句总数 | 7932 | 15586 |
| 例句≥2条 | 1984 (99.8%) | 3900 (99.8%) |
| 例句=4条 | 1980 (99.6%) | 3886 (99.4%) |
| 真题例句≥1条 | 1938 (97.5%) | 3538 (90.5%) |
| 真题例句≥2条 | 1901 (95.7%) | 3274 (83.8%) |
| 相关词有内容 | 1642 (82.6%) | 3262 (83.5%) |
| 音节自洽 | 1979/1979 | 3869/3869 |
| 有配图 | 1868 (94%) | 3638 (93.1%) |
| 文件体积 | 3.52MB（gzip 0.79MB） | 7.06MB（gzip 1.67MB） |

## 二、门槛检查

| 项目 | 实测 | 结果 | 门槛 |
|---|---|---|---|
| 词表完整性 | 1987 / 3908 | ✅ | 应与初中 1987、初中+高中 3908 一致 |
| 英式音标覆盖 | 99.9% / 99.8% | ✅ | ≥99% |
| 美式音标覆盖 | 99.9% / 99.8% | ✅ | ≥60%（Wiktionary 仅覆盖 945 词） |
| 例句 ≥2 条 | 99.8% / 99.8% | ✅ | ≥99% |
| 真题例句 ≥1 条 | 97.5% / 90.5% | ✅ | 观测项 |
| 真题例句 ≥2 条 | 95.7% / 83.8% | ✅ | ≥55% |
| 相关词覆盖 | 82.6% / 83.5% | ✅ | ≥80% |
| 音节自洽 | 100% / 100% | ✅ | 100% |
| 配图覆盖 | 94% / 93.1% | ✅ | 观测项 |
| 单库体积(原始) | 3.52MB / 7.06MB | ✅ | 观测项 |

## 三、例句来源分布

| 来源类型 | 中考库 | 高考库 |
|---|---|---|
| 高考真题 | 2855 | 6493 |
| 中考真题 | 2810 | 3313 |
| 词典例句 | 2190 | 5387 |
| 影视例句 | 30 | 40 |
| 新闻例句 | 47 | 353 |
| 人工补充 | 0 | 0 |

## 四、缺口清单（flags 统计）

| 标记 | 含义 | 中考库 | 高考库 |
|---|---|---|---|
| no_exam_ex | 无真题例句 | 49 | 370 |
| few_exam_ex | 真题例句仅 1 条 | 37 | 264 |
| few_ex | 例句不足 2 条 | 3 | 8 |
| no_ph_uk | 缺英式音标 | 1 | 9 |
| no_ph_us | 缺美式音标 | 1 | 7 |
| no_syl | 缺音节 | 8 | 39 |
| no_img | 无配图 | 119 | 270 |
| fam_gap | 无相关词 | 539 | 1005 |

## 五、抽样 30 词（人工过目用）

- **survey**（初中） /səˈvei/ — [2013·湖北·阅读E] The surveys were conducted every year from 1993 to 2003.
- **lose**（初中） /luːz/ — [2012·安徽·阅读B] Unlike red, blue can cause people to lose appetite.
- **stone**（初中） /stəun/ — [中考真题·阅读理解] LOST: A silver ring with a blue stone in it.
- **aircraft**（高中） /ˈєəkræft/ — [2014·江西·阅读C] Inside a DC-8 aircraft, there is a fully-equipped teaching hospital with television studio and classroom.
- **music**（初中） /ˈmjuːzik/ — [2009·北京·阅读D] Music is nice, people seem to say, but not important.
- **project**（初中） /ˈprɒdʒekt/ — [中考真题·阅读理解] Under this condition,the Hope Project is necessary to our country.
- **factory**（初中） /ˈfæktəri/ — [2014·江西·阅读D] For example, many handcrafts are now produced in a factory.
- **printer**（高中） /ˈprintə/ — [2016·北京·阅读A] I have hundreds of printer paper, covered in self-written notes from your video.
- **ability**（初中） /əˈbiliti/ — [2014·广东·阅读A] However, Samuel's ability to remember things doesn't stop with music.
- **register**（高中） /ˈredʒistə/ — [2022·北京·阅读A] Waiting lists If a session is full, you can register for the waiting list.
- **creative**（初中） /kriːˈeitiv/ — [2017·浙江（11月）·阅读B] Is the writer who wears a fedora more creative?
- **maple**（高中） /ˈmeipl/ — [2012·四川·阅读A] As they tell all who show even a passing interest, maple makes the best fighting sticks and white pines are the best climbing trees.
- **be**（初中） /biː/ — [2013·重庆·阅读C] But it could also be because of a difficult situation.
- **reply**（初中） /riˈplai/ — [中考真题·阅读理解] Thank you！I am looking forward to your reply.
- **wisdom**（高中） /ˈwizdəm/ — [2023·新课标Ⅰ卷·阅读D] In more technical terms, the wisdom of crowds requires that people's estimates be independent.
- **eastwards**（高中） /ˈiːstwədz/ — [有道例句] He sees that warm water flows back eastwards when winds that normally blow westwards weaken, or sometimes the other way round.
- **dumpling**（初中） /ˈdʌmpliŋ/ — [中考真题·阅读理解] There was meat and vegetables inside the dumplings.
- **skillfully**（高中） /ˈskɪlfʊli/ — [有道例句] We are not born to handle quantitative distinctions skillfully.
- **compare**（初中） /kəmˈpєə/ — [2025·北京·阅读C] "I thought, in this family, we don't compare ourselves with other people, Dad?"
- **blank**（初中） /blæŋk/ — [2013·重庆·阅读E] Rather, they are routine greetings, conversation starters or the blank "fillers".
- **turkey**（初中） /ˈtəːki/ — [中考真题·阅读理解] English can change by borrowing words from Turkey, and tea came from China.
- **bent**（高中） /bent/ — [2014·福建·阅读A] The man then bent down and gave his wife the flower, telling her who it was from.
- **candle**（初中） /ˈkændl/ — [中考真题·阅读理解] "We only need to put the candles on it, now."
- **broadcast**（高中） /ˈbrɒːdkæst/ — [2020·新高考Ⅱ卷·阅读A] From broadcasting to street art, these are just 4 of the 17 highlyunique camps being offered.
- **pie**（初中） /pai/ — [2025·全国Ⅱ卷·阅读A] Don't leave the harbor without a traditional Cornish pie.
- **thing**（初中） /θiŋ/ — [2018·浙江（11月）·阅读A] One thing is for sure, it will never be boring.
- **thirteenth**（初中） /ˈθəːtiːnθ/ — [中考真题·阅读理解] For example, they don't like to live on the thirteenth floor.
- **frost**（高中） /frɒst/ — [中考真题·阅读理解] New Year was the important time - when "Father Frost" brought presents to children.
- **outing**（高中） /ˈautiŋ/ — [2019·北京（机考 无听力）·阅读B] On the outing, she was offered a candy bar.
- **eighty**（初中） /ˈeiti/ — [2008·北京·阅读A] A small woman in her eighties stood before me.

## 六、说明

1. 高考真题例句溯源到「年份·地区/卷别·篇目」，如 `2010·北京·阅读A`。
2. 中考真题的数据源未提供年份与地区，只能标到题型；报告不编造。
3. 完形填空与七选五的原文被抽掉了空格的词（如 "I 21 a note" 实为 "I put a note"），已整体排除，只用完整阅读理解原文。
4. 真题例句无官方译文，`cn` 留空，未做机器翻译。
5. `family_supplement.json` 可人工补词族，`manual_examples.json` 可人工补例句，重新运行 `build_bank.js` 即生效。
---

# 附：四六级词库校验（2026-11-04）

数据源：`ShepiTT/CET_practice_questions`（Apache-2.0）中的 `cet4_v2.db`，含 2019–2025 年四六级真题的仔细阅读与长篇阅读原文。选词填空原文被挖空，整体排除；六级没有独立真题卷，用四级卷中的六级词 + 高考真题补。

## 一、总览

| 指标 | 四级库 | 六级库 |
|---|---|---|
| 词数 | 1,754 | 1,887 |
| 英式音标 | 1,753（99.9%） | 1,887（100%） |
| 美式音标 | 1,752（99.9%） | 1,886（99.9%） |
| 例句总数 | 4,542 | 2,844 |
| 词均例句 | 2.6 | 1.5 |
| 真题例句 ≥1 条 | 1,292（73.7%） | 776（41.1%） |
| 真题例句 ≥2 条 | 1,005（57.3%） | 432（22.9%） |
| 文件体积 | 1.61 MB（gzip 0.54 MB，两库合计） | 同左 |

## 二、例句来源分布

| 来源类型 | 四级库 | 六级库 |
|---|---|---|
| 四级真题 | 1,358 | 427 |
| 六级真题 | 680 | 380 |
| 高考真题 | 1,035 | 627 |
| 词典例句 | 1,469 | 1,410 |

> 四级词里出现六级真题句，是因为同一单词在六级卷里也出现过。选句时同学段真题加权更高（四级词优先四级句），六级句只在四级句不足时补位。

## 三、年份分布（真题句）

| 年份 | 四级库 | 六级库 |
|---|---|---|
| 2008–2018 | 570 | 379 |
| 2019 | 250 | 90 |
| 2020 | 350 | 132 |
| 2021 | 185 | 83 |
| 2022 | 238 | 104 |
| 2023 | 276 | 116 |
| 2024 | 509 | 252 |
| 2025 | 494 | 221 |
| 2026（高考卷） | 10 | 18 |

## 四、已知缺口

1. **六级真题覆盖偏低（41%）**：数据源只有四级真题 15 套，没有六级卷。已用四级卷中的六级词与高考真题补位，其余用词典句兜底。
2. **1,251 / 696 词例句 ≥2 条**：四级 71%、六级 37%。不足 2 条的词不影响答题，题型会从 `examples_data.js` 的词典/报刊句里补。
3. **真题句无中文译文**：与中高考库一致，`cn` 留空，可在管理页人工补。
4. **音节数据沿用旧表**：见主报告第五节说明。
