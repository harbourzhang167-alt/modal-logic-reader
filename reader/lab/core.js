/*
 * core.js -- propositional modal logic core for the Kripke editor.
 *
 * Works both in the browser (window.ModalCore) and in Node (module.exports).
 * No dependencies.
 */
(function (global) {
  "use strict";

  // ---------------------------------------------------------------- syntax

  const TOKEN_RE = /(<->|->|\[\]|<>|[()~&|]|[A-Za-z_$][A-Za-z0-9_$]*)/y;
  const ATOM_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

  function tokenize(text) {
    const tokens = [];
    let i = 0;
    while (i < text.length) {
      if (/\s/.test(text[i])) {
        i += 1;
        continue;
      }
      TOKEN_RE.lastIndex = i;
      const m = TOKEN_RE.exec(text);
      if (!m) {
        throw new Error(`无法识别字符 '${text[i]}'（位置 ${i}）`);
      }
      tokens.push(m[1]);
      i = TOKEN_RE.lastIndex;
    }
    return tokens;
  }

  class Parser {
    constructor(tokens) {
      this.tokens = tokens;
      this.i = 0;
    }
    peek() {
      return this.i < this.tokens.length ? this.tokens[this.i] : null;
    }
    eat(expected) {
      const tok = this.peek();
      if (tok === null) throw new Error("公式意外结束");
      if (expected !== undefined && tok !== expected) {
        throw new Error(`期望 '${expected}'，实际 '${tok}'`);
      }
      this.i += 1;
      return tok;
    }
    parse() {
      const f = this.parseIff();
      if (this.peek() !== null) {
        throw new Error(`多余的符号 '${this.peek()}'`);
      }
      return f;
    }
    parseIff() {
      let f = this.parseImp();
      while (this.peek() === "<->") {
        this.eat();
        f = { t: "iff", a: f, b: this.parseImp() };
      }
      return f;
    }
    parseImp() {
      const f = this.parseOr();
      if (this.peek() === "->") {
        this.eat();
        return { t: "imp", a: f, b: this.parseImp() };
      }
      return f;
    }
    parseOr() {
      let f = this.parseAnd();
      while (this.peek() === "|") {
        this.eat();
        f = { t: "or", a: f, b: this.parseAnd() };
      }
      return f;
    }
    parseAnd() {
      let f = this.parseUnary();
      while (this.peek() === "&") {
        this.eat();
        f = { t: "and", a: f, b: this.parseUnary() };
      }
      return f;
    }
    parseUnary() {
      const tok = this.peek();
      if (tok === "~") {
        this.eat();
        return { t: "not", a: this.parseUnary() };
      }
      if (tok === "[]") {
        this.eat();
        return { t: "box", a: this.parseUnary() };
      }
      if (tok === "<>") {
        this.eat();
        return { t: "dia", a: this.parseUnary() };
      }
      if (tok === "(") {
        this.eat();
        const f = this.parseIff();
        this.eat(")");
        return f;
      }
      if (tok === null) throw new Error("公式意外结束");
      if (ATOM_RE.test(tok)) {
        this.eat();
        return { t: "atom", name: tok };
      }
      throw new Error(`意外的符号 '${tok}'`);
    }
  }

  function parse(text) {
    if (!String(text).trim()) throw new Error("公式为空");
    return new Parser(tokenize(String(text))).parse();
  }

  const PREC = { iff: 1, imp: 2, or: 3, and: 4, not: 5, box: 5, dia: 5, atom: 6 };
  const BINOP = { and: "&", or: "|", imp: "->", iff: "<->" };

  function toAscii(f, prec) {
    prec = prec || 0;
    let s;
    let p;
    switch (f.t) {
      case "atom":
        s = f.name;
        p = PREC.atom;
        break;
      case "not":
        s = "~" + toAscii(f.a, PREC.not);
        p = PREC.not;
        break;
      case "box":
        s = "[]" + toAscii(f.a, PREC.box);
        p = PREC.box;
        break;
      case "dia":
        s = "<>" + toAscii(f.a, PREC.dia);
        p = PREC.dia;
        break;
      case "imp":
        p = PREC.imp;
        s = toAscii(f.a, p + 1) + " -> " + toAscii(f.b, p + 1);
        break;
      case "iff":
        p = PREC.iff;
        s = toAscii(f.a, p + 1) + " <-> " + toAscii(f.b, p + 1);
        break;
      default:
        p = PREC[f.t];
        s = toAscii(f.a, p) + " " + BINOP[f.t] + " " + toAscii(f.b, p + 1);
    }
    return p < prec ? "(" + s + ")" : s;
  }

  function toUnicode(f, prec) {
    return toAscii(f, prec)
      .replace(/<->/g, "↔")
      .replace(/->/g, "→")
      .replace(/\[\]/g, "□")
      .replace(/<>/g, "◇")
      .replace(/~/g, "¬")
      .replace(/&/g, "∧")
      .replace(/\|/g, "∨");
  }

  function atomsOf(f, out) {
    out = out || new Set();
    switch (f.t) {
      case "atom":
        out.add(f.name);
        break;
      case "not":
      case "box":
      case "dia":
        atomsOf(f.a, out);
        break;
      default:
        atomsOf(f.a, out);
        atomsOf(f.b, out);
    }
    return out;
  }

  // ------------------------------------------------------------- semantics

  function edgeKey(a, b) {
    return a + "," + b;
  }

  function edgeSet(model) {
    const set = new Set();
    for (const [a, b] of model.edges) set.add(edgeKey(a, b));
    return set;
  }

  function successors(model, w) {
    const out = [];
    for (const e of model.edges) if (e[0] === w) out.push(e[1]);
    return out;
  }

  function evaluate(model, world, f) {
    switch (f.t) {
      case "atom":
        return (model.val[world] || []).includes(f.name);
      case "not":
        return !evaluate(model, world, f.a);
      case "and":
        return evaluate(model, world, f.a) && evaluate(model, world, f.b);
      case "or":
        return evaluate(model, world, f.a) || evaluate(model, world, f.b);
      case "imp":
        return !evaluate(model, world, f.a) || evaluate(model, world, f.b);
      case "iff":
        return evaluate(model, world, f.a) === evaluate(model, world, f.b);
      case "box": {
        for (const v of successors(model, world)) {
          if (!evaluate(model, v, f.a)) return false;
        }
        return true;
      }
      case "dia": {
        for (const v of successors(model, world)) {
          if (evaluate(model, v, f.a)) return true;
        }
        return false;
      }
      default:
        throw new Error("未知公式类型：" + f.t);
    }
  }

  function frameProperties(model) {
    const worlds = model.worlds;
    const es = edgeSet(model);
    const has = (a, b) => es.has(edgeKey(a, b));

    const reflexive = worlds.every((w) => has(w, w));
    const serial = worlds.every((w) => worlds.some((v) => has(w, v)));
    const symmetric = model.edges.every(([a, b]) => has(b, a));

    let transitive = true;
    for (const [a, b] of model.edges) {
      for (const [c, d] of model.edges) {
        if (b === c && !has(a, d)) {
          transitive = false;
          break;
        }
      }
      if (!transitive) break;
    }

    let euclidean = true;
    outer: for (const [a, b] of model.edges) {
      for (const [c, d] of model.edges) {
        if (a === c && !has(b, d)) {
          euclidean = false;
          break outer;
        }
      }
    }

    return { reflexive, serial, transitive, symmetric, euclidean };
  }

  const LOGICS = {
    K: [],
    T: ["reflexive"],
    K4: ["transitive"],
    S4: ["reflexive", "transitive"],
    S5: ["reflexive", "transitive", "symmetric"],
    D: ["serial"],
    B: ["reflexive", "symmetric"],
    K5: ["euclidean"],
    KD45: ["serial", "transitive", "euclidean"],
  };

  function frameSatisfies(model, logic) {
    const props = frameProperties(model);
    return (LOGICS[logic] || []).every((name) => props[name]);
  }

  // -------------------------------------------------- bounded countermodels

  function bit(mask, n, a, b) {
    return (mask >> (a * n + b)) & 1;
  }

  function frameMaskOK(mask, n, constraints) {
    for (const name of constraints) {
      if (name === "reflexive") {
        for (let w = 0; w < n; w++) if (!bit(mask, n, w, w)) return false;
      } else if (name === "serial") {
        for (let w = 0; w < n; w++) {
          let any = false;
          for (let v = 0; v < n; v++) if (bit(mask, n, w, v)) { any = true; break; }
          if (!any) return false;
        }
      } else if (name === "transitive") {
        for (let a = 0; a < n; a++) {
          for (let b = 0; b < n; b++) {
            if (!bit(mask, n, a, b)) continue;
            for (let c = 0; c < n; c++) {
              if (bit(mask, n, b, c) && !bit(mask, n, a, c)) return false;
            }
          }
        }
      } else if (name === "symmetric") {
        for (let a = 0; a < n; a++) {
          for (let b = 0; b < n; b++) {
            if (bit(mask, n, a, b) && !bit(mask, n, b, a)) return false;
          }
        }
      } else if (name === "euclidean") {
        for (let a = 0; a < n; a++) {
          for (let b = 0; b < n; b++) {
            if (!bit(mask, n, a, b)) continue;
            for (let c = 0; c < n; c++) {
              if (bit(mask, n, a, c) && !bit(mask, n, b, c)) return false;
            }
          }
        }
      }
    }
    return true;
  }

  function buildSucc(mask, n) {
    const succ = Array.from({ length: n }, () => []);
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) if (bit(mask, n, a, b)) succ[a].push(b);
    }
    return succ;
  }

  function evalMask(f, w, succ, valMasks, atomIndex) {
    switch (f.t) {
      case "atom": {
        const i = atomIndex.get(f.name);
        return i !== undefined && ((valMasks[w] >> i) & 1) === 1;
      }
      case "not":
        return !evalMask(f.a, w, succ, valMasks, atomIndex);
      case "and":
        return evalMask(f.a, w, succ, valMasks, atomIndex) &&
          evalMask(f.b, w, succ, valMasks, atomIndex);
      case "or":
        return evalMask(f.a, w, succ, valMasks, atomIndex) ||
          evalMask(f.b, w, succ, valMasks, atomIndex);
      case "imp":
        return !evalMask(f.a, w, succ, valMasks, atomIndex) ||
          evalMask(f.b, w, succ, valMasks, atomIndex);
      case "iff":
        return evalMask(f.a, w, succ, valMasks, atomIndex) ===
          evalMask(f.b, w, succ, valMasks, atomIndex);
      case "box":
        return succ[w].every((v) => evalMask(f.a, v, succ, valMasks, atomIndex));
      case "dia":
        return succ[w].some((v) => evalMask(f.a, v, succ, valMasks, atomIndex));
      default:
        throw new Error("未知公式类型：" + f.t);
    }
  }

  function exportModel(n, mask, valCode, atoms) {
    const worlds = Array.from({ length: n }, (_, i) => i);
    const edges = [];
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) if (bit(mask, n, a, b)) edges.push([a, b]);
    }
    const k = atoms.length;
    const val = {};
    for (let w = 0; w < n; w++) {
      const vmask = k === 0 ? 0 : (valCode >> (w * k)) & ((1 << k) - 1);
      val[w] = atoms.filter((_, i) => ((vmask >> i) & 1) === 1);
    }
    return { worlds, edges, val };
  }

  /**
   * Search for a countermodel in frames satisfying `logic`, up to maxWorlds.
   * Returns {found, model?, world?, worlds?, atoms} or {found:false,...}.
   */
  function findCountermodel(formulaText, logic, maxWorlds) {
    const f = typeof formulaText === "string" ? parse(formulaText) : formulaText;
    maxWorlds = maxWorlds || 3;
    const atoms = Array.from(atomsOf(f)).sort();
    if (atoms.length > 4) {
      throw new Error("反模型搜索最多支持 4 个原子命题");
    }
    const atomIndex = new Map(atoms.map((a, i) => [a, i]));
    const constraints = LOGICS[logic] || [];

    for (let n = 1; n <= maxWorlds; n++) {
      const bits = n * n;
      const frameTotal = 1 << bits;
      const k = atoms.length;
      const valTotal = 1 << (n * k);

      for (let mask = 0; mask < frameTotal; mask++) {
        if (!frameMaskOK(mask, n, constraints)) continue;
        const succ = buildSucc(mask, n);
        for (let vc = 0; vc < valTotal; vc++) {
          const valMasks = new Array(n);
          for (let w = 0; w < n; w++) {
            valMasks[w] = k === 0 ? 0 : (vc >> (w * k)) & ((1 << k) - 1);
          }
          for (let w = 0; w < n; w++) {
            if (!evalMask(f, w, succ, valMasks, atomIndex)) {
              return {
                found: true,
                model: exportModel(n, mask, vc, atoms),
                world: w,
                worlds: n,
                atoms,
              };
            }
          }
        }
      }
    }
    return { found: false, maxWorlds, atoms };
  }

  // ---------------------------------------------------------------- helpers

  function cloneModel(model) {
    const val = {};
    for (const w of model.worlds) {
      val[w] = (model.val[w] || []).slice();
    }
    return {
      worlds: model.worlds.slice(),
      edges: model.edges.map((e) => [e[0], e[1]]),
      val,
    };
  }

  function defaultModel() {
    return {
      worlds: [0, 1],
      edges: [[0, 1]],
      val: { 0: [], 1: ["p"] },
    };
  }

  function describeModel(model) {
    const edges = model.edges.map(([a, b]) => `${a}→${b}`).join(", ") || "∅";
    const val = model.worlds
      .map((w) => `${w}:{${(model.val[w] || []).join(",")}}`)
      .join(" ");
    return `W={${model.worlds.join(",")}}  R={${edges}}  V={${val}}`;
  }

  const api = {
    parse,
    toAscii,
    toUnicode,
    atomsOf,
    evaluate,
    frameProperties,
    frameSatisfies,
    findCountermodel,
    cloneModel,
    defaultModel,
    describeModel,
    LOGICS,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  global.ModalCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
