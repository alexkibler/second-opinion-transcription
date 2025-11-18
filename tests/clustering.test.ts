import { describe, it, expect } from 'vitest'
import { ClusteringService } from '../src/lib/clustering'
import { WhisperWord } from '../src/lib/whisper'

describe('ClusteringService', () => {
  const clusteringService = new ClusteringService({
    confidenceThreshold: 0.60,
    proximityThreshold: 5,
    correctionWindow: 20,
  })

  it('should identify low-confidence words', () => {
    const words: WhisperWord[] = [
      { word: 'Hello', start: 0, end: 0.5, probability: 0.95 },
      { word: 'world', start: 0.5, end: 1.0, probability: 0.45 }, // Low confidence
      { word: 'test', start: 1.0, end: 1.5, probability: 0.90 },
    ]

    const clusters = clusteringService.clusterLowConfidenceWords(words)

    expect(clusters).toHaveLength(1)
    expect(clusters[0].words).toHaveLength(1)
    expect(clusters[0].words[0].word).toBe('world')
  })

  it('should cluster consecutive low-confidence words', () => {
    const words: WhisperWord[] = [
      { word: 'Hello', start: 0, end: 0.5, probability: 0.95 },
      { word: 'mumbly', start: 0.5, end: 1.0, probability: 0.45 },
      { word: 'words', start: 1.0, end: 1.5, probability: 0.35 },
      { word: 'here', start: 1.5, end: 2.0, probability: 0.50 },
      { word: 'clear', start: 10.0, end: 10.5, probability: 0.95 },
    ]

    const clusters = clusteringService.clusterLowConfidenceWords(words)

    expect(clusters).toHaveLength(1)
    expect(clusters[0].words).toHaveLength(3)
  })

  it('should create separate clusters for distant low-confidence words', () => {
    const words: WhisperWord[] = [
      { word: 'mumbly1', start: 0, end: 0.5, probability: 0.45 },
      { word: 'clear', start: 1.0, end: 1.5, probability: 0.95 },
      { word: 'mumbly2', start: 10.0, end: 10.5, probability: 0.40 }, // >5s gap
    ]

    const clusters = clusteringService.clusterLowConfidenceWords(words)

    expect(clusters).toHaveLength(2)
  })

  it('should calculate correction windows correctly', () => {
    const words: WhisperWord[] = [
      { word: 'mumbly', start: 10.0, end: 10.5, probability: 0.45 },
    ]

    const clusters = clusteringService.clusterLowConfidenceWords(words)

    expect(clusters[0].centerTime).toBe(10.25)
    expect(clusters[0].clipStart).toBe(0.25) // 10.25 - 10
    expect(clusters[0].clipEnd).toBe(20.25) // 10.25 + 10
  })

  it('should merge overlapping correction windows', () => {
    const words: WhisperWord[] = [
      { word: 'mumbly1', start: 5.0, end: 5.5, probability: 0.45 },
      { word: 'mumbly2', start: 15.0, end: 15.5, probability: 0.40 },
    ]

    const clusters = clusteringService.clusterLowConfidenceWords(words)

    // These should merge because their correction windows overlap
    expect(clusters).toHaveLength(1)
  })

  it('should return empty array for high-confidence transcription', () => {
    const words: WhisperWord[] = [
      { word: 'Perfect', start: 0, end: 0.5, probability: 0.95 },
      { word: 'transcription', start: 0.5, end: 1.0, probability: 0.98 },
    ]

    const clusters = clusteringService.clusterLowConfidenceWords(words)

    expect(clusters).toHaveLength(0)
  })
})
