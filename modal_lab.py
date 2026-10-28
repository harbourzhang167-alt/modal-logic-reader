"""modal_lab.py -- a small, dependency-free toolkit for propositional modal logic.

What it does
------------
1. Parses modal formulas written in ASCII:
       ~  &  |  ->  <->  []  <>  ( )
   e.g.  "[](p -> q) -> ([]p -> []q)"
2. Evaluates formulas in a Kripke model (W, R, V).
3. Enumerates all finite frames up to a given size and searches for
   countermodels, relative to a logic (K, T, K4, S4, S5, D, B, K5, KD45).
4. Checks Hilbert-style proofs (axiom K, T/4/5/B/D, tautologies,
   modus ponens, necessitation).

The bounded search in (3) is a *checker*, not a decision procedure for
arbitrary formulas: "valid up to n worlds" is not a theorem.  For the
standard axioms and the small formulas used here, n <= 3 is enough.

Run `python demo.py` for a guided demonstration.
"""

from __future__ import annotations

import itertools
import re
from dataclasses import dataclass
from typing import Dict, FrozenSet, Iterable, Iterator, Optional, Set, Tuple

# --------------------------------------------------------------------------
# 1. Syntax
# --------------------------------------------------------------------------

Formula = tuple


def Atom(name: str) -> Formula:
    return ("atom", name)


def Not(f: Formula) -> Formula:
    return ("not", f)


def And(a: Formula, b: Formula) -> Formula:
    return ("and", a, b)


def Or(a: Formula, b: Formula) -> Formula:
    return ("or", a, b)


def Imp(a: Formula, b: Formula) -> Formula:
    return ("imp", a, b)


def Iff(a: Formula, b: Formula) -> Formula:
    return ("iff", a, b)


def Box(a: Formula) -> Formula:
    return ("box", a)


def Dia(a: Formula) -> Formula:
    return ("dia", a)


_TOKEN_RE = re.compile(r"\s*(<->|->|\[\]|<>|[()~&|]|[A-Za-z_$][A-Za-z0-9_$]*)")
_ATOM_RE = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*\Z")


class ParseError(ValueError):
    pass


def tokenize(text: str) -> list[str]:
    tokens: list[str] = []
    pos = 0
    while pos < len(text):
        m = _TOKEN_RE.match(text, pos)
        if m is None:
            raise ParseError(f"cannot tokenize at position {pos}: {text[pos:pos + 12]!r}")
        tok = m.group(1)
        pos = m.end()
        if tok:
            tokens.append(tok)
    if not tokens:
        raise ParseError("empty formula")
    return tokens


class _Parser:
    def __init__(self, tokens: list[str]) -> None:
        self.tokens = tokens
        self.i = 0

    def peek(self) -> Optional[str]:
        return self.tokens[self.i] if self.i < len(self.tokens) else None

    def eat(self, expected: Optional[str] = None) -> str:
        tok = self.peek()
        if tok is None:
            raise ParseError("unexpected end of formula")
        if expected is not None and tok != expected:
            raise ParseError(f"expected {expected!r}, found {tok!r}")
        self.i += 1
        return tok

    def parse(self) -> Formula:
        f = self.parse_iff()
        if self.peek() is not None:
            raise ParseError(f"unexpected trailing token {self.peek()!r}")
        return f

    def parse_iff(self) -> Formula:
        f = self.parse_imp()
        while self.peek() == "<->":
            self.eat()
            f = Iff(f, self.parse_imp())
        return f

    def parse_imp(self) -> Formula:
        f = self.parse_or()
        if self.peek() == "->":
            self.eat()
            # implication is right associative
            return Imp(f, self.parse_imp())
        return f

    def parse_or(self) -> Formula:
        f = self.parse_and()
        while self.peek() == "|":
            self.eat()
            f = Or(f, self.parse_and())
        return f

    def parse_and(self) -> Formula:
        f = self.parse_unary()
        while self.peek() == "&":
            self.eat()
            f = And(f, self.parse_unary())
        return f

    def parse_unary(self) -> Formula:
        tok = self.peek()
        if tok == "~":
            self.eat()
            return Not(self.parse_unary())
        if tok == "[]":
            self.eat()
            return Box(self.parse_unary())
        if tok == "<>":
            self.eat()
            return Dia(self.parse_unary())
        if tok == "(":
            self.eat()
            f = self.parse_iff()
            self.eat(")")
            return f
        if tok is None:
            raise ParseError("unexpected end of formula")
        if _ATOM_RE.match(tok):
            self.eat()
            return Atom(tok)
        raise ParseError(f"unexpected token {tok!r}")


def parse(text: str) -> Formula:
    """Parse an ASCII modal formula into a tuple-based AST."""
    return _Parser(tokenize(text)).parse()


_PREC = {"iff": 1, "imp": 2, "or": 3, "and": 4, "not": 5, "box": 5, "dia": 5, "atom": 6}
_BINOP = {"and": "&", "or": "|", "imp": "->", "iff": "<->"}


def to_ascii(f: Formula, prec: int = 0) -> str:
    """Pretty-print, keeping parentheses that make the tree structure clear."""
    tag = f[0]
    if tag == "atom":
        s, p = f[1], _PREC["atom"]
    elif tag == "not":
        s, p = "~" + to_ascii(f[1], _PREC["not"]), _PREC["not"]
    elif tag == "box":
        s, p = "[]" + to_ascii(f[1], _PREC["box"]), _PREC["box"]
    elif tag == "dia":
        s, p = "<>" + to_ascii(f[1], _PREC["dia"]), _PREC["dia"]
    elif tag == "imp":
        p = _PREC["imp"]
        # parenthesise a nested implication on the right, for readability
        s = f"{to_ascii(f[1], p + 1)} -> {to_ascii(f[2], p + 1)}"
    elif tag == "iff":
        p = _PREC["iff"]
        s = f"{to_ascii(f[1], p + 1)} <-> {to_ascii(f[2], p + 1)}"
    else:  # and / or
        p = _PREC[tag]
        s = f"{to_ascii(f[1], p)} {_BINOP[tag]} {to_ascii(f[2], p + 1)}"
    return f"({s})" if p < prec else s


def to_unicode(f: Formula, prec: int = 0) -> str:
    return (
        to_ascii(f, prec)
        .replace("<->", "↔")
        .replace("->", "→")
        .replace("[]", "□")
        .replace("<>", "◇")
        .replace("~", "¬")
        .replace("&", "∧")
        .replace("|", "∨")
    )


def atoms_of(f: Formula) -> Set[str]:
    tag = f[0]
    if tag == "atom":
        return {f[1]}
    if tag in ("not", "box", "dia"):
        return atoms_of(f[1])
    return atoms_of(f[1]) | atoms_of(f[2])


# --------------------------------------------------------------------------
# 2. Kripke semantics
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Frame:
    worlds: Tuple[int, ...]
    edges: FrozenSet[Tuple[int, int]]


@dataclass(frozen=True)
class Model:
    worlds: Tuple[int, ...]
    edges: FrozenSet[Tuple[int, int]]
    val: Dict[int, FrozenSet[str]]

    @property
    def frame(self) -> Frame:
        return Frame(self.worlds, self.edges)


def evaluate(model: Model, world: int, f: Formula) -> bool:
    """Truth of f at `world` in `model` (standard Kripke clauses)."""
    tag = f[0]
    if tag == "atom":
        return f[1] in model.val.get(world, frozenset())
    if tag == "not":
        return not evaluate(model, world, f[1])
    if tag == "and":
        return evaluate(model, world, f[1]) and evaluate(model, world, f[2])
    if tag == "or":
        return evaluate(model, world, f[1]) or evaluate(model, world, f[2])
    if tag == "imp":
        return (not evaluate(model, world, f[1])) or evaluate(model, world, f[2])
    if tag == "iff":
        return evaluate(model, world, f[1]) == evaluate(model, world, f[2])
    if tag == "box":
        return all(
            evaluate(model, v, f[1]) for v in model.worlds if (world, v) in model.edges
        )
    if tag == "dia":
        return any(
            evaluate(model, v, f[1]) for v in model.worlds if (world, v) in model.edges
        )
    raise ValueError(f"unknown formula tag {tag!r}")


def describe_model(model: Model) -> str:
    val = ", ".join(
        f"{w}: {{{', '.join(sorted(model.val.get(w, frozenset()))) }}}"
        for w in model.worlds
    )
    edges = ", ".join(f"{a}->{b}" for a, b in sorted(model.edges))
    return f"W={{{', '.join(map(str, model.worlds))}}}, R={{{edges}}}, V={{{val}}}"


# ---- frame properties -----------------------------------------------------


def is_reflexive(fr: Frame) -> bool:
    return all((w, w) in fr.edges for w in fr.worlds)


def is_serial(fr: Frame) -> bool:
    return all(any((w, v) in fr.edges for v in fr.worlds) for w in fr.worlds)


def is_transitive(fr: Frame) -> bool:
    for w, v in fr.edges:
        for v2, u in fr.edges:
            if v == v2 and (w, u) not in fr.edges:
                return False
    return True


def is_symmetric(fr: Frame) -> bool:
    return all((v, w) in fr.edges for w, v in fr.edges)


def is_euclidean(fr: Frame) -> bool:
    for w, v in fr.edges:
        for w2, u in fr.edges:
            if w == w2 and (v, u) not in fr.edges:
                return False
    return True


PROPERTIES = {
    "reflexive": is_reflexive,
    "serial": is_serial,
    "transitive": is_transitive,
    "symmetric": is_symmetric,
    "euclidean": is_euclidean,
}

# frame conditions for the standard normal modal logics
LOGICS: Dict[str, Tuple[str, ...]] = {
    "K": (),
    "T": ("reflexive",),
    "K4": ("transitive",),
    "S4": ("reflexive", "transitive"),
    "S5": ("reflexive", "transitive", "symmetric"),
    "D": ("serial",),
    "B": ("reflexive", "symmetric"),
    "K5": ("euclidean",),
    "KD45": ("serial", "transitive", "euclidean"),
}


def all_frames(n: int) -> Iterator[Frame]:
    """All frames on worlds 0..n-1 (there are 2^(n*n) of them)."""
    pairs = [(i, j) for i in range(n) for j in range(n)]
    worlds = tuple(range(n))
    for mask in range(1 << len(pairs)):
        edges = frozenset(pairs[k] for k in range(len(pairs)) if (mask >> k) & 1)
        yield Frame(worlds, edges)


def valuations(n: int, atoms: Iterable[str]) -> Iterator[Dict[int, FrozenSet[str]]]:
    atoms = tuple(sorted(atoms))
    subsets = [
        frozenset(c)
        for r in range(len(atoms) + 1)
        for c in itertools.combinations(atoms, r)
    ]
    for combo in itertools.product(subsets, repeat=n):
        yield {i: combo[i] for i in range(n)}


@dataclass
class CheckResult:
    valid: bool
    model: Optional[Model] = None
    world: Optional[int] = None
    worlds: int = 0

    def summary(self) -> str:
        if self.valid:
            return f"no countermodel with <= {self.worlds} worlds"
        assert self.model is not None and self.world is not None
        return (
            f"countermodel at world {self.world}: {describe_model(self.model)}"
        )


def check_validity(
    formula: Formula,
    logic: str = "K",
    max_worlds: int = 3,
    atoms: Optional[Iterable[str]] = None,
) -> CheckResult:
    """Search for a countermodel over frames satisfying `logic`, up to n worlds.

    Returns valid=True iff no countermodel exists in that bounded class.
    """
    if max_worlds < 1:
        raise ValueError("max_worlds must be at least 1")
    constraints = LOGICS[logic]
    ats = set(atoms) if atoms is not None else atoms_of(formula)
    for n in range(1, max_worlds + 1):
        vals = list(valuations(n, ats))
        for fr in all_frames(n):
            if not all(PROPERTIES[c](fr) for c in constraints):
                continue
            for val in vals:
                model = Model(fr.worlds, fr.edges, val)
                for w in fr.worlds:
                    if not evaluate(model, w, formula):
                        return CheckResult(False, model, w, n)
    return CheckResult(True, None, None, max_worlds)


def check_on_property(
    formula: Formula,
    property_name: str,
    want_property: bool = True,
    max_worlds: int = 3,
) -> Tuple[bool, CheckResult]:
    """Check `formula` on all frames that do (or do not) have a property.

    Returns (holds_everywhere, result).  When a countermodel is found,
    `result` describes it.
    """
    if max_worlds < 1:
        raise ValueError("max_worlds must be at least 1")
    checker = PROPERTIES[property_name]
    ats = atoms_of(formula)
    for n in range(1, max_worlds + 1):
        vals = list(valuations(n, ats))
        for fr in all_frames(n):
            if checker(fr) != want_property:
                continue
            for val in vals:
                model = Model(fr.worlds, fr.edges, val)
                for w in fr.worlds:
                    if not evaluate(model, w, formula):
                        return False, CheckResult(False, model, w, n)
    return True, CheckResult(True, None, None, max_worlds)


# --------------------------------------------------------------------------
# 3. Hilbert-style proof checking
# --------------------------------------------------------------------------

_A, _B, _C = Atom("$A"), Atom("$B"), Atom("$C")

AXIOM_SCHEMAS = {
    "K": Imp(Box(Imp(_A, _B)), Imp(Box(_A), Box(_B))),
    "T": Imp(Box(_A), _A),
    "4": Imp(Box(_A), Box(Box(_A))),
    "5": Imp(Dia(_A), Box(Dia(_A))),
    "B": Imp(_A, Box(Dia(_A))),
    "D": Imp(Box(_A), Dia(_A)),
}

# which extra axiom schemas each logic allows
LOGIC_AXIOMS: Dict[str, Set[str]] = {
    "K": set(),
    "T": {"T"},
    "K4": {"4"},
    "S4": {"T", "4"},
    "S5": {"T", "4", "5"},
    "D": {"D"},
    "B": {"T", "B"},
    "K5": {"5"},
    "KD45": {"D", "4", "5"},
}


class ProofError(ValueError):
    pass


def _match_schema(schema: Formula, f: Formula, binding: Dict[str, Formula]) -> bool:
    tag = schema[0]
    if tag == "atom" and schema[1].startswith("$"):
        name = schema[1]
        if name in binding:
            return binding[name] == f
        binding[name] = f
        return True
    if tag != f[0]:
        return False
    if tag == "atom":
        return schema[1] == f[1]
    if tag in ("not", "box", "dia"):
        return _match_schema(schema[1], f[1], binding)
    return _match_schema(schema[1], f[1], binding) and _match_schema(
        schema[2], f[2], binding
    )


def instance_of(schema: Formula, f: Formula) -> bool:
    return _match_schema(schema, f, {})


def is_tautology(f: Formula) -> bool:
    """Propositional tautology, treating modal atoms as propositional letters."""
    var_id: Dict[Formula, int] = {}

    def collect(node: Formula) -> None:
        tag = node[0]
        if tag == "not":
            collect(node[1])
        elif tag in ("and", "or", "imp", "iff"):
            collect(node[1])
            collect(node[2])
        else:  # atom, box, dia are opaque
            var_id.setdefault(node, len(var_id))

    collect(f)
    n = len(var_id)
    if n > 16:
        raise ProofError("too many propositional atoms for a truth-table check")

    def ev(node: Formula, a: Tuple[bool, ...]) -> bool:
        tag = node[0]
        if tag == "not":
            return not ev(node[1], a)
        if tag == "and":
            return ev(node[1], a) and ev(node[2], a)
        if tag == "or":
            return ev(node[1], a) or ev(node[2], a)
        if tag == "imp":
            return (not ev(node[1], a)) or ev(node[2], a)
        if tag == "iff":
            return ev(node[1], a) == ev(node[2], a)
        return a[var_id[node]]

    for bits in itertools.product((False, True), repeat=n):
        if not ev(f, bits):
            return False
    return True


@dataclass
class Step:
    """One proof line; `args` are 0-based indices of earlier lines."""

    text: str
    rule: str
    args: Tuple[int, ...] = ()


def check_proof(steps: Iterable[Step], logic: str = "K") -> Formula:
    """Check a Hilbert proof; return the last formula.  Raises ProofError."""
    if logic not in LOGICS:
        raise ProofError(f"unknown logic {logic!r}")
    allowed = LOGIC_AXIOMS[logic]
    formulas: list[Formula] = []

    for idx, step in enumerate(steps, start=1):
        f = parse(step.text)
        rule = step.rule.strip().lower()

        if rule == "taut":
            if not is_tautology(f):
                raise ProofError(f"line {idx}: not a propositional tautology: {step.text}")
        elif rule == "k":
            if not instance_of(AXIOM_SCHEMAS["K"], f):
                raise ProofError(f"line {idx}: not an instance of axiom K")
        elif rule in ("t", "4", "5", "b", "d"):
            name = rule.upper()
            if name not in allowed:
                raise ProofError(f"line {idx}: axiom {name} is not available in {logic}")
            if not instance_of(AXIOM_SCHEMAS[name], f):
                raise ProofError(f"line {idx}: not an instance of axiom {name}")
        elif rule == "mp":
            if len(step.args) != 2:
                raise ProofError(f"line {idx}: MP needs two line numbers")
            i, j = step.args
            if not (0 <= i < len(formulas) and 0 <= j < len(formulas)):
                raise ProofError(f"line {idx}: MP refers to a non-existent line")
            if not (
                formulas[j] == Imp(formulas[i], f)
                or formulas[i] == Imp(formulas[j], f)
            ):
                raise ProofError(f"line {idx}: MP does not yield {step.text}")
        elif rule == "nec":
            if len(step.args) != 1:
                raise ProofError(f"line {idx}: NEC needs one line number")
            (i,) = step.args
            if not (0 <= i < len(formulas)):
                raise ProofError(f"line {idx}: NEC refers to a non-existent line")
            if f != Box(formulas[i]):
                raise ProofError(f"line {idx}: NEC does not yield {step.text}")
        else:
            raise ProofError(f"line {idx}: unknown rule {step.rule!r}")

        formulas.append(f)

    if not formulas:
        raise ProofError("empty proof")
    return formulas[-1]


def _main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Check a modal formula against a bounded class of Kripke frames."
    )
    parser.add_argument("formula", help='formula in ASCII syntax, e.g. "[]p -> p"')
    parser.add_argument("--logic", default="K", choices=sorted(LOGICS))
    parser.add_argument("--worlds", type=int, default=3, dest="worlds")
    args = parser.parse_args()

    formula = parse(args.formula)
    print("formula:", to_unicode(formula))
    print(f"logic: {args.logic}   worlds <= {args.worlds}")
    result = check_validity(formula, args.logic, max_worlds=args.worlds)
    print("result:", "valid" if result.valid else "invalid")
    if not result.valid:
        print(result.summary())


if __name__ == "__main__":
    _main()

