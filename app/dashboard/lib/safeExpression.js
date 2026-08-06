// מנוע נוסחאות בטוח לשדות "מחושב" - טוקנייזר + פארסר-רקורסיבי משלנו,
// **בלי eval/new Function בשום שלב** (הביטוי מקורו בהצעת AI שמקורה
// בתיאור חופשי של משתמש - אסור להריץ אותו כקוד JS ממשי). תומך רק
// בפעולות חשבון בסיסיות, סוגריים, וכמה פונקציות תאריך קבועות מראש -
// שום קריאה חיצונית, שום גישה למשתני JS.
//
// דקדוק: expr := term (('+'|'-') term)*
//        term := factor (('*'|'/') factor)*
//        factor := number | identifier | funcCall | '(' expr ')' | '-' factor
//        funcCall := identifier '(' expr (',' expr)* ')'

export const ALLOWED_FUNCTIONS = new Set(['months_between', 'days_between', 'years_between', 'percent']);

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if ('+-*/(),'.includes(ch)) { tokens.push({ type: ch, value: ch }); i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      tokens.push({ type: 'number', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      tokens.push({ type: 'identifier', value: src.slice(i, j) });
      i = j;
      continue;
    }
    throw new Error(`תו לא מוכר בנוסחה: "${ch}"`);
  }
  return tokens;
}

function parseExpression(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr() {
    let node = parseTerm();
    while (peek() && (peek().type === '+' || peek().type === '-')) {
      const op = next().type;
      node = { kind: 'binary', op, left: node, right: parseTerm() };
    }
    return node;
  }

  function parseTerm() {
    let node = parseFactor();
    while (peek() && (peek().type === '*' || peek().type === '/')) {
      const op = next().type;
      node = { kind: 'binary', op, left: node, right: parseFactor() };
    }
    return node;
  }

  function parseFactor() {
    const t = peek();
    if (!t) throw new Error('נוסחה לא שלמה');
    if (t.type === '-') { next(); return { kind: 'negate', value: parseFactor() }; }
    if (t.type === 'number') { next(); return { kind: 'number', value: Number(t.value) }; }
    if (t.type === '(') {
      next();
      const node = parseExpr();
      if (!peek() || peek().type !== ')') throw new Error('סוגר חסר בנוסחה');
      next();
      return node;
    }
    if (t.type === 'identifier') {
      next();
      if (peek() && peek().type === '(') {
        next();
        const args = [];
        if (peek() && peek().type !== ')') {
          args.push(parseExpr());
          while (peek() && peek().type === ',') { next(); args.push(parseExpr()); }
        }
        if (!peek() || peek().type !== ')') throw new Error('סוגר חסר בקריאת פונקציה');
        next();
        if (!ALLOWED_FUNCTIONS.has(t.value)) throw new Error(`פונקציה לא מוכרת: ${t.value}`);
        return { kind: 'call', name: t.value, args };
      }
      return { kind: 'identifier', name: t.value };
    }
    throw new Error('נוסחה לא תקינה');
  }

  const ast = parseExpr();
  if (pos !== tokens.length) throw new Error('תווים מיותרים בסוף הנוסחה');
  return ast;
}

export function parseFormula(expression) {
  return parseExpression(tokenize(expression || ''));
}

// כל השדות (לא today ולא שמות פונקציה) שהנוסחה מפנה אליהם - לשימוש
// בוולידציה: לוודא שכל אחד מהם קיים באמת באותה מחלקה לפני השמירה.
export function collectFieldRefs(ast, acc = new Set()) {
  if (!ast) return acc;
  if (ast.kind === 'identifier' && ast.name !== 'today') acc.add(ast.name);
  if (ast.kind === 'binary') { collectFieldRefs(ast.left, acc); collectFieldRefs(ast.right, acc); }
  if (ast.kind === 'negate') collectFieldRefs(ast.value, acc);
  if (ast.kind === 'call') ast.args.forEach((a) => collectFieldRefs(a, acc));
  return acc;
}

function toNumber(v) {
  if (typeof v !== 'number' || Number.isNaN(v)) throw new Error('ציפיתי לערך מספרי');
  return v;
}

function toDate(v) {
  if (!(v instanceof Date) || Number.isNaN(v.getTime())) throw new Error('ציפיתי לתאריך תקין');
  return v;
}

function monthsBetween(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function evalNode(ast, resolve) {
  switch (ast.kind) {
    case 'number': return ast.value;
    case 'negate': return -toNumber(evalNode(ast.value, resolve));
    case 'identifier': return resolve(ast.name);
    case 'binary': {
      const l = evalNode(ast.left, resolve);
      const r = evalNode(ast.right, resolve);
      switch (ast.op) {
        case '+': return toNumber(l) + toNumber(r);
        case '-': return toNumber(l) - toNumber(r);
        case '*': return toNumber(l) * toNumber(r);
        case '/': { const rn = toNumber(r); if (!rn) throw new Error('חלוקה באפס'); return toNumber(l) / rn; }
        default: throw new Error('אופרטור לא מוכר');
      }
    }
    case 'call': {
      const args = ast.args.map((a) => evalNode(a, resolve));
      switch (ast.name) {
        case 'months_between': return monthsBetween(toDate(args[0]), toDate(args[1]));
        case 'days_between': return Math.round((toDate(args[1]) - toDate(args[0])) / 86400000);
        case 'years_between': return monthsBetween(toDate(args[0]), toDate(args[1])) / 12;
        case 'percent': { const denom = toNumber(args[1]); if (!denom) throw new Error('חלוקה באפס'); return (toNumber(args[0]) / denom) * 100; }
        default: throw new Error('פונקציה לא מוכרת');
      }
    }
    default: throw new Error('צומת לא מוכר בנוסחה');
  }
}

// fieldTypes: { [fieldKey]: 'date' | 'number' }, values: { [fieldKey]: rawValue }
// מחזיר מספר, או null אם משהו חסר/לא תקין (לא זורק - שדה מחושב שלא
// ניתן לחישוב כרגע פשוט לא מציג ערך, לא קורס).
export function evaluateFormula(expression, fieldTypes, values) {
  function resolve(name) {
    if (name === 'today') return new Date();
    const type = fieldTypes[name];
    const raw = values?.[name];
    if (raw === undefined || raw === null || raw === '') throw new Error(`חסר ערך לשדה ${name}`);
    if (type === 'date') return toDate(new Date(raw));
    if (type === 'number') return toNumber(Number(raw));
    throw new Error(`שדה ${name} אינו מסוג תאריך/מספר`);
  }
  try {
    const ast = parseFormula(expression);
    const result = evalNode(ast, resolve);
    return typeof result === 'number' && !Number.isNaN(result) ? result : null;
  } catch {
    return null;
  }
}
