// מנוע נוסחאות בטוח לשדות "מחושב" - טוקנייזר + פארסר-רקורסיבי משלנו,
// **בלי eval/new Function בשום שלב** (הביטוי מקורו בהצעת AI שמקורה
// בתיאור חופשי של משתמש - אסור להריץ אותו כקוד JS ממשי). תומך רק
// בפעולות חשבון בסיסיות, סוגריים, וכמה פונקציות תאריך קבועות מראש -
// שום קריאה חיצונית, שום גישה למשתני JS.
//
// דקדוק: expr := comparison
//        comparison := arith (('>'|'<'|'>='|'<='|'=='|'!=') arith)?
//        arith := term (('+'|'-') term)*
//        term := factor (('*'|'/') factor)*
//        factor := number | string | identifier | funcCall | '(' expr ')' | '-' factor
//        funcCall := identifier '(' expr (',' expr)* ')'
//
// מחרוזות ("...") נתמכות רק לצורך הרכבת משפט תיאורי (חיבור עם +, למשל
// count_filled(a,b) + " קורסים" ) - לא לשום שימוש אחר. השוואות (>/</וכו')
// קיימות רק כדי לשמש כתנאי לפונקציית if(תנאי, אז, אחרת) - אין שרשור
// השוואות (a > b > c לא נתמך, בכוונה - שומר את הדקדוק פשוט ובטוח).

// count_filled/list_filled מיוחדות: מקבלות כמה שמות שדות (כל כמות, לא
// רק שניים) ועובדות על הערך הגולמי שלהם בלי קשר לסוג (טקסט/מספר/תאריך/
// בחירה) - "כמה מהשדות האלה מלאים" / "מה הערכים המלאים, מרוכזים".
//
// פונקציות מצטברות (0 ארגומנטים) - לא קוראות משדה, אלא מהיסטוריית
// התנועות (donation_transactions) של האדם באותה מחלקה, שמועברת בנפרד
// ל-evaluateFormula. שם הטבלה נשאר היסטורי אבל הפונקציות גנריות לכל
// מחלקה עם תנועות, לא רק תרומות.
export const ALLOWED_FUNCTIONS = new Set([
  'months_between', 'days_between', 'years_between', 'percent',
  'count_filled', 'list_filled', 'if',
  'total_transactions', 'transaction_count', 'avg_transaction',
  'days_since_last_transaction', 'first_transaction_date', 'last_transaction_date',
  'total_transactions_this_year',
]);
const VARIADIC_RAW_FUNCTIONS = new Set(['count_filled', 'list_filled']);
const AGGREGATE_FUNCTIONS = new Set([
  'total_transactions', 'transaction_count', 'avg_transaction',
  'days_since_last_transaction', 'first_transaction_date', 'last_transaction_date',
  'total_transactions_this_year',
]);

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if ('><='.includes(ch)) {
      const two = src.slice(i, i + 2);
      if (two === '>=' || two === '<=' || two === '==' || two === '!=') { tokens.push({ type: two, value: two }); i += 2; continue; }
      if (ch === '>' || ch === '<') { tokens.push({ type: ch, value: ch }); i++; continue; }
      throw new Error(`תו לא מוכר בנוסחה: "${ch}"`);
    }
    if (ch === '!' && src[i + 1] === '=') { tokens.push({ type: '!=', value: '!=' }); i += 2; continue; }
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
    if (ch === '"') {
      let j = i + 1;
      let value = '';
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\' && j + 1 < src.length) { value += src[j + 1]; j += 2; continue; }
        value += src[j];
        j++;
      }
      if (src[j] !== '"') throw new Error('מרכאות לא נסגרו בנוסחה');
      tokens.push({ type: 'string', value });
      i = j + 1;
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

  const COMPARE_OPS = new Set(['>', '<', '>=', '<=', '==', '!=']);

  function parseExpr() {
    const left = parseArith();
    if (peek() && COMPARE_OPS.has(peek().type)) {
      const op = next().type;
      return { kind: 'compare', op, left, right: parseArith() };
    }
    return left;
  }

  function parseArith() {
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
    if (t.type === 'string') { next(); return { kind: 'string', value: t.value }; }
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
  if (ast.kind === 'binary' || ast.kind === 'compare') { collectFieldRefs(ast.left, acc); collectFieldRefs(ast.right, acc); }
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

// פונקציות מצטברות - קוראות מ-ctx.transactions (מערך {amount,
// transaction_date} של האדם באותה מחלקה, לא משדה). אם לא סופקו תנועות
// כלל (evaluateFormula נקרא בלי הפרמטר הרביעי - למשל בעמוד לידים, ששם
// היסטוריית התנועות לא טעונה מראש) - זורקות, וה-catch החיצוני הופך
// את זה ל-null בשקט, בדיוק כמו כל חוסר-נתון אחר.
function aggregateValue(name, transactions) {
  if (!Array.isArray(transactions)) throw new Error('היסטוריית תנועות לא זמינה כאן');
  if (transactions.length === 0) {
    if (name === 'transaction_count' || name === 'total_transactions' || name === 'total_transactions_this_year') return 0;
    return null;
  }
  const amounts = transactions.map((t) => Number(t.amount) || 0);
  const dates = transactions.map((t) => new Date(t.transaction_date)).filter((d) => !Number.isNaN(d.getTime()));
  switch (name) {
    case 'total_transactions': return amounts.reduce((s, a) => s + a, 0);
    case 'transaction_count': return transactions.length;
    case 'avg_transaction': return amounts.reduce((s, a) => s + a, 0) / transactions.length;
    case 'days_since_last_transaction': {
      if (!dates.length) return null;
      const last = new Date(Math.max(...dates.map((d) => d.getTime())));
      return Math.round((new Date() - last) / 86400000);
    }
    case 'first_transaction_date': return dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
    case 'last_transaction_date': return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
    case 'total_transactions_this_year': {
      const thisYear = new Date().getFullYear();
      return transactions
        .filter((t) => new Date(t.transaction_date).getFullYear() === thisYear)
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    }
    default: throw new Error('פונקציה מצטברת לא מוכרת');
  }
}

function evalNode(ast, ctx) {
  const { resolve, getRaw, transactions } = ctx;
  switch (ast.kind) {
    case 'number': return ast.value;
    case 'string': return ast.value;
    case 'negate': return -toNumber(evalNode(ast.value, ctx));
    case 'identifier': return resolve(ast.name);
    case 'compare': {
      const l = evalNode(ast.left, ctx);
      const r = evalNode(ast.right, ctx);
      switch (ast.op) {
        case '>': return l > r;
        case '<': return l < r;
        case '>=': return l >= r;
        case '<=': return l <= r;
        case '==': return l === r || (l instanceof Date && r instanceof Date && l.getTime() === r.getTime());
        case '!=': return !(l === r || (l instanceof Date && r instanceof Date && l.getTime() === r.getTime()));
        default: throw new Error('אופרטור השוואה לא מוכר');
      }
    }
    case 'binary': {
      const l = evalNode(ast.left, ctx);
      const r = evalNode(ast.right, ctx);
      switch (ast.op) {
        // חיבור טקסטואלי אם אחד הצדדים מחרוזת (לצורך משפט מרוכז, למשל
        // count_filled(...) + " קורסים: " + list_filled(...)) - שאר
        // האופרטורים (- * /) עדיין דורשים מספרים בלבד, אין "חיסור טקסט".
        case '+': return (typeof l === 'string' || typeof r === 'string') ? String(l) + String(r) : toNumber(l) + toNumber(r);
        case '-': return toNumber(l) - toNumber(r);
        case '*': return toNumber(l) * toNumber(r);
        case '/': { const rn = toNumber(r); if (!rn) throw new Error('חלוקה באפס'); return toNumber(l) / rn; }
        default: throw new Error('אופרטור לא מוכר');
      }
    }
    case 'call': {
      if (ast.name === 'if') {
        if (ast.args.length !== 3) throw new Error('if דורשת בדיוק 3 ארגומנטים: תנאי, אז, אחרת');
        const cond = evalNode(ast.args[0], ctx);
        // מעריכים רק את הענף שנבחר - כדי שהענף הלא-רלוונטי (שעשוי
        // להפנות לשדה ריק) לא יגרום לשגיאה מיותרת.
        return cond ? evalNode(ast.args[1], ctx) : evalNode(ast.args[2], ctx);
      }
      if (AGGREGATE_FUNCTIONS.has(ast.name)) {
        if (ast.args.length !== 0) throw new Error(`${ast.name} לא מקבלת ארגומנטים`);
        return aggregateValue(ast.name, transactions);
      }
      if (VARIADIC_RAW_FUNCTIONS.has(ast.name)) {
        const names = ast.args.map((a) => {
          if (a.kind !== 'identifier') throw new Error(`${ast.name} מקבלת רק שמות שדות, לא ביטויים`);
          return a.name;
        });
        const filledValues = names.map((n) => getRaw(n)).filter((v) => v !== undefined && v !== null && v !== '');
        if (ast.name === 'count_filled') return filledValues.length;
        return filledValues.length ? filledValues.join(', ') : null; // list_filled
      }
      const args = ast.args.map((a) => evalNode(a, ctx));
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

// fieldTypes: { [fieldKey]: 'date' | 'number' | ... }, values: { [fieldKey]: rawValue },
// transactions: מערך {amount, transaction_date} אופציונלי (להיסטוריית
// תנועות - ר' הפונקציות המצטברות למעלה; אם לא סופק, הן מחזירות null
// בשקט במקום לזרוק). מחזיר מספר או מחרוזת, או null אם משהו חסר/לא תקין
// (לא זורק - שדה מחושב שלא ניתן לחישוב כרגע פשוט לא מציג ערך, לא קורס).
export function evaluateFormula(expression, fieldTypes, values, transactions) {
  function resolve(name) {
    if (name === 'today') return new Date();
    const type = fieldTypes[name];
    const raw = values?.[name];
    if (raw === undefined || raw === null || raw === '') throw new Error(`חסר ערך לשדה ${name}`);
    if (type === 'date') return toDate(new Date(raw));
    if (type === 'number') return toNumber(Number(raw));
    throw new Error(`שדה ${name} אינו מסוג תאריך/מספר`);
  }
  function getRaw(name) {
    return name === 'today' ? new Date().toLocaleDateString('he-IL') : values?.[name];
  }
  try {
    const ast = parseFormula(expression);
    let result = evalNode(ast, { resolve, getRaw, transactions });
    if (result instanceof Date) result = result.toLocaleDateString('he-IL');
    if (typeof result === 'number' && !Number.isNaN(result)) return Math.round(result * 100) / 100;
    if (typeof result === 'string' && result) return result;
    return null;
  } catch {
    return null;
  }
}
