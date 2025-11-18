import levenshtein from 'fast-levenshtein'
import { WhisperWord } from './whisper'

export interface ReconciliationResult {
  success: boolean
  originalText: string
  correctedText: string
  levenshteinDistance: number
  shouldApply: boolean  // Whether the correction improves the transcript
  reason?: string
}

export interface MergedTranscript {
  text: string
  appliedCorrections: number
  skippedCorrections: number
}

export class ReconciliationService {
  private readonly MAX_LEVENSHTEIN_RATIO = 0.7  // Max 70% difference

  /**
   * Reconcile Qwen2 correction with original Whisper transcript
   * Uses anchor-based alignment and Levenshtein distance validation
   */
  reconcile(
    originalWords: WhisperWord[],
    correctedText: string,
    clipStart: number,
    clipEnd: number
  ): ReconciliationResult {
    // Extract original text for this time window
    const wordsInWindow = originalWords.filter(
      word => word.start >= clipStart && word.end <= clipEnd
    )

    const originalText = wordsInWindow.map(w => w.word).join(' ')

    // Clean the corrected text
    const cleanedCorrection = this.cleanText(correctedText)
    const cleanedOriginal = this.cleanText(originalText)

    // Calculate Levenshtein distance
    const distance = levenshtein.get(cleanedOriginal, cleanedCorrection)
    const maxLength = Math.max(cleanedOriginal.length, cleanedCorrection.length)
    const ratio = maxLength > 0 ? distance / maxLength : 0

    // Decide whether to apply correction
    let shouldApply = true
    let reason: string | undefined

    // Skip if corrected text is empty or [unintelligible]
    if (
      !cleanedCorrection ||
      cleanedCorrection === '[unintelligible]' ||
      cleanedCorrection.length < 3
    ) {
      shouldApply = false
      reason = 'Corrected text is empty or unintelligible'
    }
    // Skip if distance is too large (potential hallucination)
    else if (ratio > this.MAX_LEVENSHTEIN_RATIO) {
      shouldApply = false
      reason = `Levenshtein ratio too high: ${ratio.toFixed(2)}`
    }
    // Skip if correction is identical to original
    else if (cleanedOriginal === cleanedCorrection) {
      shouldApply = false
      reason = 'No changes detected'
    }

    return {
      success: true,
      originalText,
      correctedText: cleanedCorrection,
      levenshteinDistance: distance,
      shouldApply,
      reason,
    }
  }

  /**
   * Merge corrections into the master transcript
   * Uses timestamp-based replacement strategy
   */
  mergeTranscript(
    originalWords: WhisperWord[],
    corrections: Array<{
      clipStart: number
      clipEnd: number
      correctedText: string
      shouldApply: boolean
    }>
  ): MergedTranscript {
    if (corrections.length === 0) {
      return {
        text: originalWords.map(w => w.word).join(' '),
        appliedCorrections: 0,
        skippedCorrections: 0,
      }
    }

    let appliedCorrections = 0
    let skippedCorrections = 0

    // Sort corrections by start time
    const sortedCorrections = [...corrections].sort((a, b) => a.clipStart - b.clipStart)

    // Build the merged transcript
    const mergedWords: string[] = []
    let currentIndex = 0

    for (const correction of sortedCorrections) {
      if (!correction.shouldApply) {
        skippedCorrections++
        continue
      }

      // Add words before this correction window
      while (
        currentIndex < originalWords.length &&
        originalWords[currentIndex].end <= correction.clipStart
      ) {
        mergedWords.push(originalWords[currentIndex].word)
        currentIndex++
      }

      // Add the corrected text
      mergedWords.push(correction.correctedText)
      appliedCorrections++

      // Skip words in the correction window
      while (
        currentIndex < originalWords.length &&
        originalWords[currentIndex].start < correction.clipEnd
      ) {
        currentIndex++
      }
    }

    // Add remaining words after all corrections
    while (currentIndex < originalWords.length) {
      mergedWords.push(originalWords[currentIndex].word)
      currentIndex++
    }

    // Join words with intelligent spacing
    const text = this.joinWords(mergedWords)

    return {
      text,
      appliedCorrections,
      skippedCorrections,
    }
  }

  /**
   * Clean text for comparison
   */
  private cleanText(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
  }

  /**
   * Join words with intelligent spacing
   * Handles punctuation and capitalization
   */
  private joinWords(words: string[]): string {
    if (words.length === 0) return ''

    let result = words[0]

    for (let i = 1; i < words.length; i++) {
      const word = words[i]
      const prevWord = words[i - 1]

      // Check if we need a space
      const needsSpace = !this.isPunctuation(word) && !this.isPunctuation(prevWord)

      if (needsSpace) {
        result += ' '
      }

      result += word
    }

    return result
  }

  /**
   * Check if a word is punctuation
   */
  private isPunctuation(word: string): boolean {
    return /^[.,!?;:'"()-]+$/.test(word)
  }

  /**
   * Find anchor words for alignment
   * (Future enhancement for more sophisticated alignment)
   */
  private findAnchors(
    originalWords: string[],
    correctedWords: string[]
  ): Array<{ originalIndex: number; correctedIndex: number }> {
    const anchors: Array<{ originalIndex: number; correctedIndex: number }> = []

    // Simple implementation: find matching words at start and end
    if (
      originalWords.length > 0 &&
      correctedWords.length > 0 &&
      this.cleanText(originalWords[0]) === this.cleanText(correctedWords[0])
    ) {
      anchors.push({ originalIndex: 0, correctedIndex: 0 })
    }

    const lastOriginal = originalWords.length - 1
    const lastCorrected = correctedWords.length - 1
    if (
      lastOriginal >= 0 &&
      lastCorrected >= 0 &&
      this.cleanText(originalWords[lastOriginal]) === this.cleanText(correctedWords[lastCorrected])
    ) {
      anchors.push({ originalIndex: lastOriginal, correctedIndex: lastCorrected })
    }

    return anchors
  }
}

export const reconciliationService = new ReconciliationService()
