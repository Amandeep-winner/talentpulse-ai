/**
 * Skill taxonomy mapping aliases and variants to canonical skill names.
 */
export const SKILL_TAXONOMY: Record<string, string> = {
  // Programming Languages
  python: 'Python',
  python3: 'Python',
  py: 'Python',
  javascript: 'JavaScript',
  js: 'JavaScript',
  typescript: 'TypeScript',
  ts: 'TypeScript',
  golang: 'Go',
  go: 'Go',
  java: 'Java',
  cplusplus: 'C++',
  'c++': 'C++',
  csharp: 'C#',
  'c#': 'C#',
  rust: 'Rust',
  ruby: 'Ruby',
  php: 'PHP',
  scala: 'Scala',
  kotlin: 'Kotlin',
  swift: 'Swift',
  r: 'R',

  // Frontend Frameworks & Libraries
  react: 'React',
  'react.js': 'React',
  reactjs: 'React',
  nextjs: 'Next.js',
  'next.js': 'Next.js',
  vue: 'Vue.js',
  vuejs: 'Vue.js',
  'vue.js': 'Vue.js',
  angular: 'Angular',
  angularjs: 'Angular',
  svelte: 'Svelte',
  redux: 'Redux',
  tailwind: 'Tailwind CSS',
  tailwindcss: 'Tailwind CSS',
  html: 'HTML5',
  html5: 'HTML5',
  css: 'CSS3',
  css3: 'CSS3',

  // Backend Frameworks & Runtimes
  node: 'Node.js',
  nodejs: 'Node.js',
  'node.js': 'Node.js',
  express: 'Express',
  expressjs: 'Express',
  nestjs: 'NestJS',
  fastapi: 'FastAPI',
  flask: 'Flask',
  django: 'Django',
  spring: 'Spring Boot',
  'spring boot': 'Spring Boot',
  springboot: 'Spring Boot',
  rails: 'Ruby on Rails',
  'ruby on rails': 'Ruby on Rails',

  // Databases & Vector Engines
  postgres: 'PostgreSQL',
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mongodb: 'MongoDB',
  mongo: 'MongoDB',
  redis: 'Redis',
  pgvector: 'pgvector',
  elasticsearch: 'Elasticsearch',
  elastic: 'Elasticsearch',
  cassandra: 'Cassandra',
  dynamodb: 'DynamoDB',
  sqlite: 'SQLite',

  // Cloud & DevOps
  aws: 'AWS',
  'amazon web services': 'AWS',
  gcp: 'Google Cloud',
  'google cloud': 'Google Cloud',
  'google cloud platform': 'Google Cloud',
  azure: 'Microsoft Azure',
  docker: 'Docker',
  k8s: 'Kubernetes',
  kubernetes: 'Kubernetes',
  terraform: 'Terraform',
  ansible: 'Ansible',
  ci_cd: 'CI/CD',
  'ci/cd': 'CI/CD',
  cicd: 'CI/CD',
  linux: 'Linux',
  git: 'Git',
  github: 'GitHub',
  grafana: 'Grafana',
  prometheus: 'Prometheus',

  // AI & Machine Learning
  ml: 'Machine Learning',
  'machine learning': 'Machine Learning',
  ai: 'Artificial Intelligence',
  nlp: 'Natural Language Processing',
  rag: 'RAG',
  llm: 'LLM',
  pytorch: 'PyTorch',
  tensorflow: 'TensorFlow',
  scikit_learn: 'Scikit-learn',
  'scikit-learn': 'Scikit-learn',
  pandas: 'Pandas',
  numpy: 'NumPy',
};

/**
 * Normalizes a single skill string against the canonical taxonomy.
 */
export function normalizeSkill(skill: string): string {
  const cleaned = skill.trim();
  if (!cleaned) return '';

  const key = cleaned.toLowerCase();
  if (SKILL_TAXONOMY[key]) {
    return SKILL_TAXONOMY[key];
  }

  // Preserve acronyms or capitalize words nicely
  if (cleaned.length <= 4 && cleaned === cleaned.toUpperCase()) {
    return cleaned;
  }

  return cleaned
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Normalizes an array of skills: canonicalizes aliases, trims, and deduplicates.
 */
export function normalizeSkills(skills: string[]): string[] {
  if (!Array.isArray(skills)) return [];

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const s of skills) {
    const canonical = normalizeSkill(s);
    if (canonical && !seen.has(canonical.toLowerCase())) {
      seen.add(canonical.toLowerCase());
      normalized.push(canonical);
    }
  }

  return normalized;
}
