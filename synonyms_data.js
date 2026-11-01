// 近义词辨析数据（人工校订，只收录确有必要区分的考试高频易混组）
// 结构：SYNONYM_DATA[单词] = { topic: 辨析主题, words: [{ w, d }] }，同一组内每个词都可反查到该组
const SYNONYM_GROUPS = [
  { topic: '评论 / 评述', words: [
    { w: 'review', d: '系统性回顾、审阅；也指为书、电影撰写评论（write a review）' },
    { w: 'comment', d: '就某事发表看法，通常简短、即时' },
    { w: 'remark', d: '谈论、评论，较正式，多指随口说出的一句话' }
  ]},
  { topic: '评论者', words: [
    { w: 'reviewer', d: '为书籍、电影、戏剧写评论的人，通常看完作品后撰写完整评述' },
    { w: 'critic', d: '批评家，多指艺术、文学领域的专业评判者，语气偏批判' },
    { w: 'commentator', d: '时事、赛事的解说员或评论员，随事件实时发表观点' }
  ]},
  { topic: '影响（动词）', words: [
    { w: 'affect', d: '动词，直接作用于某物使其发生变化，常含负面或被动意味' },
    { w: 'influence', d: '动词/名词，潜移默化地影响人的想法或决定，语气较缓' },
    { w: 'effect', d: '通常作名词「影响、效果」；作动词时意为「实现、促成」' }
  ]},
  { topic: '接受 / 收到', words: [
    { w: 'accept', d: '主动接受，含心理上的同意' },
    { w: 'receive', d: '客观收到，不含是否愿意' }
  ]},
  { topic: '借', words: [
    { w: 'borrow', d: '借入，从别人处借来（borrow sth from sb）' },
    { w: 'lend', d: '借出，把东西借给别人（lend sth to sb）' }
  ]},
  { topic: '带来 / 带走', words: [
    { w: 'bring', d: '把某物从别处带到说话人所在处' },
    { w: 'take', d: '把某物从说话人处带走' },
    { w: 'fetch', d: '去别处取来，往返一次' },
    { w: 'carry', d: '携带、搬运，强调负荷，不含方向' }
  ]},
  { topic: '花费', words: [
    { w: 'spend', d: '主语是人：sb spends time/money on sth' },
    { w: 'cost', d: '主语是物：sth costs sb money' },
    { w: 'take', d: '主语多为 it：it takes sb time to do sth' },
    { w: 'pay', d: '主语是人：sb pays money for sth' }
  ]},
  { topic: '看', words: [
    { w: 'look', d: '主动把视线投过去，强调动作（look at）' },
    { w: 'see', d: '看见，强调结果，不一定有意' },
    { w: 'watch', d: '注视、观看，强调持续关注动态事物' },
    { w: 'observe', d: '观察，带有目的性和细致性，较正式' }
  ]},
  { topic: '听', words: [
    { w: 'listen', d: '主动去听，强调动作（listen to）' },
    { w: 'hear', d: '听见，强调结果，无意中听到也用这个词' }
  ]},
  { topic: '说', words: [
    { w: 'say', d: '说出具体内容，后接说话内容' },
    { w: 'tell', d: '告诉某人，后接人（tell sb sth）' },
    { w: 'speak', d: '说某种语言，或正式场合发言' },
    { w: 'talk', d: '交谈，强调双方互动' }
  ]},
  { topic: '希望 / 期望', words: [
    { w: 'hope', d: '希望，后面所接内容通常有实现可能' },
    { w: 'wish', d: '愿望，多接虚拟语气，表示与现实相反或难实现' },
    { w: 'expect', d: '预料、期待某事会发生，基于判断' }
  ]},
  { topic: '工作 / 任务', words: [
    { w: 'job', d: '可数，指一份具体的工作、职位' },
    { w: 'work', d: '不可数，指工作这件事情或工作量' },
    { w: 'task', d: '被指派的具体任务，可数' },
    { w: 'career', d: '职业生涯，长期从事的事业' }
  ]},
  { topic: '收入', words: [
    { w: 'salary', d: '按月发放的薪金，多为白领固定工资' },
    { w: 'wage', d: '按小时/周/件计算的工资，多为体力劳动者' },
    { w: 'income', d: '总收入，含各类来源' },
    { w: 'fee', d: '服务费、酬金、报名费' }
  ]},
  { topic: '习惯 / 习俗', words: [
    { w: 'habit', d: '个人长期形成的行为习惯' },
    { w: 'custom', d: '一个民族或社会长期形成的风俗习惯' },
    { w: 'practice', d: '惯常做法，多指群体或行业内的常规' }
  ]},
  { topic: '问题', words: [
    { w: 'problem', d: '需要解决的困难或难题' },
    { w: 'question', d: '需要回答的疑问' },
    { w: 'issue', d: '众人关注、有待讨论的议题，较正式' },
    { w: 'trouble', d: '麻烦、困境，常指令人烦恼的处境' }
  ]},
  { topic: '机会', words: [
    { w: 'chance', d: '机会，也指可能性，口语常用' },
    { w: 'opportunity', d: '良机，多指有利的时机，较正式' },
    { w: 'occasion', d: '场合、时机，强调特定时刻' }
  ]},
  { topic: '旅行', words: [
    { w: 'journey', d: '陆上长途旅行，侧重行程本身' },
    { w: 'trip', d: '短途往返的旅行，口语常用' },
    { w: 'travel', d: '泛指旅行这一行为，不可数' },
    { w: 'voyage', d: '海上或太空的长途航行' }
  ]},
  { topic: '价格 / 花费', words: [
    { w: 'price', d: '商品标价，卖家定的价钱' },
    { w: 'cost', d: '成本、代价，含付出的总费用' },
    { w: 'value', d: '价值，强调物有所值' },
    { w: 'expense', d: '开支、费用，常指某项花销' }
  ]},
  { topic: '著名的', words: [
    { w: 'famous', d: '著名的，中性偏褒' },
    { w: 'well-known', d: '为人熟知的，语气比 famous 弱' },
    { w: 'notorious', d: '臭名昭著的，贬义' }
  ]},
  { topic: '大', words: [
    { w: 'big', d: '口语常用，可指体积、规模、程度' },
    { w: 'large', d: '较正式，多指面积、数量大' },
    { w: 'huge', d: '巨大的，程度更强' },
    { w: 'vast', d: '辽阔的，多形容面积、范围' }
  ]},
  { topic: '小', words: [
    { w: 'small', d: '体积小，客观描述' },
    { w: 'little', d: '小而可爱，常带感情色彩；也可指数量少' },
    { w: 'tiny', d: '极小的，程度更强' }
  ]},
  { topic: '聪明', words: [
    { w: 'clever', d: '机灵的，学东西快，偏天生' },
    { w: 'smart', d: '聪明的、精明的，口语常用' },
    { w: 'wise', d: '明智的，强调判断力和经验' },
    { w: 'intelligent', d: '智力高的，较正式' }
  ]},
  { topic: '累', words: [
    { w: 'tired', d: '疲倦的，最常用' },
    { w: 'exhausted', d: '筋疲力尽的，程度最强' },
    { w: 'weary', d: '疲惫的，书面语，常含厌倦意味' }
  ]},
  { topic: '害怕', words: [
    { w: 'afraid', d: '害怕的，只能作表语（be afraid of）' },
    { w: 'scared', d: '受惊的，口语常用' },
    { w: 'frightened', d: '被吓到的，强调受到惊吓' },
    { w: 'terrified', d: '极度恐惧的，程度最强' }
  ]},
  { topic: '高兴', words: [
    { w: 'glad', d: '高兴的，多作表语，用于客套' },
    { w: 'happy', d: '快乐的，最常用' },
    { w: 'pleased', d: '满意的，因某事而高兴' },
    { w: 'delighted', d: '非常高兴的，程度较强' }
  ]},
  { topic: '拒绝', words: [
    { w: 'refuse', d: '直接拒绝，语气强硬' },
    { w: 'reject', d: '驳回、不予接受，多用于申请、方案' },
    { w: 'decline', d: '婉言谢绝，语气客气' }
  ]},
  { topic: '允许', words: [
    { w: 'allow', d: '允许，普通用词' },
    { w: 'permit', d: '正式许可，常指规章制度' },
    { w: 'let', d: '让，口语，后接不带 to 的不定式' }
  ]},
  { topic: '回答', words: [
    { w: 'answer', d: '回答，最通用' },
    { w: 'reply', d: '回复，多指书面或正式答复' },
    { w: 'respond', d: '作出反应、回应，较正式' }
  ]},
  { topic: '选择', words: [
    { w: 'choose', d: '挑选，最常用' },
    { w: 'select', d: '精选，强调按标准挑选' },
    { w: 'pick', d: '口语，随手挑' },
    { w: 'elect', d: '选举，通过投票产生' }
  ]},
  { topic: '完成', words: [
    { w: 'finish', d: '结束、做完，口语常用' },
    { w: 'complete', d: '完成，强调使完整无缺' },
    { w: 'accomplish', d: '达成、实现，多指任务、目标' }
  ]},
  { topic: '错误', words: [
    { w: 'mistake', d: '失误，多指无心之错' },
    { w: 'error', d: '错误，较正式，可指偏差、误差' },
    { w: 'fault', d: '过错、责任，强调归咎于谁' }
  ]},
  { topic: '原因 / 理由', words: [
    { w: 'reason', d: '理由，解释为什么这样做' },
    { w: 'cause', d: '起因，导致结果的原因' },
    { w: 'excuse', d: '借口，常含辩解意味' }
  ]},
  { topic: '结果', words: [
    { w: 'result', d: '结果，中性通用' },
    { w: 'consequence', d: '后果，多指不好的连带结果' },
    { w: 'outcome', d: '结局，强调最终局面' }
  ]},
  { topic: '目的', words: [
    { w: 'purpose', d: '目的，强调意图' },
    { w: 'aim', d: '目标，较具体、短期' },
    { w: 'goal', d: '目标，需努力达成的终点' },
    { w: 'objective', d: '目标，正式用语，多用于计划' }
  ]},
  { topic: '记得 / 提醒', words: [
    { w: 'remember', d: '记得，主语自己回想' },
    { w: 'remind', d: '提醒，主语使别人想起（remind sb of sth）' },
    { w: 'recall', d: '回忆起，较正式' },
    { w: 'memorize', d: '记住、背下，强调记忆过程' }
  ]},
  { topic: '上升 / 举起', words: [
    { w: 'rise', d: '不及物，自己上升（rise-rose-risen）' },
    { w: 'raise', d: '及物，把某物举起、提高（raise sth）' },
    { w: 'arise', d: '不及物，指问题、情况出现' }
  ]},
  { topic: '发现 / 发明', words: [
    { w: 'discover', d: '发现已存在的事物' },
    { w: 'invent', d: '发明原本不存在的东西' },
    { w: 'find', d: '找到、发现，口语常用' }
  ]},
  { topic: '建议', words: [
    { w: 'advice', d: '名词，不可数（a piece of advice）' },
    { w: 'advise', d: '动词，给某人建议（advise sb to do）' },
    { w: 'suggest', d: '动词，提出想法供参考，后接 doing' }
  ]}
];

// 建立反查索引
const SYNONYM_DATA = (() => {
  const map = {};
  for (const g of SYNONYM_GROUPS) for (const it of g.words) {
    if (!map[it.w]) map[it.w] = g;
  }
  return map;
})();
