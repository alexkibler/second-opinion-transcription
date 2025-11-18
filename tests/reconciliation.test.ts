import { describe, it, expect } from 'vitest'
import { ReconciliationService } from '../src/lib/reconciliation'
import { WhisperWord } from '../src/lib/whisper'

describe('ReconciliationService', () => {
  const reconciliationService = new ReconciliationService()

  it('should accept valid corrections', () => {
    const originalWords: WhisperWord[] = [
      { word: 'The', start: 0, end: 0.3, probability: 0.95 },
      { word: 'red', start: 0.3, end: 0.6, probability: 0.45 }, // Low confidence
      { word: 'fox', start: 0.6, end: 1.0, probability: 0.90 },
    ]

    const correctedText = 'The quick red fox'

    const result = reconciliationService.reconcile(
      originalWords,
      correctedText,
      0,
      1.0
    )

    expect(result.success).toBe(true)
    expect(result.shouldApply).toBe(true)
    expect(result.levenshteinDistance).toBeGreaterThan(0)
  })

  it('should reject corrections that are too different (hallucination)', () => {
    const originalWords: WhisperWord[] = [
      { word: 'The', start: 0, end: 0.3, probability: 0.95 },
      { word: 'red', start: 0.3, end: 0.6, probability: 0.45 },
      { word: 'fox', start: 0.6, end: 1.0, probability: 0.90 },
    ]

    const correctedText = 'Completely different sentence with no relation'

    const result = reconciliationService.reconcile(
      originalWords,
      correctedText,
      0,
      1.0
    )

    expect(result.success).toBe(true)
    expect(result.shouldApply).toBe(false)
    expect(result.reason).toContain('Levenshtein')
  })

  it('should reject empty corrections', () => {
    const originalWords: WhisperWord[] = [
      { word: 'test', start: 0, end: 0.5, probability: 0.45 },
    ]

    const result = reconciliationService.reconcile(
      originalWords,
      '',
      0,
      0.5
    )

    expect(result.shouldApply).toBe(false)
    expect(result.reason).toContain('empty')
  })

  it('should reject unintelligible corrections', () => {
    const originalWords: WhisperWord[] = [
      { word: 'test', start: 0, end: 0.5, probability: 0.45 },
    ]

    const result = reconciliationService.reconcile(
      originalWords,
      '[unintelligible]',
      0,
      0.5
    )

    expect(result.shouldApply).toBe(false)
    expect(result.reason).toContain('unintelligible')
  })

  it('should reject identical corrections', () => {
    const originalWords: WhisperWord[] = [
      { word: 'test', start: 0, end: 0.5, probability: 0.45 },
    ]

    const result = reconciliationService.reconcile(
      originalWords,
      'test',
      0,
      0.5
    )

    expect(result.shouldApply).toBe(false)
    expect(result.reason).toContain('No changes')
  })

  it('should merge transcript with corrections', () => {
    const originalWords: WhisperWord[] = [
      { word: 'Hello', start: 0, end: 0.5, probability: 0.95 },
      { word: 'mumbly', start: 0.5, end: 1.0, probability: 0.45 },
      { word: 'world', start: 1.0, end: 1.5, probability: 0.95 },
    ]

    const corrections = [
      {
        clipStart: 0.3,
        clipEnd: 1.2,
        correctedText: 'beautiful',
        shouldApply: true,
      },
    ]

    const merged = reconciliationService.mergeTranscript(
      originalWords,
      corrections
    )

    expect(merged.appliedCorrections).toBe(1)
    expect(merged.text).toContain('beautiful')
  })

  it('should skip corrections marked as shouldApply: false', () => {
    const originalWords: WhisperWord[] = [
      { word: 'Hello', start: 0, end: 0.5, probability: 0.95 },
      { word: 'world', start: 0.5, end: 1.0, probability: 0.95 },
    ]

    const corrections = [
      {
        clipStart: 0,
        clipEnd: 1.0,
        correctedText: 'bad correction',
        shouldApply: false,
      },
    ]

    const merged = reconciliationService.mergeTranscript(
      originalWords,
      corrections
    )

    expect(merged.appliedCorrections).toBe(0)
    expect(merged.skippedCorrections).toBe(1)
    expect(merged.text).toBe('Hello world')
  })
})
