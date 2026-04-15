export function parseBlocks(text) {
  return (text || '').split('---').map(b => b.trim()).filter(Boolean)
}

export function parseField(block, field) {
  const m = block.match(new RegExp(field + ':\\s*([\\s\\S]+?)(?=\\n[A-Z_]+:|$)'))
  return m ? m[1].trim() : ''
}

export function parseRisks(text) {
  return parseBlocks(text).map(block => ({
    severity: parseField(block, 'SEVERITY'),
    clause:   parseField(block, 'CLAUSE'),
    risk:     parseField(block, 'RISK'),
    impact:   parseField(block, 'IMPACT'),
  })).filter(r => r.severity)
}

export function parseRewrites(text) {
  return parseBlocks(text).map(block => ({
    clause:   parseField(block, 'CLAUSE'),
    problem:  parseField(block, 'PROBLEM'),
    original: parseField(block, 'ORIGINAL'),
    rewrite:  parseField(block, 'REWRITE'),
  })).filter(r => r.clause)
}

export function parseClauses(text) {
  return parseBlocks(text).map(block => ({
    clause:   parseField(block, 'CLAUSE'),
    type:     parseField(block, 'TYPE'),
    partyA:   parseField(block, 'OBLIGATIONS_ON_PARTY_A'),
    partyB:   parseField(block, 'OBLIGATIONS_ON_PARTY_B'),
    keyTerms: parseField(block, 'KEY_TERMS'),
  })).filter(r => r.clause)
}

export function parseApproach(text) {
  return {
    verdict:        parseField(text, 'VERDICT'),
    reasoning:      parseField(text, 'REASONING'),
    step1:          parseField(text, 'STEP_1'),
    step2:          parseField(text, 'STEP_2'),
    step3:          parseField(text, 'STEP_3'),
    priorityClause: parseField(text, 'PRIORITY_CLAUSE'),
  }
}

export function countSeverity(text, level) {
  return (text.match(new RegExp(`SEVERITY:\\s*${level}`, 'g')) || []).length
}
