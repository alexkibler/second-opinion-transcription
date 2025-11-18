import { WhisperWord } from './whisper'

export interface ConfidenceCluster {
  id: string
  words: WhisperWord[]
  centerTime: number
  startTime: number
  endTime: number
  averageConfidence: number
  clipStart: number  // Start of the 20-second correction window
  clipEnd: number    // End of the 20-second correction window
}

export interface ClusteringOptions {
  confidenceThreshold: number
  proximityThreshold: number  // seconds
  correctionWindow: number    // seconds (typically 20)
}

export class ClusteringService {
  private options: ClusteringOptions

  constructor(options?: Partial<ClusteringOptions>) {
    this.options = {
      confidenceThreshold: options?.confidenceThreshold ??
        parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.60'),
      proximityThreshold: options?.proximityThreshold ??
        parseFloat(process.env.CLUSTERING_PROXIMITY_SECONDS || '5'),
      correctionWindow: options?.correctionWindow ??
        parseFloat(process.env.CORRECTION_WINDOW_SECONDS || '20'),
    }
  }

  /**
   * Find and cluster low-confidence words
   * Algorithm:
   * 1. Scan for words below confidence threshold
   * 2. Group consecutive or proximal low-confidence words
   * 3. Calculate center time for each cluster
   * 4. Define correction window (±10 seconds from center)
   * 5. Merge overlapping windows
   */
  clusterLowConfidenceWords(words: WhisperWord[]): ConfidenceCluster[] {
    if (words.length === 0) return []

    // Step 1: Filter low-confidence words
    const lowConfidenceWords = words.filter(
      word => word.probability < this.options.confidenceThreshold
    )

    if (lowConfidenceWords.length === 0) return []

    // Step 2: Group into clusters based on proximity
    const rawClusters: WhisperWord[][] = []
    let currentCluster: WhisperWord[] = [lowConfidenceWords[0]]

    for (let i = 1; i < lowConfidenceWords.length; i++) {
      const currentWord = lowConfidenceWords[i]
      const lastWord = currentCluster[currentCluster.length - 1]

      // Check if words are proximal (within threshold seconds)
      if (currentWord.start - lastWord.end <= this.options.proximityThreshold) {
        currentCluster.push(currentWord)
      } else {
        // Start new cluster
        rawClusters.push(currentCluster)
        currentCluster = [currentWord]
      }
    }
    // Don't forget the last cluster
    rawClusters.push(currentCluster)

    // Step 3: Calculate cluster metadata and correction windows
    let clusters: ConfidenceCluster[] = rawClusters.map((clusterWords, index) => {
      const startTime = clusterWords[0].start
      const endTime = clusterWords[clusterWords.length - 1].end
      const centerTime = (startTime + endTime) / 2

      // Calculate average confidence
      const totalConfidence = clusterWords.reduce(
        (sum, word) => sum + word.probability,
        0
      )
      const averageConfidence = totalConfidence / clusterWords.length

      // Define correction window (±10 seconds from center, or half of correctionWindow)
      const halfWindow = this.options.correctionWindow / 2
      const clipStart = Math.max(0, centerTime - halfWindow)
      const clipEnd = centerTime + halfWindow

      return {
        id: `cluster_${index}`,
        words: clusterWords,
        centerTime,
        startTime,
        endTime,
        averageConfidence,
        clipStart,
        clipEnd,
      }
    })

    // Step 4: Merge overlapping correction windows
    clusters = this.mergeOverlappingClusters(clusters)

    return clusters
  }

  /**
   * Merge clusters with overlapping correction windows
   */
  private mergeOverlappingClusters(
    clusters: ConfidenceCluster[]
  ): ConfidenceCluster[] {
    if (clusters.length <= 1) return clusters

    const merged: ConfidenceCluster[] = []
    let current = clusters[0]

    for (let i = 1; i < clusters.length; i++) {
      const next = clusters[i]

      // Check if correction windows overlap
      if (current.clipEnd >= next.clipStart) {
        // Merge clusters
        current = {
          id: `${current.id}_${next.id}`,
          words: [...current.words, ...next.words],
          centerTime: (current.centerTime + next.centerTime) / 2,
          startTime: Math.min(current.startTime, next.startTime),
          endTime: Math.max(current.endTime, next.endTime),
          averageConfidence:
            (current.averageConfidence * current.words.length +
              next.averageConfidence * next.words.length) /
            (current.words.length + next.words.length),
          clipStart: Math.min(current.clipStart, next.clipStart),
          clipEnd: Math.max(current.clipEnd, next.clipEnd),
        }
      } else {
        // No overlap, push current and move to next
        merged.push(current)
        current = next
      }
    }
    // Don't forget the last cluster
    merged.push(current)

    return merged
  }

  /**
   * Get statistics about clustering
   */
  getClusteringStats(words: WhisperWord[], clusters: ConfidenceCluster[]) {
    const lowConfidenceWords = words.filter(
      word => word.probability < this.options.confidenceThreshold
    )

    return {
      totalWords: words.length,
      lowConfidenceWords: lowConfidenceWords.length,
      clustersCreated: clusters.length,
      wordsInClusters: clusters.reduce((sum, c) => sum + c.words.length, 0),
      averageClusterSize: clusters.length > 0
        ? clusters.reduce((sum, c) => sum + c.words.length, 0) / clusters.length
        : 0,
      totalCorrectionTime: clusters.reduce(
        (sum, c) => sum + (c.clipEnd - c.clipStart),
        0
      ),
    }
  }
}

export const clusteringService = new ClusteringService()
