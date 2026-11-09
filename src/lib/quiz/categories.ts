export interface QuizCategoryMeta {
  key: string;
  labelAr: string;
  labelEn: string;
  icon: string;
  badgeBg: string;
}

export const QUIZ_CATEGORIES: Record<string, QuizCategoryMeta> = {
  cs: {
    key: "cs",
    labelAr: "علوم الحاسوب والبرمجة",
    labelEn: "Computer Science",
    icon: "💻",
    badgeBg: "bg-cyan-100 text-cyan-800 border-cyan-200",
  },
  music: {
    key: "music",
    labelAr: "خمن الأغنية والشارة",
    labelEn: "Guess the Song",
    icon: "🎶",
    badgeBg: "bg-pink-100 text-pink-800 border-pink-200",
  },
  mind_games: {
    key: "mind_games",
    labelAr: "ألعاب عقل وفوازير",
    labelEn: "Mind Games",
    icon: "🧠",
    badgeBg: "bg-amber-100 text-amber-800 border-amber-200",
  },
  logic: {
    key: "logic",
    labelAr: "منطق واستنتاج",
    labelEn: "Logic & Reasoning",
    icon: "🔍",
    badgeBg: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  crack_the_code: {
    key: "crack_the_code",
    labelAr: "فك الشفرة",
    labelEn: "Crack the Code",
    icon: "🔐",
    badgeBg: "bg-blue-100 text-blue-800 border-blue-200",
  },
  sequences: {
    key: "sequences",
    labelAr: "متتاليات الأرقام والأنماط",
    labelEn: "Number Sequences",
    icon: "🔢",
    badgeBg: "bg-indigo-100 text-indigo-800 border-indigo-200",
  },
  fun: {
    key: "fun",
    labelAr: "أسئلة مرحة وجيمينغ وتيك",
    labelEn: "Fun & Gaming",
    icon: "🎮",
    badgeBg: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
  },
};

export function getCategoryMeta(key?: string | null): QuizCategoryMeta {
  if (!key) return QUIZ_CATEGORIES.fun;
  return QUIZ_CATEGORIES[key] ?? {
    key,
    labelAr: "تحدي منوع",
    labelEn: "Challenge",
    icon: "✨",
    badgeBg: "bg-primary-tint text-primary border-primary/20",
  };
}
